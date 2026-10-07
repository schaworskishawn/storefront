import { ROLE_BY_ID, TASK_OWNER } from "../agents/registry";
import { iso, json, type Row, type Sql } from "../db/sql";
import { redactDeep } from "../redact";
import {
	actorKey,
	actorLabel,
	type Actor,
	type RoleId,
	type SourceRef,
	type TaskKind,
	type TaskState,
} from "../types";
import { InvalidTransitionError, assertTransition, isFinished } from "./state-machine";

/**
 * The shared task system. Every task has one owning role (decided by its kind, never chosen freely), says in advance what
 * "done" looks like, and can only be completed with evidence. The same request twice maps to the same idempotency key and
 * returns the existing task. Every change of state, and every step worth knowing about, is written to the task's history.
 */

export type TaskRecord = {
	id: string;
	kind: TaskKind;
	title: string;
	ownerRole: RoleId;
	state: TaskState;
	idempotencyKey: string;
	requestedBy: string;
	requestedByLabel: string | null;
	expectedResult: string;
	completionEvidence: Record<string, unknown> | null;
	input: Record<string, unknown>;
	result: Record<string, unknown> | null;
	error: string | null;
	attempts: number;
	parentTaskId: string | null;
	delegationDepth: number;
	sourceRefs: SourceRef[];
	externalRunId: string | null;
	createdAt: string;
	updatedAt: string;
	startedAt: string | null;
	finishedAt: string | null;
};

const COLUMNS = `id, kind, title, owner_role, state, idempotency_key, requested_by, requested_by_label, expected_result,
	completion_evidence, input, result, error, attempts, parent_task_id, delegation_depth, source_refs, external_run_id,
	created_at, updated_at, started_at, finished_at`;

export function mapTask(r: Row): TaskRecord {
	return {
		id: r.id as string,
		kind: r.kind as TaskKind,
		title: r.title as string,
		ownerRole: r.owner_role as RoleId,
		state: r.state as TaskState,
		idempotencyKey: r.idempotency_key as string,
		requestedBy: r.requested_by as string,
		requestedByLabel: (r.requested_by_label as string | null) ?? null,
		expectedResult: r.expected_result as string,
		completionEvidence: (r.completion_evidence as Record<string, unknown> | null) ?? null,
		input: (r.input as Record<string, unknown>) ?? {},
		result: (r.result as Record<string, unknown> | null) ?? null,
		error: (r.error as string | null) ?? null,
		attempts: Number(r.attempts ?? 0),
		parentTaskId: (r.parent_task_id as string | null) ?? null,
		delegationDepth: Number(r.delegation_depth ?? 0),
		sourceRefs: (r.source_refs as SourceRef[]) ?? [],
		externalRunId: (r.external_run_id as string | null) ?? null,
		createdAt: iso(r.created_at) as string,
		updatedAt: iso(r.updated_at) as string,
		startedAt: iso(r.started_at),
		finishedAt: iso(r.finished_at),
	};
}

export class DelegationLimitError extends Error {
	constructor(max: number) {
		super(`This would delegate more than ${max} level${max === 1 ? "" : "s"} deep.`);
		this.name = "DelegationLimitError";
	}
}

export class TaskNotFoundError extends Error {
	constructor(id: string) {
		super(`Task ${id} doesn't exist.`);
		this.name = "TaskNotFoundError";
	}
}

// ---- History ------------------------------------------------------------------

export type TaskEventInput = {
	kind: string;
	actor: Actor;
	roleId?: RoleId | null;
	tool?: string | null;
	fromState?: TaskState | null;
	toState?: TaskState | null;
	detail?: Record<string, unknown>;
};

export type TaskEvent = {
	id: number;
	taskId: string;
	at: string;
	kind: string;
	actor: string;
	roleId: RoleId | null;
	tool: string | null;
	fromState: TaskState | null;
	toState: TaskState | null;
	detail: Record<string, unknown>;
};

/** Adds one step to a task's history. Detail is always redacted on the way in. */
export async function addTaskEvent(sql: Sql, taskId: string, event: TaskEventInput): Promise<void> {
	await sql.query(
		`insert into wai_task_events (task_id, kind, actor, role_id, tool, from_state, to_state, detail)
		 values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
		[
			taskId,
			event.kind,
			actorKey(event.actor),
			event.roleId ?? (event.actor.kind === "agent" ? event.actor.roleId : null),
			event.tool ?? null,
			event.fromState ?? null,
			event.toState ?? null,
			json(redactDeep(event.detail ?? {})),
		],
	);
}

export async function getTaskEvents(sql: Sql, taskId: string): Promise<TaskEvent[]> {
	const { rows } = await sql.query(
		`select id, task_id, at, kind, actor, role_id, tool, from_state, to_state, detail
		 from wai_task_events where task_id = $1 order by id`,
		[taskId],
	);
	return rows.map((r) => ({
		id: Number(r.id),
		taskId: r.task_id as string,
		at: iso(r.at) as string,
		kind: r.kind as string,
		actor: r.actor as string,
		roleId: (r.role_id as RoleId | null) ?? null,
		tool: (r.tool as string | null) ?? null,
		fromState: (r.from_state as TaskState | null) ?? null,
		toState: (r.to_state as TaskState | null) ?? null,
		detail: (r.detail as Record<string, unknown>) ?? {},
	}));
}

// ---- Creating and reading --------------------------------------------------------

export type CreateTaskInput = {
	kind: TaskKind;
	title: string;
	expectedResult: string;
	/** The same request always gives the same key. A second request with it returns the first task. */
	idempotencyKey: string;
	actor: Actor;
	input?: Record<string, unknown>;
	parentTaskId?: string | null;
	sourceRefs?: SourceRef[];
	/** How deep delegation may go for whoever is creating this (from their role's limits). */
	maxDelegationDepth?: number;
};

export async function getTask(sql: Sql, id: string): Promise<TaskRecord | null> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_tasks where id = $1`, [id]);
	return rows[0] ? mapTask(rows[0]) : null;
}

export async function getTaskByKey(sql: Sql, idempotencyKey: string): Promise<TaskRecord | null> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_tasks where idempotency_key = $1`, [
		idempotencyKey,
	]);
	return rows[0] ? mapTask(rows[0]) : null;
}

/**
 * Creates a task, or returns the one the same request already made. The owner is the role that owns the kind of work; it is
 * not an argument, so a task can't be created owned by a role that doesn't do that work.
 */
export async function createTask(
	sql: Sql,
	args: CreateTaskInput,
): Promise<{ task: TaskRecord; created: boolean }> {
	const ownerRole = TASK_OWNER[args.kind];
	let depth = 0;
	if (args.parentTaskId) {
		const parent = await getTask(sql, args.parentTaskId);
		if (!parent) throw new TaskNotFoundError(args.parentTaskId);
		depth = parent.delegationDepth + 1;
		const max =
			args.maxDelegationDepth ??
			(args.actor.kind === "agent" ? ROLE_BY_ID[args.actor.roleId].limits.maxDelegationDepth : 3);
		if (depth > max) throw new DelegationLimitError(max);
	}

	const { rows } = await sql.query(
		`insert into wai_tasks (kind, title, owner_role, idempotency_key, requested_by, requested_by_label, expected_result,
			input, parent_task_id, delegation_depth, source_refs)
		 values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb)
		 on conflict (idempotency_key) do nothing
		 returning ${COLUMNS}`,
		[
			args.kind,
			args.title,
			ownerRole,
			args.idempotencyKey,
			actorKey(args.actor),
			actorLabel(args.actor),
			args.expectedResult,
			json(args.input ?? {}),
			args.parentTaskId ?? null,
			depth,
			json(args.sourceRefs ?? []),
		],
	);
	if (rows[0]) {
		const task = mapTask(rows[0]);
		await addTaskEvent(sql, task.id, {
			kind: "created",
			actor: args.actor,
			toState: "queued",
			detail: { kind: args.kind, owner: ownerRole, expectedResult: args.expectedResult },
		});
		return { task, created: true };
	}
	const existing = await getTaskByKey(sql, args.idempotencyKey);
	if (!existing) throw new Error("A task with this idempotency key was just removed.");
	return { task: existing, created: false };
}

/** The newest task of a kind whose input has a field with this value (for example, the latest draft task for one case). */
export async function findLatestTask(
	sql: Sql,
	kind: TaskKind,
	inputField: string,
	inputValue: string,
): Promise<TaskRecord | null> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_tasks where kind = $1 and input ->> $2 = $3 order by created_at desc, id desc limit 1`,
		[kind, inputField, inputValue],
	);
	return rows[0] ? mapTask(rows[0]) : null;
}

/** Remembers the background job runner's id for a run (Trigger.dev), without changing the task's state. */
export async function setExternalRunId(sql: Sql, taskId: string, externalRunId: string): Promise<void> {
	await sql.query(`update wai_tasks set external_run_id = $2, updated_at = now() where id = $1`, [
		taskId,
		externalRunId,
	]);
}

export type TaskFilter = {
	state?: TaskState | TaskState[];
	ownerRole?: RoleId;
	kind?: TaskKind;
	limit?: number;
	offset?: number;
};

export async function listTasks(sql: Sql, filter: TaskFilter = {}): Promise<TaskRecord[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.state) {
		const states = Array.isArray(filter.state) ? filter.state : [filter.state];
		params.push(states);
		where.push(`state = any($${params.length}::text[])`);
	}
	if (filter.ownerRole) {
		params.push(filter.ownerRole);
		where.push(`owner_role = $${params.length}`);
	}
	if (filter.kind) {
		params.push(filter.kind);
		where.push(`kind = $${params.length}`);
	}
	params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200), Math.max(filter.offset ?? 0, 0));
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_tasks ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by created_at desc, id limit $${params.length - 1} offset $${params.length}`,
		params,
	);
	return rows.map(mapTask);
}

export async function countTasksByState(sql: Sql): Promise<Record<TaskState, number>> {
	const { rows } = await sql.query<{ state: TaskState; n: number }>(
		`select state, count(*)::int as n from wai_tasks group by state`,
	);
	const counts: Record<TaskState, number> = {
		queued: 0,
		running: 0,
		needs_review: 0,
		completed: 0,
		failed: 0,
		cancelled: 0,
		outcome_unknown: 0,
	};
	for (const row of rows) counts[row.state] = Number(row.n);
	return counts;
}

// ---- Moving between states -------------------------------------------------------------

export type TransitionPatch = {
	result?: Record<string, unknown> | null;
	error?: string | null;
	completionEvidence?: Record<string, unknown> | null;
	externalRunId?: string | null;
	sourceRefs?: SourceRef[];
	note?: string;
	detail?: Record<string, unknown>;
	/** Refuse unless the task is in one of these states (guards a stale view or a double click). */
	onlyFrom?: readonly TaskState[];
};

/**
 * Moves a task to a new state if the state machine allows it, in one transaction with the history entry. Completing needs
 * evidence. If the task isn't in a state the move is allowed from, it throws and nothing changes.
 */
export async function transitionTask(
	sql: Sql,
	taskId: string,
	to: TaskState,
	actor: Actor,
	patch: TransitionPatch = {},
): Promise<TaskRecord> {
	return sql.transaction(async (tx) => {
		const { rows } = await tx.query(`select ${COLUMNS} from wai_tasks where id = $1 for update`, [taskId]);
		if (!rows[0]) throw new TaskNotFoundError(taskId);
		const current = mapTask(rows[0]);
		if (patch.onlyFrom && !patch.onlyFrom.includes(current.state))
			throw new InvalidTransitionError(current.state, to);
		assertTransition(current.state, to);
		if (to === "completed" && !(patch.completionEvidence ?? current.completionEvidence))
			throw new Error("A task can't be completed without completion evidence.");

		const starting = to === "running";
		const finishing = isFinished(to);
		const requeueing = to === "queued";
		const updated = await tx.query(
			`update wai_tasks set
				state = $2,
				updated_at = now(),
				attempts = attempts + $3,
				started_at = case when $4 then now() else started_at end,
				finished_at = case when $5 then now() when $6 then null else finished_at end,
				result = case when $7::boolean then $8::jsonb else result end,
				error = case when $9::boolean then $10 when $6 then null else error end,
				completion_evidence = case when $11::boolean then $12::jsonb else completion_evidence end,
				external_run_id = case when $13::boolean then $14 else external_run_id end,
				source_refs = case when $15::boolean then $16::jsonb else source_refs end
			 where id = $1
			 returning ${COLUMNS}`,
			[
				taskId,
				to,
				starting ? 1 : 0,
				starting,
				finishing,
				requeueing,
				patch.result !== undefined,
				json(patch.result),
				patch.error !== undefined,
				patch.error ?? null,
				patch.completionEvidence !== undefined,
				json(patch.completionEvidence),
				patch.externalRunId !== undefined,
				patch.externalRunId ?? null,
				patch.sourceRefs !== undefined,
				json(patch.sourceRefs ?? []),
			],
		);
		await addTaskEvent(tx, taskId, {
			kind: "state_change",
			actor,
			fromState: current.state,
			toState: to,
			detail: {
				...(patch.detail ?? {}),
				...(patch.note ? { note: patch.note } : {}),
				...(patch.error ? { error: patch.error } : {}),
			},
		});
		return mapTask(updated.rows[0]);
	});
}

/**
 * Starts a queued task, but only if its role has a free slot. The check and the start happen under a lock for that role, so
 * two jobs starting together can't both take the last slot.
 */
export async function claimTask(
	sql: Sql,
	taskId: string,
	actor: Actor,
	options: { maxConcurrent: number },
): Promise<{ claimed: true; task: TaskRecord } | { claimed: false; reason: "busy" | "not_queued" }> {
	return sql.transaction(async (tx) => {
		const { rows } = await tx.query(`select ${COLUMNS} from wai_tasks where id = $1 for update`, [taskId]);
		if (!rows[0]) throw new TaskNotFoundError(taskId);
		const task = mapTask(rows[0]);
		if (task.state !== "queued") return { claimed: false as const, reason: "not_queued" as const };
		await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, [`wai-claim-${task.ownerRole}`]);
		const running = await tx.query<{ n: number }>(
			`select count(*)::int as n from wai_tasks where owner_role = $1 and state = 'running'`,
			[task.ownerRole],
		);
		if (Number(running.rows[0].n) >= options.maxConcurrent)
			return { claimed: false as const, reason: "busy" as const };
		const started = await transitionTask(tx, taskId, "running", actor, { onlyFrom: ["queued"] });
		return { claimed: true as const, task: started };
	});
}

/** Marks tasks that have been running longer than their limit as outcome unknown, since nobody recorded how they ended. */
export async function sweepStuckTasks(
	sql: Sql,
	options: { secondsFor: (role: RoleId) => number; now?: Date },
): Promise<TaskRecord[]> {
	const now = options.now ?? new Date();
	const running = await listTasks(sql, { state: "running", limit: 200 });
	const swept: TaskRecord[] = [];
	for (const task of running) {
		const started = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
		if (now.getTime() - started <= options.secondsFor(task.ownerRole) * 1000) continue;
		try {
			swept.push(
				await transitionTask(
					sql,
					task.id,
					"outcome_unknown",
					{ kind: "system", label: "stuck-task-sweep" },
					{
						error:
							"No result was recorded before the time limit. The work may or may not have finished; check before trying again.",
						onlyFrom: ["running"],
					},
				),
			);
		} catch {
			// It finished while we were looking; leave it.
		}
	}
	return swept;
}
