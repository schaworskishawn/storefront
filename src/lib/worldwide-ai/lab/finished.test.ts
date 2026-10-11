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
} from "./batches";
import {
	RELEASE_CONFIRMATIONS,
	decideRelease,
	liftHold,
	listBulkMovements,
	listFinished,
	listHolds,
	listPackagingRuns,
	placeHold,
	recordBulkMovement,
	recordPackagingRun,
	releaseChecks,
	type NewPackagingRun,
} from "./finished";
import { createIngredient, createLot, getLot, postMovement, verifyLedger } from "./inventory";

let sql: SqlClient;
const TODAY = "2026-10-14";
let serial = 0;
const key = () => `finished-test-${++serial}-${Math.random().toString(36).slice(2)}`;
const ids: Record<string, string> = {};
const ALL = RELEASE_CONFIRMATIONS.map((item) => item.id);

async function stock(
	name: string,
	ingredient: Parameters<typeof createIngredient>[2],
	lot: Omit<Parameters<typeof createLot>[2], "ingredientId">,
	quantity: string,
) {
	const made = await createIngredient(sql, staff, ingredient);
	const created = await createLot(sql, staff, { ingredientId: made.id, ...lot });
	await postMovement(
		sql,
		staff,
		{ lotId: created.id, kind: "receipt", quantity, idempotencyKey: key() },
		TODAY,
	);
	ids[name] = made.id;
	ids[`${name}Lot`] = created.id;
}

/** Plans, reserves and makes a batch of the test recipe, returning its id. */
async function made(batchMl: string, actualYieldMl: string): Promise<string> {
	const batch = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl }, TODAY);
	await reserveBatch(sql, staff, batch.id, TODAY);
	await completeBatch(sql, staff, batch.id, { actualYieldMl }, TODAY);
	return batch.id;
}

const run = (batchId: string, changes: Partial<NewPackagingRun> = {}) =>
	recordPackagingRun(
		sql,
		staff,
		{
			batchId,
			sku: "MANGO-12-30",
			bottleMl: "30",
			unitsFilled: "10",
			bulkUsedMl: "302.5",
			labelVersion: "Mango 12 label, revision 3",
			lineClearance: "Line cleared: no bottles or labels from the previous product on the bench.",
			idempotencyKey: key(),
			...changes,
		},
		TODAY,
	);

beforeAll(async () => {
	sql = await freshDb();
	await stock("pg", { name: "PG USP", category: "pg" }, { lotCode: "PG-1", unit: "mL" }, "20000");
	await stock("vg", { name: "VG USP", category: "vg" }, { lotCode: "VG-1", unit: "mL" }, "20000");
	await stock(
		"base",
		{
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			pgPercent: "90",
			vgPercent: "0",
		},
		{ lotCode: "N-1", unit: "mL" },
		"5000",
	);
	await stock(
		"mango",
		{ name: "Mango concentrate", category: "flavour", pgPercent: "100", vgPercent: "0" },
		{ lotCode: "M-1", unit: "mL" },
		"5000",
	);
	await stock(
		"bottles",
		{ name: "30 mL bottle", category: "packaging" },
		{ lotCode: "BTL-1", unit: "each" },
		"100",
	);
	await stock(
		"caps",
		{ name: "Child-resistant cap", category: "packaging" },
		{ lotCode: "CAP-1", unit: "each" },
		"100",
	);
	const recipe = await createRecipe(sql, staff, { name: "Mango 12" });
	const version = await addRecipeVersion(sql, staff, {
		recipeId: recipe.id,
		batchMl: "1000",
		targetNicotineMgPerMl: "12",
		targetPgPercent: "50",
		baseIngredientId: ids.base,
		pgIngredientId: ids.pg,
		vgIngredientId: ids.vg,
		flavours: [{ ingredientId: ids.mango, percent: "10" }],
	});
	await approveRecipeVersion(sql, owner, version.id);
	ids.version = version.id;
});
afterAll(async () => {
	await sql.close();
});

describe("a batch's bulk liquid", () => {
	it("starts as exactly what was measured when the batch was made, and nothing before that", async () => {
		const planned = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
		expect(planned.bulkRemainingMl).toBeNull();
		await expect(
			recordBulkMovement(sql, staff, {
				batchId: planned.id,
				kind: "sample",
				quantityMl: "5",
				reason: "Retained sample",
				idempotencyKey: key(),
			}),
		).rejects.toThrow("hasn't been made, so it has no bulk liquid.");
		await reserveBatch(sql, staff, planned.id, TODAY);
		const done = await completeBatch(sql, staff, planned.id, { actualYieldMl: "992.5" }, TODAY);
		expect(done.bulkRemainingMl).toBe("992.5");
		expect(
			(await listBulkMovements(sql, planned.id)).map((m) => [m.kind, m.quantityMl, m.remainingAfterMl]),
		).toEqual([["produced", "992.5", "992.5"]]);
		ids.first = planned.id;
	});

	it("is drawn down by samples and waste with a reason, and can't go below zero", async () => {
		await expect(
			recordBulkMovement(sql, staff, {
				batchId: ids.first,
				kind: "sample",
				quantityMl: "10",
				reason: "",
				idempotencyKey: key(),
			}),
		).rejects.toThrow("Say why.");
		const request = {
			batchId: ids.first,
			kind: "sample",
			quantityMl: "10",
			reason: "Retained sample",
			idempotencyKey: key(),
		};
		expect((await recordBulkMovement(sql, staff, request)).bulkRemainingMl).toBe("982.5");
		// The same request again is the same movement.
		expect((await recordBulkMovement(sql, staff, request)).bulkRemainingMl).toBe("982.5");
		await expect(
			recordBulkMovement(sql, staff, {
				batchId: ids.first,
				kind: "waste",
				quantityMl: "982.500001",
				reason: "Spill",
				idempotencyKey: key(),
			}),
		).rejects.toThrow("Only 982.5 mL of batch");
		await expect(
			recordBulkMovement(sql, staff, {
				batchId: ids.first,
				kind: "correction",
				quantityMl: "-2.5",
				reason: "Remeasured",
				idempotencyKey: key(),
			}),
		).rejects.toThrow("Only the owner can correct what is left of a batch.");
		expect(
			(
				await recordBulkMovement(sql, owner, {
					batchId: ids.first,
					kind: "correction",
					quantityMl: "-2.5",
					reason: "Remeasured",
					idempotencyKey: key(),
				})
			).bulkRemainingMl,
		).toBe("980");
		await expect(
			sql.query(`update wai_batches set bulk_remaining_ml = -1 where id = $1`, [ids.first]),
		).rejects.toThrow();
	});
});

describe("a packaging run", () => {
	it("needs a recorded line clearance, a label version, and a measured quantity", async () => {
		await expect(run(ids.first, { lineClearance: " " })).rejects.toThrow("Record the line clearance");
		await expect(run(ids.first, { labelVersion: "" })).rejects.toThrow(
			"Enter which approved label version was used.",
		);
		await expect(run(ids.first, { bulkUsedMl: "" })).rejects.toThrow(
			"The bulk used must be a number of millilitres",
		);
		await expect(run(ids.first, { unitsFilled: "9.5" })).rejects.toThrow(
			"Units filled must be a whole number.",
		);
		expect(await listPackagingRuns(sql, ids.first)).toEqual([]);
	});

	it("takes the liquid from the bulk and the bottles and caps from stock, in one step", async () => {
		const recorded = await run(ids.first, {
			components: [
				{ lotId: ids.bottlesLot, quantity: "11" },
				{ lotId: ids.capsLot, quantity: "10" },
			],
			unitsRejected: "1",
		});
		expect(recorded).toMatchObject({
			code: `${recorded.batchCode}-P1`,
			sku: "MANGO-12-30",
			unitsFilled: 10,
			unitsRejected: 1,
			bulkUsedMl: "302.5",
			// What ten 30 mL bottles nominally hold. Shown for comparison; the bulk was drawn down by what was measured.
			nominalMl: "300",
		});
		expect(recorded.components.map((c) => [c.ingredient, c.lotCode, c.quantity])).toEqual([
			["30 mL bottle", "BTL-1", "11"],
			["Child-resistant cap", "CAP-1", "10"],
		]);
		expect((await getBatch(sql, ids.first))?.bulkRemainingMl).toBe("677.5");
		expect(await getLot(sql, ids.bottlesLot)).toMatchObject({ onHand: "89", reserved: "0" });
		expect(await getLot(sql, ids.capsLot)).toMatchObject({ onHand: "90", reserved: "0" });
		expect((await listBulkMovements(sql, ids.first))[0]).toMatchObject({
			kind: "packaged",
			quantityMl: "302.5",
			reference: recorded.code,
		});
	});

	it("records nothing at all when any part of it can't be done", async () => {
		// More bottles than there are: the liquid stays in the bulk and the caps stay on the shelf.
		await expect(
			run(ids.first, {
				components: [
					{ lotId: ids.capsLot, quantity: "5" },
					{ lotId: ids.bottlesLot, quantity: "500" },
				],
			}),
		).rejects.toThrow("Only 89 each of lot BTL-1 is usable.");
		expect(await getLot(sql, ids.capsLot)).toMatchObject({ onHand: "90", reserved: "0" });
		expect((await getBatch(sql, ids.first))?.bulkRemainingMl).toBe("677.5");
		// More liquid than is left.
		await expect(run(ids.first, { bulkUsedMl: "700" })).rejects.toThrow("Only 677.5 mL of batch");
		// A liquid lot is not packaging.
		await expect(run(ids.first, { components: [{ lotId: ids.pgLot, quantity: "5" }] })).rejects.toThrow(
			"Lot PG-1 isn't counted in pieces, so it isn't a packaging lot.",
		);
		expect(await listPackagingRuns(sql, ids.first)).toHaveLength(1);
	});

	it("is recorded once when the same form arrives twice", async () => {
		const request = { idempotencyKey: key(), bulkUsedMl: "150", unitsFilled: "5" };
		const first = await run(ids.first, request);
		const again = await run(ids.first, request);
		expect(again.id).toBe(first.id);
		expect((await getBatch(sql, ids.first))?.bulkRemainingMl).toBe("527.5");
		expect(await listPackagingRuns(sql, ids.first)).toHaveLength(2);
	});
});

describe("a quality hold", () => {
	it("stops a batch being packaged or released until the owner lifts it, with a reason", async () => {
		await expect(placeHold(sql, staff, ids.first, "")).rejects.toThrow(
			"Say why the batch is being put on hold.",
		);
		const hold = await placeHold(sql, staff, ids.first, "Colour looks darker than usual");
		await expect(run(ids.first)).rejects.toThrow(
			"is on hold (Colour looks darker than usual), so it can't be packaged.",
		);
		await expect(
			decideRelease(sql, owner, {
				batchId: ids.first,
				decision: "released",
				note: "All in order",
				confirmations: ALL,
			}),
		).rejects.toThrow(/can't be released: it is not on hold \(On hold: Colour looks darker than usual\)/);
		expect((await listFinished(sql)).find((item) => item.batch.id === ids.first)?.standing).toBe("on_hold");
		await expect(liftHold(sql, staff, hold.id, "Looks fine")).rejects.toThrow(
			"Only the owner can lift a hold.",
		);
		await expect(liftHold(sql, owner, hold.id, "")).rejects.toThrow("Say why the hold is being lifted.");
		const lifted = await liftHold(
			sql,
			owner,
			hold.id,
			"Compared with the retained sample: within the usual range.",
		);
		expect(lifted).toMatchObject({
			liftedBy: "operator:owner-1",
			liftReason: "Compared with the retained sample: within the usual range.",
		});
		await expect(liftHold(sql, owner, hold.id, "Again")).rejects.toThrow("has already been lifted");
		expect(await listHolds(sql, ids.first)).toHaveLength(1);
	});
});

describe("the release decision", () => {
	it("is the owner's alone, and a refused attempt is logged", async () => {
		await expect(
			decideRelease(sql, staff, {
				batchId: ids.first,
				decision: "released",
				note: "Fine",
				confirmations: ALL,
			}),
		).rejects.toThrow("Only the owner can release or reject a batch.");
		expect((await listAudit(sql, 1))[0]).toMatchObject({
			action: "batch.released",
			outcome: "denied",
			actor: "operator:staff-1",
		});
	});

	it("needs every confirmation and a stated basis, however good the records look", async () => {
		const batch = await getBatch(sql, ids.first);
		expect((await releaseChecks(sql, batch as NonNullable<typeof batch>)).map((c) => [c.name, c.ok])).toEqual(
			[
				["The batch was recorded as made", true],
				["Its recipe version is approved and unaltered", true],
				["Its plan is unaltered", true],
				["What was used from every lot is recorded", true],
				["The stock ledger adds up for every lot it used", true],
				["No lot it used is in quarantine", true],
				["Its bulk ledger adds up", true],
				["It is not on hold", true],
				["No deviation is open against it", true],
				["No result is waiting to be verified", true],
			],
		);
		await expect(
			decideRelease(sql, owner, { batchId: ids.first, decision: "released", note: "", confirmations: ALL }),
		).rejects.toThrow("Say on what basis the batch is being released.");
		await expect(
			decideRelease(sql, owner, {
				batchId: ids.first,
				decision: "released",
				note: "Reviewed",
				confirmations: ["record", "labels"],
			}),
		).rejects.toThrow(/Not confirmed: Every required test result is on file.*There is no open deviation/);
		expect((await getBatch(sql, ids.first))?.qualityStatus).toBe("awaiting_review");
	});

	it("rechecks the records at the moment of release and refuses if one fails", async () => {
		// A lot the batch used is put in quarantine after the batch was made.
		await postMovement(
			sql,
			staff,
			{ lotId: ids.mangoLot, kind: "quarantine", reason: "Supplier recall notice", idempotencyKey: key() },
			TODAY,
		);
		await expect(
			decideRelease(sql, owner, {
				batchId: ids.first,
				decision: "released",
				note: "Reviewed",
				confirmations: ALL,
			}),
		).rejects.toThrow("can't be released: no lot it used is in quarantine (In quarantine now: M-1.)");
		await postMovement(
			sql,
			owner,
			{
				lotId: ids.mangoLot,
				kind: "quarantine_release",
				reason: "Recall did not cover this lot",
				idempotencyKey: key(),
			},
			TODAY,
		);
		// The bulk balance is changed behind the ledger's back.
		await sql.query(`update wai_batches set bulk_remaining_ml = 600 where id = $1`, [ids.first]);
		await expect(
			decideRelease(sql, owner, {
				batchId: ids.first,
				decision: "released",
				note: "Reviewed",
				confirmations: ALL,
			}),
		).rejects.toThrow(
			/its bulk ledger adds up \(The batch shows 600 mL left but its movements add up to 527.5 mL\.\)/,
		);
		await sql.query(`update wai_batches set bulk_remaining_ml = 527.5 where id = $1`, [ids.first]);
	});

	it("records who released it, on what basis, and exactly what was checked and confirmed", async () => {
		const released = await decideRelease(sql, owner, {
			batchId: ids.first,
			decision: "released",
			note: "Batch record and lab report LR-2291 reviewed.",
			confirmations: ALL,
		});
		expect(released).toMatchObject({
			qualityStatus: "released",
			decisionNote: "Batch record and lab report LR-2291 reviewed.",
		});
		const record = released.decisionRecord as {
			checks: Array<{ ok: boolean }>;
			confirmations: Array<{ id: string }>;
		};
		expect(record.checks).toHaveLength(10);
		expect(record.checks.every((c) => c.ok)).toBe(true);
		expect(record.confirmations.map((c) => c.id)).toEqual(["record", "tests", "deviations", "labels"]);
		expect((await listFinished(sql)).find((item) => item.batch.id === ids.first)).toMatchObject({
			standing: "released",
			unitsFilled: 15,
		});
		// A decision is made once.
		await expect(
			decideRelease(sql, owner, { batchId: ids.first, decision: "rejected", note: "Changed my mind" }),
		).rejects.toThrow("has already been released.");
		// A released batch can still be packaged, and a later doubt is a hold, which shows.
		await run(ids.first, { bulkUsedMl: "60", unitsFilled: "2" });
		await placeHold(sql, staff, ids.first, "Customer complaint about the seal");
		expect((await listFinished(sql)).find((item) => item.batch.id === ids.first)?.standing).toBe("on_hold");
	});

	it("rejects a batch with a reason, after which it can't be packaged", async () => {
		const second = await made("500", "495");
		await expect(
			decideRelease(sql, owner, { batchId: second, decision: "rejected", note: " " }),
		).rejects.toThrow("Say why the batch is being rejected.");
		const rejected = await decideRelease(sql, owner, {
			batchId: second,
			decision: "rejected",
			note: "Nicotine result out of specification.",
		});
		expect(rejected.qualityStatus).toBe("rejected");
		await expect(run(second)).rejects.toThrow("was rejected, so it can't be packaged.");
		expect((await listFinished(sql)).find((item) => item.batch.id === second)?.standing).toBe("rejected");
	});

	it("can't be decided before the batch is made, even by going round the application", async () => {
		const planned = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "500" }, TODAY);
		await expect(
			decideRelease(sql, owner, {
				batchId: planned.id,
				decision: "released",
				note: "Early",
				confirmations: ALL,
			}),
		).rejects.toThrow("hasn't been recorded as made, so there is nothing to decide.");
		await expect(
			sql.query(
				`update wai_batches set quality_status = 'released', decided_by = 'operator:owner-1', decided_at = now(), decision_note = 'x', decision_record = '{}' where id = $1`,
				[planned.id],
			),
		).rejects.toThrow();
		await expect(
			sql.query(
				`update wai_batches set quality_status = 'released', decided_by = 'agent:assure', decided_at = now(), decision_note = 'x', decision_record = '{}' where id = $1`,
				[ids.first],
			),
		).rejects.toThrow();
		expect(await verifyLedger(sql)).toEqual([]);
	});
});
