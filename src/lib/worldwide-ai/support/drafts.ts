import { iso, json, type Row, type Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import type { RoleId } from "../types";

/** Reply drafts and the exact sources each was written from. A draft belongs to one case and one task. */

export type DraftState = "pending_review" | "saved" | "rejected" | "superseded";
export type SourceStatus = "ok" | "stale" | "missing";

export type DraftSourceRecord = {
	id: string;
	documentId: string;
	version: number;
	title: string;
	contentSha256: string;
	retrievedAt: string;
	freshness: "current" | "stale";
	cited: boolean;
	excerpt: string | null;
};

export type DraftRecord = {
	id: string;
	taskId: string;
	caseId: string;
	kind: string;
	subject: string | null;
	body: string;
	bodySha256: string;
	state: DraftState;
	sourceStatus: SourceStatus;
	warnings: string[];
	model: string | null;
	promptVersion: string | null;
	createdByRole: RoleId;
	createdAt: string;
	updatedAt: string;
	editedBy: string | null;
	reviewedBy: string | null;
	reviewedAt: string | null;
	reviewNote: string | null;
	savedAt: string | null;
};

const COLUMNS = `id, task_id, case_id, kind, subject, body, body_sha256, state, source_status, warnings, model, prompt_version,
	created_by_role, created_at, updated_at, edited_by, reviewed_by, reviewed_at, review_note, saved_at`;

export function mapDraft(r: Row): DraftRecord {
	return {
		id: r.id as string,
		taskId: r.task_id as string,
		caseId: r.case_id as string,
		kind: r.kind as string,
		subject: (r.subject as string | null) ?? null,
		body: r.body as string,
		bodySha256: r.body_sha256 as string,
		state: r.state as DraftState,
		sourceStatus: r.source_status as SourceStatus,
		warnings: (r.warnings as string[]) ?? [],
		model: (r.model as string | null) ?? null,
		promptVersion: (r.prompt_version as string | null) ?? null,
		createdByRole: r.created_by_role as RoleId,
		createdAt: iso(r.created_at) as string,
		updatedAt: iso(r.updated_at) as string,
		editedBy: (r.edited_by as string | null) ?? null,
		reviewedBy: (r.reviewed_by as string | null) ?? null,
		reviewedAt: iso(r.reviewed_at),
		reviewNote: (r.review_note as string | null) ?? null,
		savedAt: iso(r.saved_at),
	};
}

function mapSource(r: Row): DraftSourceRecord {
	return {
		id: r.id as string,
		documentId: r.document_id as string,
		version: Number(r.version),
		title: r.title as string,
		contentSha256: r.content_sha256 as string,
		retrievedAt: iso(r.retrieved_at) as string,
		freshness: r.freshness as "current" | "stale",
		cited: Boolean(r.cited),
		excerpt: (r.excerpt as string | null) ?? null,
	};
}

export type NewDraft = {
	taskId: string;
	caseId: string;
	subject: string | null;
	body: string;
	sourceStatus: SourceStatus;
	warnings: string[];
	model: string | null;
	promptVersion: string | null;
	createdByRole: RoleId;
	sources: Array<{
		documentId: string;
		version: number;
		title: string;
		contentSha256: string;
		retrievedAt: string;
		freshness: "current" | "stale";
		cited: boolean;
		excerpt?: string | null;
	}>;
};

/**
 * Saves a draft and its sources together or not at all. A task gets one draft however often it is retried: a second
 * attempt finds the first (the `task_id` column is unique) and returns it unchanged.
 */
export async function insertDraft(
	sql: Sql,
	input: NewDraft,
): Promise<{ draft: DraftRecord; created: boolean }> {
	return sql.transaction(async (tx) => {
		const inserted = await tx.query(
			`insert into wai_drafts (task_id, case_id, subject, body, body_sha256, source_status, warnings, model, prompt_version, created_by_role)
			 values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
			 on conflict (task_id) do nothing returning ${COLUMNS}`,
			[
				input.taskId,
				input.caseId,
				input.subject,
				input.body,
				sha256Hex(input.body),
				input.sourceStatus,
				json(input.warnings),
				input.model,
				input.promptVersion,
				input.createdByRole,
			],
		);
		if (!inserted.rows[0]) {
			const existing = await tx.query(`select ${COLUMNS} from wai_drafts where task_id = $1`, [input.taskId]);
			return { draft: mapDraft(existing.rows[0]), created: false };
		}
		const draft = mapDraft(inserted.rows[0]);
		for (const source of input.sources) {
			await tx.query(
				`insert into wai_draft_sources (draft_id, document_id, version, title, content_sha256, retrieved_at, freshness, cited, excerpt)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				[
					draft.id,
					source.documentId,
					source.version,
					source.title,
					source.contentSha256,
					source.retrievedAt,
					source.freshness,
					source.cited,
					source.excerpt ?? null,
				],
			);
		}
		return { draft, created: true };
	});
}

export async function getDraft(sql: Sql, id: string): Promise<DraftRecord | null> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_drafts where id = $1`, [id]);
	return rows[0] ? mapDraft(rows[0]) : null;
}

export async function getDraftByTask(sql: Sql, taskId: string): Promise<DraftRecord | null> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_drafts where task_id = $1`, [taskId]);
	return rows[0] ? mapDraft(rows[0]) : null;
}

export async function getDraftSources(sql: Sql, draftId: string): Promise<DraftSourceRecord[]> {
	const { rows } = await sql.query(
		`select id, document_id, version, title, content_sha256, retrieved_at, freshness, cited, excerpt from wai_draft_sources where draft_id = $1 order by cited desc, title`,
		[draftId],
	);
	return rows.map(mapSource);
}

export async function listDrafts(
	sql: Sql,
	filter: { state?: DraftState; caseId?: string; limit?: number } = {},
): Promise<DraftRecord[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.state) {
		params.push(filter.state);
		where.push(`state = $${params.length}`);
	}
	if (filter.caseId) {
		params.push(filter.caseId);
		where.push(`case_id = $${params.length}`);
	}
	params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200));
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_drafts ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`,
		params,
	);
	return rows.map(mapDraft);
}
