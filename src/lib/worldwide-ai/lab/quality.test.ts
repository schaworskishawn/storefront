import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { freshDb, owner, staff } from "../testing.test-util";
import {
	addRecipeVersion,
	approveRecipeVersion,
	completeBatch,
	createRecipe,
	getBatch,
	planBatch,
	reserveBatch,
	type Batch,
} from "./batches";
import {
	RELEASE_CONFIRMATIONS,
	decideRelease,
	listBulkMovements,
	listHolds,
	recordPackagingRun,
	releaseChecks,
} from "./finished";
import { createIngredient, createLot, postMovement } from "./inventory";
import {
	addCorrectiveAction,
	addDeviationEntry,
	addSpecification,
	approveSpecification,
	approvedSpecification,
	assess,
	batchAssessment,
	closeDeviation,
	enterResult,
	getDeviation,
	judge,
	listDeviations,
	listPendingActions,
	listResults,
	listSamples,
	listSpecifications,
	listUnverifiedResults,
	openDeviation,
	parseCriteria,
	qualityChecks,
	recordSampleEvent,
	ruleOnResult,
	takeSample,
	updateCorrectiveAction,
	verifyResult,
	type Criterion,
	type NewResult,
	type TestResult,
} from "./quality";

let sql: SqlClient;
const TODAY = "2026-10-15";
let serial = 0;
const key = () => `quality-test-${++serial}-${Math.random().toString(36).slice(2)}`;
const ids: Record<string, string> = {};
const ALL = RELEASE_CONFIRMATIONS.map((item) => item.id);

async function stock(name: string, ingredient: Parameters<typeof createIngredient>[2], lotCode: string) {
	const made = await createIngredient(sql, staff, ingredient);
	const lot = await createLot(sql, staff, { ingredientId: made.id, lotCode, unit: "mL" });
	await postMovement(
		sql,
		staff,
		{ lotId: lot.id, kind: "receipt", quantity: "50000", idempotencyKey: key() },
		TODAY,
	);
	ids[name] = made.id;
}

/** A recipe of its own with one approved version, so each group of tests has its own specification. */
async function recipe(name: string): Promise<{ recipeId: string; versionId: string }> {
	const created = await createRecipe(sql, staff, { name });
	const version = await addRecipeVersion(sql, staff, {
		recipeId: created.id,
		batchMl: "1000",
		targetNicotineMgPerMl: "12",
		targetPgPercent: "50",
		baseIngredientId: ids.base,
		pgIngredientId: ids.pg,
		vgIngredientId: ids.vg,
		flavours: [{ ingredientId: ids.mango, percent: "10" }],
	});
	await approveRecipeVersion(sql, owner, version.id);
	return { recipeId: created.id, versionId: version.id };
}

/** Plans, reserves and makes a batch, returning it. */
async function made(versionId: string, actualYieldMl = "990"): Promise<Batch> {
	const batch = await planBatch(sql, staff, { recipeVersionId: versionId, batchMl: "1000" }, TODAY);
	await reserveBatch(sql, staff, batch.id, TODAY);
	return completeBatch(sql, staff, batch.id, { actualYieldMl }, TODAY);
}

const NICOTINE = { analyte: "Nicotine", unit: "mg/mL", min: "11.4", max: "12.6", method: "HPLC-UV" };
const DIACETYL = { analyte: "Diacetyl", unit: "µg/g", max: "5", required: false };

async function specified(recipeId: string) {
	const draft = await addSpecification(sql, staff, { recipeId, criteria: [NICOTINE, DIACETYL] });
	return approveSpecification(sql, owner, draft.id);
}

const result = (batchId: string, changes: Partial<NewResult> = {}) =>
	enterResult(
		sql,
		staff,
		{
			batchId,
			analyte: "Nicotine",
			method: "HPLC-UV",
			reportedAs: "12.1",
			unit: "mg/mL",
			lab: "Prairie Analytical",
			reportRef: "PA-1001",
			reportedOn: "2026-10-14",
			...changes,
		},
		TODAY,
	);

const named = (checks: Awaited<ReturnType<typeof qualityChecks>>, name: string) =>
	checks.find((check) => check.name === name);

beforeAll(async () => {
	sql = await freshDb();
	await stock("pg", { name: "PG USP", category: "pg" }, "PG-1");
	await stock("vg", { name: "VG USP", category: "vg" }, "VG-1");
	await stock(
		"base",
		{
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			pgPercent: "90",
			vgPercent: "0",
		},
		"N-1",
	);
	await stock(
		"mango",
		{ name: "Mango concentrate", category: "flavour", pgPercent: "100", vgPercent: "0" },
		"M-1",
	);
});
afterAll(async () => {
	await sql.close();
});

describe("a specification", () => {
	it("guides nothing until the owner approves it, and keeps the version it replaces", async () => {
		const { recipeId } = await recipe("Spec Mango");
		const first = await addSpecification(sql, staff, { recipeId, criteria: [NICOTINE] });
		expect(first).toMatchObject({ version: 1, state: "draft", intact: true, recipeName: "Spec Mango" });
		expect(first.criteria).toEqual([
			{ analyte: "Nicotine", unit: "mg/mL", min: "11.4", max: "12.6", method: "HPLC-UV", required: true },
		]);
		expect(await approvedSpecification(sql, recipeId)).toBeNull();

		await expect(approveSpecification(sql, staff, first.id)).rejects.toThrow(
			"Only the owner can approve a specification.",
		);
		expect((await listAudit(sql, 1))[0]).toMatchObject({
			action: "specification.approve",
			outcome: "denied",
			actor: "operator:staff-1",
		});

		expect(await approveSpecification(sql, owner, first.id)).toMatchObject({
			state: "approved",
			approvedBy: "operator:owner-1",
		});
		await expect(approveSpecification(sql, owner, first.id)).rejects.toThrow("already approved");

		const second = await addSpecification(sql, staff, { recipeId, criteria: [NICOTINE, DIACETYL] });
		expect(second.version).toBe(2);
		// The first stays in force until the second is approved.
		expect((await approvedSpecification(sql, recipeId))?.version).toBe(1);
		await approveSpecification(sql, owner, second.id);
		expect((await listSpecifications(sql, recipeId)).map((s) => [s.version, s.state])).toEqual([
			[2, "approved"],
			[1, "superseded"],
		]);
	});

	it("never assumes a limit, and refuses limits that can't be right", async () => {
		const { recipeId } = await recipe("Spec Refusals");
		const add = (criteria: Parameters<typeof addSpecification>[2]["criteria"]) =>
			addSpecification(sql, staff, { recipeId, criteria });
		await expect(add([])).rejects.toThrow("at least one thing that is tested");
		await expect(add([{ analyte: "Nicotine", unit: "mg/mL" }])).rejects.toThrow(
			"Nicotine: give a lower limit, an upper limit, or both. A limit is never assumed.",
		);
		await expect(add([{ analyte: "Nicotine", unit: "", max: "12" }])).rejects.toThrow(
			"Nicotine: give the unit its limits are in.",
		);
		await expect(add([{ analyte: "Nicotine", unit: "mg/mL", min: "13", max: "12" }])).rejects.toThrow(
			"the lower limit is above the upper limit",
		);
		await expect(add([{ analyte: "Nicotine", unit: "mg/mL", max: "about 12" }])).rejects.toThrow(
			"the upper limit must be a number",
		);
		await expect(add([NICOTINE, { ...NICOTINE, analyte: " nicotine " }])).rejects.toThrow("listed twice");
		await expect(
			addSpecification(sql, staff, {
				recipeId: "00000000-0000-4000-8000-000000000000",
				criteria: [NICOTINE],
			}),
		).rejects.toThrow("Choose the recipe");
		expect(await listSpecifications(sql, recipeId)).toEqual([]);
	});

	it("reads criteria typed one to a line", () => {
		expect(
			parseCriteria(
				"Nicotine | mg/mL | 11.4 | 12.6 | HPLC-UV\n\n  Diacetyl | µg/g | | 5 | | optional \nWater|%||0.5",
			),
		).toEqual([
			{ analyte: "Nicotine", unit: "mg/mL", min: "11.4", max: "12.6", method: "HPLC-UV", required: true },
			{ analyte: "Diacetyl", unit: "µg/g", min: "", max: "5", method: "", required: false },
			{ analyte: "Water", unit: "%", min: "", max: "0.5", method: "", required: true },
		]);
	});
});

describe("a sample", () => {
	it("takes its liquid from the bulk in the same step, and only once", async () => {
		const { versionId } = await recipe("Sample Mango");
		const batch = await made(versionId, "990");
		const input = {
			batchId: batch.id,
			purpose: "release_test",
			quantityMl: "10",
			testsRequested: "Nicotine",
			idempotencyKey: key(),
		};
		const sample = await takeSample(sql, staff, input);
		expect(sample).toMatchObject({
			code: `${batch.code}-S1`,
			purpose: "release_test",
			quantityMl: "10",
			takenBy: "operator:staff-1",
		});
		expect(sample.events.map((e) => e.event)).toEqual(["taken"]);
		expect((await getBatch(sql, batch.id))?.bulkRemainingMl).toBe("980");
		expect((await listBulkMovements(sql, batch.id))[0]).toMatchObject({
			kind: "sample",
			quantityMl: "10",
			remainingAfterMl: "980",
			reason: "Release testing sample",
			reference: sample.code,
		});

		// The same request arriving twice is one sample.
		expect((await takeSample(sql, staff, input)).id).toBe(sample.id);
		expect((await getBatch(sql, batch.id))?.bulkRemainingMl).toBe("980");
		expect(await listSamples(sql, batch.id)).toHaveLength(1);

		const retained = await takeSample(sql, staff, { ...input, purpose: "retained", idempotencyKey: key() });
		expect(retained.code).toBe(`${batch.code}-S2`);
		expect((await getBatch(sql, batch.id))?.bulkRemainingMl).toBe("970");
	});

	it("can't take more than is left or from a batch that hasn't been made, and then records nothing", async () => {
		const { versionId } = await recipe("Sample Refusals");
		const planned = await planBatch(sql, staff, { recipeVersionId: versionId, batchMl: "1000" }, TODAY);
		const take = (batchId: string, changes: Record<string, string> = {}) =>
			takeSample(sql, staff, {
				batchId,
				purpose: "release_test",
				quantityMl: "10",
				idempotencyKey: key(),
				...changes,
			});
		await expect(take(planned.id)).rejects.toThrow("hasn't been made, so it has no bulk liquid.");
		const batch = await made(versionId, "50");
		await expect(take(batch.id, { quantityMl: "60" })).rejects.toThrow(
			`Only 50 mL of batch ${batch.code} is left in bulk. 60 mL can't be taken from it.`,
		);
		await expect(take(batch.id, { quantityMl: "0" })).rejects.toThrow("greater than zero");
		await expect(take(batch.id, { quantityMl: "a little" })).rejects.toThrow("greater than zero");
		await expect(take(batch.id, { purpose: "curiosity" })).rejects.toThrow("Choose what the sample is for.");
		expect(await listSamples(sql, batch.id)).toEqual([]);
		expect((await getBatch(sql, batch.id))?.bulkRemainingMl).toBe("50");
	});

	it("keeps a line for each hand-over, in order, and none without saying where it went", async () => {
		const { versionId } = await recipe("Sample Custody");
		const batch = await made(versionId);
		const sample = await takeSample(sql, staff, {
			batchId: batch.id,
			purpose: "release_test",
			quantityMl: "10",
			idempotencyKey: key(),
		});
		await recordSampleEvent(sql, staff, {
			sampleId: sample.id,
			event: "dispatched",
			detail: "Courier waybill 4471 to Prairie Analytical",
		});
		await recordSampleEvent(sql, owner, {
			sampleId: sample.id,
			event: "received_by_lab",
			detail: "Signed for by the lab, 9:40",
		});
		await expect(
			recordSampleEvent(sql, staff, { sampleId: sample.id, event: "dispatched", detail: " " }),
		).rejects.toThrow("Say where it went or what happened");
		// A sample is taken once, by taking it.
		await expect(
			recordSampleEvent(sql, staff, { sampleId: sample.id, event: "taken", detail: "Again" }),
		).rejects.toThrow("Choose what happened to the sample.");
		const [stored] = await listSamples(sql, batch.id);
		expect(stored.events.map((e) => [e.event, e.detail, e.actor])).toEqual([
			["taken", null, "operator:staff-1"],
			["dispatched", "Courier waybill 4471 to Prairie Analytical", "operator:staff-1"],
			["received_by_lab", "Signed for by the lab, 9:40", "operator:owner-1"],
		]);
	});
});

describe("comparing a result with a criterion", () => {
	const criterion: Criterion = {
		analyte: "Nicotine",
		unit: "mg/mL",
		min: "11.4",
		max: "12.6",
		method: "HPLC-UV",
		required: true,
	};
	const reported = (changes: Partial<TestResult>): TestResult => ({
		id: "r",
		batchId: "b",
		batchCode: "B-1",
		sampleId: null,
		sampleCode: null,
		analyte: "Nicotine",
		method: "HPLC-UV",
		reportedAs: changes.value ?? "12",
		value: "12",
		uncertainty: null,
		unit: "mg/mL",
		lab: "Lab",
		reportRef: "R-1",
		reportedOn: "2026-10-14",
		enteredBy: "operator:staff-1",
		enteredAt: "2026-10-14T15:00:00.000Z",
		verifiedBy: "operator:owner-1",
		verifiedAt: "2026-10-14T16:00:00.000Z",
		replacesId: null,
		correctionReason: null,
		replaced: false,
		ruling: null,
		ruledBy: null,
		ruledAt: null,
		rulingReason: null,
		...changes,
	});

	it("passes on or inside the limits and fails outside them, in exact decimals", () => {
		expect(judge(criterion, reported({ value: "12" }))).toEqual({
			outcome: "pass",
			detail: "Within 11.4 to 12.6 mg/mL.",
		});
		expect(judge(criterion, reported({ value: "11.4" })).outcome).toBe("pass");
		expect(judge(criterion, reported({ value: "12.6" })).outcome).toBe("pass");
		expect(judge(criterion, reported({ value: "12.600001" }))).toEqual({
			outcome: "fail",
			detail: "Outside the limit of 11.4 to 12.6 mg/mL.",
		});
		expect(judge(criterion, reported({ value: "11.399999" })).outcome).toBe("fail");
		expect(
			judge({ ...criterion, min: null, max: "5", method: null }, reported({ value: "5.1" })).detail,
		).toBe("Outside the limit of at most 5 mg/mL.");
	});

	it("never converts a unit, assumes a method, or reads words as a number", () => {
		expect(judge(criterion, reported({ unit: "mg/g" }))).toEqual({
			outcome: "unresolved",
			detail: "Reported in mg/g; the specification is in mg/mL. Units are never converted here.",
		});
		// Case and spacing are not a different unit.
		expect(judge(criterion, reported({ unit: " MG/ML " })).outcome).toBe("pass");
		expect(judge(criterion, reported({ method: "GC-FID" })).detail).toBe(
			"Tested by GC-FID; the specification names HPLC-UV.",
		);
		expect(judge(criterion, reported({ method: null })).detail).toBe(
			"The method isn't recorded; the specification names HPLC-UV.",
		);
		expect(judge({ ...criterion, method: null }, reported({ method: null })).outcome).toBe("pass");
		expect(judge(criterion, reported({ value: null, reportedAs: "< 0.05" }))).toEqual({
			outcome: "unresolved",
			detail: 'Reported as "< 0.05", which isn\'t a number that can be compared with a limit.',
		});
	});

	it("leaves a result unresolved when its reported uncertainty reaches past a limit", () => {
		expect(judge(criterion, reported({ value: "12.5", uncertainty: "0.2" }))).toEqual({
			outcome: "unresolved",
			detail:
				"Within 11.4 to 12.6 mg/mL, but the reported uncertainty of ±0.2 reaches past the limit. A person decides.",
		});
		expect(judge(criterion, reported({ value: "12", uncertainty: "0.2" })).outcome).toBe("pass");
		expect(judge(criterion, reported({ value: "12.5", uncertainty: "0.1" })).outcome).toBe("pass");
		// Outside is outside, whatever the uncertainty.
		expect(judge(criterion, reported({ value: "12.7", uncertainty: "0.5" })).outcome).toBe("fail");
	});

	it("needs every result that counts to pass, and says what is missing", () => {
		const specification = {
			id: "s",
			recipeId: "x",
			recipeName: "Mango",
			version: 1,
			state: "approved" as const,
			criteria: [
				criterion,
				{ ...criterion, analyte: "Diacetyl", unit: "µg/g", min: null, max: "5", required: false },
			],
			intact: true,
			note: null,
			createdBy: "operator:staff-1",
			createdAt: "",
			approvedBy: "operator:owner-1",
			approvedAt: "",
		};
		expect(assess(specification, []).map((l) => [l.analyte, l.outcome])).toEqual([
			["Nicotine", "missing"],
			["Diacetyl", "not_tested"],
		]);
		const fail = reported({ id: "a", value: "13.9", reportedAs: "13.9" });
		const retest = reported({ id: "b", value: "12.1", reportedAs: "12.1", reportRef: "R-2" });
		// A passing retest doesn't hide a failing result that is still on file.
		expect(assess(specification, [fail, retest])[0]).toMatchObject({
			outcome: "fail",
			resultIds: ["a", "b"],
			detail:
				"13.9 mg/mL (report R-1): Outside the limit of 11.4 to 12.6 mg/mL. 12.1 mg/mL (report R-2): Within 11.4 to 12.6 mg/mL.",
		});
		expect(assess(specification, [{ ...fail, ruling: "set_aside" }, retest])[0].outcome).toBe("pass");
		expect(assess(specification, [{ ...fail, replaced: true }, retest])[0].outcome).toBe("pass");
		expect(assess(specification, [{ ...retest, verifiedAt: null }])[0].outcome).toBe("unverified");
		// Something tested that the specification doesn't mention is shown, and compared with nothing.
		expect(
			assess(specification, [retest, reported({ id: "c", analyte: "pH", unit: "pH" })])[2],
		).toMatchObject({
			analyte: "pH",
			outcome: "no_criterion",
			limits: null,
		});
		expect(assess(null, [retest])[0].detail).toContain("No specification is approved for this recipe");
	});
});

describe("a result", () => {
	it("is not evidence until the owner has verified it", async () => {
		const { recipeId, versionId } = await recipe("Result Mango");
		await specified(recipeId);
		const batch = await made(versionId);
		const entered = await result(batch.id);
		expect(entered).toMatchObject({
			analyte: "Nicotine",
			reportedAs: "12.1",
			value: "12.1",
			enteredBy: "operator:staff-1",
			verifiedAt: null,
			replaced: false,
		});
		expect((await listUnverifiedResults(sql)).map((r) => r.id)).toContain(entered.id);
		const before = await qualityChecks(sql, batch);
		expect(named(before, "No result is waiting to be verified")).toMatchObject({
			ok: false,
			detail: "Not verified: Nicotine (report PA-1001)",
		});
		expect(named(before, "Its verified results meet the approved specification")?.ok).toBe(false);

		await expect(verifyResult(sql, staff, entered.id)).rejects.toThrow("Only the owner can verify a result.");
		expect((await listAudit(sql, 1))[0]).toMatchObject({ action: "result.verify", outcome: "denied" });

		const verified = await verifyResult(sql, owner, entered.id);
		expect(verified.result.verifiedBy).toBe("operator:owner-1");
		expect(verified.verdict).toEqual({ outcome: "pass", detail: "Within 11.4 to 12.6 mg/mL." });
		expect(verified.hold).toBeNull();
		await expect(verifyResult(sql, owner, entered.id)).rejects.toThrow("already been verified");

		const after = await qualityChecks(sql, batch);
		expect(after.every((check) => check.ok)).toBe(true);
		expect(named(after, "Its verified results meet the approved specification")?.detail).toBe(
			"Specification version 1. Nicotine: within limits. 12.1 mg/mL (report PA-1001): Within 11.4 to 12.6 mg/mL. Diacetyl: not tested. Not tested. The specification doesn't require it.",
		);
		expect((await listUnverifiedResults(sql)).map((r) => r.id)).not.toContain(entered.id);
	});

	it("is entered as the report gives it, for a batch that was made, and never dated ahead", async () => {
		const { versionId } = await recipe("Result Refusals");
		const planned = await planBatch(sql, staff, { recipeVersionId: versionId, batchMl: "1000" }, TODAY);
		await expect(result(planned.id)).rejects.toThrow("hasn't been recorded as made");
		const batch = await made(versionId);
		const other = await made(versionId);
		const sample = await takeSample(sql, staff, {
			batchId: other.id,
			purpose: "release_test",
			quantityMl: "5",
			idempotencyKey: key(),
		});
		await expect(result(batch.id, { reportedAs: " " })).rejects.toThrow(
			"A result is never filled in from memory or estimated.",
		);
		await expect(result(batch.id, { unit: "" })).rejects.toThrow("Enter the unit");
		await expect(result(batch.id, { lab: "" })).rejects.toThrow("Enter the laboratory");
		await expect(result(batch.id, { reportRef: "" })).rejects.toThrow("report's number or reference");
		await expect(result(batch.id, { reportedOn: "2026-10-16" })).rejects.toThrow(
			"The report date can't be after today.",
		);
		await expect(result(batch.id, { reportedOn: "yesterday" })).rejects.toThrow("must be a date");
		await expect(result(batch.id, { uncertainty: "-1" })).rejects.toThrow("uncertainty must be a number");
		await expect(result(batch.id, { sampleId: sample.id })).rejects.toThrow(
			`That sample wasn't taken from batch ${batch.code}.`,
		);
		expect(await listResults(sql, batch.id)).toEqual([]);

		// Words stay words: nothing is read into them.
		const words = await result(batch.id, { analyte: "Diacetyl", reportedAs: "not detected", unit: "µg/g" });
		expect(words).toMatchObject({ reportedAs: "not detected", value: null });
		const linked = await result(other.id, { sampleId: sample.id, uncertainty: "0.3" });
		expect(linked).toMatchObject({ sampleCode: sample.code, uncertainty: "0.3" });
	});

	it("outside its limit puts the batch on hold the moment it is verified", async () => {
		const { recipeId, versionId } = await recipe("Result Out Of Spec");
		await specified(recipeId);
		const batch = await made(versionId);
		const high = await result(batch.id, { reportedAs: "13.9", reportRef: "PA-2001" });
		// Entered but unverified, it holds nothing yet.
		expect(await listHolds(sql, batch.id)).toEqual([]);

		const verified = await verifyResult(sql, owner, high.id);
		expect(verified.verdict?.outcome).toBe("fail");
		expect(verified.hold).toMatchObject({
			batchId: batch.id,
			placedBy: "operator:owner-1",
			reason:
				"Verified result out of specification: Nicotine 13.9 mg/mL, limit 11.4 to 12.6 mg/mL (report PA-2001).",
		});
		// The hold is real: nothing can be packaged, and the release is refused on three counts.
		await expect(
			recordPackagingRun(
				sql,
				staff,
				{
					batchId: batch.id,
					sku: "MANGO-12-30",
					bottleMl: "30",
					unitsFilled: "5",
					bulkUsedMl: "150",
					labelVersion: "Label 3",
					lineClearance: "Line cleared.",
					idempotencyKey: key(),
				},
				TODAY,
			),
		).rejects.toThrow("is on hold");
		const failed = (await releaseChecks(sql, (await getBatch(sql, batch.id)) as Batch)).filter((c) => !c.ok);
		expect(failed.map((c) => c.name)).toEqual([
			"It is not on hold",
			"Its verified results meet the approved specification",
		]);
		await expect(
			decideRelease(sql, owner, {
				batchId: batch.id,
				decision: "released",
				note: "Looks fine",
				confirmations: ALL,
			}),
		).rejects.toThrow("can't be released");

		// A result outside its limit can't be waved through.
		await expect(
			ruleOnResult(sql, owner, { resultId: high.id, ruling: "accepted", reason: "Close enough" }),
		).rejects.toThrow("is outside its limit, so it can't be accepted");
	});

	it("is corrected by a new result that names it, and the earlier one is kept", async () => {
		const { recipeId, versionId } = await recipe("Result Corrections");
		await specified(recipeId);
		const batch = await made(versionId);
		const typo = await result(batch.id, { reportedAs: "21.1" });
		await expect(result(batch.id, { reportedAs: "12.1", replacesId: typo.id })).rejects.toThrow(
			"Say why the earlier result is being corrected.",
		);
		const fixed = await result(batch.id, {
			reportedAs: "12.1",
			replacesId: typo.id,
			correctionReason: "Digits swapped when typed from the report",
		});
		expect(fixed).toMatchObject({ replacesId: typo.id, verifiedAt: null });
		const stored = await listResults(sql, batch.id);
		expect(stored.map((r) => [r.reportedAs, r.replaced])).toEqual([
			["21.1", true],
			["12.1", false],
		]);
		// The replaced one can't be verified or corrected again, and the correction is what gets verified.
		await expect(verifyResult(sql, owner, typo.id)).rejects.toThrow("Verify the correction instead.");
		await expect(
			result(batch.id, { reportedAs: "12.2", replacesId: typo.id, correctionReason: "Again" }),
		).rejects.toThrow("already been corrected");
		const other = await made(versionId);
		await expect(
			result(other.id, { reportedAs: "12.2", replacesId: fixed.id, correctionReason: "Wrong batch" }),
		).rejects.toThrow("isn't one of this batch's");
		expect((await verifyResult(sql, owner, fixed.id)).hold).toBeNull();
		expect((await batchAssessment(sql, batch)).lines[0]).toMatchObject({
			outcome: "pass",
			resultIds: [fixed.id],
		});
		expect(await listHolds(sql, batch.id)).toEqual([]);
	});

	it("can be set aside or accepted only by the owner, with a reason that is kept", async () => {
		const { recipeId, versionId } = await recipe("Result Rulings");
		await specified(recipeId);
		const batch = await made(versionId);
		const inGrams = await result(batch.id, { reportedAs: "10.8", unit: "mg/g", reportRef: "PA-3001" });
		await expect(
			ruleOnResult(sql, owner, { resultId: inGrams.id, ruling: "accepted", reason: "Density 1.12" }),
		).rejects.toThrow("Verify the result against the report before accepting it.");
		await verifyResult(sql, owner, inGrams.id);
		expect((await batchAssessment(sql, batch)).lines[0]).toMatchObject({ outcome: "unresolved" });
		expect(await listHolds(sql, batch.id)).toEqual([]);

		await expect(
			ruleOnResult(sql, staff, { resultId: inGrams.id, ruling: "accepted", reason: "Density 1.12" }),
		).rejects.toThrow("Only the owner can accept a result.");
		await expect(
			ruleOnResult(sql, owner, { resultId: inGrams.id, ruling: "accepted", reason: "" }),
		).rejects.toThrow("Say why.");
		const accepted = await ruleOnResult(sql, owner, {
			resultId: inGrams.id,
			ruling: "accepted",
			reason: "Measured density 1.12 g/mL gives 12.1 mg/mL.",
		});
		expect(accepted).toMatchObject({ ruling: "accepted", ruledBy: "operator:owner-1" });
		const line = (await batchAssessment(sql, batch)).lines[0];
		expect(line.outcome).toBe("accepted");
		expect(line.detail).toContain("Accepted by the owner: Measured density 1.12 g/mL gives 12.1 mg/mL.");
		expect((await qualityChecks(sql, batch)).every((check) => check.ok)).toBe(true);
		await expect(
			ruleOnResult(sql, owner, { resultId: inGrams.id, ruling: "set_aside", reason: "Changed my mind" }),
		).rejects.toThrow("A ruling has already been recorded");

		// A passing result has nothing to accept.
		const fine = await result(batch.id, { reportRef: "PA-3002" });
		await verifyResult(sql, owner, fine.id);
		await expect(
			ruleOnResult(sql, owner, { resultId: fine.id, ruling: "accepted", reason: "It passed" }),
		).rejects.toThrow("Only a result the workspace couldn't judge for itself can be accepted.");

		// Setting a failing result aside takes it out of the comparison; it stays on file with the reason.
		const second = await made(versionId);
		const bad = await result(second.id, { reportedAs: "14", reportRef: "PA-3003" });
		await verifyResult(sql, owner, bad.id);
		const retest = await result(second.id, { reportedAs: "12.2", reportRef: "PA-3004" });
		await verifyResult(sql, owner, retest.id);
		expect((await batchAssessment(sql, second)).lines[0].outcome).toBe("fail");
		await ruleOnResult(sql, owner, {
			resultId: bad.id,
			ruling: "set_aside",
			reason: "Lab confirmed a dilution error in PA-3003; see their letter.",
		});
		expect((await batchAssessment(sql, second)).lines[0]).toMatchObject({
			outcome: "pass",
			resultIds: [retest.id],
		});
		expect((await listResults(sql, second.id))[0]).toMatchObject({
			ruling: "set_aside",
			rulingReason: "Lab confirmed a dilution error in PA-3003; see their letter.",
		});
		// The hold the failing result placed stays until the owner lifts it.
		expect((await listHolds(sql, second.id)).filter((hold) => hold.liftedAt === null)).toHaveLength(1);
	});
});

describe("a deviation", () => {
	it("gets a number, and can put its batch on hold in the same step", async () => {
		const { versionId } = await recipe("Deviation Mango");
		const batch = await made(versionId);
		const open = (changes: Record<string, unknown> = {}) =>
			openDeviation(
				sql,
				staff,
				{
					batchId: batch.id,
					title: "Mixer stopped mid-batch",
					description: "The mixer tripped its breaker after about four minutes.",
					severity: "major",
					...changes,
				},
				TODAY,
			);
		await expect(open({ title: "" })).rejects.toThrow("Give the deviation a short title.");
		await expect(open({ description: "" })).rejects.toThrow("Describe what happened");
		await expect(open({ severity: "catastrophic" })).rejects.toThrow("Choose how serious it is.");
		await expect(open({ batchId: "", hold: true })).rejects.toThrow("Choose the batch to put on hold");

		const first = await open({ hold: true });
		expect(first).toMatchObject({
			code: "DEV-20261015-001",
			batchCode: batch.code,
			severity: "major",
			status: "open",
			openedBy: "operator:staff-1",
		});
		expect((await listHolds(sql, batch.id)).map((hold) => hold.reason)).toEqual([
			"Deviation DEV-20261015-001: Mixer stopped mid-batch",
		]);
		// Not tied to a batch, it is still a record.
		const general = await open({ batchId: "", title: "Scale found out of level", severity: "minor" });
		expect(general).toMatchObject({ code: "DEV-20261015-002", batchId: null });
		expect((await listDeviations(sql, { batchId: batch.id })).map((d) => d.code)).toEqual([
			"DEV-20261015-001",
		]);
	});

	it("stands in the way of its batch's release until it is closed", async () => {
		const { versionId } = await recipe("Deviation Release");
		const batch = await made(versionId);
		const deviation = await openDeviation(
			sql,
			staff,
			{ batchId: batch.id, title: "Yield low", description: "Yield 4% under nominal.", severity: "minor" },
			TODAY,
		);
		expect(named(await qualityChecks(sql, batch), "No deviation is open against it")).toEqual({
			name: "No deviation is open against it",
			ok: false,
			detail: `Open: ${deviation.code} (Yield low)`,
		});
		await expect(
			decideRelease(sql, owner, {
				batchId: batch.id,
				decision: "released",
				note: "Read",
				confirmations: ALL,
			}),
		).rejects.toThrow(`no deviation is open against it (Open: ${deviation.code} (Yield low))`);

		await addDeviationEntry(sql, staff, {
			deviationId: deviation.id,
			kind: "established_finding",
			body: "Transfer hose retained about 40 mL; measured.",
		});
		await closeDeviation(sql, owner, {
			deviationId: deviation.id,
			disposition: "No effect on the liquid. Batch may proceed.",
		});
		const released = await decideRelease(sql, owner, {
			batchId: batch.id,
			decision: "released",
			note: "Record read, deviation closed.",
			confirmations: ALL,
		});
		expect(released.qualityStatus).toBe("released");
		// What was checked is kept with the decision, the quality checks among them.
		const record = released.decisionRecord as { checks: Array<{ name: string; ok: boolean }> };
		expect(record.checks.map((check) => check.name)).toEqual(
			expect.arrayContaining(["No deviation is open against it", "No result is waiting to be verified"]),
		);
		// No specification is approved for this recipe, so no comparison is claimed.
		expect(record.checks.map((check) => check.name)).not.toContain(
			"Its verified results meet the approved specification",
		);
	});

	it("can't be closed while an action is unfinished or unverified, or before anything is established", async () => {
		const deviation = await openDeviation(
			sql,
			staff,
			{
				title: "Label roll mix-up",
				description: "Two label rolls found on the bench.",
				severity: "critical",
			},
			TODAY,
		);
		const close = () =>
			closeDeviation(sql, owner, {
				deviationId: deviation.id,
				disposition: "Rolls separated; none applied.",
			});
		await expect(
			closeDeviation(sql, staff, { deviationId: deviation.id, disposition: "Fine" }),
		).rejects.toThrow("Only the owner can close a deviation.");
		await expect(closeDeviation(sql, owner, { deviationId: deviation.id, disposition: "" })).rejects.toThrow(
			"Record the disposition",
		);
		await expect(close()).rejects.toThrow("nothing is recorded as established");

		await addDeviationEntry(sql, staff, {
			deviationId: deviation.id,
			kind: "suspected_cause",
			body: "Previous run's roll not returned to stores.",
		});
		// A suspicion is not a finding.
		await expect(close()).rejects.toThrow("nothing is recorded as established");
		await expect(
			addDeviationEntry(sql, staff, { deviationId: deviation.id, kind: "hunch", body: "x" }),
		).rejects.toThrow("Choose what kind of entry this is.");
		await addDeviationEntry(sql, owner, {
			deviationId: deviation.id,
			kind: "established_finding",
			body: "Line clearance for the previous run did not list the label roll.",
		});

		await expect(
			addCorrectiveAction(sql, staff, { deviationId: deviation.id, action: "", responsible: "Sam" }, TODAY),
		).rejects.toThrow("Say what is to be done.");
		await expect(
			addCorrectiveAction(
				sql,
				staff,
				{
					deviationId: deviation.id,
					action: "Add the label roll to the clearance checklist",
					responsible: "",
				},
				TODAY,
			),
		).rejects.toThrow("Say who is responsible for it.");
		await addCorrectiveAction(
			sql,
			staff,
			{
				deviationId: deviation.id,
				action: "Add the label roll to the clearance checklist",
				responsible: "Sam",
				dueOn: "2026-10-22",
			},
			TODAY,
		);
		await addCorrectiveAction(
			sql,
			staff,
			{ deviationId: deviation.id, action: "Buy a second label cabinet", responsible: "Olivia" },
			TODAY,
		);
		const [checklist, cabinet] = ((await getDeviation(sql, deviation.id))?.actions ?? []).map((a) => a.id);
		expect((await listPendingActions(sql)).map((a) => [a.action, a.dueOn, a.status])).toEqual(
			expect.arrayContaining([["Add the label roll to the clearance checklist", "2026-10-22", "open"]]),
		);
		await expect(close()).rejects.toThrow("2 actions are still open");

		const step = (actor: typeof owner, actionId: string, stepName: string, note: string) =>
			updateCorrectiveAction(sql, actor, { actionId, step: stepName, note });
		// Nothing to verify before it is done; done needs its evidence.
		await expect(step(owner, checklist, "verified", "Works")).rejects.toThrow("hasn't been marked done yet");
		await expect(step(staff, checklist, "done", "")).rejects.toThrow(
			"Say what was done and where the evidence is.",
		);
		expect(
			await step(staff, checklist, "done", "Checklist revision 4 issued; copy in the binder."),
		).toMatchObject({
			status: "done",
			doneBy: "operator:staff-1",
		});
		// Done is not the end.
		await expect(close()).rejects.toThrow(
			"1 action is still open and 1 is done but not verified to have worked",
		);
		await expect(step(staff, checklist, "verified", "Looks good")).rejects.toThrow(
			"Only the owner can verify that an action worked.",
		);
		await expect(step(staff, cabinet, "cancelled", "No budget")).rejects.toThrow(
			"Only the owner can cancel an action.",
		);
		expect(
			await step(owner, checklist, "verified", "Three runs since, each clearance lists the roll."),
		).toMatchObject({
			status: "verified",
			effectiveness: "Three runs since, each clearance lists the roll.",
		});
		await expect(close()).rejects.toThrow("1 action is still open.");
		expect(
			await step(owner, cabinet, "cancelled", "One cabinet with two shelves does the job."),
		).toMatchObject({
			status: "cancelled",
			cancelReason: "One cabinet with two shelves does the job.",
		});

		const closed = await close();
		expect(closed).toMatchObject({
			status: "closed",
			closedBy: "operator:owner-1",
			disposition: "Rolls separated; none applied.",
		});
		expect(closed.entries.map((entry) => entry.kind)).toEqual(["suspected_cause", "established_finding"]);
		// A closed deviation is not reopened or added to.
		await expect(
			addDeviationEntry(sql, staff, { deviationId: deviation.id, kind: "note", body: "One more thing" }),
		).rejects.toThrow("is closed. Open a new one instead.");
		await expect(step(owner, cabinet, "done", "Bought anyway")).rejects.toThrow("is closed");
		expect((await listPendingActions(sql)).map((a) => a.deviationId)).not.toContain(deviation.id);
	});
});

describe("a release with a specification in force", () => {
	it("is refused while a required result is missing, and allowed once the records are in order", async () => {
		const { recipeId, versionId } = await recipe("Release Mango");
		await specified(recipeId);
		const batch = await made(versionId);
		const release = () =>
			decideRelease(sql, owner, {
				batchId: batch.id,
				decision: "released",
				note: "Batch record and report PA-4001 read.",
				confirmations: ALL,
			});
		// Ticking every box is not enough: the workspace looks for the result itself.
		await expect(release()).rejects.toThrow(
			"its verified results meet the approved specification (Specification version 1. Nicotine: missing. No result is on file.)",
		);
		const entered = await result(batch.id, { reportRef: "PA-4001" });
		await expect(release()).rejects.toThrow("no result is waiting to be verified");
		await verifyResult(sql, owner, entered.id);
		const released = await release();
		expect(released.qualityStatus).toBe("released");
		const record = released.decisionRecord as {
			checks: Array<{ name: string; ok: boolean; detail: string }>;
		};
		expect(
			record.checks.find((c) => c.name === "Its verified results meet the approved specification"),
		).toEqual({
			name: "Its verified results meet the approved specification",
			ok: true,
			detail:
				"Specification version 1. Nicotine: within limits. 12.1 mg/mL (report PA-4001): Within 11.4 to 12.6 mg/mL. Diacetyl: not tested. Not tested. The specification doesn't require it.",
		});
	});
});
