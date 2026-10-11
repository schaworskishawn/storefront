import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import { actorKey, type OperatorActor } from "../types";
import { WorkflowError } from "../workflows/types";
import {
	SUITE_VERSION,
	hashOfPackage,
	hashOfSkill,
	packageOf,
	type SkillDefinition,
	type SkillPackage,
} from "./types";

/**
 * What the application remembers about skills: evaluations, approved releases, which procedures each task followed, and
 * improvement proposals. The procedures themselves are in the repository; a release here is the exact package a person
 * approved, kept so that what guides work doesn't change when the repository does.
 *
 * Only the owner approves, revokes or rolls back, and every attempt is written to the audit log, refused ones included.
 */

/** The rule an evaluation must meet before its version can be approved. Fixed before any candidate is evaluated. */
export const EVALUATION_POLICY = {
	version: 1,
	/** A single critical failure (permission, binding, calculation, integrity) blocks approval. */
	criticalFailuresAllowed: 0,
	/** Every case that could be run must pass. Cases that could not be run are shown to the approver, never counted as passes. */
	failuresAllowed: 0,
} as const;

export type CaseOutcome = "passed" | "failed" | "not_run";

export type EvaluationCase = {
	id: string;
	kind:
		| "format"
		| "substance"
		| "permission"
		| "binding"
		| "success"
		| "missing-data"
		| "duplicate"
		| "authorization"
		| "injection"
		| "calculation"
		| "integrity"
		| "live-model";
	title: string;
	critical: boolean;
	outcome: CaseOutcome;
	detail: string;
};

export type EvaluationTotals = { total: number; passed: number; failed: number; notRun: number };

export type SkillEvaluation = {
	id: string;
	skillId: string;
	version: number;
	contentSha256: string;
	policyVersion: number;
	suiteVersion: number;
	environment: "isolated";
	passed: boolean;
	criticalFailures: number;
	totals: EvaluationTotals;
	cases: EvaluationCase[];
	ranBy: string;
	ranAt: string;
};

export type SkillRelease = {
	id: string;
	skillId: string;
	kind: "foundation" | "role-pack";
	version: number;
	contentSha256: string;
	package: SkillPackage;
	state: "approved" | "revoked";
	active: boolean;
	evaluationId: string;
	previousReleaseId: string | null;
	approvedBy: string;
	approvedAt: string;
	activatedAt: string | null;
	revokedBy: string | null;
	revokedAt: string | null;
	revokeReason: string | null;
};

const EVALUATION_COLUMNS = `id, skill_id, version, content_sha256, policy_version, suite_version, environment, passed,
	critical_failures, totals, cases, ran_by, ran_at`;

const toEvaluation = (r: Row): SkillEvaluation => ({
	id: r.id as string,
	skillId: r.skill_id as string,
	version: Number(r.version),
	contentSha256: r.content_sha256 as string,
	policyVersion: Number(r.policy_version),
	suiteVersion: Number(r.suite_version),
	environment: "isolated",
	passed: r.passed === true,
	criticalFailures: Number(r.critical_failures),
	totals: r.totals as EvaluationTotals,
	cases: (r.cases as EvaluationCase[]) ?? [],
	ranBy: r.ran_by as string,
	ranAt: iso(r.ran_at) as string,
});

const RELEASE_COLUMNS = `id, skill_id, kind, version, content_sha256, package, state, active, evaluation_id,
	previous_release_id, approved_by, approved_at, activated_at, revoked_by, revoked_at, revoke_reason`;

const toRelease = (r: Row): SkillRelease => ({
	id: r.id as string,
	skillId: r.skill_id as string,
	kind: r.kind as SkillRelease["kind"],
	version: Number(r.version),
	contentSha256: r.content_sha256 as string,
	package: (typeof r.package === "string" ? JSON.parse(r.package) : r.package) as SkillPackage,
	state: r.state as SkillRelease["state"],
	active: r.active === true,
	evaluationId: r.evaluation_id as string,
	previousReleaseId: (r.previous_release_id as string | null) ?? null,
	approvedBy: r.approved_by as string,
	approvedAt: iso(r.approved_at) as string,
	activatedAt: iso(r.activated_at),
	revokedBy: (r.revoked_by as string | null) ?? null,
	revokedAt: iso(r.revoked_at),
	revokeReason: (r.revoke_reason as string | null) ?? null,
});

/** Whether a stored release still is what was approved: its package hashes to the checksum recorded with the approval. */
export const releaseIsIntact = (release: SkillRelease): boolean => {
	try {
		return hashOfPackage(release.package) === release.contentSha256;
	} catch {
		return false;
	}
};

// ---- Evaluations --------------------------------------------------------------------------------------

export function summarizeCases(cases: readonly EvaluationCase[]): {
	totals: EvaluationTotals;
	criticalFailures: number;
	passed: boolean;
} {
	const failed = cases.filter((c) => c.outcome === "failed");
	const criticalFailures = failed.filter((c) => c.critical).length;
	const totals = {
		total: cases.length,
		passed: cases.filter((c) => c.outcome === "passed").length,
		failed: failed.length,
		notRun: cases.filter((c) => c.outcome === "not_run").length,
	};
	return {
		totals,
		criticalFailures,
		passed:
			criticalFailures <= EVALUATION_POLICY.criticalFailuresAllowed &&
			failed.length <= EVALUATION_POLICY.failuresAllowed &&
			totals.passed > 0,
	};
}

export async function insertEvaluation(
	sql: Sql,
	input: { skill: SkillDefinition; cases: EvaluationCase[]; ranBy: string },
): Promise<SkillEvaluation> {
	const summary = summarizeCases(input.cases);
	const { rows } = await sql.query(
		`insert into wai_skill_evaluations (skill_id, version, content_sha256, policy_version, suite_version, environment,
			passed, critical_failures, totals, cases, ran_by)
		 values ($1,$2,$3,$4,$5,'isolated',$6,$7,$8::jsonb,$9::jsonb,$10)
		 returning ${EVALUATION_COLUMNS}`,
		[
			input.skill.id,
			input.skill.version,
			hashOfSkill(input.skill),
			EVALUATION_POLICY.version,
			SUITE_VERSION,
			summary.passed,
			summary.criticalFailures,
			json(summary.totals),
			json(input.cases),
			input.ranBy,
		],
	);
	return toEvaluation(rows[0]);
}

export async function getEvaluation(sql: Sql, id: string): Promise<SkillEvaluation | null> {
	const { rows } = await sql.query(`select ${EVALUATION_COLUMNS} from wai_skill_evaluations where id = $1`, [
		id,
	]);
	return rows[0] ? toEvaluation(rows[0]) : null;
}

export async function listEvaluations(sql: Sql, skillId: string, limit = 10): Promise<SkillEvaluation[]> {
	const { rows } = await sql.query(
		`select ${EVALUATION_COLUMNS} from wai_skill_evaluations where skill_id = $1 order by ran_at desc, id desc limit $2`,
		[skillId, limit],
	);
	return rows.map(toEvaluation);
}

/** The newest evaluation of each skill, whatever version it was of. */
export async function latestEvaluations(sql: Sql): Promise<Map<string, SkillEvaluation>> {
	const { rows } = await sql.query(
		`select distinct on (skill_id) ${EVALUATION_COLUMNS} from wai_skill_evaluations order by skill_id, ran_at desc, id desc`,
	);
	return new Map(rows.map((r) => [r.skill_id as string, toEvaluation(r)]));
}

// ---- Releases -----------------------------------------------------------------------------------------

export async function listReleases(sql: Sql, skillId?: string): Promise<SkillRelease[]> {
	const { rows } = await sql.query(
		`select ${RELEASE_COLUMNS} from wai_skill_releases ${skillId ? "where skill_id = $1" : ""}
		 order by approved_at desc, id desc`,
		skillId ? [skillId] : [],
	);
	return rows.map(toRelease);
}

export async function getRelease(sql: Sql, id: string): Promise<SkillRelease | null> {
	const { rows } = await sql.query(`select ${RELEASE_COLUMNS} from wai_skill_releases where id = $1`, [id]);
	return rows[0] ? toRelease(rows[0]) : null;
}

/** The releases in use right now, by skill id. */
export async function activeReleases(
	sql: Sql,
	skillIds?: readonly string[],
): Promise<Map<string, SkillRelease>> {
	const { rows } = await sql.query(
		`select ${RELEASE_COLUMNS} from wai_skill_releases
		 where active and state = 'approved' ${skillIds ? "and skill_id = any($1::text[])" : ""}`,
		skillIds ? [skillIds] : [],
	);
	return new Map(rows.map((r) => [r.skill_id as string, toRelease(r)]));
}

async function requireOwner(sql: Sql, actor: OperatorActor, action: string, subject: string): Promise<void> {
	if (actor.role === "owner") return;
	await audit(sql, { actor, action, subject, outcome: "denied", detail: { reason: "owner only" } });
	throw new WorkflowError("forbidden", "Only the owner can approve, revoke or roll back a skill.");
}

/**
 * Approves the version of a skill that an evaluation was run on, and puts it in use. The evaluation must be of exactly this
 * content, must have passed with no critical failure, and must be from the current suite and policy. The release that was in
 * use stays approved and becomes the one a rollback returns to.
 */
export async function approveRelease(
	sql: Sql,
	actor: OperatorActor,
	input: { skill: SkillDefinition; evaluationId: string; now?: Date },
): Promise<SkillRelease> {
	const { skill } = input;
	await requireOwner(sql, actor, "skill.approve", skill.id);
	const sha = hashOfSkill(skill);
	const refuse = async (message: string, code: "conflict" | "invalid" = "conflict"): Promise<never> => {
		await audit(sql, {
			actor,
			action: "skill.approve",
			subject: skill.id,
			outcome: "denied",
			detail: { reason: message, version: skill.version },
		});
		throw new WorkflowError(code, message);
	};
	const evaluation = await getEvaluation(sql, input.evaluationId);
	if (!evaluation || evaluation.skillId !== skill.id)
		return refuse("That evaluation isn't of this skill. Evaluate it first.", "invalid");
	if (evaluation.contentSha256 !== sha || evaluation.version !== skill.version)
		return refuse("The skill has changed since that evaluation. Evaluate the current version first.");
	if (evaluation.suiteVersion !== SUITE_VERSION || evaluation.policyVersion !== EVALUATION_POLICY.version)
		return refuse("That evaluation was run under an older set of checks. Evaluate it again.");
	if (!evaluation.passed)
		return refuse(
			evaluation.criticalFailures
				? `The evaluation has ${evaluation.criticalFailures} critical failure${evaluation.criticalFailures === 1 ? "" : "s"}, so this version can't be approved.`
				: "The evaluation didn't pass, so this version can't be approved.",
		);

	const pack = packageOf(skill);
	const at = (input.now ?? new Date()).toISOString();
	const release = await sql.transaction(async (tx) => {
		const existing = await tx.query(
			`select ${RELEASE_COLUMNS} from wai_skill_releases where skill_id = $1 and content_sha256 = $2 for update`,
			[skill.id, sha],
		);
		if (existing.rows[0] && existing.rows[0].state === "revoked")
			throw new WorkflowError(
				"conflict",
				"This exact version was revoked. Change the procedure and evaluate the new version.",
			);
		const current = await tx.query<{ id: string }>(
			`select id from wai_skill_releases where skill_id = $1 and active for update`,
			[skill.id],
		);
		const previousId = current.rows[0]?.id ?? null;
		if (existing.rows[0]) {
			if (previousId === existing.rows[0].id) return toRelease(existing.rows[0]);
			await tx.query(`update wai_skill_releases set active = false where skill_id = $1 and active`, [
				skill.id,
			]);
			const { rows } = await tx.query(
				`update wai_skill_releases set active = true, activated_at = $2::timestamptz, evaluation_id = $3
				 where id = $1 returning ${RELEASE_COLUMNS}`,
				[existing.rows[0].id, at, evaluation.id],
			);
			return toRelease(rows[0]);
		}
		await tx.query(`update wai_skill_releases set active = false where skill_id = $1 and active`, [skill.id]);
		const { rows } = await tx.query(
			`insert into wai_skill_releases (skill_id, kind, version, content_sha256, package, state, active, evaluation_id,
				previous_release_id, approved_by, approved_at, activated_at)
			 values ($1,$2,$3,$4,$5::json,'approved',true,$6,$7,$8,$9::timestamptz,$9::timestamptz)
			 returning ${RELEASE_COLUMNS}`,
			[skill.id, skill.kind, skill.version, sha, json(pack), evaluation.id, previousId, actorKey(actor), at],
		);
		return toRelease(rows[0]);
	});
	await audit(sql, {
		actor,
		action: "skill.approve",
		subject: skill.id,
		outcome: "allowed",
		detail: {
			version: skill.version,
			checksum: sha.slice(0, 12),
			evaluation: evaluation.id,
			release: release.id,
		},
	});
	return release;
}

/**
 * Takes a release out of use at once. Nothing takes its place: there is no silent fall back to another version. The owner
 * either rolls back to an earlier approved version or approves a new one.
 */
export async function revokeRelease(
	sql: Sql,
	actor: OperatorActor,
	input: { releaseId: string; reason: string; now?: Date },
): Promise<SkillRelease> {
	const reason = input.reason.trim().slice(0, 500);
	const existing = await getRelease(sql, input.releaseId);
	await requireOwner(sql, actor, "skill.revoke", existing?.skillId ?? input.releaseId);
	if (!existing) throw new WorkflowError("not_found", "That release doesn't exist.");
	if (!reason) throw new WorkflowError("invalid", "Say why it is being revoked.");
	if (existing.state === "revoked") return existing;
	const { rows } = await sql.query(
		`update wai_skill_releases set state = 'revoked', active = false, revoked_by = $2, revoked_at = $3::timestamptz,
			revoke_reason = $4
		 where id = $1 returning ${RELEASE_COLUMNS}`,
		[existing.id, actorKey(actor), (input.now ?? new Date()).toISOString(), reason],
	);
	await audit(sql, {
		actor,
		action: "skill.revoke",
		subject: existing.skillId,
		outcome: "allowed",
		detail: { release: existing.id, version: existing.version, reason },
	});
	return toRelease(rows[0]);
}

/**
 * Puts the most recent earlier approved release back in use. The release it replaces stays approved unless it was revoked.
 * Refused when there is no approved earlier release to return to.
 */
export async function rollbackSkill(
	sql: Sql,
	actor: OperatorActor,
	input: { skillId: string; now?: Date },
): Promise<SkillRelease> {
	await requireOwner(sql, actor, "skill.rollback", input.skillId);
	const at = (input.now ?? new Date()).toISOString();
	const release = await sql.transaction(async (tx) => {
		const { rows } = await tx.query(
			`select ${RELEASE_COLUMNS} from wai_skill_releases where skill_id = $1 order by approved_at desc, id desc for update`,
			[input.skillId],
		);
		const all = rows.map(toRelease);
		const current = all.find((r) => r.active);
		const target = all.find(
			(r) => r.state === "approved" && !r.active && (!current || r.approvedAt <= current.approvedAt),
		);
		if (!target)
			throw new WorkflowError("conflict", "There is no earlier approved version of this skill to return to.");
		if (!releaseIsIntact(target))
			throw new WorkflowError(
				"conflict",
				"The earlier version's stored package no longer matches its approved checksum, so it can't be used.",
			);
		await tx.query(`update wai_skill_releases set active = false where skill_id = $1 and active`, [
			input.skillId,
		]);
		const updated = await tx.query(
			`update wai_skill_releases set active = true, activated_at = $2::timestamptz where id = $1 returning ${RELEASE_COLUMNS}`,
			[target.id, at],
		);
		return { release: toRelease(updated.rows[0]), from: current?.id ?? null };
	});
	await audit(sql, {
		actor,
		action: "skill.rollback",
		subject: input.skillId,
		outcome: "allowed",
		detail: { to: release.release.id, toVersion: release.release.version, from: release.from },
	});
	return release.release;
}

// ---- What a task followed -------------------------------------------------------------------------------

export type InvocationStage = "selected" | "loaded" | "invoked" | "completed";

export type SkillInvocation = {
	taskId: string;
	skillId: string;
	releaseId: string;
	version: number;
	contentSha256: string;
	role: "primary" | "foundation";
	stage: InvocationStage;
	at: string;
};

/** What is pinned to a task and to its stored result: which procedures, at which exact version. */
export type PinnedSkill = {
	skillId: string;
	title: string;
	releaseId: string;
	version: number;
	contentSha256: string;
	role: "primary" | "foundation";
};

const STAGE_ORDER: Record<InvocationStage, number> = { selected: 0, loaded: 1, invoked: 2, completed: 3 };

export async function recordInvocations(
	sql: Sql,
	taskId: string,
	skills: readonly PinnedSkill[],
	stage: InvocationStage,
): Promise<void> {
	for (const skill of skills)
		await sql.query(
			`insert into wai_skill_invocations (task_id, skill_id, release_id, version, content_sha256, role, stage)
			 values ($1,$2,$3,$4,$5,$6,$7)
			 on conflict (task_id, skill_id) do nothing`,
			[taskId, skill.skillId, skill.releaseId, skill.version, skill.contentSha256, skill.role, stage],
		);
}

/** Moves a task's invocations forward to a stage. A stage never goes backwards. */
export async function advanceInvocations(sql: Sql, taskId: string, stage: InvocationStage): Promise<void> {
	const earlier = (Object.keys(STAGE_ORDER) as InvocationStage[]).filter(
		(s) => STAGE_ORDER[s] < STAGE_ORDER[stage],
	);
	if (!earlier.length) return;
	await sql.query(
		`update wai_skill_invocations set stage = $2, updated_at = now() where task_id = $1 and stage = any($3::text[])`,
		[taskId, stage, earlier],
	);
}

export async function listInvocations(sql: Sql, taskId: string): Promise<SkillInvocation[]> {
	const { rows } = await sql.query(
		`select task_id, skill_id, release_id, version, content_sha256, role, stage, at
		 from wai_skill_invocations where task_id = $1 order by role desc, id`,
		[taskId],
	);
	return rows.map((r) => ({
		taskId: r.task_id as string,
		skillId: r.skill_id as string,
		releaseId: r.release_id as string,
		version: Number(r.version),
		contentSha256: r.content_sha256 as string,
		role: r.role as SkillInvocation["role"],
		stage: r.stage as InvocationStage,
		at: iso(r.at) as string,
	}));
}

/** How often each skill was followed, by how far the task got. Demonstration runs are left out. */
export async function usageBySkill(
	sql: Sql,
): Promise<Map<string, { selected: number; completed: number; lastAt: string | null }>> {
	const { rows } = await sql.query(
		`select i.skill_id, count(*)::int as selected, count(*) filter (where i.stage = 'completed')::int as completed,
			max(i.at) as last_at
		 from wai_skill_invocations i join wai_tasks t on t.id = i.task_id
		 where not t.demo
		 group by i.skill_id`,
	);
	return new Map(
		rows.map((r) => [
			r.skill_id as string,
			{ selected: Number(r.selected), completed: Number(r.completed), lastAt: iso(r.last_at) },
		]),
	);
}

// ---- Improvement proposals ----------------------------------------------------------------------------

export type ProposalState = "open" | "accepted" | "declined" | "superseded";

export type SkillProposal = {
	id: string;
	skillId: string;
	baseVersion: number;
	baseSha256: string;
	summary: string;
	proposedChange: string;
	sourceType: "none" | "work_product" | "draft" | "task";
	sourceId: string | null;
	state: ProposalState;
	createdBy: string;
	createdAt: string;
	decidedBy: string | null;
	decidedAt: string | null;
	decisionNote: string | null;
};

const PROPOSAL_COLUMNS = `id, skill_id, base_version, base_sha256, summary, proposed_change, source_type, source_id, state,
	created_by, created_at, decided_by, decided_at, decision_note`;

const toProposal = (r: Row): SkillProposal => ({
	id: r.id as string,
	skillId: r.skill_id as string,
	baseVersion: Number(r.base_version),
	baseSha256: r.base_sha256 as string,
	summary: r.summary as string,
	proposedChange: r.proposed_change as string,
	sourceType: r.source_type as SkillProposal["sourceType"],
	sourceId: (r.source_id as string | null) ?? null,
	state: r.state as ProposalState,
	createdBy: r.created_by as string,
	createdAt: iso(r.created_at) as string,
	decidedBy: (r.decided_by as string | null) ?? null,
	decidedAt: iso(r.decided_at),
	decisionNote: (r.decision_note as string | null) ?? null,
});

const tidy = (value: string, max: number) =>
	value
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
		.trim()
		.slice(0, max);

/**
 * Records a person's proposal to improve a procedure. It changes nothing: the procedure in use stays exactly as approved
 * until a new version exists in the repository, has been evaluated, and has been approved by the owner.
 */
export async function createProposal(
	sql: Sql,
	actor: OperatorActor,
	input: {
		skill: SkillDefinition;
		summary: string;
		proposedChange: string;
		sourceType?: SkillProposal["sourceType"];
		sourceId?: string | null;
	},
): Promise<SkillProposal> {
	const summary = tidy(input.summary, 200);
	const proposedChange = tidy(input.proposedChange, 4000);
	if (summary.length < 8) throw new WorkflowError("invalid", "Say in a sentence what should improve.");
	if (proposedChange.length < 20)
		throw new WorkflowError("invalid", "Describe the change to the procedure in at least a sentence or two.");
	const sourceType = input.sourceType ?? "none";
	const sourceId = sourceType === "none" ? null : tidy(input.sourceId ?? "", 80) || null;
	if (sourceType !== "none" && !sourceId)
		throw new WorkflowError("invalid", "Give the id of the result this came from, or leave the source out.");
	const { rows } = await sql.query(
		`insert into wai_skill_proposals (skill_id, base_version, base_sha256, summary, proposed_change, source_type,
			source_id, created_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8) returning ${PROPOSAL_COLUMNS}`,
		[
			input.skill.id,
			input.skill.version,
			hashOfSkill(input.skill),
			summary,
			proposedChange,
			sourceType,
			sourceId,
			actorKey(actor),
		],
	);
	await audit(sql, {
		actor,
		action: "skill.propose",
		subject: input.skill.id,
		outcome: "allowed",
		detail: { proposal: rows[0].id, version: input.skill.version },
	});
	return toProposal(rows[0]);
}

export async function listProposals(
	sql: Sql,
	filter: { skillId?: string; state?: ProposalState } = {},
): Promise<SkillProposal[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.skillId) {
		params.push(filter.skillId);
		where.push(`skill_id = $${params.length}`);
	}
	if (filter.state) {
		params.push(filter.state);
		where.push(`state = $${params.length}`);
	}
	const { rows } = await sql.query(
		`select ${PROPOSAL_COLUMNS} from wai_skill_proposals ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by created_at desc, id desc limit 200`,
		params,
	);
	return rows.map(toProposal);
}

/** The owner's decision on a proposal. Accepting it records that the change is wanted; it still changes no procedure. */
export async function decideProposal(
	sql: Sql,
	actor: OperatorActor,
	input: { proposalId: string; decision: "accepted" | "declined"; note?: string; now?: Date },
): Promise<SkillProposal> {
	await requireOwner(sql, actor, "skill.proposal.decide", input.proposalId);
	const { rows } = await sql.query(
		`update wai_skill_proposals set state = $2, decided_by = $3, decided_at = $4::timestamptz, decision_note = $5
		 where id = $1 and state = 'open' returning ${PROPOSAL_COLUMNS}`,
		[
			input.proposalId,
			input.decision,
			actorKey(actor),
			(input.now ?? new Date()).toISOString(),
			tidy(input.note ?? "", 500) || null,
		],
	);
	if (!rows[0])
		throw new WorkflowError("conflict", "That proposal doesn't exist or has already been decided.");
	await audit(sql, {
		actor,
		action: "skill.proposal.decide",
		subject: rows[0].skill_id as string,
		outcome: "allowed",
		detail: { proposal: input.proposalId, decision: input.decision },
	});
	return toProposal(rows[0]);
}
