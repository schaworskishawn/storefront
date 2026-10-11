import { audit } from "./audit";
import { iso, json, type Row, type Sql } from "./db/sql";
import { redactDeep, redactText } from "./redact";
import {
	actorKey,
	actorLabel,
	type OperatorActor,
	type RoleId,
	type Severity,
	type SourceRef,
} from "./types";

/**
 * Findings: things an agent noticed (a stale document, a page error, an integration that stopped answering) with their
 * evidence and where the facts came from. A finding with the same dedupe key as an existing one isn't recorded again, so a
 * schedule that sees the same problem every day doesn't bury the dashboard.
 */

export type FindingStatus = "open" | "acknowledged" | "dismissed" | "resolved";

export type FindingRecord = {
	id: string;
	taskId: string | null;
	roleId: RoleId;
	severity: Severity;
	category: string;
	title: string;
	detail: string;
	evidence: Record<string, unknown>;
	sourceRefs: SourceRef[];
	status: FindingStatus;
	dedupeKey: string | null;
	createdAt: string;
	updatedAt: string;
};

const COLUMNS = `id, task_id, role_id, severity, category, title, detail, evidence, source_refs, status, dedupe_key, created_at, updated_at`;

function mapFinding(r: Row): FindingRecord {
	return {
		id: r.id as string,
		taskId: (r.task_id as string | null) ?? null,
		roleId: r.role_id as RoleId,
		severity: r.severity as Severity,
		category: r.category as string,
		title: r.title as string,
		detail: r.detail as string,
		evidence: (r.evidence as Record<string, unknown>) ?? {},
		sourceRefs: (r.source_refs as SourceRef[]) ?? [],
		status: r.status as FindingStatus,
		dedupeKey: (r.dedupe_key as string | null) ?? null,
		createdAt: iso(r.created_at) as string,
		updatedAt: iso(r.updated_at) as string,
	};
}

export type NewFinding = {
	roleId: RoleId;
	taskId?: string | null;
	severity: Severity;
	category: string;
	title: string;
	detail?: string;
	evidence?: Record<string, unknown>;
	sourceRefs?: SourceRef[];
	dedupeKey?: string | null;
};

/** Records a finding (redacted). Returns the existing one, with `created: false`, when the dedupe key was already used. */
export async function recordFinding(
	sql: Sql,
	input: NewFinding,
): Promise<{ finding: FindingRecord; created: boolean }> {
	const { rows } = await sql.query(
		`insert into wai_findings (task_id, role_id, severity, category, title, detail, evidence, source_refs, dedupe_key)
		 values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
		 on conflict (dedupe_key) do nothing returning ${COLUMNS}`,
		[
			input.taskId ?? null,
			input.roleId,
			input.severity,
			input.category.slice(0, 60),
			redactText(input.title).slice(0, 200),
			redactText(input.detail ?? "").slice(0, 4000),
			json(redactDeep(input.evidence ?? {})),
			json(input.sourceRefs ?? []),
			input.dedupeKey ?? null,
		],
	);
	if (rows[0]) return { finding: mapFinding(rows[0]), created: true };
	const existing = await sql.query(`select ${COLUMNS} from wai_findings where dedupe_key = $1`, [
		input.dedupeKey,
	]);
	return { finding: mapFinding(existing.rows[0]), created: false };
}

const SEVERITY_ORDER = `case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`;

export async function listFindings(
	sql: Sql,
	filter: { status?: FindingStatus; taskId?: string; limit?: number } = {},
): Promise<FindingRecord[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.status) {
		params.push(filter.status);
		where.push(`status = $${params.length}`);
	}
	if (filter.taskId) {
		params.push(filter.taskId);
		where.push(`task_id = $${params.length}`);
	}
	params.push(Math.min(Math.max(filter.limit ?? 100, 1), 300));
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_findings ${where.length ? `where ${where.join(" and ")}` : ""} order by ${SEVERITY_ORDER}, created_at desc limit $${params.length}`,
		params,
	);
	return rows.map(mapFinding);
}

export async function decideFinding(
	sql: Sql,
	actor: OperatorActor,
	id: string,
	decision: "acknowledged" | "dismissed" | "resolved",
	note?: string,
): Promise<FindingRecord | null> {
	const updated = await sql.transaction(async (tx) => {
		const { rows } = await tx.query(
			`update wai_findings set status = $2, updated_at = now() where id = $1 and status in ('open','acknowledged') returning ${COLUMNS}`,
			[id, decision],
		);
		if (!rows[0]) return null;
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note) values ('finding', $1, $2, $3, $4, $5)`,
			[
				id,
				decision === "resolved" ? "acknowledged" : decision,
				actorKey(actor),
				actorLabel(actor),
				note ?? null,
			],
		);
		return mapFinding(rows[0]);
	});
	await audit(sql, {
		actor,
		action: `finding.${decision}`,
		subject: id,
		outcome: updated ? "allowed" : "denied",
	});
	return updated;
}

export async function countOpenFindings(sql: Sql): Promise<Record<Severity, number>> {
	const { rows } = await sql.query<{ severity: Severity; n: number }>(
		`select severity, count(*)::int as n from wai_findings where status = 'open' group by severity`,
	);
	const counts: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
	for (const row of rows) counts[row.severity] = Number(row.n);
	return counts;
}
