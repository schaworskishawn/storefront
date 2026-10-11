import { audit } from "../audit";
import { iso, type Row, type Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import { actorKey, type Actor } from "../types";

/**
 * Support cases. Messages that arrive through the contact form (when ingestion is switched on) or that staff type in are
 * filed here so a reply can be drafted against them. The customer's orders stay in Saleor; a case only carries the order
 * number the customer gave. Case text is customer-written, so everything downstream treats it as data, never as instructions.
 */

export type CaseSource = "manual" | "contact_form" | "demo";
export type CaseStatus = "open" | "draft_ready" | "resolved" | "closed";

export type CaseRecord = {
	id: string;
	source: CaseSource;
	sourceRef: string | null;
	subject: string;
	customerName: string | null;
	customerEmail: string | null;
	orderNumber: string | null;
	message: string;
	messageSha256: string;
	status: CaseStatus;
	createdBy: string;
	receivedAt: string;
	createdAt: string;
	updatedAt: string;
	draftCount: number;
};

export class CaseError extends Error {
	constructor(
		readonly code: "invalid" | "not_found" | "conflict",
		message: string,
	) {
		super(message);
		this.name = "CaseError";
	}
}

const CASE_SELECT = `c.id, c.source, c.source_ref, c.subject, c.customer_name, c.customer_email, c.order_number, c.message, c.message_sha256,
	c.status, c.created_by, c.received_at, c.created_at, c.updated_at,
	(select count(*)::int from wai_drafts d where d.case_id = c.id) as draft_count`;

function mapCase(r: Row): CaseRecord {
	return {
		id: r.id as string,
		source: r.source as CaseSource,
		sourceRef: (r.source_ref as string | null) ?? null,
		subject: r.subject as string,
		customerName: (r.customer_name as string | null) ?? null,
		customerEmail: (r.customer_email as string | null) ?? null,
		orderNumber: (r.order_number as string | null) ?? null,
		message: r.message as string,
		messageSha256: r.message_sha256 as string,
		status: r.status as CaseStatus,
		createdBy: r.created_by as string,
		receivedAt: iso(r.received_at) as string,
		createdAt: iso(r.created_at) as string,
		updatedAt: iso(r.updated_at) as string,
		draftCount: Number(r.draft_count ?? 0),
	};
}

const clean = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/\r\n?/g, "\n")
				 
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

export type NewCase = {
	source: CaseSource;
	sourceRef?: string | null;
	subject: string;
	message: string;
	customerName?: string | null;
	customerEmail?: string | null;
	orderNumber?: string | null;
	receivedAt?: string | null;
};

export function validateCase(input: NewCase): {
	subject: string;
	message: string;
	customerName: string | null;
	customerEmail: string | null;
	orderNumber: string | null;
} {
	const subject = clean(input.subject, 200);
	const message = clean(input.message, 8000);
	if (!subject) throw new CaseError("invalid", "A subject is required.");
	if (!message) throw new CaseError("invalid", "The customer's message is required.");
	const email = clean(input.customerEmail, 200);
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		throw new CaseError("invalid", "That email address isn't valid.");
	const order = clean(input.orderNumber, 40).replace(/^#/, "");
	if (order && !/^[A-Za-z0-9-]{1,40}$/.test(order))
		throw new CaseError("invalid", "An order number has only letters, numbers and dashes.");
	return {
		subject,
		message,
		customerName: clean(input.customerName, 120) || null,
		customerEmail: email || null,
		orderNumber: order || null,
	};
}

/**
 * Files a case. A case with a source reference that already exists (the same contact-form message arriving twice) is not
 * filed again: the existing case is returned.
 */
export async function createCase(
	sql: Sql,
	actor: Actor,
	input: NewCase,
): Promise<{ case: CaseRecord; created: boolean }> {
	const valid = validateCase(input);
	const { rows } = await sql.query(
		`insert into wai_cases (source, source_ref, subject, customer_name, customer_email, order_number, message, message_sha256, created_by, received_at)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::timestamptz, now()))
		 on conflict (source, source_ref) where source_ref is not null do nothing
		 returning id`,
		[
			input.source,
			input.sourceRef ?? null,
			valid.subject,
			valid.customerName,
			valid.customerEmail,
			valid.orderNumber,
			valid.message,
			sha256Hex(valid.message),
			actorKey(actor),
			input.receivedAt ?? null,
		],
	);
	if (rows[0]) {
		await audit(sql, {
			actor,
			action: "case.created",
			subject: rows[0].id as string,
			outcome: "allowed",
			detail: { source: input.source },
		});
		const created = await getCase(sql, rows[0].id as string);
		return { case: created as CaseRecord, created: true };
	}
	const existing = await sql.query(
		`select ${CASE_SELECT} from wai_cases c where c.source = $1 and c.source_ref = $2`,
		[input.source, input.sourceRef],
	);
	return { case: mapCase(existing.rows[0]), created: false };
}

export async function getCase(sql: Sql, id: string): Promise<CaseRecord | null> {
	const { rows } = await sql.query(`select ${CASE_SELECT} from wai_cases c where c.id = $1`, [id]);
	return rows[0] ? mapCase(rows[0]) : null;
}

export async function listCases(
	sql: Sql,
	filter: { status?: CaseStatus; limit?: number } = {},
): Promise<CaseRecord[]> {
	const params: unknown[] = [];
	let where = "";
	if (filter.status) {
		params.push(filter.status);
		where = `where c.status = $1`;
	}
	params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200));
	const { rows } = await sql.query(
		`select ${CASE_SELECT} from wai_cases c ${where} order by c.received_at desc, c.id limit $${params.length}`,
		params,
	);
	return rows.map(mapCase);
}

export async function setCaseStatus(sql: Sql, actor: Actor, id: string, status: CaseStatus): Promise<void> {
	const result = await sql.query(`update wai_cases set status = $2, updated_at = now() where id = $1`, [
		id,
		status,
	]);
	if (!result.rowCount) throw new CaseError("not_found", "That case doesn't exist.");
	await audit(sql, {
		actor,
		action: "case.status_changed",
		subject: id,
		outcome: "allowed",
		detail: { status },
	});
}
