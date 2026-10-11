import { iso, json, type Row, type Sql } from "../db/sql";
import type { InspectionResult, InspectionSpec } from "./connector";

/** The record kept for every OpenClaw run: the session id this application made, the run id the worker returned, and the evidence. */

export type RunRowState =
	| "submitting"
	| "submitted"
	| "running"
	| "succeeded"
	| "failed"
	| "timed_out"
	| "unknown";

export type EvidenceFile = {
	kind: "screenshot";
	path: string;
	sha256: string;
	bytes: number;
	url: string;
	viewport: string;
	mime: string;
};

export type OpenClawRunRow = {
	id: string;
	taskId: string;
	sessionId: string;
	runId: string | null;
	jobType: string;
	spec: InspectionSpec;
	state: RunRowState;
	submittedAt: string | null;
	lastPolledAt: string | null;
	finishedAt: string | null;
	result: InspectionResult | null;
	evidence: EvidenceFile[];
	error: string | null;
	createdAt: string;
};

const COLUMNS = `id, task_id, session_id, run_id, job_type, spec, state, submitted_at, last_polled_at, finished_at, result, evidence, error, created_at`;

function map(r: Row): OpenClawRunRow {
	return {
		id: r.id as string,
		taskId: r.task_id as string,
		sessionId: r.session_id as string,
		runId: (r.run_id as string | null) ?? null,
		jobType: r.job_type as string,
		spec: r.spec as InspectionSpec,
		state: r.state as RunRowState,
		submittedAt: iso(r.submitted_at),
		lastPolledAt: iso(r.last_polled_at),
		finishedAt: iso(r.finished_at),
		result: (r.result as InspectionResult | null) ?? null,
		evidence: (r.evidence as EvidenceFile[]) ?? [],
		error: (r.error as string | null) ?? null,
		createdAt: iso(r.created_at) as string,
	};
}

export async function getRunForTask(sql: Sql, taskId: string): Promise<OpenClawRunRow | null> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_openclaw_runs where task_id = $1 order by created_at desc limit 1`,
		[taskId],
	);
	return rows[0] ? map(rows[0]) : null;
}

/** Makes the run record, or returns the one already made for this task (a retry keeps the same session id). */
export async function ensureRunRow(
	sql: Sql,
	taskId: string,
	sessionId: string,
	spec: InspectionSpec,
): Promise<OpenClawRunRow> {
	const existing = await getRunForTask(sql, taskId);
	if (existing) return existing;
	const { rows } = await sql.query(
		`insert into wai_openclaw_runs (task_id, session_id, job_type, spec) values ($1,$2,$3,$4::jsonb)
		 on conflict (session_id) do update set task_id = wai_openclaw_runs.task_id returning ${COLUMNS}`,
		[taskId, sessionId, spec.type, json(spec)],
	);
	return map(rows[0]);
}

export type RunPatch = Partial<{
	runId: string;
	state: RunRowState;
	submittedAt: Date;
	lastPolledAt: Date;
	finishedAt: Date;
	result: InspectionResult | null;
	evidence: EvidenceFile[];
	error: string | null;
}>;

export async function updateRunRow(sql: Sql, id: string, patch: RunPatch): Promise<OpenClawRunRow> {
	const sets: string[] = [];
	const params: unknown[] = [id];
	const set = (column: string, value: unknown, cast = "") => {
		params.push(value);
		sets.push(`${column} = $${params.length}${cast}`);
	};
	if (patch.runId !== undefined) set("run_id", patch.runId);
	if (patch.state !== undefined) set("state", patch.state);
	if (patch.submittedAt !== undefined) set("submitted_at", patch.submittedAt.toISOString());
	if (patch.lastPolledAt !== undefined) set("last_polled_at", patch.lastPolledAt.toISOString());
	if (patch.finishedAt !== undefined) set("finished_at", patch.finishedAt.toISOString());
	if (patch.result !== undefined) set("result", json(patch.result), "::jsonb");
	if (patch.evidence !== undefined) set("evidence", json(patch.evidence), "::jsonb");
	if (patch.error !== undefined) set("error", patch.error);
	if (!sets.length) {
		const { rows } = await sql.query(`select ${COLUMNS} from wai_openclaw_runs where id = $1`, [id]);
		return map(rows[0]);
	}
	const { rows } = await sql.query(
		`update wai_openclaw_runs set ${sets.join(", ")} where id = $1 returning ${COLUMNS}`,
		params,
	);
	return map(rows[0]);
}
