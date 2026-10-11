import { audit } from "../audit";
import { iso, type Row, type Sql } from "../db/sql";
import { actorKey, type OperatorActor } from "../types";
import { WorkflowError } from "../workflows/types";

/**
 * The RFID and NFC tag registry.
 *
 * A tag is registered once, under the identifier it reports. What it is attached to is an assignment: a tag has one at a
 * time, and ended assignments are kept as its history. A scan is stored as an observation and nothing more. It moves no
 * stock, places nothing on a shelf, and proves nothing about authenticity, identity, age or safety. A tag nobody
 * registered, or one that was revoked or retired, turns a scan into an exception for a person to resolve.
 *
 * No reader is connected, so scans are typed in or pasted from a reader's export, and nothing here verifies a tag
 * cryptographically: a tag that supports it is recorded as supporting it, and that is all.
 */

export class TagError extends WorkflowError {
	constructor(code: "invalid" | "not_found" | "conflict" | "forbidden", message: string) {
		super(code, message);
		this.name = "TagError";
	}
}

export const TECHNOLOGIES = { uhf_rfid: "UHF RFID", nfc: "NFC" } as const;
export type Technology = keyof typeof TECHNOLOGIES;

export const SECURITY = {
	plain: "Readable identifier only",
	password: "Password-protected memory",
	cryptographic: "Supports cryptographic verification",
} as const;
export type Security = keyof typeof SECURITY;

export const SUBJECT_KINDS = {
	product_unit: "Product unit",
	carton: "Carton",
	case: "Case",
	container: "Container",
	location: "Location",
	equipment: "Equipment",
	tote: "Tote",
} as const;
export type SubjectKind = keyof typeof SUBJECT_KINDS;

/** The kinds other tagged things can be inside. */
const HOLDERS: readonly SubjectKind[] = ["carton", "case", "container", "tote"];

export const WORKFLOWS = {
	receiving: "Receiving",
	cycle_count: "Cycle count",
	picking: "Picking",
	shipping: "Shipping",
	lookup: "Looking a tag up",
	other: "Other",
} as const;
export type Workflow = keyof typeof WORKFLOWS;

export const SCAN_SOURCES = {
	manual: "Typed in by a person",
	reader_export: "From a reader's export",
	simulated: "Simulated, not a real read",
} as const;
export type ScanSource = keyof typeof SCAN_SOURCES;

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

const pick = <T extends string>(options: Record<T, string>, value: unknown): T | undefined =>
	(Object.keys(options) as T[]).find((option) => option === value);

/**
 * The identifier as it is stored: upper-case hexadecimal with the separators a reader or a label prints taken out. An NFC
 * UID is 4, 7 or 10 bytes. A UHF identifier (EPC) is a whole number of 16-bit words, at least one. Anything else is refused
 * rather than guessed at.
 */
export function normalizeUid(technology: Technology, raw: unknown): string {
	const uid = tidy(raw, 200)
		.replace(/^0x/i, "")
		.replace(/[\s:.\-]/g, "")
		.toUpperCase();
	if (!uid) throw new TagError("invalid", "Enter the tag's identifier.");
	if (!/^[0-9A-F]+$/.test(uid))
		throw new TagError(
			"invalid",
			`"${tidy(raw, 60)}" isn't a tag identifier. It should be hexadecimal: the digits 0 to 9 and the letters A to F.`,
		);
	if (technology === "nfc") {
		if (![8, 14, 20].includes(uid.length))
			throw new TagError(
				"invalid",
				`An NFC identifier is 4, 7 or 10 bytes (8, 14 or 20 characters). "${uid}" is ${uid.length} characters.`,
			);
	} else if (uid.length % 4 !== 0 || uid.length < 16 || uid.length > 124)
		throw new TagError(
			"invalid",
			`A UHF identifier is a whole number of 16-bit words, 16 to 124 characters. "${uid}" is ${uid.length} characters.`,
		);
	return uid;
}

// ---- Tags ---------------------------------------------------------------------------------------------

export type Tag = {
	id: string;
	technology: Technology;
	uid: string;
	security: Security;
	status: "active" | "retired" | "revoked";
	statusReason: string | null;
	sourceRef: string | null;
	note: string | null;
	registeredBy: string;
	registeredAt: string;
	verifiedBy: string | null;
	verifiedAt: string | null;
};

export type Assignment = {
	id: string;
	tagId: string;
	subjectKind: SubjectKind;
	subjectRef: string;
	sku: string | null;
	lot: string | null;
	serial: string | null;
	parentTagId: string | null;
	parentUid: string | null;
	equipmentId: string | null;
	packagingRunId: string | null;
	unitsDeclared: number | null;
	unitsSource: string | null;
	assignedBy: string;
	assignedAt: string;
	endedBy: string | null;
	endedAt: string | null;
	endReason: string | null;
};

const TAG_COLUMNS = `t.id, t.technology, t.tag_uid, t.security, t.status, t.status_reason, t.source_ref, t.note, t.registered_by,
	t.registered_at, t.verified_by, t.verified_at`;
const ASSIGNMENT_COLUMNS = `a.id, a.tag_id, a.subject_kind, a.subject_ref, a.sku, a.lot, a.serial, a.parent_tag_id,
	p.tag_uid as parent_uid, a.equipment_id, a.packaging_run_id, a.units_declared, a.units_source, a.assigned_by, a.assigned_at,
	a.ended_by, a.ended_at, a.end_reason`;
const ASSIGNMENT_FROM = `wai_tag_assignments a left join wai_tags p on p.id = a.parent_tag_id`;

const toTag = (r: Row): Tag => ({
	id: r.id as string,
	technology: r.technology as Technology,
	uid: r.tag_uid as string,
	security: r.security as Security,
	status: r.status as Tag["status"],
	statusReason: (r.status_reason as string | null) ?? null,
	sourceRef: (r.source_ref as string | null) ?? null,
	note: (r.note as string | null) ?? null,
	registeredBy: r.registered_by as string,
	registeredAt: iso(r.registered_at) as string,
	verifiedBy: (r.verified_by as string | null) ?? null,
	verifiedAt: iso(r.verified_at),
});

const toAssignment = (r: Row): Assignment => ({
	id: r.id as string,
	tagId: r.tag_id as string,
	subjectKind: r.subject_kind as SubjectKind,
	subjectRef: r.subject_ref as string,
	sku: (r.sku as string | null) ?? null,
	lot: (r.lot as string | null) ?? null,
	serial: (r.serial as string | null) ?? null,
	parentTagId: (r.parent_tag_id as string | null) ?? null,
	parentUid: (r.parent_uid as string | null) ?? null,
	equipmentId: (r.equipment_id as string | null) ?? null,
	packagingRunId: (r.packaging_run_id as string | null) ?? null,
	unitsDeclared:
		r.units_declared === null || r.units_declared === undefined ? null : Number(r.units_declared),
	unitsSource: (r.units_source as string | null) ?? null,
	assignedBy: r.assigned_by as string,
	assignedAt: iso(r.assigned_at) as string,
	endedBy: (r.ended_by as string | null) ?? null,
	endedAt: iso(r.ended_at),
	endReason: (r.end_reason as string | null) ?? null,
});

/**
 * Registers tags, one identifier to a line, all of one technology from one source. All of them are registered or none is:
 * a line that can't be read, repeats another, or is already registered is named with its line number.
 */
export async function registerTags(
	sql: Sql,
	actor: OperatorActor,
	input: { technology: string; security: string; uids: string; sourceRef?: string; note?: string },
): Promise<Tag[]> {
	const technology = pick(TECHNOLOGIES, input.technology);
	if (!technology) throw new TagError("invalid", "Choose UHF RFID or NFC. They are different kinds of tag.");
	const security = pick(SECURITY, input.security);
	if (!security) throw new TagError("invalid", "Choose what the tag itself can do.");
	const lines = (typeof input.uids === "string" ? input.uids : "")
		.split(/[\r\n,;]+/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) throw new TagError("invalid", "Enter at least one tag identifier.");
	if (lines.length > 500) throw new TagError("invalid", "Register at most 500 tags at a time.");
	const problems: string[] = [];
	const uids: string[] = [];
	lines.forEach((line, index) => {
		try {
			const uid = normalizeUid(technology, line);
			if (uids.includes(uid)) problems.push(`Line ${index + 1}: ${uid} is listed twice.`);
			else uids.push(uid);
		} catch (error) {
			problems.push(`Line ${index + 1}: ${error instanceof Error ? error.message : "can't be read."}`);
		}
	});
	if (problems.length)
		throw new TagError("invalid", `Nothing was registered. ${problems.slice(0, 8).join(" ")}`);
	const tags = await sql.transaction(async (tx) => {
		const existing = await tx.query<{ tag_uid: string }>(
			`select tag_uid from wai_tags where technology = $1 and tag_uid = any($2::text[])`,
			[technology, uids],
		);
		if (existing.rows.length)
			throw new TagError(
				"conflict",
				`Nothing was registered. Already in the registry: ${existing.rows
					.map((r) => r.tag_uid)
					.slice(0, 8)
					.join(", ")}.`,
			);
		const made: Tag[] = [];
		for (const uid of uids) {
			const { rows } = await tx.query(
				`insert into wai_tags as t (technology, tag_uid, security, source_ref, note, registered_by)
				 values ($1,$2,$3,$4,$5,$6) returning ${TAG_COLUMNS}`,
				[
					technology,
					uid,
					security,
					tidy(input.sourceRef, 200) || null,
					tidy(input.note, 500) || null,
					actorKey(actor),
				],
			);
			made.push(toTag(rows[0]));
		}
		return made;
	});
	await audit(sql, {
		actor,
		action: "tag.register",
		subject: tags[0].id,
		outcome: "allowed",
		detail: { technology, count: tags.length, source: tidy(input.sourceRef, 200) || null },
	});
	return tags;
}

async function tagById(sql: Sql, id: string, lock = false): Promise<Tag> {
	const { rows } = await sql.query(
		`select ${TAG_COLUMNS} from wai_tags t where t.id = $1 ${lock ? "for update" : ""}`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new TagError("not_found", "That tag isn't in the registry.");
	return toTag(rows[0]);
}

async function currentAssignment(sql: Sql, tagId: string): Promise<Assignment | null> {
	const { rows } = await sql.query(
		`select ${ASSIGNMENT_COLUMNS} from ${ASSIGNMENT_FROM} where a.tag_id = $1 and a.ended_at is null`,
		[tagId],
	);
	return rows[0] ? toAssignment(rows[0]) : null;
}

/** A person read the tag and confirms the identifier on record is the one it reports. */
export async function verifyTag(sql: Sql, actor: OperatorActor, tagId: string): Promise<Tag> {
	const { rows } = await sql.query(
		`update wai_tags as t set verified_by = $2, verified_at = now() where t.id = $1 and t.verified_at is null
		 returning ${TAG_COLUMNS}`,
		[tidy(tagId, 60), actorKey(actor)],
	);
	if (!rows[0]) throw new TagError("conflict", "That tag isn't in the registry, or is already confirmed.");
	const tag = toTag(rows[0]);
	await audit(sql, {
		actor,
		action: "tag.verify",
		subject: tag.id,
		outcome: "allowed",
		detail: { uid: tag.uid },
	});
	return tag;
}

export type NewAssignment = {
	tagId: string;
	subjectKind: string;
	subjectRef: string;
	sku?: string;
	lot?: string;
	serial?: string;
	/** The identifier of the tagged carton, case, container or tote this is inside. */
	parentUid?: string;
	equipmentId?: string;
	packagingRunId?: string;
	unitsDeclared?: string;
	unitsSource?: string;
};

/**
 * Attaches a tag to something. A tag is attached to one thing at a time, so an existing assignment has to be ended first,
 * and a retired or revoked tag can't be attached at all. A carton's quantity is taken from the manifest named beside it,
 * never from the tag.
 */
export async function assignTag(sql: Sql, actor: OperatorActor, input: NewAssignment): Promise<Assignment> {
	const subjectKind = pick(SUBJECT_KINDS, input.subjectKind);
	if (!subjectKind) throw new TagError("invalid", "Choose what the tag is attached to.");
	const subjectRef = tidy(input.subjectRef, 200);
	if (!subjectRef)
		throw new TagError("invalid", "Say what it is: the product, the shelf, the equipment, the tote.");
	const unitsText = tidy(input.unitsDeclared, 8);
	const holder = HOLDERS.includes(subjectKind);
	if (unitsText && !holder)
		throw new TagError("invalid", "Only a carton, case, container or tote holds a number of units.");
	if (unitsText && !/^\d{1,6}$/.test(unitsText))
		throw new TagError("invalid", "The number of units must be a whole number.");
	const units = unitsText ? Number(unitsText) : null;
	if (units !== null && units < 1) throw new TagError("invalid", "The number of units must be at least one.");
	const unitsSource = tidy(input.unitsSource, 200) || null;
	if (units !== null && !unitsSource)
		throw new TagError(
			"invalid",
			"Name the manifest or packing list the number of units comes from. It is never read from the tag.",
		);

	const id = await sql.transaction(async (tx) => {
		const tag = await tagById(tx, input.tagId, true);
		if (tag.status !== "active")
			throw new TagError(
				"conflict",
				`Tag ${tag.uid} is ${tag.status} (${tag.statusReason}), so it can't be attached to anything.`,
			);
		const existing = await currentAssignment(tx, tag.id);
		if (existing)
			throw new TagError(
				"conflict",
				`Tag ${tag.uid} is already attached to ${SUBJECT_KINDS[existing.subjectKind].toLowerCase()} "${existing.subjectRef}". End that first: a tag is attached to one thing at a time.`,
			);
		let parentId: string | null = null;
		const parentText = tidy(input.parentUid, 200);
		if (parentText) {
			const parentUid = normalizeUid(tag.technology, parentText);
			const found = await tx.query<{ id: string; status: string }>(
				`select id, status from wai_tags where technology = $1 and tag_uid = $2`,
				[tag.technology, parentUid],
			);
			const parent = found.rows[0];
			if (!parent)
				throw new TagError("invalid", `The tag it is inside, ${parentUid}, isn't in the registry.`);
			if (parent.id === tag.id) throw new TagError("invalid", "A tag can't be inside itself.");
			const holding = await currentAssignment(tx, parent.id);
			if (parent.status !== "active" || !holding || !HOLDERS.includes(holding.subjectKind))
				throw new TagError(
					"conflict",
					`Tag ${parentUid} isn't attached to a carton, case, container or tote at the moment, so nothing can be inside it.`,
				);
			// No loop can be made here: the tag being attached has no assignment yet, so nothing is inside it, and a
			// container can't be taken off or re-attached while things are recorded inside it.
			parentId = parent.id;
		}
		let sku = tidy(input.sku, 120) || null;
		let lot = tidy(input.lot, 120) || null;
		const equipmentId = tidy(input.equipmentId, 60) || null;
		if (equipmentId) {
			if (subjectKind !== "equipment")
				throw new TagError(
					"invalid",
					"Choose Equipment as what it is attached to, or leave the equipment blank.",
				);
			const found = await tx.query(`select 1 from wai_equipment where id = $1`, [equipmentId]);
			if (!found.rows[0]) throw new TagError("invalid", "That equipment doesn't exist.");
		}
		const packagingRunId = tidy(input.packagingRunId, 60) || null;
		if (packagingRunId) {
			const run = await tx.query<{ code: string; sku: string }>(
				`select code, sku from wai_packaging_runs where id = $1`,
				[packagingRunId],
			);
			if (!run.rows[0]) throw new TagError("invalid", "That packaging run doesn't exist.");
			// The packaged lot is the run. Its SKU and code are taken from the record, not retyped.
			sku = run.rows[0].sku;
			lot = run.rows[0].code;
		}
		const { rows } = await tx.query<{ id: string }>(
			`insert into wai_tag_assignments (tag_id, subject_kind, subject_ref, sku, lot, serial, parent_tag_id, equipment_id,
				packaging_run_id, units_declared, units_source, assigned_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
			[
				tag.id,
				subjectKind,
				subjectRef,
				sku,
				lot,
				tidy(input.serial, 120) || null,
				parentId,
				equipmentId,
				packagingRunId,
				units,
				units === null ? null : unitsSource,
				actorKey(actor),
			],
		);
		return rows[0].id;
	});
	const { rows } = await sql.query(`select ${ASSIGNMENT_COLUMNS} from ${ASSIGNMENT_FROM} where a.id = $1`, [
		id,
	]);
	const assignment = toAssignment(rows[0]);
	await audit(sql, {
		actor,
		action: "tag.assign",
		subject: assignment.tagId,
		outcome: "allowed",
		detail: { kind: subjectKind, subject: subjectRef, sku: assignment.sku, lot: assignment.lot },
	});
	return assignment;
}

async function endCurrent(tx: Sql, actor: OperatorActor, tagId: string, reason: string): Promise<boolean> {
	const { rows } = await tx.query(
		`update wai_tag_assignments set ended_by = $2, ended_at = now(), end_reason = $3 where tag_id = $1 and ended_at is null
		 returning id`,
		[tagId, actorKey(actor), reason],
	);
	return rows.length > 0;
}

/** Ends what a tag is attached to, with a reason. The assignment is kept as history. */
export async function endAssignment(
	sql: Sql,
	actor: OperatorActor,
	input: { tagId: string; reason: string },
): Promise<void> {
	const reason = tidy(input.reason, 500);
	if (!reason) throw new TagError("invalid", "Say why the tag is being taken off.");
	const tag = await sql.transaction(async (tx) => {
		const found = await tagById(tx, input.tagId, true);
		const inside = await tx.query(
			`select 1 from wai_tag_assignments where parent_tag_id = $1 and ended_at is null limit 1`,
			[found.id],
		);
		if (inside.rows[0])
			throw new TagError(
				"conflict",
				`Other tags are recorded as inside ${found.uid}. End those first, so nothing is left inside a container that no longer exists.`,
			);
		if (!(await endCurrent(tx, actor, found.id, reason)))
			throw new TagError("conflict", `Tag ${found.uid} isn't attached to anything.`);
		return found;
	});
	await audit(sql, {
		actor,
		action: "tag.unassign",
		subject: tag.id,
		outcome: "allowed",
		detail: { uid: tag.uid, reason },
	});
}

/**
 * Retires a tag (end of life, anyone), revokes it (it shouldn't be trusted: damaged, lost, possibly copied; anyone), or
 * puts it back in use (the owner). Retiring or revoking ends what it is attached to.
 */
export async function setTagStatus(
	sql: Sql,
	actor: OperatorActor,
	input: { tagId: string; status: string; reason: string },
): Promise<Tag> {
	const status = (["active", "retired", "revoked"] as const).find((s) => s === input.status);
	if (!status) throw new TagError("invalid", "A tag is in use, retired or revoked.");
	if (status === "active" && actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "tag.reinstate",
			subject: input.tagId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new TagError("forbidden", "Only the owner can put a retired or revoked tag back in use.");
	}
	const reason = tidy(input.reason, 500);
	if (!reason) throw new TagError("invalid", "Say why.");
	const tag = await sql.transaction(async (tx) => {
		const found = await tagById(tx, input.tagId, true);
		if (found.status === status) throw new TagError("conflict", `Tag ${found.uid} is already ${status}.`);
		if (status !== "active") {
			const inside = await tx.query(
				`select 1 from wai_tag_assignments where parent_tag_id = $1 and ended_at is null limit 1`,
				[found.id],
			);
			if (inside.rows[0])
				throw new TagError("conflict", `Other tags are recorded as inside ${found.uid}. End those first.`);
			await endCurrent(tx, actor, found.id, `Tag ${status}: ${reason}`);
		}
		const { rows } = await tx.query(
			`update wai_tags as t set status = $2, status_reason = $3, status_changed_by = $4, status_changed_at = now() where t.id = $1
			 returning ${TAG_COLUMNS}`,
			[found.id, status, status === "active" ? null : reason, actorKey(actor)],
		);
		return toTag(rows[0]);
	});
	await audit(sql, {
		actor,
		action: status === "active" ? "tag.reinstate" : `tag.${status === "retired" ? "retire" : "revoke"}`,
		subject: tag.id,
		outcome: "allowed",
		detail: { uid: tag.uid, reason },
	});
	return tag;
}

export type TagRow = { tag: Tag; assignment: Assignment | null };

export async function listTags(
	sql: Sql,
	filter: { q?: string; technology?: string; unassigned?: boolean } = {},
): Promise<TagRow[]> {
	const where: string[] = [];
	const values: unknown[] = [];
	const technology = pick(TECHNOLOGIES, filter.technology);
	if (technology) where.push(`t.technology = $${values.push(technology)}`);
	const q = tidy(filter.q, 80);
	if (q) {
		const n = values.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
		where.push(
			`(t.tag_uid ilike $${n} or exists (select 1 from wai_tag_assignments x where x.tag_id = t.id and x.ended_at is null
				and (x.subject_ref ilike $${n} or x.sku ilike $${n} or x.lot ilike $${n} or x.serial ilike $${n})))`,
		);
	}
	if (filter.unassigned)
		where.push(
			`t.status = 'active' and not exists (select 1 from wai_tag_assignments x where x.tag_id = t.id and x.ended_at is null)`,
		);
	const { rows } = await sql.query(
		`select ${TAG_COLUMNS} from wai_tags t ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by t.registered_at desc, t.tag_uid limit 300`,
		values,
	);
	const tags = rows.map(toTag);
	if (tags.length === 0) return [];
	const assignments = await sql.query(
		`select ${ASSIGNMENT_COLUMNS} from ${ASSIGNMENT_FROM} where a.tag_id = any($1::uuid[]) and a.ended_at is null`,
		[tags.map((tag) => tag.id)],
	);
	const current = assignments.rows.map(toAssignment);
	return tags.map((tag) => ({ tag, assignment: current.find((a) => a.tagId === tag.id) ?? null }));
}

/** How many tags there are, and how many of the ones in use are attached to nothing. */
export async function tagCounts(
	sql: Sql,
): Promise<{ total: number; unassigned: number; openExceptions: number }> {
	const { rows } = await sql.query<{ total: number; unassigned: number; exceptions: number }>(
		`select (select count(*)::int from wai_tags) as total,
			(select count(*)::int from wai_tags t where t.status = 'active'
				and not exists (select 1 from wai_tag_assignments x where x.tag_id = t.id and x.ended_at is null)) as unassigned,
			(select count(*)::int from wai_tag_exceptions where status = 'open') as exceptions`,
	);
	return {
		total: Number(rows[0].total),
		unassigned: Number(rows[0].unassigned),
		openExceptions: Number(rows[0].exceptions),
	};
}

// ---- Scans and exceptions -----------------------------------------------------------------------------

export type ScanEvent = {
	id: string;
	eventId: string;
	technology: Technology;
	uid: string;
	tagId: string | null;
	station: string;
	workflow: Workflow;
	source: ScanSource;
	evidence: string | null;
	observedAt: string;
	receivedAt: string;
	exceptionId: string | null;
	operator: string;
};

export type TagException = {
	id: string;
	technology: Technology;
	uid: string;
	kind: "unknown_tag" | "revoked_seen" | "retired_seen";
	detail: string;
	status: "open" | "resolved";
	raisedAt: string;
	seen: number;
	lastSeenAt: string;
	resolvedAt: string | null;
	resolution: string | null;
};

export const EXCEPTION_LABELS: Record<TagException["kind"], string> = {
	unknown_tag: "Tag not in the registry",
	revoked_seen: "Revoked tag seen",
	retired_seen: "Retired tag seen",
};

const SCAN_COLUMNS = `id, event_id, technology, tag_uid, tag_id, station, workflow, source, evidence, observed_at, received_at,
	exception_id, operator`;
const EXCEPTION_COLUMNS = `id, technology, tag_uid, kind, detail, status, raised_at, seen, last_seen_at, resolved_at, resolution`;

const toScan = (r: Row): ScanEvent => ({
	id: r.id as string,
	eventId: r.event_id as string,
	technology: r.technology as Technology,
	uid: r.tag_uid as string,
	tagId: (r.tag_id as string | null) ?? null,
	station: r.station as string,
	workflow: r.workflow as Workflow,
	source: r.source as ScanSource,
	evidence: (r.evidence as string | null) ?? null,
	observedAt: iso(r.observed_at) as string,
	receivedAt: iso(r.received_at) as string,
	exceptionId: (r.exception_id as string | null) ?? null,
	operator: r.operator as string,
});

const toException = (r: Row): TagException => ({
	id: r.id as string,
	technology: r.technology as Technology,
	uid: r.tag_uid as string,
	kind: r.kind as TagException["kind"],
	detail: r.detail as string,
	status: r.status as TagException["status"],
	raisedAt: iso(r.raised_at) as string,
	seen: Number(r.seen),
	lastSeenAt: iso(r.last_seen_at) as string,
	resolvedAt: iso(r.resolved_at),
	resolution: (r.resolution as string | null) ?? null,
});

export type NewScan = {
	/** The reader's own id for the read. Leave it out for a scan typed in, and one is made. */
	eventId?: string;
	technology: string;
	uid: string;
	station: string;
	workflow: string;
	source: string;
	evidence?: string;
	/** When the tag was read, if the reader says. Otherwise the moment it is recorded. */
	observedAt?: string;
};

export type ScanOutcome = {
	event: ScanEvent;
	/** False when this event id had already been recorded: the earlier observation is returned and nothing is added. */
	recorded: boolean;
	tag: Tag | null;
	assignment: Assignment | null;
	exception: TagException | null;
};

/**
 * Stores a scan as an observation. The same event id arriving twice (a replayed export, a retried request) is one
 * observation. A tag that isn't registered, or is revoked or retired, raises an exception, or adds to the one already open
 * for it. Nothing else happens: no stock moves, no location is set, and nothing is said about authenticity.
 */
export async function recordScan(
	sql: Sql,
	actor: OperatorActor,
	input: NewScan,
	now: Date,
): Promise<ScanOutcome> {
	const technology = pick(TECHNOLOGIES, input.technology);
	if (!technology) throw new TagError("invalid", "Choose UHF RFID or NFC.");
	const uid = normalizeUid(technology, input.uid);
	const station = tidy(input.station, 160);
	if (!station) throw new TagError("invalid", "Say where it was read: the reader, the station or the place.");
	const workflow = pick(WORKFLOWS, input.workflow);
	if (!workflow) throw new TagError("invalid", "Choose what the scan was for.");
	const source = pick(SCAN_SOURCES, input.source);
	if (!source)
		throw new TagError("invalid", "Say where the scan came from, and whether it is real or simulated.");
	const eventId = tidy(input.eventId, 200) || `manual:${actorKey(actor)}:${now.toISOString()}:${uid}`;
	const observedText = tidy(input.observedAt, 40);
	const observed = observedText ? new Date(observedText) : now;
	if (Number.isNaN(observed.getTime()))
		throw new TagError("invalid", "The time it was read must be a date and time, like 2026-10-14T15:00:00Z.");
	if (observed.getTime() > now.getTime() + 5 * 60_000)
		throw new TagError("invalid", "The time it was read is in the future.");

	const done = await sql.transaction(async (tx) => {
		const before = await tx.query(`select ${SCAN_COLUMNS} from wai_scan_events where event_id = $1`, [
			eventId,
		]);
		if (before.rows[0]) return { event: toScan(before.rows[0]), recorded: false };
		const found = await tx.query(
			`select ${TAG_COLUMNS} from wai_tags t where t.technology = $1 and t.tag_uid = $2`,
			[technology, uid],
		);
		const tag = found.rows[0] ? toTag(found.rows[0]) : null;
		const kind: TagException["kind"] | null = !tag
			? "unknown_tag"
			: tag.status === "revoked"
				? "revoked_seen"
				: tag.status === "retired"
					? "retired_seen"
					: null;
		let exceptionId: string | null = null;
		if (kind) {
			const detail = !tag
				? `Read at ${station}. No tag with this identifier is registered.`
				: `Read at ${station}. This tag was ${tag.status}: ${tag.statusReason}`;
			const raised = await tx.query<{ id: string }>(
				`insert into wai_tag_exceptions (technology, tag_uid, kind, detail, raised_at, last_seen_at) values ($1,$2,$3,$4,$5,$5)
				 on conflict (technology, tag_uid, kind) where status = 'open'
				 do update set seen = wai_tag_exceptions.seen + 1, last_seen_at = excluded.last_seen_at
				 returning id`,
				[technology, uid, kind, detail, observed.toISOString()],
			);
			exceptionId = raised.rows[0].id;
		}
		const { rows } = await tx.query(
			`insert into wai_scan_events (event_id, technology, tag_uid, tag_id, station, workflow, source, evidence, observed_at,
				exception_id, operator)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${SCAN_COLUMNS}`,
			[
				eventId,
				technology,
				uid,
				tag?.id ?? null,
				station,
				workflow,
				source,
				tidy(input.evidence, 500) || null,
				observed.toISOString(),
				exceptionId,
				actorKey(actor),
			],
		);
		return { event: toScan(rows[0]), recorded: true };
	});
	const tag = done.event.tagId ? await tagById(sql, done.event.tagId) : null;
	const exception = done.event.exceptionId
		? toException(
				(
					await sql.query(`select ${EXCEPTION_COLUMNS} from wai_tag_exceptions where id = $1`, [
						done.event.exceptionId,
					])
				).rows[0],
			)
		: null;
	if (done.recorded)
		await audit(sql, {
			actor,
			action: "tag.scan",
			subject: done.event.id,
			outcome: "allowed",
			detail: { uid, station, workflow, source, exception: exception?.kind ?? null },
		});
	return {
		...done,
		tag,
		assignment: tag ? await currentAssignment(sql, tag.id) : null,
		exception,
	};
}

export async function listScans(
	sql: Sql,
	filter: { tagId?: string; limit?: number } = {},
): Promise<ScanEvent[]> {
	const { rows } = await sql.query(
		`select ${SCAN_COLUMNS} from wai_scan_events ${filter.tagId ? "where tag_id = $2" : ""}
		 order by observed_at desc, received_at desc limit $1`,
		filter.tagId ? [Math.min(filter.limit ?? 100, 300), filter.tagId] : [Math.min(filter.limit ?? 100, 300)],
	);
	return rows.map(toScan);
}

export async function listExceptions(
	sql: Sql,
	status: "open" | "resolved" = "open",
): Promise<TagException[]> {
	const { rows } = await sql.query(
		`select ${EXCEPTION_COLUMNS} from wai_tag_exceptions where status = $1 order by last_seen_at desc limit 200`,
		[status],
	);
	return rows.map(toException);
}

/** A person closes an exception, saying what it turned out to be and what was done. */
export async function resolveException(
	sql: Sql,
	actor: OperatorActor,
	input: { exceptionId: string; resolution: string },
): Promise<TagException> {
	const resolution = tidy(input.resolution, 1000);
	if (!resolution) throw new TagError("invalid", "Say what it turned out to be and what was done about it.");
	const { rows } = await sql.query(
		`update wai_tag_exceptions set status = 'resolved', resolved_by = $2, resolved_at = now(), resolution = $3
		 where id = $1 and status = 'open' returning ${EXCEPTION_COLUMNS}`,
		[tidy(input.exceptionId, 60), actorKey(actor), resolution],
	);
	if (!rows[0]) throw new TagError("conflict", "That exception doesn't exist or has already been resolved.");
	const exception = toException(rows[0]);
	await audit(sql, {
		actor,
		action: "tag.exception.resolve",
		subject: exception.id,
		outcome: "allowed",
		detail: { uid: exception.uid, kind: exception.kind },
	});
	return exception;
}

/** One tag with everything recorded about it: what it is on now, what it was on before, what is inside it, its scans. */
export async function getTag(
	sql: Sql,
	id: string,
): Promise<{
	tag: Tag;
	assignment: Assignment | null;
	history: Assignment[];
	inside: Array<{ tag: Tag; assignment: Assignment }>;
	scans: ScanEvent[];
} | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const found = await sql.query(`select ${TAG_COLUMNS} from wai_tags t where t.id = $1`, [id]);
	if (!found.rows[0]) return null;
	const tag = toTag(found.rows[0]);
	const [history, children, scans] = await Promise.all([
		sql.query(
			`select ${ASSIGNMENT_COLUMNS} from ${ASSIGNMENT_FROM} where a.tag_id = $1 order by a.assigned_at desc, a.id`,
			[id],
		),
		sql.query(
			`select ${ASSIGNMENT_COLUMNS} from ${ASSIGNMENT_FROM} where a.parent_tag_id = $1 and a.ended_at is null
			 order by a.assigned_at limit 300`,
			[id],
		),
		listScans(sql, { tagId: id, limit: 50 }),
	]);
	const all = history.rows.map(toAssignment);
	const childAssignments = children.rows.map(toAssignment);
	const childTags = childAssignments.length
		? (
				await sql.query(`select ${TAG_COLUMNS} from wai_tags t where t.id = any($1::uuid[])`, [
					childAssignments.map((a) => a.tagId),
				])
			).rows.map(toTag)
		: [];
	return {
		tag,
		assignment: all.find((a) => a.endedAt === null) ?? null,
		history: all.filter((a) => a.endedAt !== null),
		inside: childAssignments.flatMap((assignment) => {
			const child = childTags.find((t) => t.id === assignment.tagId);
			return child ? [{ tag: child, assignment }] : [];
		}),
		scans,
	};
}
