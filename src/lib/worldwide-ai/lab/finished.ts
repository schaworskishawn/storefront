import { audit } from "../audit";
import { ZERO, dec, eq, gt, isNegative, isZero, round, sub, toText, tryDec, type Dec } from "../decimal";
import { iso, json, type Row, type Sql } from "../db/sql";
import { hashOf } from "../functions/products";
import { actorKey, type OperatorActor } from "../types";
import { getBatch, listAllocations, type Batch } from "./batches";
import {
	FinishedError,
	HOLD_COLUMNS,
	insertHold,
	lockBatch,
	moveBulk,
	toHold,
	type BulkMovement,
	type QualityHold,
} from "./bulk";
import { applyMovement, getLot, verifyLedger } from "./inventory";
import { qualityChecks, type ReleaseCheck } from "./quality";
import { assertQualified } from "./training";

/**
 * Finished liquid: a made batch's bulk, the packaging runs that draw it down, quality holds, and the release decision.
 *
 * Bulk has its own ledger. What was measured when the batch was made goes in; packaging runs, samples and waste come out;
 * nothing is edited afterwards, and the remaining bulk can't go below zero, so the same liquid is never counted twice.
 *
 * Release is a person's decision, the owner's, and it is a transaction, not a tick box. When the owner releases a batch the
 * application rechecks everything it can check for itself, at that moment, and refuses if anything fails or a hold is open.
 * What it can't check for itself (test results, deviations, labels) the owner has to confirm one by one, and what was checked
 * and confirmed is stored with the decision exactly as it stood. Releasing makes the batch eligible in this workspace only:
 * nothing is published and no sellable stock changes in Saleor.
 */

export { FinishedError, type BulkMovement, type QualityHold };

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";
const num = (value: unknown): string | null =>
	value === null || value === undefined ? null : toText(dec(String(value)));

function millilitres(label: string, value: unknown, options: { signed?: boolean } = {}): Dec {
	const text = tidy(value, 40);
	const amount = text ? tryDec(text) : null;
	if (!amount)
		throw new FinishedError("invalid", `${label} must be a number of millilitres, like 250 or 250.5.`);
	if (!eq(round(amount, 6), amount))
		throw new FinishedError("invalid", `${label} can have at most six decimal places.`);
	if (isZero(amount)) throw new FinishedError("invalid", `${label} can't be zero.`);
	if (!options.signed && isNegative(amount))
		throw new FinishedError("invalid", `${label} can't be negative.`);
	return amount;
}

function wholeNumber(label: string, value: unknown, options: { min: number }): number {
	const text = tidy(value, 12);
	if (!/^\d{1,9}$/.test(text)) throw new FinishedError("invalid", `${label} must be a whole number.`);
	const amount = Number(text);
	if (amount < options.min) throw new FinishedError("invalid", `${label} must be at least ${options.min}.`);
	return amount;
}

// ---- Quality holds ------------------------------------------------------------------------------------

export async function listHolds(sql: Sql, batchId: string): Promise<QualityHold[]> {
	const { rows } = await sql.query(
		`select ${HOLD_COLUMNS} from wai_quality_holds where batch_id = $1 order by placed_at desc`,
		[batchId],
	);
	return rows.map(toHold);
}

/** Anyone in the workspace can place a hold. It stops the batch being packaged or released until the owner lifts it. */
export async function placeHold(
	sql: Sql,
	actor: OperatorActor,
	batchId: string,
	reasonText: string,
): Promise<QualityHold> {
	const reason = tidy(reasonText, 500);
	if (!reason) throw new FinishedError("invalid", "Say why the batch is being put on hold.");
	const batch = await getBatch(sql, batchId);
	if (!batch) throw new FinishedError("not_found", "That batch doesn't exist.");
	const hold = await insertHold(sql, actor, batchId, reason);
	await audit(sql, {
		actor,
		action: "batch.hold.place",
		subject: batchId,
		outcome: "allowed",
		detail: { code: batch.code, reason },
	});
	return hold;
}

export async function liftHold(
	sql: Sql,
	actor: OperatorActor,
	holdId: string,
	reasonText: string,
): Promise<QualityHold> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "batch.hold.lift",
			subject: holdId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new FinishedError("forbidden", "Only the owner can lift a hold.");
	}
	const reason = tidy(reasonText, 500);
	if (!reason) throw new FinishedError("invalid", "Say why the hold is being lifted.");
	const { rows } = await sql.query(
		`update wai_quality_holds set lifted_by = $2, lifted_at = now(), lift_reason = $3 where id = $1 and lifted_at is null
		 returning ${HOLD_COLUMNS}`,
		[holdId, actorKey(actor), reason],
	);
	if (!rows[0]) throw new FinishedError("conflict", "That hold doesn't exist or has already been lifted.");
	await audit(sql, {
		actor,
		action: "batch.hold.lift",
		subject: rows[0].batch_id as string,
		outcome: "allowed",
		detail: { reason },
	});
	return toHold(rows[0]);
}

const openHolds = (holds: readonly QualityHold[]) => holds.filter((hold) => hold.liftedAt === null);

// ---- The bulk ledger ----------------------------------------------------------------------------------

export async function listBulkMovements(sql: Sql, batchId: string): Promise<BulkMovement[]> {
	const { rows } = await sql.query(
		`select id, kind, quantity_ml::text as quantity_ml, delta_ml::text as delta_ml, remaining_after_ml::text as remaining_after_ml,
			reason, reference, actor, at from wai_bulk_movements where batch_id = $1 order by at desc, id desc`,
		[batchId],
	);
	return rows.map((r) => ({
		id: r.id as string,
		kind: r.kind as BulkMovement["kind"],
		quantityMl: num(r.quantity_ml) as string,
		deltaMl: num(r.delta_ml) as string,
		remainingAfterMl: num(r.remaining_after_ml) as string,
		reason: (r.reason as string | null) ?? null,
		reference: (r.reference as string | null) ?? null,
		actor: r.actor as string,
		at: iso(r.at) as string,
	}));
}

/** Records a sample taken from the bulk, a loss, or (the owner only) a correction to what is left. */
export async function recordBulkMovement(
	sql: Sql,
	actor: OperatorActor,
	input: { batchId: string; kind: string; quantityMl: string; reason: string; idempotencyKey: string },
): Promise<Batch> {
	const kind = (["sample", "waste", "correction"] as const).find((k) => k === input.kind);
	if (!kind) throw new FinishedError("invalid", "Bulk can be sampled, written off as waste, or corrected.");
	const key = tidy(input.idempotencyKey, 120);
	if (key.length < 8)
		throw new FinishedError("invalid", "The request is missing its key. Reload the page and try again.");
	const reason = tidy(input.reason, 500);
	if (!reason) throw new FinishedError("invalid", "Say why. The reason is kept with the ledger line.");
	if (kind === "correction" && actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "batch.bulk.correction",
			subject: input.batchId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new FinishedError("forbidden", "Only the owner can correct what is left of a batch.");
	}
	const amount = millilitres("The quantity", input.quantityMl, { signed: kind === "correction" });
	const batch = await sql.transaction(async (tx) => {
		const done = await tx.query(`select batch_id from wai_bulk_movements where idempotency_key = $1`, [key]);
		if (done.rows[0]) return (await getBatch(tx, done.rows[0].batch_id as string)) as Batch;
		const current = await lockBatch(tx, input.batchId);
		await moveBulk(tx, actor, current, {
			kind,
			delta: kind === "correction" ? amount : sub(ZERO, amount),
			reason,
			key,
		});
		return (await getBatch(tx, current.id)) as Batch;
	});
	await audit(sql, {
		actor,
		action: `batch.bulk.${kind}`,
		subject: batch.id,
		outcome: "allowed",
		detail: { code: batch.code, quantityMl: toText(amount) },
	});
	return batch;
}

// ---- Packaging runs -----------------------------------------------------------------------------------

export type PackagingRun = {
	id: string;
	code: string;
	batchId: string;
	batchCode: string;
	sku: string;
	bottleMl: string;
	unitsFilled: number;
	unitsRejected: number;
	bulkUsedMl: string;
	/** Units filled times the bottle size, for comparison with what actually left the bulk. Never used as the quantity. */
	nominalMl: string;
	labelVersion: string;
	lineClearance: string;
	components: Array<{ lotId: string; lotCode: string; ingredient: string; quantity: string }>;
	notes: string | null;
	runBy: string;
	runAt: string;
};

const RUN_COLUMNS = `p.id, p.code, p.batch_id, b.code as batch_code, p.sku, p.bottle_ml::text as bottle_ml, p.units_filled,
	p.units_rejected, p.bulk_used_ml::text as bulk_used_ml, p.label_version, p.line_clearance, p.components, p.notes, p.run_by, p.run_at`;

const toRun = (r: Row): PackagingRun => {
	const bottle = dec(String(r.bottle_ml));
	return {
		id: r.id as string,
		code: r.code as string,
		batchId: r.batch_id as string,
		batchCode: r.batch_code as string,
		sku: r.sku as string,
		bottleMl: toText(bottle),
		unitsFilled: Number(r.units_filled),
		unitsRejected: Number(r.units_rejected),
		bulkUsedMl: num(r.bulk_used_ml) as string,
		nominalMl: toText({ v: bottle.v * BigInt(Number(r.units_filled)) }),
		labelVersion: r.label_version as string,
		lineClearance: r.line_clearance as string,
		components: (r.components as PackagingRun["components"]) ?? [],
		notes: (r.notes as string | null) ?? null,
		runBy: r.run_by as string,
		runAt: iso(r.run_at) as string,
	};
};

export async function listPackagingRuns(sql: Sql, batchId?: string): Promise<PackagingRun[]> {
	const { rows } = await sql.query(
		`select ${RUN_COLUMNS} from wai_packaging_runs p join wai_batches b on b.id = p.batch_id
		 ${batchId ? "where p.batch_id = $1" : ""} order by p.run_at desc, p.code desc limit 300`,
		batchId ? [batchId] : [],
	);
	return rows.map(toRun);
}

export type NewPackagingRun = {
	batchId: string;
	sku: string;
	bottleMl: string;
	unitsFilled: string;
	unitsRejected?: string;
	bulkUsedMl: string;
	labelVersion: string;
	lineClearance: string;
	/** Packaging lots used (bottles, caps, labels), each counted in pieces. */
	components?: Array<{ lotId: string; quantity: string }>;
	notes?: string;
	idempotencyKey: string;
};

/**
 * Records a packaging run: bulk liquid filled into units, after a recorded line clearance. One transaction takes the liquid
 * from the bulk ledger and the bottles, caps and labels from the stock ledger and writes the run, so either all of it is
 * recorded or none of it. What left the bulk is entered as measured; it is never taken to be units times bottle size.
 */
export async function recordPackagingRun(
	sql: Sql,
	actor: OperatorActor,
	input: NewPackagingRun,
	today: string,
): Promise<PackagingRun> {
	const key = tidy(input.idempotencyKey, 120);
	if (key.length < 8)
		throw new FinishedError("invalid", "The request is missing its key. Reload the page and try again.");
	const sku = tidy(input.sku, 120);
	if (!sku) throw new FinishedError("invalid", "Enter the product or SKU this run fills.");
	const labelVersion = tidy(input.labelVersion, 160);
	if (!labelVersion) throw new FinishedError("invalid", "Enter which approved label version was used.");
	const lineClearance = tidy(input.lineClearance, 500);
	if (!lineClearance)
		throw new FinishedError(
			"invalid",
			"Record the line clearance: what was checked to confirm the previous product's materials and labels were removed.",
		);
	const bottle = millilitres("The bottle size", input.bottleMl);
	const bulkUsed = millilitres("The bulk used", input.bulkUsedMl);
	const unitsFilled = wholeNumber("Units filled", input.unitsFilled, { min: 1 });
	const unitsRejected = tidy(input.unitsRejected, 12)
		? wholeNumber("Units rejected", input.unitsRejected, { min: 0 })
		: 0;
	const wanted = (input.components ?? []).filter((c) => tidy(c.lotId, 60) || tidy(c.quantity, 20));
	// Where the owner requires training for this step, a person without it is refused here, before anything is touched.
	await assertQualified(sql, actor, "package_batch", today);

	const runId = await sql.transaction(async (tx) => {
		const done = await tx.query<{ id: string }>(
			`select id from wai_packaging_runs where idempotency_key = $1`,
			[key],
		);
		if (done.rows[0]) return done.rows[0].id;
		const batch = await lockBatch(tx, input.batchId);
		if (batch.status !== "completed")
			throw new FinishedError(
				"conflict",
				`Batch ${batch.code} hasn't been recorded as made, so there is nothing to package.`,
			);
		if (batch.qualityStatus === "rejected")
			throw new FinishedError("conflict", `Batch ${batch.code} was rejected, so it can't be packaged.`);
		const holds = openHolds(await listHolds(tx, batch.id));
		if (holds.length)
			throw new FinishedError(
				"conflict",
				`Batch ${batch.code} is on hold (${holds[0].reason}), so it can't be packaged.`,
			);

		const count = await tx.query<{ n: number }>(
			`select count(*)::int as n from wai_packaging_runs where batch_id = $1`,
			[batch.id],
		);
		const code = `${batch.code}-P${Number(count.rows[0].n) + 1}`;
		const components: PackagingRun["components"] = [];
		for (const [index, component] of wanted.entries()) {
			const lot = await getLot(tx, tidy(component.lotId, 60));
			if (!lot) throw new FinishedError("invalid", "Choose the packaging lot for each quantity entered.");
			if (lot.unit !== "each")
				throw new FinishedError(
					"invalid",
					`Lot ${lot.lotCode} isn't counted in pieces, so it isn't a packaging lot.`,
				);
			const quantity = String(
				wholeNumber(`The quantity from lot ${lot.lotCode}`, component.quantity, { min: 1 }),
			);
			// Reserved and used in the same moment, so the stock ledger shows this run took them and nothing else can.
			for (const kind of ["reservation", "consumption"] as const)
				await applyMovement(
					tx,
					actor,
					{ lotId: lot.id, kind, quantity, reference: code, idempotencyKey: `${key}:${index}:${kind}` },
					today,
				);
			const named = await tx.query<{ name: string }>(`select name from wai_ingredients where id = $1`, [
				lot.ingredientId,
			]);
			components.push({
				lotId: lot.id,
				lotCode: lot.lotCode,
				ingredient: named.rows[0]?.name ?? "",
				quantity,
			});
		}
		await moveBulk(tx, actor, batch, {
			kind: "packaged",
			delta: sub(ZERO, bulkUsed),
			reference: code,
			key: `${key}:bulk`,
		});
		const { rows } = await tx.query<{ id: string }>(
			`insert into wai_packaging_runs (code, batch_id, sku, bottle_ml, units_filled, units_rejected, bulk_used_ml, label_version,
				line_clearance, components, notes, idempotency_key, run_by)
			 values ($1,$2,$3,$4::numeric,$5,$6,$7::numeric,$8,$9,$10::jsonb,$11,$12,$13) returning id`,
			[
				code,
				batch.id,
				sku,
				toText(bottle),
				unitsFilled,
				unitsRejected,
				toText(bulkUsed),
				labelVersion,
				lineClearance,
				json(components),
				tidy(input.notes, 1000) || null,
				key,
				actorKey(actor),
			],
		);
		return rows[0].id;
	});
	const { rows } = await sql.query(
		`select ${RUN_COLUMNS} from wai_packaging_runs p join wai_batches b on b.id = p.batch_id where p.id = $1`,
		[runId],
	);
	const run = toRun(rows[0]);
	await audit(sql, {
		actor,
		action: "batch.package",
		subject: run.batchId,
		outcome: "allowed",
		detail: { run: run.code, units: run.unitsFilled, bulkUsedMl: run.bulkUsedMl },
	});
	return run;
}

// ---- Release ------------------------------------------------------------------------------------------

/** What the owner has to confirm in person, because the workspace holds no record it could check them against. */
export const RELEASE_CONFIRMATIONS = [
	{
		id: "record",
		label:
			"I have read the batch record: what was planned, what was used from each lot, and the measured yield.",
	},
	{
		id: "tests",
		label:
			"Every required test result is on file and meets its specification, or no test is required for this batch.",
	},
	{ id: "deviations", label: "There is no open deviation or unexplained difference for this batch." },
	{ id: "labels", label: "The labels and packaging used are the approved versions." },
] as const;

export type { ReleaseCheck };

/**
 * Everything about a batch the application can check for itself, checked now. Used to show whether a batch could be released
 * and, inside the release transaction, to decide whether it is.
 */
export async function releaseChecks(sql: Sql, batch: Batch): Promise<ReleaseCheck[]> {
	const checks: ReleaseCheck[] = [];
	const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
	check(
		"The batch was recorded as made",
		batch.status === "completed",
		batch.status === "completed" ? `Measured yield ${batch.actualYieldMl} mL.` : `It is ${batch.status}.`,
	);
	const version = await sql.query<{ state: string; formula: unknown; formula_sha256: string }>(
		`select state, formula, formula_sha256 from wai_recipe_versions where id = $1`,
		[batch.recipeVersionId],
	);
	const stored = version.rows[0];
	const formula = stored
		? typeof stored.formula === "string"
			? JSON.parse(stored.formula)
			: stored.formula
		: null;
	check(
		"Its recipe version is approved and unaltered",
		!!stored && stored.state === "approved" && hashOf(formula) === stored.formula_sha256,
		!stored
			? "The recipe version is missing."
			: stored.state !== "approved"
				? `The recipe version is ${stored.state}.`
				: hashOf(formula) === stored.formula_sha256
					? `${batch.recipeName}, version ${batch.recipeVersion}.`
					: "The stored formula no longer matches its checksum.",
	);
	check(
		"Its plan is unaltered",
		batch.planIntact,
		batch.planIntact
			? "The plan matches the checksum recorded when it was planned."
			: "The stored plan no longer matches its checksum.",
	);
	const allocations = await listAllocations(sql, batch.id);
	const unsettled = allocations.filter((allocation) => allocation.usedQuantity === null);
	check(
		"What was used from every lot is recorded",
		allocations.length > 0 && unsettled.length === 0,
		allocations.length === 0
			? "No lot is recorded against this batch."
			: unsettled.length
				? `${unsettled.length} lot${unsettled.length === 1 ? " has" : "s have"} no recorded use.`
				: `${allocations.length} lot${allocations.length === 1 ? "" : "s"} settled.`,
	);
	const lotIds = new Set(allocations.map((allocation) => allocation.lotId));
	const ledger = (await verifyLedger(sql)).filter((problem) => lotIds.has(problem.lotId));
	check(
		"The stock ledger adds up for every lot it used",
		ledger.length === 0,
		ledger.length
			? ledger.map((problem) => `Lot ${problem.lotCode}: ${problem.problem}`).join("; ")
			: "Every lot's movements add up to its balance.",
	);
	const quarantined: string[] = [];
	for (const lotId of lotIds) {
		const lot = await getLot(sql, lotId);
		if (lot?.status === "quarantined") quarantined.push(lot.lotCode);
	}
	check(
		"No lot it used is in quarantine",
		quarantined.length === 0,
		quarantined.length
			? `In quarantine now: ${quarantined.join(", ")}.`
			: "None of its lots is in quarantine.",
	);
	const bulk = await sql.query<{ total: string | null }>(
		`select sum(delta_ml)::text as total from wai_bulk_movements where batch_id = $1`,
		[batch.id],
	);
	const ledgerBulk = dec(bulk.rows[0]?.total ?? "0");
	const bulkOk = batch.bulkRemainingMl !== null && eq(ledgerBulk, dec(batch.bulkRemainingMl));
	check(
		"Its bulk ledger adds up",
		bulkOk,
		bulkOk
			? `${batch.bulkRemainingMl} mL left in bulk, as its movements add up to.`
			: `The batch shows ${batch.bulkRemainingMl ?? "nothing"} mL left but its movements add up to ${toText(ledgerBulk)} mL.`,
	);
	const holds = openHolds(await listHolds(sql, batch.id));
	check(
		"It is not on hold",
		holds.length === 0,
		holds.length ? `On hold: ${holds.map((hold) => hold.reason).join("; ")}` : "No hold is open.",
	);
	// What the quality records say: deviations, results waiting to be verified, and results against the specification.
	for (const item of await qualityChecks(sql, batch)) checks.push(item);
	return checks;
}

/**
 * The owner's decision on a batch that has been made. To release it, every check has to pass at this moment and every
 * confirmation has to be given; what was checked and confirmed is stored with the decision. A rejection needs only its
 * reason. A decision is made once and is not changed afterwards: a later doubt is a hold.
 */
export async function decideRelease(
	sql: Sql,
	actor: OperatorActor,
	input: {
		batchId: string;
		decision: "released" | "rejected";
		note: string;
		confirmations?: readonly string[];
	},
): Promise<Batch> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: `batch.${input.decision}`,
			subject: input.batchId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new FinishedError("forbidden", "Only the owner can release or reject a batch.");
	}
	const note = tidy(input.note, 1000);
	if (!note)
		throw new FinishedError(
			"invalid",
			input.decision === "released"
				? "Say on what basis the batch is being released."
				: "Say why the batch is being rejected.",
		);
	const confirmed = RELEASE_CONFIRMATIONS.filter((item) => input.confirmations?.includes(item.id));
	const batch = await sql.transaction(async (tx) => {
		const current = await lockBatch(tx, input.batchId);
		if (current.qualityStatus !== "awaiting_review")
			throw new FinishedError("conflict", `Batch ${current.code} has already been ${current.qualityStatus}.`);
		if (current.status !== "completed")
			throw new FinishedError(
				"conflict",
				`Batch ${current.code} hasn't been recorded as made, so there is nothing to decide.`,
			);
		// Checked again here, inside the transaction, whatever the page showed a moment ago.
		const checks = await releaseChecks(tx, current);
		if (input.decision === "released") {
			const failed = checks.filter((item) => !item.ok);
			if (failed.length)
				throw new FinishedError(
					"conflict",
					`Batch ${current.code} can't be released: ${failed.map((item) => `${item.name.toLowerCase()} (${item.detail})`).join("; ")}`,
				);
			const missing = RELEASE_CONFIRMATIONS.filter((item) => !input.confirmations?.includes(item.id));
			if (missing.length)
				throw new FinishedError(
					"invalid",
					`Each of these has to be confirmed before a batch is released. Not confirmed: ${missing.map((item) => item.label).join(" ")}`,
				);
		}
		await tx.query(
			`update wai_batches set quality_status = $2, decided_by = $3, decided_at = now(), decision_note = $4, decision_record = $5::jsonb
			 where id = $1 and quality_status = 'awaiting_review'`,
			[
				current.id,
				input.decision,
				actorKey(actor),
				note,
				json({ checks, confirmations: confirmed.map((item) => ({ id: item.id, label: item.label })) }),
			],
		);
		return (await getBatch(tx, current.id)) as Batch;
	});
	await audit(sql, {
		actor,
		action: `batch.${input.decision}`,
		subject: batch.id,
		outcome: "allowed",
		detail: { code: batch.code, note },
	});
	return batch;
}

// ---- Finished liquid at a glance -----------------------------------------------------------------------

export type FinishedBatch = {
	batch: Batch;
	holds: QualityHold[];
	runs: PackagingRun[];
	unitsFilled: number;
	/** In words, what a person may do with this batch's liquid right now. */
	standing: "awaiting_review" | "released" | "rejected" | "on_hold";
};

/** Every batch that has been made, with what is left in bulk, what was packaged, and where it stands. */
export async function listFinished(sql: Sql): Promise<FinishedBatch[]> {
	const made = await sql.query<{ id: string }>(
		`select id from wai_batches where status = 'completed' order by completed_at desc limit 200`,
	);
	const result: FinishedBatch[] = [];
	for (const { id } of made.rows) {
		const batch = (await getBatch(sql, id)) as Batch;
		const [holds, runs] = await Promise.all([listHolds(sql, id), listPackagingRuns(sql, id)]);
		const open = openHolds(holds);
		result.push({
			batch,
			holds: open,
			runs,
			unitsFilled: runs.reduce((total, run) => total + run.unitsFilled, 0),
			standing: open.length && batch.qualityStatus !== "rejected" ? "on_hold" : batch.qualityStatus,
		});
	}
	return result;
}

export const STANDING_LABELS: Record<FinishedBatch["standing"], string> = {
	awaiting_review: "Awaiting a release decision",
	released: "Released",
	rejected: "Rejected",
	on_hold: "On hold",
};

/** Whether anything greater than zero is left in a batch's bulk. */
export const hasBulk = (batch: Batch): boolean =>
	batch.bulkRemainingMl !== null && gt(dec(batch.bulkRemainingMl), ZERO);
