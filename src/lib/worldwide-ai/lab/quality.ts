import { audit } from "../audit";
import {
	ZERO,
	add,
	dec,
	eq,
	gt,
	isNegative,
	isZero,
	lt,
	round,
	sub,
	toText,
	tryDec,
	type Dec,
} from "../decimal";
import { iso, json, type Row, type Sql } from "../db/sql";
import { hashOf } from "../functions/products";
import { actorKey, type OperatorActor } from "../types";
import { getBatch, type Batch } from "./batches";
import { insertHold, lockBatch, moveBulk, type QualityHold } from "./bulk";
import { InventoryError } from "./inventory";

/**
 * Quality records: the specification a recipe's liquid is tested against, samples and where they went, the results a
 * laboratory reported, and deviations with their corrective actions.
 *
 * The rules that matter:
 * - A result is what a laboratory reported, typed in by a person. It counts only once the owner has verified it against the
 *   report, and it is never edited: a correction is a new result that names the one it replaces.
 * - A verified result is compared with the approved specification by code, in exact decimals. Units are never converted and
 *   a method is never assumed. Anything the code can't judge is left unresolved for a person, never called a pass.
 * - A verified result outside its limit puts the batch on hold in the same step.
 * - A deviation can't be closed while an action is still open or is done but not verified to have worked.
 *
 * None of this is a laboratory finding of its own, and matching a specification is not a statement that a product is safe.
 */

export class QualityError extends InventoryError {}

/** One thing the application checked about a batch before a release decision. */
export type ReleaseCheck = { name: string; ok: boolean; detail: string };

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";
/** How two names are compared: case and spacing don't matter, anything else does. */
const same = (a: string | null, b: string | null): boolean =>
	(a ?? "").trim().toLowerCase().replace(/\s+/g, " ") === (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const num = (value: unknown): string | null =>
	value === null || value === undefined ? null : toText(dec(String(value)));
const day = (value: unknown): string | null =>
	value === null || value === undefined
		? null
		: value instanceof Date
			? value.toISOString().slice(0, 10)
			: String(value).slice(0, 10);

async function ownerOnly(sql: Sql, actor: OperatorActor, action: string, subject: string, what: string) {
	if (actor.role === "owner") return;
	await audit(sql, { actor, action, subject, outcome: "denied", detail: { reason: "owner only" } });
	throw new QualityError("forbidden", `Only the owner can ${what}.`);
}

function calendarDay(
	label: string,
	value: unknown,
	today: string,
	options: { notAfterToday?: boolean } = {},
) {
	const text = tidy(value, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)))
		throw new QualityError("invalid", `${label} must be a date, like 2026-10-14.`);
	if (options.notAfterToday && text > today)
		throw new QualityError("invalid", `${label} can't be after today.`);
	return text;
}

// ---- Specifications -----------------------------------------------------------------------------------

export type Criterion = {
	analyte: string;
	unit: string;
	min: string | null;
	max: string | null;
	method: string | null;
	required: boolean;
};
export type CriterionInput = {
	analyte: string;
	unit: string;
	min?: string;
	max?: string;
	method?: string;
	required?: boolean;
};

export type Specification = {
	id: string;
	recipeId: string;
	recipeName: string;
	version: number;
	state: "draft" | "approved" | "superseded";
	criteria: Criterion[];
	/** Whether the stored criteria still match the checksum recorded when they were written. */
	intact: boolean;
	note: string | null;
	createdBy: string;
	createdAt: string;
	approvedBy: string | null;
	approvedAt: string | null;
};

const SPEC_COLUMNS = `s.id, s.recipe_id, r.name as recipe_name, s.version, s.state, s.criteria, s.criteria_sha256, s.note,
	s.created_by, s.created_at, s.approved_by, s.approved_at`;
const SPEC_FROM = `wai_specifications s join wai_recipes r on r.id = s.recipe_id`;

const toSpecification = (r: Row): Specification => {
	const criteria = (typeof r.criteria === "string" ? JSON.parse(r.criteria) : r.criteria) as Criterion[];
	return {
		id: r.id as string,
		recipeId: r.recipe_id as string,
		recipeName: r.recipe_name as string,
		version: Number(r.version),
		state: r.state as Specification["state"],
		criteria,
		intact: hashOf(criteria) === r.criteria_sha256,
		note: (r.note as string | null) ?? null,
		createdBy: r.created_by as string,
		createdAt: iso(r.created_at) as string,
		approvedBy: (r.approved_by as string | null) ?? null,
		approvedAt: iso(r.approved_at),
	};
};

/** A criterion's limits in words: "11.4 to 12.6 mg/mL", "at most 0.5 %". */
export const limitsText = (criterion: Criterion): string =>
	criterion.min !== null && criterion.max !== null
		? `${criterion.min} to ${criterion.max} ${criterion.unit}`
		: criterion.min !== null
			? `at least ${criterion.min} ${criterion.unit}`
			: `at most ${criterion.max} ${criterion.unit}`;

function limit(label: string, value: unknown): Dec | null {
	const text = tidy(value, 40);
	if (!text) return null;
	const amount = tryDec(text);
	if (!amount) throw new QualityError("invalid", `${label} must be a number, like 12 or 12.5.`);
	if (!eq(round(amount, 6), amount))
		throw new QualityError("invalid", `${label} can have at most six decimal places.`);
	return amount;
}

function criteriaOf(input: readonly CriterionInput[]): Criterion[] {
	if (input.length === 0)
		throw new QualityError("invalid", "A specification needs at least one thing that is tested.");
	if (input.length > 40) throw new QualityError("invalid", "A specification can list at most 40 tests.");
	const seen: string[] = [];
	return input.map((item, index) => {
		const analyte = tidy(item.analyte, 120);
		if (!analyte) throw new QualityError("invalid", `Line ${index + 1}: say what is tested.`);
		if (seen.some((name) => same(name, analyte)))
			throw new QualityError("invalid", `${analyte} is listed twice.`);
		seen.push(analyte);
		const unit = tidy(item.unit, 40);
		if (!unit) throw new QualityError("invalid", `${analyte}: give the unit its limits are in.`);
		const min = limit(`${analyte}: the lower limit`, item.min);
		const max = limit(`${analyte}: the upper limit`, item.max);
		if (!min && !max)
			throw new QualityError(
				"invalid",
				`${analyte}: give a lower limit, an upper limit, or both. A limit is never assumed.`,
			);
		if (min && max && gt(min, max))
			throw new QualityError("invalid", `${analyte}: the lower limit is above the upper limit.`);
		return {
			analyte,
			unit,
			min: min ? toText(min) : null,
			max: max ? toText(max) : null,
			method: tidy(item.method, 160) || null,
			required: item.required !== false,
		};
	});
}

/**
 * Reads criteria typed one per line as "what | unit | lower | upper | method | optional". The limits and the method can be
 * left blank; a line is required unless its last part says optional.
 */
export function parseCriteria(text: string): CriterionInput[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [analyte = "", unit = "", min = "", max = "", method = "", flag = ""] = line
				.split("|")
				.map((part) => part.trim());
			return { analyte, unit, min, max, method, required: !/^(optional|no|not required)$/i.test(flag) };
		});
}

export async function listSpecifications(sql: Sql, recipeId?: string): Promise<Specification[]> {
	const { rows } = await sql.query(
		`select ${SPEC_COLUMNS} from ${SPEC_FROM} ${recipeId ? "where s.recipe_id = $1" : ""}
		 order by r.name, s.version desc limit 400`,
		recipeId ? [recipeId] : [],
	);
	return rows.map(toSpecification);
}

/** The specification in force for a recipe, or null when none has been approved. */
export async function approvedSpecification(sql: Sql, recipeId: string): Promise<Specification | null> {
	const { rows } = await sql.query(
		`select ${SPEC_COLUMNS} from ${SPEC_FROM} where s.recipe_id = $1 and s.state = 'approved'`,
		[recipeId],
	);
	return rows[0] ? toSpecification(rows[0]) : null;
}

/** Writes a new draft version of a recipe's specification. It guides nothing until the owner approves it. */
export async function addSpecification(
	sql: Sql,
	actor: OperatorActor,
	input: { recipeId: string; criteria: readonly CriterionInput[]; note?: string },
): Promise<Specification> {
	const criteria = criteriaOf(input.criteria);
	const id = await sql.transaction(async (tx) => {
		const recipe = await tx.query(`select id from wai_recipes where id = $1 for update`, [
			tidy(input.recipeId, 60),
		]);
		if (!recipe.rows[0]) throw new QualityError("invalid", "Choose the recipe this specification is for.");
		const last = await tx.query<{ n: number | null }>(
			`select max(version)::int as n from wai_specifications where recipe_id = $1`,
			[recipe.rows[0].id],
		);
		const { rows } = await tx.query<{ id: string }>(
			`insert into wai_specifications (recipe_id, version, criteria, criteria_sha256, note, created_by)
			 values ($1,$2,$3::jsonb,$4,$5,$6) returning id`,
			[
				recipe.rows[0].id,
				Number(last.rows[0]?.n ?? 0) + 1,
				json(criteria),
				hashOf(criteria),
				tidy(input.note, 1000) || null,
				actorKey(actor),
			],
		);
		return rows[0].id;
	});
	const { rows } = await sql.query(`select ${SPEC_COLUMNS} from ${SPEC_FROM} where s.id = $1`, [id]);
	const specification = toSpecification(rows[0]);
	await audit(sql, {
		actor,
		action: "specification.add",
		subject: id,
		outcome: "allowed",
		detail: { recipe: specification.recipeName, version: specification.version },
	});
	return specification;
}

/** The owner puts a draft into force. The version that was in force is kept, marked superseded. */
export async function approveSpecification(
	sql: Sql,
	actor: OperatorActor,
	id: string,
): Promise<Specification> {
	await ownerOnly(sql, actor, "specification.approve", id, "approve a specification");
	await sql.transaction(async (tx) => {
		const found = await tx.query(`select ${SPEC_COLUMNS} from ${SPEC_FROM} where s.id = $1 for update of s`, [
			id,
		]);
		if (!found.rows[0]) throw new QualityError("not_found", "That specification doesn't exist.");
		const specification = toSpecification(found.rows[0]);
		if (specification.state !== "draft")
			throw new QualityError("conflict", `That version is already ${specification.state}.`);
		if (!specification.intact)
			throw new QualityError(
				"conflict",
				"The stored criteria no longer match their checksum, so this version can't be approved.",
			);
		await tx.query(
			`update wai_specifications set state = 'superseded' where recipe_id = $1 and state = 'approved'`,
			[specification.recipeId],
		);
		await tx.query(
			`update wai_specifications set state = 'approved', approved_by = $2, approved_at = now() where id = $1`,
			[id, actorKey(actor)],
		);
	});
	const { rows } = await sql.query(`select ${SPEC_COLUMNS} from ${SPEC_FROM} where s.id = $1`, [id]);
	const specification = toSpecification(rows[0]);
	await audit(sql, {
		actor,
		action: "specification.approve",
		subject: id,
		outcome: "allowed",
		detail: { recipe: specification.recipeName, version: specification.version },
	});
	return specification;
}

// ---- Samples ------------------------------------------------------------------------------------------

export const SAMPLE_PURPOSES = {
	release_test: "Release testing",
	retained: "Retained sample",
	stability: "Stability",
	other: "Other",
} as const;
export type SamplePurpose = keyof typeof SAMPLE_PURPOSES;

export const SAMPLE_EVENTS = {
	taken: "Taken",
	stored: "Stored",
	dispatched: "Sent to the laboratory",
	received_by_lab: "Received by the laboratory",
	report_received: "Report received",
	disposed: "Disposed of",
	note: "Note",
} as const;
export type SampleEventKind = keyof typeof SAMPLE_EVENTS;

export type SampleEvent = {
	id: string;
	event: SampleEventKind;
	detail: string | null;
	actor: string;
	at: string;
};
export type Sample = {
	id: string;
	code: string;
	batchId: string;
	batchCode: string;
	purpose: SamplePurpose;
	quantityMl: string;
	testsRequested: string | null;
	takenBy: string;
	takenAt: string;
	/** Oldest first. The last one says where the sample is now. */
	events: SampleEvent[];
};

export async function listSamples(sql: Sql, batchId?: string): Promise<Sample[]> {
	const { rows } = await sql.query(
		`select s.id, s.code, s.batch_id, b.code as batch_code, s.purpose, s.quantity_ml::text as quantity_ml, s.tests_requested,
			s.taken_by, s.taken_at
		 from wai_samples s join wai_batches b on b.id = s.batch_id ${batchId ? "where s.batch_id = $1" : ""}
		 order by s.taken_at desc, s.code desc limit 300`,
		batchId ? [batchId] : [],
	);
	if (rows.length === 0) return [];
	const events = await sql.query(
		`select id, sample_id, event, detail, actor, at from wai_sample_events where sample_id = any($1::uuid[]) order by at, id`,
		[rows.map((r) => r.id)],
	);
	return rows.map((r) => ({
		id: r.id as string,
		code: r.code as string,
		batchId: r.batch_id as string,
		batchCode: r.batch_code as string,
		purpose: r.purpose as SamplePurpose,
		quantityMl: num(r.quantity_ml) as string,
		testsRequested: (r.tests_requested as string | null) ?? null,
		takenBy: r.taken_by as string,
		takenAt: iso(r.taken_at) as string,
		events: events.rows
			.filter((e) => e.sample_id === r.id)
			.map((e) => ({
				id: e.id as string,
				event: e.event as SampleEventKind,
				detail: (e.detail as string | null) ?? null,
				actor: e.actor as string,
				at: iso(e.at) as string,
			})),
	}));
}

/**
 * Takes a sample from a batch's bulk. One transaction writes the sample, its first custody line and the bulk ledger line
 * for the liquid it removed, so the sample and the liquid can't disagree. A batch on hold can still be sampled: that is
 * how a hold is looked into.
 */
export async function takeSample(
	sql: Sql,
	actor: OperatorActor,
	input: {
		batchId: string;
		purpose: string;
		quantityMl: string;
		testsRequested?: string;
		idempotencyKey: string;
	},
): Promise<Sample> {
	const key = tidy(input.idempotencyKey, 120);
	if (key.length < 8)
		throw new QualityError("invalid", "The request is missing its key. Reload the page and try again.");
	const purpose = (Object.keys(SAMPLE_PURPOSES) as SamplePurpose[]).find((p) => p === input.purpose);
	if (!purpose) throw new QualityError("invalid", "Choose what the sample is for.");
	const amount = tryDec(tidy(input.quantityMl, 40));
	if (!amount || isNegative(amount) || isZero(amount) || !eq(round(amount, 6), amount))
		throw new QualityError(
			"invalid",
			"The sample size must be a number of millilitres greater than zero, like 10 or 10.5.",
		);
	const id = await sql.transaction(async (tx) => {
		const done = await tx.query<{ id: string }>(`select id from wai_samples where idempotency_key = $1`, [
			key,
		]);
		if (done.rows[0]) return done.rows[0].id;
		const batch = await lockBatch(tx, input.batchId);
		const count = await tx.query<{ n: number }>(
			`select count(*)::int as n from wai_samples where batch_id = $1`,
			[batch.id],
		);
		const code = `${batch.code}-S${Number(count.rows[0].n) + 1}`;
		await moveBulk(tx, actor, batch, {
			kind: "sample",
			delta: sub(ZERO, amount),
			reason: `${SAMPLE_PURPOSES[purpose]} sample`,
			reference: code,
			key: `${key}:bulk`,
		});
		const { rows } = await tx.query<{ id: string }>(
			`insert into wai_samples (code, batch_id, purpose, quantity_ml, tests_requested, idempotency_key, taken_by)
			 values ($1,$2,$3,$4::numeric,$5,$6,$7) returning id`,
			[
				code,
				batch.id,
				purpose,
				toText(amount),
				tidy(input.testsRequested, 500) || null,
				key,
				actorKey(actor),
			],
		);
		await tx.query(`insert into wai_sample_events (sample_id, event, actor) values ($1,'taken',$2)`, [
			rows[0].id,
			actorKey(actor),
		]);
		return rows[0].id;
	});
	const sample = (await listSamples(sql, input.batchId)).find((s) => s.id === id) as Sample;
	await audit(sql, {
		actor,
		action: "sample.take",
		subject: sample.batchId,
		outcome: "allowed",
		detail: { sample: sample.code, quantityMl: sample.quantityMl, purpose },
	});
	return sample;
}

/** Adds a line to a sample's custody record: where it was stored, who it was sent to, when the laboratory had it. */
export async function recordSampleEvent(
	sql: Sql,
	actor: OperatorActor,
	input: { sampleId: string; event: string; detail: string },
): Promise<void> {
	const event = (Object.keys(SAMPLE_EVENTS) as SampleEventKind[]).find(
		(e) => e === input.event && e !== "taken",
	);
	if (!event) throw new QualityError("invalid", "Choose what happened to the sample.");
	const detail = tidy(input.detail, 500);
	if (!detail)
		throw new QualityError(
			"invalid",
			"Say where it went or what happened: the place, the laboratory, the courier or the report.",
		);
	const sample = await sql.query<{ code: string; batch_id: string }>(
		`select code, batch_id from wai_samples where id = $1`,
		[tidy(input.sampleId, 60)],
	);
	if (!sample.rows[0]) throw new QualityError("not_found", "That sample doesn't exist.");
	await sql.query(`insert into wai_sample_events (sample_id, event, detail, actor) values ($1,$2,$3,$4)`, [
		input.sampleId,
		event,
		detail,
		actorKey(actor),
	]);
	await audit(sql, {
		actor,
		action: "sample.event",
		subject: sample.rows[0].batch_id,
		outcome: "allowed",
		detail: { sample: sample.rows[0].code, event },
	});
}

// ---- Results ------------------------------------------------------------------------------------------

export type TestResult = {
	id: string;
	batchId: string;
	batchCode: string;
	sampleId: string | null;
	sampleCode: string | null;
	analyte: string;
	method: string | null;
	/** Exactly what the report says. */
	reportedAs: string;
	/** The same as a number, when it is one. */
	value: string | null;
	uncertainty: string | null;
	unit: string;
	lab: string;
	reportRef: string;
	reportedOn: string;
	enteredBy: string;
	enteredAt: string;
	verifiedBy: string | null;
	verifiedAt: string | null;
	replacesId: string | null;
	correctionReason: string | null;
	/** True once a correction has replaced this result. It is kept, and no longer counts. */
	replaced: boolean;
	ruling: "set_aside" | "accepted" | null;
	ruledBy: string | null;
	ruledAt: string | null;
	rulingReason: string | null;
};

const RESULT_COLUMNS = `t.id, t.batch_id, b.code as batch_code, t.sample_id, s.code as sample_code, t.analyte, t.method,
	t.reported_as, t.value::text as value, t.uncertainty::text as uncertainty, t.unit, t.lab, t.report_ref, t.reported_on,
	t.entered_by, t.entered_at, t.verified_by, t.verified_at, t.replaces_id, t.correction_reason, t.ruling, t.ruled_by,
	t.ruled_at, t.ruling_reason,
	exists (select 1 from wai_test_results n where n.replaces_id = t.id) as replaced`;
const RESULT_FROM = `wai_test_results t join wai_batches b on b.id = t.batch_id left join wai_samples s on s.id = t.sample_id`;

const toResult = (r: Row): TestResult => ({
	id: r.id as string,
	batchId: r.batch_id as string,
	batchCode: r.batch_code as string,
	sampleId: (r.sample_id as string | null) ?? null,
	sampleCode: (r.sample_code as string | null) ?? null,
	analyte: r.analyte as string,
	method: (r.method as string | null) ?? null,
	reportedAs: r.reported_as as string,
	value: num(r.value),
	uncertainty: num(r.uncertainty),
	unit: r.unit as string,
	lab: r.lab as string,
	reportRef: r.report_ref as string,
	reportedOn: day(r.reported_on) as string,
	enteredBy: r.entered_by as string,
	enteredAt: iso(r.entered_at) as string,
	verifiedBy: (r.verified_by as string | null) ?? null,
	verifiedAt: iso(r.verified_at),
	replacesId: (r.replaces_id as string | null) ?? null,
	correctionReason: (r.correction_reason as string | null) ?? null,
	replaced: r.replaced === true,
	ruling: (r.ruling as TestResult["ruling"]) ?? null,
	ruledBy: (r.ruled_by as string | null) ?? null,
	ruledAt: iso(r.ruled_at),
	rulingReason: (r.ruling_reason as string | null) ?? null,
});

/** Every result recorded for a batch, oldest first, including the ones a correction replaced. */
export async function listResults(sql: Sql, batchId: string): Promise<TestResult[]> {
	const { rows } = await sql.query(
		`select ${RESULT_COLUMNS} from ${RESULT_FROM} where t.batch_id = $1 order by t.entered_at, t.id`,
		[batchId],
	);
	return rows.map(toResult);
}

/** Results nobody has verified yet, across every batch, oldest first. */
export async function listUnverifiedResults(sql: Sql): Promise<TestResult[]> {
	const { rows } = await sql.query(
		`select ${RESULT_COLUMNS} from ${RESULT_FROM}
		 where t.verified_at is null and t.ruling is null
			and not exists (select 1 from wai_test_results n where n.replaces_id = t.id)
		 order by t.entered_at, t.id limit 300`,
	);
	return rows.map(toResult);
}

async function getResult(sql: Sql, id: string): Promise<TestResult | null> {
	const { rows } = await sql.query(`select ${RESULT_COLUMNS} from ${RESULT_FROM} where t.id = $1`, [id]);
	return rows[0] ? toResult(rows[0]) : null;
}

/** The results that count: not replaced by a correction and not set aside. */
const current = (results: readonly TestResult[]) =>
	results.filter((result) => !result.replaced && result.ruling !== "set_aside");

export type NewResult = {
	batchId: string;
	sampleId?: string;
	analyte: string;
	method?: string;
	reportedAs: string;
	uncertainty?: string;
	unit: string;
	lab: string;
	reportRef: string;
	reportedOn: string;
	/** A correction: the result this one replaces, and why. */
	replacesId?: string;
	correctionReason?: string;
};

/**
 * Records a result exactly as the laboratory's report gives it. Whoever types it in, it is not evidence until the owner has
 * verified it against the report. A correction is a new result naming the one it replaces; the earlier one is kept.
 */
export async function enterResult(
	sql: Sql,
	actor: OperatorActor,
	input: NewResult,
	today: string,
): Promise<TestResult> {
	const analyte = tidy(input.analyte, 120);
	if (!analyte) throw new QualityError("invalid", "Say what was tested.");
	const reportedAs = tidy(input.reportedAs, 80);
	if (!reportedAs)
		throw new QualityError(
			"invalid",
			"Enter the result exactly as the report gives it. A result is never filled in from memory or estimated.",
		);
	const unit = tidy(input.unit, 40);
	if (!unit) throw new QualityError("invalid", "Enter the unit the report gives the result in.");
	const lab = tidy(input.lab, 160);
	if (!lab) throw new QualityError("invalid", "Enter the laboratory that reported it.");
	const reportRef = tidy(input.reportRef, 160);
	if (!reportRef) throw new QualityError("invalid", "Enter the report's number or reference.");
	const reportedOn = calendarDay("The report date", input.reportedOn, today, { notAfterToday: true });
	const read = tryDec(reportedAs);
	const value = read && eq(round(read, 6), read) ? read : null;
	const uncertaintyText = tidy(input.uncertainty, 40);
	const uncertainty = uncertaintyText ? tryDec(uncertaintyText) : null;
	if (uncertaintyText && (!uncertainty || isNegative(uncertainty) || !eq(round(uncertainty, 6), uncertainty)))
		throw new QualityError(
			"invalid",
			"The uncertainty must be a number that isn't negative, in the result's unit. Leave it blank when the report states none.",
		);
	const replacesId = tidy(input.replacesId, 60) || null;
	const correctionReason = tidy(input.correctionReason, 500) || null;
	if (replacesId && !correctionReason)
		throw new QualityError("invalid", "Say why the earlier result is being corrected.");

	const id = await sql.transaction(async (tx) => {
		const batch = await getBatch(tx, tidy(input.batchId, 60));
		if (!batch) throw new QualityError("not_found", "That batch doesn't exist.");
		if (batch.status !== "completed")
			throw new QualityError(
				"conflict",
				`Batch ${batch.code} hasn't been recorded as made, so there is nothing a result could be about.`,
			);
		const sampleId = tidy(input.sampleId, 60) || null;
		if (sampleId) {
			const sample = await tx.query(`select 1 from wai_samples where id = $1 and batch_id = $2`, [
				sampleId,
				batch.id,
			]);
			if (!sample.rows[0])
				throw new QualityError("invalid", `That sample wasn't taken from batch ${batch.code}.`);
		}
		if (replacesId) {
			const earlier = await tx.query<{ batch_id: string }>(
				`select batch_id from wai_test_results where id = $1 for update`,
				[replacesId],
			);
			if (!earlier.rows[0] || earlier.rows[0].batch_id !== batch.id)
				throw new QualityError("invalid", "The result being corrected isn't one of this batch's.");
			const taken = await tx.query(`select 1 from wai_test_results where replaces_id = $1`, [replacesId]);
			if (taken.rows[0])
				throw new QualityError(
					"conflict",
					"That result has already been corrected. Correct the correction instead.",
				);
		}
		const { rows } = await tx.query<{ id: string }>(
			`insert into wai_test_results (batch_id, sample_id, analyte, method, reported_as, value, uncertainty, unit, lab, report_ref,
				reported_on, entered_by, replaces_id, correction_reason)
			 values ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8,$9,$10,$11::date,$12,$13,$14) returning id`,
			[
				batch.id,
				sampleId,
				analyte,
				tidy(input.method, 160) || null,
				reportedAs,
				value ? toText(value) : null,
				uncertainty ? toText(uncertainty) : null,
				unit,
				lab,
				reportRef,
				reportedOn,
				actorKey(actor),
				replacesId,
				replacesId ? correctionReason : null,
			],
		);
		return rows[0].id;
	});
	const result = (await getResult(sql, id)) as TestResult;
	await audit(sql, {
		actor,
		action: replacesId ? "result.correct" : "result.enter",
		subject: result.batchId,
		outcome: "allowed",
		detail: { analyte, report: reportRef, replaces: replacesId },
	});
	return result;
}

export type Verdict = { outcome: "pass" | "fail" | "unresolved"; detail: string };

/**
 * One result against one criterion, in exact decimals. It answers pass or fail only when both are in the same unit, the
 * method is the one the specification names, and the report gives a number. Anything else is unresolved: nothing is
 * converted, assumed or rounded into a pass.
 */
export function judge(criterion: Criterion, result: TestResult): Verdict {
	if (!same(result.unit, criterion.unit))
		return {
			outcome: "unresolved",
			detail: `Reported in ${result.unit}; the specification is in ${criterion.unit}. Units are never converted here.`,
		};
	if (criterion.method && !same(result.method, criterion.method))
		return {
			outcome: "unresolved",
			detail: result.method
				? `Tested by ${result.method}; the specification names ${criterion.method}.`
				: `The method isn't recorded; the specification names ${criterion.method}.`,
		};
	if (result.value === null)
		return {
			outcome: "unresolved",
			detail: `Reported as "${result.reportedAs}", which isn't a number that can be compared with a limit.`,
		};
	const value = dec(result.value);
	const min = criterion.min === null ? null : dec(criterion.min);
	const max = criterion.max === null ? null : dec(criterion.max);
	if ((min && lt(value, min)) || (max && gt(value, max)))
		return { outcome: "fail", detail: `Outside the limit of ${limitsText(criterion)}.` };
	const spread = result.uncertainty === null ? null : dec(result.uncertainty);
	if (
		spread &&
		!isZero(spread) &&
		((min && lt(sub(value, spread), min)) || (max && gt(add(value, spread), max)))
	)
		return {
			outcome: "unresolved",
			detail: `Within ${limitsText(criterion)}, but the reported uncertainty of ±${result.uncertainty} reaches past the limit. A person decides.`,
		};
	return { outcome: "pass", detail: `Within ${limitsText(criterion)}.` };
}

export type AssessmentOutcome =
	| "pass"
	| "accepted"
	| "fail"
	| "unresolved"
	| "unverified"
	| "missing"
	| "not_tested"
	| "no_criterion";

export type AssessmentLine = {
	analyte: string;
	/** The criterion's limits in words, or null when the specification has no criterion for this. */
	limits: string | null;
	required: boolean;
	outcome: AssessmentOutcome;
	detail: string;
	resultIds: string[];
};

/** The outcomes that stand in the way of a release. */
export const BLOCKING: readonly AssessmentOutcome[] = ["fail", "unresolved", "unverified", "missing"];

const WORST: readonly AssessmentOutcome[] = ["fail", "unresolved", "unverified", "accepted", "pass"];

/** How one result that counts stands against its criterion, taking verification and the owner's ruling into account. */
function standing(criterion: Criterion, result: TestResult): { outcome: AssessmentOutcome; detail: string } {
	if (result.verifiedAt === null) return { outcome: "unverified", detail: "Entered, not yet verified." };
	const verdict = judge(criterion, result);
	if (verdict.outcome === "unresolved" && result.ruling === "accepted")
		return {
			outcome: "accepted",
			detail: `${verdict.detail} Accepted by the owner: ${result.rulingReason}`,
		};
	return verdict;
}

/**
 * A batch's results against a specification, one line per thing tested. Every result that counts has to pass: a passing
 * retest does not hide a failing result that is still on file. Pure, so the same records always give the same answer.
 */
export function assess(
	specification: Specification | null,
	results: readonly TestResult[],
): AssessmentLine[] {
	const counted = current(results);
	const lines: AssessmentLine[] = [];
	const matched = new Set<string>();
	for (const criterion of specification?.criteria ?? []) {
		const mine = counted.filter((result) => same(result.analyte, criterion.analyte));
		for (const result of mine) matched.add(result.id);
		if (mine.length === 0) {
			lines.push({
				analyte: criterion.analyte,
				limits: limitsText(criterion),
				required: criterion.required,
				outcome: criterion.required ? "missing" : "not_tested",
				detail: criterion.required
					? "No result is on file."
					: "Not tested. The specification doesn't require it.",
				resultIds: [],
			});
			continue;
		}
		const judged = mine.map((result) => ({ result, ...standing(criterion, result) }));
		const outcome = WORST.find((o) => judged.some((j) => j.outcome === o)) as AssessmentOutcome;
		lines.push({
			analyte: criterion.analyte,
			limits: limitsText(criterion),
			required: criterion.required,
			outcome,
			detail: judged
				.map((j) => `${j.result.reportedAs} ${j.result.unit} (report ${j.result.reportRef}): ${j.detail}`)
				.join(" "),
			resultIds: mine.map((result) => result.id),
		});
	}
	for (const result of counted.filter((r) => !matched.has(r.id)))
		lines.push({
			analyte: result.analyte,
			limits: null,
			required: false,
			outcome: result.verifiedAt === null ? "unverified" : "no_criterion",
			detail: `${result.reportedAs} ${result.unit} (report ${result.reportRef}): ${
				result.verifiedAt === null
					? "Entered, not yet verified."
					: specification
						? "The specification has no criterion for this, so it isn't compared with anything."
						: "No specification is approved for this recipe, so it isn't compared with anything."
			}`,
			resultIds: [result.id],
		});
	return lines;
}

export const OUTCOME_LABELS: Record<AssessmentOutcome, string> = {
	pass: "Within limits",
	accepted: "Accepted by the owner",
	fail: "Out of specification",
	unresolved: "Unresolved",
	unverified: "Not verified",
	missing: "Missing",
	not_tested: "Not tested",
	no_criterion: "No criterion",
};

async function recipeOf(sql: Sql, batch: Batch): Promise<string | null> {
	const { rows } = await sql.query<{ recipe_id: string }>(
		`select recipe_id from wai_recipe_versions where id = $1`,
		[batch.recipeVersionId],
	);
	return rows[0]?.recipe_id ?? null;
}

/** A batch's results, the specification in force for its recipe, and how the one stands against the other. */
export async function batchAssessment(
	sql: Sql,
	batch: Batch,
): Promise<{ specification: Specification | null; results: TestResult[]; lines: AssessmentLine[] }> {
	const recipeId = await recipeOf(sql, batch);
	const [specification, results] = await Promise.all([
		recipeId ? approvedSpecification(sql, recipeId) : null,
		listResults(sql, batch.id),
	]);
	return { specification, results, lines: assess(specification, results) };
}

/**
 * The owner confirms a result matches the laboratory's report. From then on it counts. If it is outside its limit in the
 * approved specification, the batch is put on hold in the same transaction.
 */
export async function verifyResult(
	sql: Sql,
	actor: OperatorActor,
	resultId: string,
): Promise<{ result: TestResult; verdict: Verdict | null; hold: QualityHold | null }> {
	await ownerOnly(sql, actor, "result.verify", resultId, "verify a result");
	const done = await sql.transaction(async (tx) => {
		const locked = await tx.query(`select id from wai_test_results where id = $1 for update`, [resultId]);
		if (!locked.rows[0]) throw new QualityError("not_found", "That result doesn't exist.");
		const before = (await getResult(tx, resultId)) as TestResult;
		if (before.replaced)
			throw new QualityError(
				"conflict",
				"That result has been replaced by a correction. Verify the correction instead.",
			);
		if (before.ruling === "set_aside") throw new QualityError("conflict", "That result has been set aside.");
		if (before.verifiedAt) throw new QualityError("conflict", "That result has already been verified.");
		await tx.query(`update wai_test_results set verified_by = $2, verified_at = now() where id = $1`, [
			resultId,
			actorKey(actor),
		]);
		const result = (await getResult(tx, resultId)) as TestResult;
		const batch = await lockBatch(tx, result.batchId);
		const recipeId = await recipeOf(tx, batch);
		const specification = recipeId ? await approvedSpecification(tx, recipeId) : null;
		const criterion = specification?.criteria.find((c) => same(c.analyte, result.analyte)) ?? null;
		const verdict = criterion ? judge(criterion, result) : null;
		const hold =
			criterion && verdict?.outcome === "fail"
				? await insertHold(
						tx,
						actor,
						batch.id,
						`Verified result out of specification: ${result.analyte} ${result.reportedAs} ${result.unit}, limit ${limitsText(criterion)} (report ${result.reportRef}).`,
					)
				: null;
		return { result, verdict, hold, code: batch.code };
	});
	await audit(sql, {
		actor,
		action: "result.verify",
		subject: done.result.batchId,
		outcome: "allowed",
		detail: {
			analyte: done.result.analyte,
			report: done.result.reportRef,
			verdict: done.verdict?.outcome ?? "not compared",
			hold: done.hold !== null,
		},
	});
	return { result: done.result, verdict: done.verdict, hold: done.hold };
}

/**
 * The owner's ruling on a result, always with a reason. Setting one aside keeps it on file and stops it being compared.
 * Accepting is only for a result the code left unresolved; a result outside its limit can't be accepted.
 */
export async function ruleOnResult(
	sql: Sql,
	actor: OperatorActor,
	input: { resultId: string; ruling: string; reason: string },
): Promise<TestResult> {
	const ruling = (["set_aside", "accepted"] as const).find((r) => r === input.ruling);
	if (!ruling) throw new QualityError("invalid", "A result can be set aside or accepted.");
	await ownerOnly(
		sql,
		actor,
		`result.${ruling}`,
		input.resultId,
		ruling === "accepted" ? "accept a result" : "set a result aside",
	);
	const reason = tidy(input.reason, 500);
	if (!reason) throw new QualityError("invalid", "Say why. The reason is kept with the result.");
	const result = await sql.transaction(async (tx) => {
		const locked = await tx.query(`select id from wai_test_results where id = $1 for update`, [
			input.resultId,
		]);
		if (!locked.rows[0]) throw new QualityError("not_found", "That result doesn't exist.");
		const before = (await getResult(tx, input.resultId)) as TestResult;
		if (before.replaced) throw new QualityError("conflict", "That result has been replaced by a correction.");
		if (before.ruling)
			throw new QualityError("conflict", "A ruling has already been recorded on that result.");
		if (ruling === "accepted") {
			if (!before.verifiedAt)
				throw new QualityError("conflict", "Verify the result against the report before accepting it.");
			const batch = (await getBatch(tx, before.batchId)) as Batch;
			const recipeId = await recipeOf(tx, batch);
			const specification = recipeId ? await approvedSpecification(tx, recipeId) : null;
			const criterion = specification?.criteria.find((c) => same(c.analyte, before.analyte)) ?? null;
			const verdict = criterion ? judge(criterion, before) : null;
			if (verdict?.outcome !== "unresolved")
				throw new QualityError(
					"conflict",
					verdict?.outcome === "fail"
						? "That result is outside its limit, so it can't be accepted. Set it aside with a reason, or reject the batch."
						: "Only a result the workspace couldn't judge for itself can be accepted.",
				);
		}
		await tx.query(
			`update wai_test_results set ruling = $2, ruled_by = $3, ruled_at = now(), ruling_reason = $4 where id = $1`,
			[input.resultId, ruling, actorKey(actor), reason],
		);
		return (await getResult(tx, input.resultId)) as TestResult;
	});
	await audit(sql, {
		actor,
		action: `result.${ruling}`,
		subject: result.batchId,
		outcome: "allowed",
		detail: { analyte: result.analyte, report: result.reportRef, reason },
	});
	return result;
}

// ---- Deviations ---------------------------------------------------------------------------------------

export const SEVERITIES = { minor: "Minor", major: "Major", critical: "Critical" } as const;
export type Severity = keyof typeof SEVERITIES;

export const ENTRY_KINDS = {
	containment: "Containment",
	scope: "How far it reaches",
	suspected_cause: "Suspected cause",
	established_finding: "Established finding",
	note: "Note",
} as const;
export type EntryKind = keyof typeof ENTRY_KINDS;

export type DeviationEntry = { id: string; kind: EntryKind; body: string; actor: string; at: string };

export type CorrectiveAction = {
	id: string;
	deviationId: string;
	deviationCode: string;
	action: string;
	responsible: string;
	dueOn: string | null;
	status: "open" | "done" | "verified" | "cancelled";
	createdBy: string;
	createdAt: string;
	doneBy: string | null;
	doneAt: string | null;
	evidence: string | null;
	verifiedBy: string | null;
	verifiedAt: string | null;
	effectiveness: string | null;
	cancelReason: string | null;
};

export type Deviation = {
	id: string;
	code: string;
	batchId: string | null;
	batchCode: string | null;
	title: string;
	description: string;
	severity: Severity;
	status: "open" | "closed";
	openedBy: string;
	openedAt: string;
	closedBy: string | null;
	closedAt: string | null;
	disposition: string | null;
	entries: DeviationEntry[];
	actions: CorrectiveAction[];
};

const ACTION_COLUMNS = `a.id, a.deviation_id, d.code as deviation_code, a.action, a.responsible, a.due_on, a.status, a.created_by,
	a.created_at, a.done_by, a.done_at, a.evidence, a.verified_by, a.verified_at, a.effectiveness, a.cancel_reason`;
const ACTION_FROM = `wai_corrective_actions a join wai_deviations d on d.id = a.deviation_id`;

const toAction = (r: Row): CorrectiveAction => ({
	id: r.id as string,
	deviationId: r.deviation_id as string,
	deviationCode: r.deviation_code as string,
	action: r.action as string,
	responsible: r.responsible as string,
	dueOn: day(r.due_on),
	status: r.status as CorrectiveAction["status"],
	createdBy: r.created_by as string,
	createdAt: iso(r.created_at) as string,
	doneBy: (r.done_by as string | null) ?? null,
	doneAt: iso(r.done_at),
	evidence: (r.evidence as string | null) ?? null,
	verifiedBy: (r.verified_by as string | null) ?? null,
	verifiedAt: iso(r.verified_at),
	effectiveness: (r.effectiveness as string | null) ?? null,
	cancelReason: (r.cancel_reason as string | null) ?? null,
});

const DEVIATION_COLUMNS = `d.id, d.code, d.batch_id, b.code as batch_code, d.title, d.description, d.severity, d.status,
	d.opened_by, d.opened_at, d.closed_by, d.closed_at, d.disposition`;
const DEVIATION_FROM = `wai_deviations d left join wai_batches b on b.id = d.batch_id`;

async function withDetail(sql: Sql, rows: Row[]): Promise<Deviation[]> {
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const [entries, actions] = await Promise.all([
		sql.query(
			`select id, deviation_id, kind, body, actor, at from wai_deviation_entries where deviation_id = any($1::uuid[]) order by at, id`,
			[ids],
		),
		sql.query(
			`select ${ACTION_COLUMNS} from ${ACTION_FROM} where a.deviation_id = any($1::uuid[]) order by a.created_at, a.id`,
			[ids],
		),
	]);
	return rows.map((r) => ({
		id: r.id as string,
		code: r.code as string,
		batchId: (r.batch_id as string | null) ?? null,
		batchCode: (r.batch_code as string | null) ?? null,
		title: r.title as string,
		description: r.description as string,
		severity: r.severity as Severity,
		status: r.status as Deviation["status"],
		openedBy: r.opened_by as string,
		openedAt: iso(r.opened_at) as string,
		closedBy: (r.closed_by as string | null) ?? null,
		closedAt: iso(r.closed_at),
		disposition: (r.disposition as string | null) ?? null,
		entries: entries.rows
			.filter((e) => e.deviation_id === r.id)
			.map((e) => ({
				id: e.id as string,
				kind: e.kind as EntryKind,
				body: e.body as string,
				actor: e.actor as string,
				at: iso(e.at) as string,
			})),
		actions: actions.rows.filter((a) => a.deviation_id === r.id).map(toAction),
	}));
}

export async function listDeviations(
	sql: Sql,
	filter: { batchId?: string; status?: "open" | "closed" } = {},
): Promise<Deviation[]> {
	const where: string[] = [];
	const values: unknown[] = [];
	if (filter.batchId) where.push(`d.batch_id = $${values.push(filter.batchId)}`);
	if (filter.status) where.push(`d.status = $${values.push(filter.status)}`);
	const { rows } = await sql.query(
		`select ${DEVIATION_COLUMNS} from ${DEVIATION_FROM} ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by d.opened_at desc, d.code desc limit 300`,
		values,
	);
	return withDetail(sql, rows);
}

export async function getDeviation(sql: Sql, id: string): Promise<Deviation | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const { rows } = await sql.query(`select ${DEVIATION_COLUMNS} from ${DEVIATION_FROM} where d.id = $1`, [
		id,
	]);
	return (await withDetail(sql, rows))[0] ?? null;
}

/**
 * Opens a deviation: something that didn't go as it should have. Anyone can open one. Tied to a batch, it stands in the way
 * of that batch's release until it is closed, and it can put the batch on hold in the same step.
 */
export async function openDeviation(
	sql: Sql,
	actor: OperatorActor,
	input: { batchId?: string; title: string; description: string; severity: string; hold?: boolean },
	today: string,
): Promise<Deviation> {
	const title = tidy(input.title, 160);
	if (!title) throw new QualityError("invalid", "Give the deviation a short title.");
	const description = tidy(input.description, 4000);
	if (!description)
		throw new QualityError("invalid", "Describe what happened: what was seen, where and when.");
	const severity = (Object.keys(SEVERITIES) as Severity[]).find((s) => s === input.severity);
	if (!severity) throw new QualityError("invalid", "Choose how serious it is.");
	const batchId = tidy(input.batchId, 60) || null;
	const batch = batchId ? await getBatch(sql, batchId) : null;
	if (batchId && !batch) throw new QualityError("invalid", "That batch doesn't exist.");
	if (input.hold && !batch)
		throw new QualityError("invalid", "Choose the batch to put on hold, or leave the hold unticked.");
	const stamp = today.replace(/-/g, "");
	for (let attempt = 0; attempt < 5; attempt++) {
		const count = await sql.query<{ n: number }>(
			`select count(*)::int as n from wai_deviations where code like $1`,
			[`DEV-${stamp}-%`],
		);
		const code = `DEV-${stamp}-${String(Number(count.rows[0].n) + 1 + attempt).padStart(3, "0")}`;
		try {
			const id = await sql.transaction(async (tx) => {
				const { rows } = await tx.query<{ id: string }>(
					`insert into wai_deviations (code, batch_id, title, description, severity, opened_by)
					 values ($1,$2,$3,$4,$5,$6) returning id`,
					[code, batch?.id ?? null, title, description, severity, actorKey(actor)],
				);
				if (input.hold && batch) await insertHold(tx, actor, batch.id, `Deviation ${code}: ${title}`);
				return rows[0].id;
			});
			await audit(sql, {
				actor,
				action: "deviation.open",
				subject: id,
				outcome: "allowed",
				detail: { code, severity, batch: batch?.code ?? null, hold: !!(input.hold && batch) },
			});
			return (await getDeviation(sql, id)) as Deviation;
		} catch (error) {
			// Someone opened a deviation at the same moment and took the number: take the next one.
			if (!(error instanceof Error) || !/wai_deviations_code_key|unique/i.test(error.message)) throw error;
		}
	}
	throw new QualityError("conflict", "A deviation number couldn't be assigned. Try again.");
}

async function openDeviationRow(tx: Sql, id: string): Promise<{ id: string; code: string }> {
	const { rows } = await tx.query<{ id: string; code: string; status: string }>(
		`select id, code, status from wai_deviations where id = $1 for update`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new QualityError("not_found", "That deviation doesn't exist.");
	if (rows[0].status !== "open")
		throw new QualityError("conflict", `Deviation ${rows[0].code} is closed. Open a new one instead.`);
	return rows[0];
}

/** Adds to the investigation. Entries are never changed, so a suspicion stays apart from what was established. */
export async function addDeviationEntry(
	sql: Sql,
	actor: OperatorActor,
	input: { deviationId: string; kind: string; body: string },
): Promise<void> {
	const kind = (Object.keys(ENTRY_KINDS) as EntryKind[]).find((k) => k === input.kind);
	if (!kind) throw new QualityError("invalid", "Choose what kind of entry this is.");
	const body = tidy(input.body, 4000);
	if (!body) throw new QualityError("invalid", "Write the entry.");
	const deviation = await sql.transaction(async (tx) => {
		const row = await openDeviationRow(tx, input.deviationId);
		await tx.query(
			`insert into wai_deviation_entries (deviation_id, kind, body, actor) values ($1,$2,$3,$4)`,
			[row.id, kind, body, actorKey(actor)],
		);
		return row;
	});
	await audit(sql, {
		actor,
		action: "deviation.entry",
		subject: deviation.id,
		outcome: "allowed",
		detail: { code: deviation.code, kind },
	});
}

export async function addCorrectiveAction(
	sql: Sql,
	actor: OperatorActor,
	input: { deviationId: string; action: string; responsible: string; dueOn?: string },
	today: string,
): Promise<void> {
	const action = tidy(input.action, 1000);
	if (!action) throw new QualityError("invalid", "Say what is to be done.");
	const responsible = tidy(input.responsible, 120);
	if (!responsible) throw new QualityError("invalid", "Say who is responsible for it.");
	const dueOn = tidy(input.dueOn, 10) ? calendarDay("The due date", input.dueOn, today) : null;
	const deviation = await sql.transaction(async (tx) => {
		const row = await openDeviationRow(tx, input.deviationId);
		await tx.query(
			`insert into wai_corrective_actions (deviation_id, action, responsible, due_on, created_by) values ($1,$2,$3,$4::date,$5)`,
			[row.id, action, responsible, dueOn, actorKey(actor)],
		);
		return row;
	});
	await audit(sql, {
		actor,
		action: "deviation.action.add",
		subject: deviation.id,
		outcome: "allowed",
		detail: { code: deviation.code, responsible, dueOn },
	});
}

/**
 * Moves a corrective action on: done (anyone, with the evidence), verified to have worked (the owner, saying what showed
 * it), or cancelled (the owner, with a reason). Done is not the end: only a verified or cancelled action lets its deviation
 * close.
 */
export async function updateCorrectiveAction(
	sql: Sql,
	actor: OperatorActor,
	input: { actionId: string; step: string; note: string },
): Promise<CorrectiveAction> {
	const step = (["done", "verified", "cancelled"] as const).find((s) => s === input.step);
	if (!step) throw new QualityError("invalid", "An action can be marked done, verified or cancelled.");
	if (step !== "done")
		await ownerOnly(
			sql,
			actor,
			`deviation.action.${step}`,
			input.actionId,
			step === "verified" ? "verify that an action worked" : "cancel an action",
		);
	const note = tidy(input.note, 2000);
	if (!note)
		throw new QualityError(
			"invalid",
			step === "done"
				? "Say what was done and where the evidence is."
				: step === "verified"
					? "Say what showed that the action worked."
					: "Say why the action is being cancelled.",
		);
	const updated = await sql.transaction(async (tx) => {
		const found = await tx.query<{ status: string; deviation_id: string }>(
			`select status, deviation_id from wai_corrective_actions where id = $1 for update`,
			[tidy(input.actionId, 60)],
		);
		if (!found.rows[0]) throw new QualityError("not_found", "That action doesn't exist.");
		await openDeviationRow(tx, found.rows[0].deviation_id);
		const status = found.rows[0].status;
		if (step === "done") {
			if (status !== "open") throw new QualityError("conflict", `That action is already ${status}.`);
			await tx.query(
				`update wai_corrective_actions set status = 'done', done_by = $2, done_at = now(), evidence = $3 where id = $1`,
				[input.actionId, actorKey(actor), note],
			);
		} else if (step === "verified") {
			if (status !== "done")
				throw new QualityError(
					"conflict",
					status === "open"
						? "That action hasn't been marked done yet, so there is nothing to verify."
						: `That action is already ${status}.`,
				);
			await tx.query(
				`update wai_corrective_actions set status = 'verified', verified_by = $2, verified_at = now(), effectiveness = $3 where id = $1`,
				[input.actionId, actorKey(actor), note],
			);
		} else {
			if (status === "verified" || status === "cancelled")
				throw new QualityError("conflict", `That action is already ${status}.`);
			await tx.query(
				`update wai_corrective_actions set status = 'cancelled', cancelled_by = $2, cancelled_at = now(), cancel_reason = $3 where id = $1`,
				[input.actionId, actorKey(actor), note],
			);
		}
		const { rows } = await tx.query(`select ${ACTION_COLUMNS} from ${ACTION_FROM} where a.id = $1`, [
			input.actionId,
		]);
		return toAction(rows[0]);
	});
	await audit(sql, {
		actor,
		action: `deviation.action.${step}`,
		subject: updated.deviationId,
		outcome: "allowed",
		detail: { code: updated.deviationCode },
	});
	return updated;
}

/**
 * The owner closes a deviation with its disposition. It can't be closed while an action is open or done but not verified,
 * or before anything has been recorded as established (even if what was established is that the cause couldn't be found).
 */
export async function closeDeviation(
	sql: Sql,
	actor: OperatorActor,
	input: { deviationId: string; disposition: string },
): Promise<Deviation> {
	await ownerOnly(sql, actor, "deviation.close", input.deviationId, "close a deviation");
	const disposition = tidy(input.disposition, 4000);
	if (!disposition)
		throw new QualityError(
			"invalid",
			"Record the disposition: what was decided and what happens to the stock.",
		);
	const row = await sql.transaction(async (tx) => {
		const deviation = await openDeviationRow(tx, input.deviationId);
		const pending = await tx.query<{ status: string; n: number }>(
			`select status, count(*)::int as n from wai_corrective_actions where deviation_id = $1 and status in ('open', 'done') group by status`,
			[deviation.id],
		);
		const open = Number(pending.rows.find((r) => r.status === "open")?.n ?? 0);
		const unverified = Number(pending.rows.find((r) => r.status === "done")?.n ?? 0);
		if (open || unverified)
			throw new QualityError(
				"conflict",
				`Deviation ${deviation.code} can't be closed yet: ${[
					open ? `${open} action${open === 1 ? " is" : "s are"} still open` : "",
					unverified
						? `${unverified} ${unverified === 1 ? "is" : "are"} done but not verified to have worked`
						: "",
				]
					.filter(Boolean)
					.join(" and ")}.`,
			);
		const established = await tx.query(
			`select 1 from wai_deviation_entries where deviation_id = $1 and kind = 'established_finding' limit 1`,
			[deviation.id],
		);
		if (!established.rows[0])
			throw new QualityError(
				"conflict",
				`Deviation ${deviation.code} can't be closed yet: nothing is recorded as established. Add an established finding, even if it is that the cause couldn't be found.`,
			);
		await tx.query(
			`update wai_deviations set status = 'closed', closed_by = $2, closed_at = now(), disposition = $3 where id = $1`,
			[deviation.id, actorKey(actor), disposition],
		);
		return deviation;
	});
	await audit(sql, {
		actor,
		action: "deviation.close",
		subject: row.id,
		outcome: "allowed",
		detail: { code: row.code },
	});
	return (await getDeviation(sql, row.id)) as Deviation;
}

/** Corrective actions that still need someone: open, or done and waiting for the owner to verify they worked. */
export async function listPendingActions(sql: Sql): Promise<CorrectiveAction[]> {
	const { rows } = await sql.query(
		`select ${ACTION_COLUMNS} from ${ACTION_FROM} where a.status in ('open', 'done') and d.status = 'open'
		 order by a.due_on nulls last, a.created_at limit 300`,
	);
	return rows.map(toAction);
}

// ---- What the quality records say about a release -------------------------------------------------------

/**
 * The checks a release makes against the quality records, as they stand now: no deviation open against the batch, no result
 * waiting to be verified, and, when a specification is approved for the recipe, every result that counts within it. With no
 * approved specification there is nothing to compare results with, and the owner confirms them in person instead.
 */
export async function qualityChecks(sql: Sql, batch: Batch): Promise<ReleaseCheck[]> {
	const checks: ReleaseCheck[] = [];
	const deviations = await sql.query<{ code: string; title: string }>(
		`select code, title from wai_deviations where batch_id = $1 and status = 'open' order by code`,
		[batch.id],
	);
	checks.push({
		name: "No deviation is open against it",
		ok: deviations.rows.length === 0,
		detail: deviations.rows.length
			? `Open: ${deviations.rows.map((d) => `${d.code} (${d.title})`).join("; ")}`
			: "No deviation is open against this batch.",
	});
	const { specification, results, lines } = await batchAssessment(sql, batch);
	const waiting = current(results).filter((result) => result.verifiedAt === null);
	checks.push({
		name: "No result is waiting to be verified",
		ok: waiting.length === 0,
		detail: waiting.length
			? `Not verified: ${waiting.map((r) => `${r.analyte} (report ${r.reportRef})`).join("; ")}`
			: results.length
				? "Every result that counts has been verified."
				: "No result is recorded for this batch.",
	});
	if (specification) {
		const blocking = lines.filter((line) => BLOCKING.includes(line.outcome));
		const ok = specification.intact && blocking.length === 0;
		checks.push({
			name: "Its verified results meet the approved specification",
			ok,
			detail: !specification.intact
				? "The stored specification no longer matches its checksum."
				: `Specification version ${specification.version}. ${(ok ? lines : blocking)
						.map((line) => `${line.analyte}: ${OUTCOME_LABELS[line.outcome].toLowerCase()}. ${line.detail}`)
						.join(" ")}`,
		});
	}
	return checks;
}
