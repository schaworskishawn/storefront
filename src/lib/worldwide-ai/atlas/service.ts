import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import { actorKey, actorLabel, type OperatorActor } from "../types";
import { KNOWLEDGE_COLLECTIONS, isCollectionId } from "./collections";
import { evaluateFreshness, isIsoDay, type Freshness } from "./freshness";
import { buildOrQuery } from "./query";

/**
 * Atlas, the knowledge library. A document has numbered versions. A version starts as a draft, and only a person (the
 * owner) approves it; approving makes it the document's current version and supersedes the one before. Only an approved,
 * current version of an approved document is ever returned as a source, and every source carries its version, its content
 * hash and how fresh it is, so an answer can always be traced to exactly what it was read from.
 */

export type AtlasErrorCode = "forbidden" | "invalid" | "not_found" | "conflict";

export class AtlasError extends Error {
	constructor(
		readonly code: AtlasErrorCode,
		message: string,
	) {
		super(message);
		this.name = "AtlasError";
	}
}

export const MAX_CONTENT_CHARS = 200_000;

export type DocumentStatus = "draft" | "approved" | "retired";
export type VersionStatus = "draft" | "approved" | "superseded" | "retired";

export type DocumentRecord = {
	id: string;
	collection: string;
	title: string;
	owner: string;
	source: string;
	status: DocumentStatus;
	currentVersion: number | null;
	reviewDue: string | null;
	expiresAt: string | null;
	tags: string[];
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	/** How trustworthy the current approved version is today. Null when nothing is approved. */
	freshness: Freshness | null;
	approvedAt: string | null;
	versionCount: number;
	pendingVersion: number | null;
};

export type VersionRecord = {
	id: string;
	documentId: string;
	version: number;
	title: string;
	content: string;
	contentSha256: string;
	filePath: string | null;
	fileName: string | null;
	mime: string | null;
	bytes: number | null;
	status: VersionStatus;
	submittedBy: string;
	approvedBy: string | null;
	approvedAt: string | null;
	createdAt: string;
};

type Clock = { now?: Date; staleAfterDays?: number };
const DEFAULT_STALE_DAYS = 180;

function mapDocument(r: Row, clock: Clock): DocumentRecord {
	const approvedAt = iso(r.approved_at);
	const status = r.status as DocumentStatus;
	return {
		id: r.id as string,
		collection: r.collection as string,
		title: r.title as string,
		owner: r.owner as string,
		source: r.source as string,
		status,
		currentVersion: r.current_version === null ? null : Number(r.current_version),
		reviewDue: (r.review_due as string | null) ?? null,
		expiresAt: (r.expires_at as string | null) ?? null,
		tags: (r.tags as string[]) ?? [],
		createdBy: r.created_by as string,
		createdAt: iso(r.created_at) as string,
		updatedAt: iso(r.updated_at) as string,
		freshness:
			status === "approved" && approvedAt
				? evaluateFreshness({
						approvedAt,
						reviewDue: (r.review_due as string | null) ?? null,
						expiresAt: (r.expires_at as string | null) ?? null,
						now: clock.now ?? new Date(),
						staleAfterDays: clock.staleAfterDays ?? DEFAULT_STALE_DAYS,
					})
				: null,
		approvedAt,
		versionCount: Number(r.version_count ?? 0),
		pendingVersion:
			r.pending_version === null || r.pending_version === undefined ? null : Number(r.pending_version),
	};
}

function mapVersion(r: Row): VersionRecord {
	return {
		id: r.id as string,
		documentId: r.document_id as string,
		version: Number(r.version),
		title: r.title as string,
		content: r.content as string,
		contentSha256: r.content_sha256 as string,
		filePath: (r.file_path as string | null) ?? null,
		fileName: (r.file_name as string | null) ?? null,
		mime: (r.mime as string | null) ?? null,
		bytes: r.bytes === null || r.bytes === undefined ? null : Number(r.bytes),
		status: r.status as VersionStatus,
		submittedBy: r.submitted_by as string,
		approvedBy: (r.approved_by as string | null) ?? null,
		approvedAt: iso(r.approved_at),
		createdAt: iso(r.created_at) as string,
	};
}

const DOCUMENT_SELECT = `
	d.id, d.collection, d.title, d.owner, d.source, d.status, d.current_version,
	d.review_due::text as review_due, d.expires_at::text as expires_at, d.tags, d.created_by, d.created_at, d.updated_at,
	(select v.approved_at from wai_document_versions v where v.document_id = d.id and v.version = d.current_version and v.status = 'approved') as approved_at,
	(select count(*)::int from wai_document_versions v where v.document_id = d.id) as version_count,
	(select max(v.version) from wai_document_versions v where v.document_id = d.id and v.status = 'draft') as pending_version`;

const VERSION_COLUMNS = `id, document_id, version, title, content, content_sha256, file_path, file_name, mime, bytes, status,
	submitted_by, approved_by, approved_at, created_at`;

// ---- Writing -----------------------------------------------------------------------

export type FileInfo = { path: string; name: string; mime: string; bytes: number };

export type NewDocument = {
	collection: string;
	title: string;
	owner: string;
	source: string;
	content: string;
	reviewDue?: string | null;
	expiresAt?: string | null;
	tags?: string[];
	file?: FileInfo | null;
};

function validateText(label: string, value: unknown, max: number): string {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) throw new AtlasError("invalid", `${label} is required.`);
	if (text.length > max) throw new AtlasError("invalid", `${label} is too long (at most ${max} characters).`);
	return text;
}

function validateDay(label: string, value: unknown): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (!isIsoDay(value)) throw new AtlasError("invalid", `${label} must be a date like 2026-12-31.`);
	return value;
}

function validateContent(value: unknown): string {
	const content = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
	if (!content) throw new AtlasError("invalid", "The document needs some text.");
	if (content.length > MAX_CONTENT_CHARS)
		throw new AtlasError(
			"invalid",
			`The text is too long (at most ${MAX_CONTENT_CHARS.toLocaleString()} characters).`,
		);
	return content;
}

export async function createDocument(
	sql: Sql,
	actor: OperatorActor,
	input: NewDocument,
): Promise<{ document: DocumentRecord; version: VersionRecord }> {
	if (!isCollectionId(input.collection))
		throw new AtlasError(
			"invalid",
			`Collection must be one of: ${KNOWLEDGE_COLLECTIONS.map((c) => c.id).join(", ")}.`,
		);
	const title = validateText("Title", input.title, 200);
	const owner = validateText("Owner", input.owner, 120);
	const source = validateText("Source", input.source, 300);
	const content = validateContent(input.content);
	const reviewDue = validateDay("Review date", input.reviewDue);
	const expiresAt = validateDay("Expiry date", input.expiresAt);
	const tags = (input.tags ?? [])
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean)
		.slice(0, 10);

	const result = await sql.transaction(async (tx) => {
		const doc = await tx.query<{ id: string }>(
			`insert into wai_documents (collection, title, owner, source, review_due, expires_at, tags, created_by)
			 values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) returning id`,
			[input.collection, title, owner, source, reviewDue, expiresAt, json(tags), actorKey(actor)],
		);
		const documentId = doc.rows[0].id;
		const version = await insertVersion(tx, documentId, 1, title, content, actor, input.file ?? null);
		return { documentId, version };
	});
	await audit(sql, {
		actor,
		action: "atlas.document_created",
		subject: result.documentId,
		outcome: "allowed",
		detail: { collection: input.collection, title },
	});
	const document = await getDocument(sql, result.documentId);
	if (!document) throw new AtlasError("not_found", "The document was not saved.");
	return { document: document.document, version: result.version };
}

async function insertVersion(
	tx: Sql,
	documentId: string,
	version: number,
	title: string,
	content: string,
	actor: OperatorActor,
	file: FileInfo | null,
): Promise<VersionRecord> {
	const { rows } = await tx.query(
		`insert into wai_document_versions (document_id, version, title, content, content_sha256, file_path, file_name, mime, bytes, submitted_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${VERSION_COLUMNS}`,
		[
			documentId,
			version,
			title,
			content,
			sha256Hex(content),
			file?.path ?? null,
			file?.name ?? null,
			file?.mime ?? null,
			file?.bytes ?? null,
			actorKey(actor),
		],
	);
	return mapVersion(rows[0]);
}

export async function addVersion(
	sql: Sql,
	actor: OperatorActor,
	documentId: string,
	input: { content: string; title?: string; file?: FileInfo | null },
): Promise<VersionRecord> {
	const content = validateContent(input.content);
	const version = await sql.transaction(async (tx) => {
		const { rows } = await tx.query(`select status, title from wai_documents where id = $1 for update`, [
			documentId,
		]);
		if (!rows[0]) throw new AtlasError("not_found", "That document doesn't exist.");
		if (rows[0].status === "retired")
			throw new AtlasError("conflict", "A retired document can't get new versions.");
		const next = await tx.query<{ n: number }>(
			`select coalesce(max(version), 0)::int + 1 as n from wai_document_versions where document_id = $1`,
			[documentId],
		);
		const title = input.title?.trim() ? validateText("Title", input.title, 200) : (rows[0].title as string);
		return insertVersion(tx, documentId, Number(next.rows[0].n), title, content, actor, input.file ?? null);
	});
	await audit(sql, {
		actor,
		action: "atlas.version_added",
		subject: documentId,
		outcome: "allowed",
		detail: { version: version.version },
	});
	return version;
}

export async function updateDocumentDetails(
	sql: Sql,
	actor: OperatorActor,
	documentId: string,
	input: {
		owner?: string;
		source?: string;
		reviewDue?: string | null;
		expiresAt?: string | null;
		tags?: string[];
	},
): Promise<DocumentRecord> {
	const sets: string[] = ["updated_at = now()"];
	const params: unknown[] = [documentId];
	const push = (column: string, value: unknown, cast = "") => {
		params.push(value);
		sets.push(`${column} = $${params.length}${cast}`);
	};
	if (input.owner !== undefined) push("owner", validateText("Owner", input.owner, 120));
	if (input.source !== undefined) push("source", validateText("Source", input.source, 300));
	if (input.reviewDue !== undefined) push("review_due", validateDay("Review date", input.reviewDue));
	if (input.expiresAt !== undefined) push("expires_at", validateDay("Expiry date", input.expiresAt));
	if (input.tags !== undefined)
		push(
			"tags",
			json(
				input.tags
					.map((t) => t.trim().toLowerCase())
					.filter(Boolean)
					.slice(0, 10),
			),
			"::jsonb",
		);
	const result = await sql.query(`update wai_documents set ${sets.join(", ")} where id = $1`, params);
	if (!result.rowCount) throw new AtlasError("not_found", "That document doesn't exist.");
	await audit(sql, {
		actor,
		action: "atlas.document_updated",
		subject: documentId,
		outcome: "allowed",
		detail: { fields: Object.keys(input) },
	});
	const updated = await getDocument(sql, documentId);
	if (!updated) throw new AtlasError("not_found", "That document doesn't exist.");
	return updated.document;
}

/**
 * Approves a draft version. Only an owner can; a staff member's attempt is refused (and logged). Approving supersedes the
 * previous approved version in the same transaction, so there is never a moment with two current versions.
 */
export async function approveVersion(
	sql: Sql,
	actor: OperatorActor,
	documentId: string,
	version: number,
	options: { note?: string; reviewDue?: string | null } = {},
): Promise<VersionRecord> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "atlas.approve_version",
			subject: documentId,
			outcome: "denied",
			detail: { version, reason: "owner only" },
		});
		throw new AtlasError("forbidden", "Only the owner can approve a document version.");
	}
	const reviewDue =
		options.reviewDue === undefined ? undefined : validateDay("Review date", options.reviewDue);
	const approved = await sql.transaction(async (tx) => {
		const doc = await tx.query(`select status from wai_documents where id = $1 for update`, [documentId]);
		if (!doc.rows[0]) throw new AtlasError("not_found", "That document doesn't exist.");
		if (doc.rows[0].status === "retired")
			throw new AtlasError("conflict", "A retired document can't be approved.");
		const target = await tx.query(
			`select ${VERSION_COLUMNS} from wai_document_versions where document_id = $1 and version = $2 for update`,
			[documentId, version],
		);
		if (!target.rows[0]) throw new AtlasError("not_found", "That version doesn't exist.");
		if (target.rows[0].status !== "draft")
			throw new AtlasError(
				"conflict",
				`Version ${version} is ${target.rows[0].status as string}, not a draft.`,
			);

		await tx.query(
			`update wai_document_versions set status = 'superseded' where document_id = $1 and status = 'approved'`,
			[documentId],
		);
		const updated = await tx.query(
			`update wai_document_versions set status = 'approved', approved_by = $3, approved_at = now()
			 where document_id = $1 and version = $2 returning ${VERSION_COLUMNS}`,
			[documentId, version, actorKey(actor)],
		);
		await tx.query(
			`update wai_documents set status = 'approved', current_version = $2, title = $3, updated_at = now(),
				review_due = case when $4::boolean then $5::date else review_due end
			 where id = $1`,
			[documentId, version, updated.rows[0].title, reviewDue !== undefined, reviewDue ?? null],
		);
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note, after_sha256)
			 values ('document_version', $1, 'approved', $2, $3, $4, $5)`,
			[
				`${documentId}:${version}`,
				actorKey(actor),
				actorLabel(actor),
				options.note ?? null,
				updated.rows[0].content_sha256,
			],
		);
		return mapVersion(updated.rows[0]);
	});
	await audit(sql, {
		actor,
		action: "atlas.approve_version",
		subject: documentId,
		outcome: "allowed",
		detail: { version },
	});
	return approved;
}

export async function rejectVersion(
	sql: Sql,
	actor: OperatorActor,
	documentId: string,
	version: number,
	note?: string,
): Promise<void> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "atlas.reject_version",
			subject: documentId,
			outcome: "denied",
			detail: { version },
		});
		throw new AtlasError("forbidden", "Only the owner can reject a document version.");
	}
	await sql.transaction(async (tx) => {
		const result = await tx.query(
			`update wai_document_versions set status = 'retired' where document_id = $1 and version = $2 and status = 'draft'`,
			[documentId, version],
		);
		if (!result.rowCount) throw new AtlasError("conflict", "Only a draft version can be rejected.");
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note) values ('document_version', $1, 'rejected', $2, $3, $4)`,
			[`${documentId}:${version}`, actorKey(actor), actorLabel(actor), note ?? null],
		);
	});
	await audit(sql, {
		actor,
		action: "atlas.reject_version",
		subject: documentId,
		outcome: "allowed",
		detail: { version },
	});
}

export async function retireDocument(
	sql: Sql,
	actor: OperatorActor,
	documentId: string,
	note?: string,
): Promise<void> {
	if (actor.role !== "owner") {
		await audit(sql, { actor, action: "atlas.retire_document", subject: documentId, outcome: "denied" });
		throw new AtlasError("forbidden", "Only the owner can retire a document.");
	}
	await sql.transaction(async (tx) => {
		const result = await tx.query(
			`update wai_documents set status = 'retired', updated_at = now() where id = $1 and status <> 'retired'`,
			[documentId],
		);
		if (!result.rowCount)
			throw new AtlasError("conflict", "That document doesn't exist or is already retired.");
		await tx.query(
			`update wai_document_versions set status = 'retired' where document_id = $1 and status in ('approved', 'draft')`,
			[documentId],
		);
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note) values ('document_version', $1, 'retired', $2, $3, $4)`,
			[`${documentId}:all`, actorKey(actor), actorLabel(actor), note ?? null],
		);
	});
	await audit(sql, { actor, action: "atlas.retire_document", subject: documentId, outcome: "allowed" });
}

// ---- Reading -----------------------------------------------------------------------------

export async function getDocument(
	sql: Sql,
	id: string,
	clock: Clock = {},
): Promise<{ document: DocumentRecord; versions: VersionRecord[] } | null> {
	const doc = await sql.query(`select ${DOCUMENT_SELECT} from wai_documents d where d.id = $1`, [id]);
	if (!doc.rows[0]) return null;
	const versions = await sql.query(
		`select ${VERSION_COLUMNS} from wai_document_versions where document_id = $1 order by version desc`,
		[id],
	);
	return { document: mapDocument(doc.rows[0], clock), versions: versions.rows.map(mapVersion) };
}

export async function getVersion(
	sql: Sql,
	documentId: string,
	version: number,
): Promise<VersionRecord | null> {
	const { rows } = await sql.query(
		`select ${VERSION_COLUMNS} from wai_document_versions where document_id = $1 and version = $2`,
		[documentId, version],
	);
	return rows[0] ? mapVersion(rows[0]) : null;
}

export async function listDocuments(
	sql: Sql,
	filter: { collection?: string; status?: DocumentStatus } = {},
	clock: Clock = {},
): Promise<DocumentRecord[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.collection) {
		params.push(filter.collection);
		where.push(`d.collection = $${params.length}`);
	}
	if (filter.status) {
		params.push(filter.status);
		where.push(`d.status = $${params.length}`);
	}
	const { rows } = await sql.query(
		`select ${DOCUMENT_SELECT} from wai_documents d ${where.length ? `where ${where.join(" and ")}` : ""} order by d.collection, d.title`,
		params,
	);
	return rows.map((r) => mapDocument(r, clock));
}

/** Draft versions waiting for the owner, newest first (the review queue shows these). */
export async function listPendingVersions(
	sql: Sql,
): Promise<Array<VersionRecord & { documentTitle: string; collection: string }>> {
	const { rows } = await sql.query(
		`select v.id, v.document_id, v.version, v.title, v.content, v.content_sha256, v.file_path, v.file_name, v.mime, v.bytes, v.status,
			v.submitted_by, v.approved_by, v.approved_at, v.created_at, d.title as document_title, d.collection
		 from wai_document_versions v join wai_documents d on d.id = v.document_id
		 where v.status = 'draft' and d.status <> 'retired' order by v.created_at desc`,
	);
	return rows.map((r) => ({
		...mapVersion(r),
		documentTitle: r.document_title as string,
		collection: r.collection as string,
	}));
}

// ---- Retrieval ---------------------------------------------------------------------------------

export type AtlasHit = {
	documentId: string;
	version: number;
	title: string;
	collection: string;
	owner: string;
	source: string;
	/** The version's full text (shortened if very long), for the model to read as data. */
	content: string;
	truncated: boolean;
	/** A short passage showing the match. */
	excerpt: string;
	contentSha256: string;
	approvedAt: string;
	rank: number;
	freshness: Freshness;
};

export type SkippedSource = { documentId: string; title: string; reason: string };

export type AtlasSearchResult = {
	hits: AtlasHit[];
	/** Matching documents that were left out, and why (expired). Shown so a missing source is never silent. */
	skipped: SkippedSource[];
	retrievedAt: string;
};

export const SOURCE_CHARS = 6_000;

/**
 * Finds approved sources for some text, limited to the collections the caller may read. Drafts, superseded and retired
 * versions never match; expired documents are skipped (and reported); stale ones are returned flagged.
 */
export async function searchApproved(
	sql: Sql,
	args: {
		query: string;
		allowedCollections: readonly string[];
		collection?: string;
		limit?: number;
		now?: Date;
		staleAfterDays?: number;
	},
): Promise<AtlasSearchResult> {
	const now = args.now ?? new Date();
	const retrievedAt = now.toISOString();
	if (args.collection && !args.allowedCollections.includes(args.collection))
		throw new AtlasError("forbidden", `This role can't read the "${args.collection}" collection.`);
	const collections = args.collection ? [args.collection] : [...args.allowedCollections];
	const tsquery = buildOrQuery(args.query.slice(0, 2000));
	if (!tsquery || collections.length === 0) return { hits: [], skipped: [], retrievedAt };

	const limit = Math.min(Math.max(args.limit ?? 3, 1), 5);
	const { rows } = await sql.query(
		`select d.id as document_id, d.collection, d.title, d.owner, d.source, d.review_due::text as review_due, d.expires_at::text as expires_at,
			v.version, v.content, v.content_sha256, v.approved_at,
			ts_rank_cd(v.search, q.query) as rank,
			ts_headline('english', v.content, q.query, 'MaxWords=40, MinWords=12, ShortWord=2, MaxFragments=1') as excerpt
		 from wai_documents d
		 join wai_document_versions v on v.document_id = d.id and v.version = d.current_version
		 cross join (select to_tsquery('english', $1) as query) q
		 where d.status = 'approved' and v.status = 'approved' and d.collection = any($2::text[]) and v.search @@ q.query
		 order by rank desc, d.updated_at desc
		 limit 20`,
		[tsquery, collections],
	);

	const hits: AtlasHit[] = [];
	const skipped: SkippedSource[] = [];
	for (const r of rows) {
		const freshness = evaluateFreshness({
			approvedAt: iso(r.approved_at),
			reviewDue: (r.review_due as string | null) ?? null,
			expiresAt: (r.expires_at as string | null) ?? null,
			now,
			staleAfterDays: args.staleAfterDays ?? DEFAULT_STALE_DAYS,
		});
		if (freshness.state === "expired") {
			skipped.push({
				documentId: r.document_id as string,
				title: r.title as string,
				reason: freshness.reasons.join(" "),
			});
			continue;
		}
		if (hits.length >= limit) continue;
		const content = r.content as string;
		hits.push({
			documentId: r.document_id as string,
			version: Number(r.version),
			title: r.title as string,
			collection: r.collection as string,
			owner: r.owner as string,
			source: r.source as string,
			content: content.length > SOURCE_CHARS ? content.slice(0, SOURCE_CHARS) : content,
			truncated: content.length > SOURCE_CHARS,
			excerpt: String(r.excerpt ?? "")
				.replace(/<\/?b>/g, "")
				.trim(),
			contentSha256: r.content_sha256 as string,
			approvedAt: iso(r.approved_at) as string,
			rank: Number(r.rank),
			freshness,
		});
	}
	return { hits, skipped, retrievedAt };
}

/** Whether a document version still exists with the same content, for checking a draft's references after it was saved. */
export async function versionStillMatches(
	sql: Sql,
	documentId: string,
	version: number,
	sha256: string,
): Promise<boolean> {
	const { rows } = await sql.query(
		`select 1 from wai_document_versions where document_id = $1 and version = $2 and content_sha256 = $3`,
		[documentId, version, sha256],
	);
	return rows.length === 1;
}
