import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import { daysBetween } from "../time";
import { actorKey, type OperatorActor } from "../types";
import { ComplianceError, day, optionalDay, optionalWhole, ownerOnly, pick, tidy } from "./common";

/**
 * The licence calendar: the licences, registrations and permits the business holds or has applied for, as they read on
 * the document, with their renewal dates and the questions nobody has answered about what they cover.
 *
 * Every date here is one a person entered from the licence or the authority. Nothing is filled in from a rule of thumb, and
 * no checklist of licences the business "should" have is assumed: the calendar reminds about what was recorded, nothing
 * more. Recording or changing a licence is the owner's; anyone in the workspace can raise a question about one.
 */

export const LICENCE_STATUSES = {
	applied_for: "Applied for",
	held: "Held",
	surrendered: "Surrendered",
	refused: "Refused",
} as const;
export type LicenceStatus = keyof typeof LICENCE_STATUSES;

export type Licence = {
	id: string;
	name: string;
	authority: string;
	reference: string | null;
	scope: string;
	premises: string | null;
	responsible: string;
	securityObligations: string | null;
	evidence: string | null;
	status: LicenceStatus;
	issuedOn: string | null;
	expiresOn: string | null;
	renewBy: string | null;
	remindDays: number;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

export type LicenceEvent = {
	id: string;
	licenceId: string;
	kind: "recorded" | "renewed" | "changed" | "status";
	before: Record<string, unknown> | null;
	after: Record<string, unknown>;
	note: string | null;
	actor: string;
	at: string;
};

export type LicenceQuestion = {
	id: string;
	licenceId: string;
	question: string;
	raisedBy: string;
	raisedAt: string;
	answer: string | null;
	answeredBy: string | null;
	answeredAt: string | null;
};

export type LicenceStanding =
	| "current"
	| "renewal_due"
	| "renewal_overdue"
	| "expired"
	| "no_dates"
	| "applied_for"
	| "ended";

export const LICENCE_STANDING_LABELS: Record<LicenceStanding, string> = {
	current: "Current",
	renewal_due: "Renewal coming up",
	renewal_overdue: "Renewal date passed",
	expired: "Expired",
	no_dates: "No expiry or renewal date recorded",
	applied_for: "Applied for",
	ended: "No longer held",
};

export type LicenceSummary = Licence & {
	standing: LicenceStanding;
	/** Days until the renewal date, or the expiry when no renewal date is recorded. Negative once it has passed. */
	daysLeft: number | null;
	openQuestions: number;
};

const COLUMNS = `id, name, authority, reference, scope, premises, responsible, security_obligations, evidence, status, issued_on,
	expires_on, renew_by, remind_days, created_by, created_at, updated_at`;
const EVENT_COLUMNS = `id, licence_id, kind, before, after, note, actor, at`;
const QUESTION_COLUMNS = `id, licence_id, question, raised_by, raised_at, answer, answered_by, answered_at`;

const toLicence = (r: Row): Licence => ({
	id: r.id as string,
	name: r.name as string,
	authority: r.authority as string,
	reference: (r.reference as string | null) ?? null,
	scope: r.scope as string,
	premises: (r.premises as string | null) ?? null,
	responsible: r.responsible as string,
	securityObligations: (r.security_obligations as string | null) ?? null,
	evidence: (r.evidence as string | null) ?? null,
	status: r.status as LicenceStatus,
	issuedOn: day(r.issued_on),
	expiresOn: day(r.expires_on),
	renewBy: day(r.renew_by),
	remindDays: Number(r.remind_days),
	createdBy: r.created_by as string,
	createdAt: iso(r.created_at) as string,
	updatedAt: iso(r.updated_at) as string,
});

const toEvent = (r: Row): LicenceEvent => ({
	id: r.id as string,
	licenceId: r.licence_id as string,
	kind: r.kind as LicenceEvent["kind"],
	before: (r.before as Record<string, unknown> | null) ?? null,
	after: r.after as Record<string, unknown>,
	note: (r.note as string | null) ?? null,
	actor: r.actor as string,
	at: iso(r.at) as string,
});

const toQuestion = (r: Row): LicenceQuestion => ({
	id: r.id as string,
	licenceId: r.licence_id as string,
	question: r.question as string,
	raisedBy: r.raised_by as string,
	raisedAt: iso(r.raised_at) as string,
	answer: (r.answer as string | null) ?? null,
	answeredBy: (r.answered_by as string | null) ?? null,
	answeredAt: iso(r.answered_at),
});

/** Pure: where a licence stands today, from its own dates. */
export function licenceStanding(
	licence: Licence,
	today: string,
): { standing: LicenceStanding; daysLeft: number | null } {
	if (licence.status === "applied_for") return { standing: "applied_for", daysLeft: null };
	if (licence.status !== "held") return { standing: "ended", daysLeft: null };
	if (licence.expiresOn && licence.expiresOn < today)
		return { standing: "expired", daysLeft: daysBetween(today, licence.expiresOn) };
	const target = licence.renewBy ?? licence.expiresOn;
	if (!target) return { standing: "no_dates", daysLeft: null };
	const daysLeft = daysBetween(today, target);
	if (daysLeft < 0) return { standing: "renewal_overdue", daysLeft };
	return { standing: daysLeft <= licence.remindDays ? "renewal_due" : "current", daysLeft };
}

export type LicenceInput = {
	name: string;
	authority: string;
	reference?: string;
	scope: string;
	premises?: string;
	responsible: string;
	securityObligations?: string;
	evidence?: string;
	status?: string;
	issuedOn?: string;
	expiresOn?: string;
	renewBy?: string;
	remindDays?: string;
};

type Clean = Omit<Licence, "id" | "createdBy" | "createdAt" | "updatedAt">;

function clean(input: LicenceInput): Clean {
	const name = tidy(input.name, 200);
	if (!name) throw new ComplianceError("invalid", "Name the licence as it reads on the document.");
	const authority = tidy(input.authority, 200);
	if (!authority) throw new ComplianceError("invalid", "Say who issues it.");
	const scope = tidy(input.scope, 3000);
	if (!scope) throw new ComplianceError("invalid", "Say what it covers, as the licence says.");
	const responsible = tidy(input.responsible, 300);
	if (!responsible) throw new ComplianceError("invalid", "Say who is responsible for it.");
	const status = pick(LICENCE_STATUSES, input.status ?? "held");
	if (!status)
		throw new ComplianceError("invalid", "Choose whether it is held, applied for, surrendered or refused.");
	const issuedOn = optionalDay("The date it was issued", input.issuedOn);
	const expiresOn = optionalDay("The date it expires", input.expiresOn);
	if (issuedOn && expiresOn && expiresOn < issuedOn)
		throw new ComplianceError("invalid", "It can't expire before it was issued.");
	return {
		name,
		authority,
		reference: tidy(input.reference, 120) || null,
		scope,
		premises: tidy(input.premises, 500) || null,
		responsible,
		securityObligations: tidy(input.securityObligations, 3000) || null,
		evidence: tidy(input.evidence, 1000) || null,
		status,
		issuedOn,
		expiresOn,
		renewBy: optionalDay("The date the renewal is due", input.renewBy),
		remindDays:
			optionalWhole("Days of warning before the renewal", input.remindDays, { min: 0, max: 365 }) ?? 60,
	};
}

const asRecord = (v: Clean | Licence): Record<string, unknown> => ({
	name: v.name,
	authority: v.authority,
	reference: v.reference,
	scope: v.scope,
	premises: v.premises,
	responsible: v.responsible,
	securityObligations: v.securityObligations,
	evidence: v.evidence,
	status: v.status,
	issuedOn: v.issuedOn,
	expiresOn: v.expiresOn,
	renewBy: v.renewBy,
	remindDays: v.remindDays,
});

/** The owner records a licence as it reads on the document. */
export async function recordLicence(sql: Sql, actor: OperatorActor, input: LicenceInput): Promise<Licence> {
	await ownerOnly(sql, actor, "compliance.licence.record", "new", "Only the owner can record a licence.");
	const v = clean(input);
	const licence = await sql.transaction(async (tx) => {
		const { rows } = await tx.query(
			`insert into wai_licences (name, authority, reference, scope, premises, responsible, security_obligations, evidence,
				status, issued_on, expires_on, renew_by, remind_days, created_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning ${COLUMNS}`,
			[
				v.name,
				v.authority,
				v.reference,
				v.scope,
				v.premises,
				v.responsible,
				v.securityObligations,
				v.evidence,
				v.status,
				v.issuedOn,
				v.expiresOn,
				v.renewBy,
				v.remindDays,
				actorKey(actor),
			],
		);
		const made = toLicence(rows[0]);
		await tx.query(
			`insert into wai_licence_events (licence_id, kind, after, actor) values ($1, 'recorded', $2::jsonb, $3)`,
			[made.id, json(asRecord(made)), actorKey(actor)],
		);
		return made;
	});
	await audit(sql, {
		actor,
		action: "compliance.licence.record",
		subject: licence.id,
		outcome: "allowed",
		detail: { name: licence.name, authority: licence.authority },
	});
	return licence;
}

/**
 * The owner records a renewal, a change, or a change of status. The licence is replaced with what was entered, and what it
 * said before is kept in its history. A renewal has to move the expiry or the renewal date on.
 */
export async function changeLicence(
	sql: Sql,
	actor: OperatorActor,
	input: LicenceInput & { licenceId: string; kind: string; note: string },
): Promise<Licence> {
	await ownerOnly(
		sql,
		actor,
		"compliance.licence.change",
		tidy(input.licenceId, 60),
		"Only the owner can change a licence.",
	);
	const kind = (["renewed", "changed", "status"] as const).find((k) => k === input.kind);
	if (!kind)
		throw new ComplianceError("invalid", "Say whether this is a renewal, a change, or a change of status.");
	const note = tidy(input.note, 1000);
	if (!note) throw new ComplianceError("invalid", "Say what happened, and what shows it.");
	const v = clean(input);
	const changed = await sql.transaction(async (tx) => {
		const found = await tx.query(`select ${COLUMNS} from wai_licences where id = $1 for update`, [
			tidy(input.licenceId, 60),
		]);
		if (!found.rows[0]) throw new ComplianceError("not_found", "That licence doesn't exist.");
		const before = toLicence(found.rows[0]);
		if (kind === "renewed") {
			const moved =
				(v.expiresOn !== null && (before.expiresOn === null || v.expiresOn > before.expiresOn)) ||
				(v.renewBy !== null && (before.renewBy === null || v.renewBy > before.renewBy));
			if (!moved)
				throw new ComplianceError(
					"invalid",
					"A renewal moves the expiry or the renewal date on. Enter the new dates from the renewed licence.",
				);
		}
		if (kind === "status" && v.status === before.status)
			throw new ComplianceError("invalid", `It is already ${LICENCE_STATUSES[v.status].toLowerCase()}.`);
		const same = JSON.stringify(asRecord(before)) === JSON.stringify(asRecord(v));
		if (same) throw new ComplianceError("invalid", "Nothing was changed.");
		const { rows } = await tx.query(
			`update wai_licences set name = $2, authority = $3, reference = $4, scope = $5, premises = $6, responsible = $7,
				security_obligations = $8, evidence = $9, status = $10, issued_on = $11, expires_on = $12, renew_by = $13,
				remind_days = $14, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[
				before.id,
				v.name,
				v.authority,
				v.reference,
				v.scope,
				v.premises,
				v.responsible,
				v.securityObligations,
				v.evidence,
				v.status,
				v.issuedOn,
				v.expiresOn,
				v.renewBy,
				v.remindDays,
			],
		);
		const after = toLicence(rows[0]);
		await tx.query(
			`insert into wai_licence_events (licence_id, kind, before, after, note, actor) values ($1,$2,$3::jsonb,$4::jsonb,$5,$6)`,
			[after.id, kind, json(asRecord(before)), json(asRecord(after)), note, actorKey(actor)],
		);
		return after;
	});
	await audit(sql, {
		actor,
		action: `compliance.licence.${kind}`,
		subject: changed.id,
		outcome: "allowed",
		detail: { note },
	});
	return changed;
}

/** Anyone in the workspace can ask what a licence covers. The question stays open until the owner answers it. */
export async function raiseLicenceQuestion(
	sql: Sql,
	actor: OperatorActor,
	input: { licenceId: string; question: string },
): Promise<LicenceQuestion> {
	const question = tidy(input.question, 2000);
	if (!question) throw new ComplianceError("invalid", "Write the question.");
	const found = await sql.query(`select id from wai_licences where id = $1`, [tidy(input.licenceId, 60)]);
	if (!found.rows[0]) throw new ComplianceError("not_found", "That licence doesn't exist.");
	const { rows } = await sql.query(
		`insert into wai_licence_questions (licence_id, question, raised_by) values ($1,$2,$3) returning ${QUESTION_COLUMNS}`,
		[found.rows[0].id, question, actorKey(actor)],
	);
	const made = toQuestion(rows[0]);
	await audit(sql, {
		actor,
		action: "compliance.licence.question",
		subject: made.licenceId,
		outcome: "allowed",
	});
	return made;
}

export async function answerLicenceQuestion(
	sql: Sql,
	actor: OperatorActor,
	input: { questionId: string; answer: string },
): Promise<LicenceQuestion> {
	await ownerOnly(
		sql,
		actor,
		"compliance.licence.answer",
		tidy(input.questionId, 60),
		"Only the owner can answer a question about a licence.",
	);
	const answer = tidy(input.answer, 3000);
	if (!answer) throw new ComplianceError("invalid", "Write the answer, and where it came from.");
	const { rows } = await sql.query(
		`update wai_licence_questions set answer = $2, answered_by = $3, answered_at = now()
		 where id = $1 and answer is null returning ${QUESTION_COLUMNS}`,
		[tidy(input.questionId, 60), answer, actorKey(actor)],
	);
	if (!rows[0]) {
		const found = await sql.query(`select 1 from wai_licence_questions where id = $1`, [
			tidy(input.questionId, 60),
		]);
		throw found.rows[0]
			? new ComplianceError("conflict", "That question was already answered.")
			: new ComplianceError("not_found", "That question doesn't exist.");
	}
	const made = toQuestion(rows[0]);
	await audit(sql, {
		actor,
		action: "compliance.licence.answer",
		subject: made.licenceId,
		outcome: "allowed",
	});
	return made;
}

export async function listLicences(sql: Sql, today: string): Promise<LicenceSummary[]> {
	const { rows } = await sql.query(
		`select ${COLUMNS}, (select count(*) from wai_licence_questions q where q.licence_id = l.id and q.answer is null)::int
			as open_questions
		 from wai_licences l order by name limit 500`,
	);
	return rows.map((r) => {
		const licence = toLicence(r);
		return { ...licence, ...licenceStanding(licence, today), openQuestions: Number(r.open_questions) };
	});
}

export async function getLicence(
	sql: Sql,
	id: string,
): Promise<{ licence: Licence; events: LicenceEvent[]; questions: LicenceQuestion[] } | null> {
	const found = await sql.query(`select ${COLUMNS} from wai_licences where id = $1`, [tidy(id, 60)]);
	if (!found.rows[0]) return null;
	const licence = toLicence(found.rows[0]);
	const [events, questions] = await Promise.all([
		sql.query(`select ${EVENT_COLUMNS} from wai_licence_events where licence_id = $1 order by at desc`, [
			licence.id,
		]),
		sql.query(
			`select ${QUESTION_COLUMNS} from wai_licence_questions where licence_id = $1 order by raised_at desc`,
			[licence.id],
		),
	]);
	return { licence, events: events.rows.map(toEvent), questions: questions.rows.map(toQuestion) };
}
