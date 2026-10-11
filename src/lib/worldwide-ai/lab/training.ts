import { audit } from "../audit";
import { iso, type Row, type Sql } from "../db/sql";
import { daysBetween } from "../time";
import { actorKey, type OperatorActor } from "../types";
import { InventoryError } from "./inventory";

/**
 * Training records, and the requirements the owner sets on controlled steps.
 *
 * A record says a person completed some training and where the evidence is. It counts once the owner has verified it, and
 * only while it is in date. Where the owner has required training for a step (recording a batch as made, recording a
 * packaging run), a person without a verified, current record for it is refused that step, and the refusal is logged.
 * With no requirement set, nothing is gated: the workspace never invents one.
 *
 * A record is evidence someone named, not proof of competence. Nothing here is a personnel file: it holds a name, a topic,
 * dates, and where the evidence is kept.
 */

export class TrainingError extends InventoryError {}

export const CONTROLLED_STEPS = {
	make_batch: "Recording a batch as made",
	package_batch: "Recording a packaging run",
} as const;
export type ControlledStep = keyof typeof CONTROLLED_STEPS;

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";
const same = (a: string, b: string): boolean =>
	a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
const day = (value: unknown): string | null =>
	value === null || value === undefined
		? null
		: value instanceof Date
			? value.toISOString().slice(0, 10)
			: String(value).slice(0, 10);

function calendarDay(label: string, value: unknown): string {
	const text = tidy(value, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)))
		throw new TrainingError("invalid", `${label} must be a date, like 2026-10-14.`);
	return text;
}

export type TrainingRecord = {
	id: string;
	person: string;
	/** The person's sign-in, when the record was made by them. Null for someone recorded by name only. */
	personKey: string | null;
	topic: string;
	completedOn: string;
	validUntil: string | null;
	evidence: string;
	recordedBy: string;
	recordedAt: string;
	verifiedBy: string | null;
	verifiedAt: string | null;
};

const COLUMNS = `id, person, person_key, topic, completed_on, valid_until, evidence, recorded_by, recorded_at, verified_by, verified_at`;

const toRecord = (r: Row): TrainingRecord => ({
	id: r.id as string,
	person: r.person as string,
	personKey: (r.person_key as string | null) ?? null,
	topic: r.topic as string,
	completedOn: day(r.completed_on) as string,
	validUntil: day(r.valid_until),
	evidence: r.evidence as string,
	recordedBy: r.recorded_by as string,
	recordedAt: iso(r.recorded_at) as string,
	verifiedBy: (r.verified_by as string | null) ?? null,
	verifiedAt: iso(r.verified_at),
});

export type TrainingStanding = "unverified" | "valid" | "expiring" | "expired";

/** Where a record stands today. "Expiring" is within thirty days of its last valid day. */
export function trainingStanding(record: TrainingRecord, today: string): TrainingStanding {
	if (record.verifiedAt === null) return "unverified";
	if (record.validUntil === null) return "valid";
	if (record.validUntil < today) return "expired";
	return daysBetween(today, record.validUntil) <= 30 ? "expiring" : "valid";
}

export const STANDING_LABELS: Record<TrainingStanding, string> = {
	unverified: "Not verified",
	valid: "In date",
	expiring: "Expires soon",
	expired: "Expired",
};

export async function listTraining(sql: Sql): Promise<TrainingRecord[]> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_training_records order by lower(person), lower(topic), completed_on desc limit 500`,
	);
	return rows.map(toRecord);
}

/**
 * Records training. `forSelf` ties the record to the sign-in of whoever is recording it, which is what lets it satisfy a
 * requirement; a record made for someone else by name is kept but can't.
 */
export async function recordTraining(
	sql: Sql,
	actor: OperatorActor,
	input: {
		forSelf: boolean;
		person?: string;
		topic: string;
		completedOn: string;
		validUntil?: string;
		evidence: string;
	},
	today: string,
): Promise<TrainingRecord> {
	const person = input.forSelf ? tidy(actor.label, 120) || actorKey(actor) : tidy(input.person, 120);
	if (!person) throw new TrainingError("invalid", "Say who completed the training.");
	const topic = tidy(input.topic, 200);
	if (!topic)
		throw new TrainingError(
			"invalid",
			"Say what the training was, with the procedure's version if it has one.",
		);
	const completedOn = calendarDay("The completion date", input.completedOn);
	if (completedOn > today) throw new TrainingError("invalid", "The completion date can't be after today.");
	const validUntil = tidy(input.validUntil, 10)
		? calendarDay("The valid-until date", input.validUntil)
		: null;
	if (validUntil && validUntil < completedOn)
		throw new TrainingError("invalid", "The valid-until date is before the completion date.");
	const evidence = tidy(input.evidence, 500);
	if (!evidence)
		throw new TrainingError(
			"invalid",
			"Say where the evidence is: the signed sheet, the certificate, the assessment. Attendance is never assumed.",
		);
	const { rows } = await sql.query(
		`insert into wai_training_records (person, person_key, topic, completed_on, valid_until, evidence, recorded_by)
		 values ($1,$2,$3,$4::date,$5::date,$6,$7) returning ${COLUMNS}`,
		[
			person,
			input.forSelf ? actorKey(actor) : null,
			topic,
			completedOn,
			validUntil,
			evidence,
			actorKey(actor),
		],
	);
	const record = toRecord(rows[0]);
	await audit(sql, {
		actor,
		action: "training.record",
		subject: record.id,
		outcome: "allowed",
		detail: { topic, forSelf: input.forSelf },
	});
	return record;
}

/** The owner confirms the evidence for a training record. From then on it counts, while it is in date. */
export async function verifyTraining(sql: Sql, actor: OperatorActor, id: string): Promise<TrainingRecord> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "training.verify",
			subject: id,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new TrainingError("forbidden", "Only the owner can verify a training record.");
	}
	const { rows } = await sql.query(
		`update wai_training_records set verified_by = $2, verified_at = now() where id = $1 and verified_at is null
		 returning ${COLUMNS}`,
		[tidy(id, 60), actorKey(actor)],
	);
	if (!rows[0])
		throw new TrainingError("conflict", "That record doesn't exist or has already been verified.");
	const record = toRecord(rows[0]);
	await audit(sql, {
		actor,
		action: "training.verify",
		subject: record.id,
		outcome: "allowed",
		detail: { topic: record.topic, person: record.person },
	});
	return record;
}

// ---- Requirements -------------------------------------------------------------------------------------

export type TrainingRequirement = {
	id: string;
	step: ControlledStep;
	topic: string;
	setBy: string;
	setAt: string;
};

export async function listRequirements(sql: Sql): Promise<TrainingRequirement[]> {
	const { rows } = await sql.query(
		`select id, step, topic, set_by, set_at from wai_training_requirements order by step, lower(topic)`,
	);
	return rows.map((r) => ({
		id: r.id as string,
		step: r.step as ControlledStep,
		topic: r.topic as string,
		setBy: r.set_by as string,
		setAt: iso(r.set_at) as string,
	}));
}

async function ownerOnly(sql: Sql, actor: OperatorActor, action: string, subject: string) {
	if (actor.role === "owner") return;
	await audit(sql, { actor, action, subject, outcome: "denied", detail: { reason: "owner only" } });
	throw new TrainingError("forbidden", "Only the owner can change what training a step requires.");
}

/** The owner requires training on a topic before a step can be recorded. It applies to everyone, the owner included. */
export async function setRequirement(
	sql: Sql,
	actor: OperatorActor,
	input: { step: string; topic: string },
): Promise<TrainingRequirement[]> {
	const step = (Object.keys(CONTROLLED_STEPS) as ControlledStep[]).find((s) => s === input.step);
	if (!step) throw new TrainingError("invalid", "Choose the step the training is required for.");
	await ownerOnly(sql, actor, "training.require", step);
	const topic = tidy(input.topic, 200);
	if (!topic) throw new TrainingError("invalid", "Say what training is required.");
	const existing = (await listRequirements(sql)).find((r) => r.step === step && same(r.topic, topic));
	if (!existing)
		await sql.query(`insert into wai_training_requirements (step, topic, set_by) values ($1,$2,$3)`, [
			step,
			topic,
			actorKey(actor),
		]);
	await audit(sql, {
		actor,
		action: "training.require",
		subject: step,
		outcome: "allowed",
		detail: { topic },
	});
	return listRequirements(sql);
}

export async function removeRequirement(sql: Sql, actor: OperatorActor, id: string): Promise<void> {
	await ownerOnly(sql, actor, "training.unrequire", id);
	const { rows } = await sql.query<{ step: string; topic: string }>(
		`delete from wai_training_requirements where id = $1 returning step, topic`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new TrainingError("not_found", "That requirement doesn't exist.");
	await audit(sql, {
		actor,
		action: "training.unrequire",
		subject: rows[0].step,
		outcome: "allowed",
		detail: { topic: rows[0].topic },
	});
}

/** The required topics a person has no verified, in-date training for. Empty when the step isn't gated or they qualify. */
export async function qualificationGaps(
	sql: Sql,
	personKey: string,
	step: ControlledStep,
	today: string,
): Promise<string[]> {
	const required = (await listRequirements(sql)).filter((requirement) => requirement.step === step);
	if (required.length === 0) return [];
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_training_records where person_key = $1 and verified_at is not null
			and (valid_until is null or valid_until >= $2::date)`,
		[personKey, today],
	);
	const held = rows.map(toRecord);
	return required
		.filter((requirement) => !held.some((record) => same(record.topic, requirement.topic)))
		.map((requirement) => requirement.topic);
}

/**
 * Refuses a controlled step to a person without the training the owner requires for it, and logs the refusal. Call it
 * before the step's own transaction, so the refusal is kept even though nothing else is.
 */
export async function assertQualified(
	sql: Sql,
	actor: OperatorActor,
	step: ControlledStep,
	today: string,
): Promise<void> {
	const gaps = await qualificationGaps(sql, actorKey(actor), step, today);
	if (gaps.length === 0) return;
	await audit(sql, {
		actor,
		action: "training.gate",
		subject: step,
		outcome: "denied",
		detail: { missing: gaps },
	});
	throw new TrainingError(
		"forbidden",
		`${CONTROLLED_STEPS[step]} needs verified, in-date training in: ${gaps.join("; ")}. None is on file for you. Record it under Manufacturing, Training, and ask the owner to verify it.`,
	);
}
