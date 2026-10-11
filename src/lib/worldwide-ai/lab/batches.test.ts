import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { freshDb, owner, staff } from "../testing.test-util";
import {
	addRecipeVersion,
	approveRecipeVersion,
	batchAvailability,
	cancelBatch,
	completeBatch,
	createRecipe,
	getBatch,
	getRecipe,
	listAllocations,
	listRecipes,
	planBatch,
	reserveBatch,
	yieldDifference,
	type RecipeVersion,
} from "./batches";
import { createIngredient, createLot, getLot, listMovements, postMovement, verifyLedger } from "./inventory";

let sql: SqlClient;
const TODAY = "2026-10-14";
let serial = 0;
const ids: Record<string, string> = {};
const lots: Record<string, string> = {};

async function stock(
	name: string,
	ingredient: Parameters<typeof createIngredient>[2],
	lotsToMake: Array<
		Parameters<typeof createLot>[2] extends infer L
			? Omit<L & object, "ingredientId"> & { quantity: string }
			: never
	>,
) {
	const made = await createIngredient(sql, staff, ingredient);
	ids[name] = made.id;
	for (const { quantity, ...lot } of lotsToMake) {
		const created = await createLot(sql, staff, { ingredientId: made.id, ...lot });
		lots[lot.lotCode] = created.id;
		await postMovement(
			sql,
			staff,
			{ lotId: created.id, kind: "receipt", quantity, idempotencyKey: `setup-${++serial}-${lot.lotCode}` },
			TODAY,
		);
	}
}

const balances = async (code: string) => {
	const lot = await getLot(sql, lots[code]);
	return `${lot?.onHand} on hand, ${lot?.reserved} reserved`;
};

beforeAll(async () => {
	sql = await freshDb();
	await stock("pg", { name: "PG USP", category: "pg" }, [{ lotCode: "PG-1", unit: "mL", quantity: "5000" }]);
	// VG is kept by weight. Its lot has a documented density, so it can still be measured out in millilitres.
	await stock("vg", { name: "VG USP", category: "vg" }, [
		{ lotCode: "VG-1", unit: "g", quantity: "6305", densityGPerMl: "1.261", densitySource: "CoA VG-1" },
	]);
	await stock(
		"base",
		{
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			pgPercent: "90",
			vgPercent: "0",
		},
		[
			{ lotCode: "N-2", unit: "mL", quantity: "200" },
			{ lotCode: "N-1", unit: "mL", quantity: "100", expiresOn: "2026-11-01" },
		],
	);
	await stock("mango", { name: "Mango concentrate", category: "flavour", pgPercent: "100", vgPercent: "0" }, [
		{ lotCode: "M-1", unit: "mL", quantity: "300" },
	]);
	await stock("berry", { name: "Berry concentrate", category: "flavour" }, [
		{ lotCode: "B-1", unit: "mL", quantity: "300" },
	]);
});
afterAll(async () => {
	await sql.close();
});

const formula = (changes: Partial<Parameters<typeof addRecipeVersion>[2]> = {}) => ({
	batchMl: "1000",
	targetNicotineMgPerMl: "12",
	targetPgPercent: "50",
	baseIngredientId: ids.base,
	pgIngredientId: ids.pg,
	vgIngredientId: ids.vg,
	flavours: [{ ingredientId: ids.mango, percent: "10" }],
	...changes,
});

describe("writing a recipe", () => {
	let recipeId: string;
	it("keeps the formula exactly as written, with each ingredient's documented strength and carrier", async () => {
		const recipe = await createRecipe(sql, staff, { name: "Mango Ice", product: "Mango Ice 12 mg" });
		recipeId = recipe.id;
		await expect(createRecipe(sql, staff, { name: "mango ice" })).rejects.toThrow(
			"There is already a recipe called mango ice.",
		);
		const version = await addRecipeVersion(sql, staff, { recipeId, ...formula() });
		expect(version).toMatchObject({ version: 1, state: "draft", intact: true, calcVersion: 1 });
		expect(version.formula).toEqual({
			batchMl: "1000",
			targetNicotineMgPerMl: "12",
			targetPgPercent: "50",
			base: {
				ingredientId: ids.base,
				name: "Nic base 100",
				strengthMgPerMl: "100",
				pgPercent: "90",
				vgPercent: "0",
			},
			flavours: [
				{
					ingredientId: ids.mango,
					name: "Mango concentrate",
					percent: "10",
					pgPercent: "100",
					vgPercent: "0",
				},
			],
			pg: { ingredientId: ids.pg, name: "PG USP" },
			vg: { ingredientId: ids.vg, name: "VG USP" },
		});
		expect(
			(await addRecipeVersion(sql, staff, { recipeId, ...formula({ targetNicotineMgPerMl: "6" }) })).version,
		).toBe(2);
		expect(await listRecipes(sql)).toMatchObject([{ name: "Mango Ice", versions: 2, approved: null }]);
	});

	it("refuses an ingredient whose carrier isn't documented, one of the wrong kind, a repeat, and a formula that can't be made", async () => {
		await expect(
			addRecipeVersion(sql, staff, {
				recipeId,
				...formula({ flavours: [{ ingredientId: ids.berry, percent: "5" }] }),
			}),
		).rejects.toThrow(
			"Berry concentrate has no documented carrier. Record what it is carried in before using it in a recipe: it is never assumed to be all PG.",
		);
		await expect(
			addRecipeVersion(sql, staff, { recipeId, ...formula({ pgIngredientId: ids.vg }) }),
		).rejects.toThrow("VG USP isn't recorded as PG.");
		await expect(
			addRecipeVersion(sql, staff, {
				recipeId,
				...formula({
					flavours: [
						{ ingredientId: ids.mango, percent: "5" },
						{ ingredientId: ids.mango, percent: "5" },
					],
				}),
			}),
		).rejects.toThrow("Mango concentrate is listed twice.");
		await expect(
			addRecipeVersion(sql, staff, { recipeId, ...formula({ targetPgPercent: "10" }) }),
		).rejects.toThrow(/already bring 208\.00 mL of PG/);
		await expect(
			addRecipeVersion(sql, staff, { recipeId, ...formula({ baseIngredientId: undefined }) }),
		).rejects.toThrow("Choose the nicotine base.");
		// A zero-nicotine recipe needs no base at all.
		const zero = await addRecipeVersion(sql, staff, {
			recipeId,
			...formula({ targetNicotineMgPerMl: "0", baseIngredientId: undefined }),
		});
		expect(zero.formula.base).toBeNull();
	});

	it("can be made only from a version the owner approved", async () => {
		const versions = (await getRecipe(sql, recipeId))?.versions as RecipeVersion[];
		const first = versions.find((v) => v.version === 1) as RecipeVersion;
		await expect(
			planBatch(sql, staff, { recipeVersionId: first.id, batchMl: "1000" }, TODAY),
		).rejects.toThrow("Only a recipe version the owner has approved can be made into a batch.");
		await expect(approveRecipeVersion(sql, staff, first.id)).rejects.toThrow(
			"Only the owner can approve a recipe version.",
		);
		expect((await listAudit(sql, 1))[0]).toMatchObject({
			action: "recipe.version.approve",
			outcome: "denied",
		});
		const approved = await approveRecipeVersion(sql, owner, first.id);
		expect(approved).toMatchObject({ state: "approved", approvedBy: "operator:owner-1" });
		ids.version = first.id;
	});
});

describe("planning a batch", () => {
	it("calculates what the batch needs from the approved formula and numbers it", async () => {
		const batch = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
		expect(batch).toMatchObject({
			code: "B-20261014-001",
			status: "planned",
			recipeName: "Mango Ice",
			recipeVersion: 1,
			plannedMl: "1000",
			expectedYieldMl: "1000",
			qualityStatus: "awaiting_review",
		});
		expect(batch.plan.lines.map((line) => [line.key, line.name, line.requiredMl])).toEqual([
			["base", "Nic base 100", "120"],
			[`flavour:${ids.mango}`, "Mango concentrate", "100"],
			["pg", "PG USP", "286"],
			["vg", "VG USP", "494"],
		]);
		ids.batch = batch.id;
		const half = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "500" }, TODAY);
		expect(half.code).toBe("B-20261014-002");
		expect(half.plan.lines.map((line) => line.requiredMl)).toEqual(["60", "50", "143", "247"]);
		ids.half = half.id;
	});

	it("uses the formula as it was approved, even after an ingredient's record changes", async () => {
		await sql.query(`update wai_ingredients set pg_percent = 50, vg_percent = 50 where id = $1`, [ids.mango]);
		const later = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
		expect(later.plan.lines.map((line) => line.requiredMl)).toEqual(["120", "100", "286", "494"]);
		await cancelBatch(sql, staff, later.id, "Planned by mistake", TODAY);
		await sql.query(`update wai_ingredients set pg_percent = 100, vg_percent = 0 where id = $1`, [ids.mango]);
	});

	it("won't plan from a formula that was altered after it was written", async () => {
		const other = await createRecipe(sql, staff, { name: "Tampered" });
		const version = await addRecipeVersion(sql, staff, { recipeId: other.id, ...formula() });
		await approveRecipeVersion(sql, owner, version.id);
		await sql.query(
			`update wai_recipe_versions set formula = jsonb_set(formula::jsonb, '{targetNicotineMgPerMl}', '"50"')::json where id = $1`,
			[version.id],
		);
		await expect(
			planBatch(sql, staff, { recipeVersionId: version.id, batchMl: "1000" }, TODAY),
		).rejects.toThrow("The stored formula no longer matches its checksum, so it can't be used.");
	});
});

describe("reserving a batch", () => {
	it("reserves nothing at all when any ingredient is short, and says which", async () => {
		const big = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "4000" }, TODAY);
		expect(
			(await batchAvailability(sql, big, TODAY)).map((entry) => [
				entry.line.name,
				entry.availableMl,
				entry.shortMl,
			]),
		).toEqual([
			["Nic base 100", "300", "180"],
			["Mango concentrate", "300", "100"],
			["PG USP", "5000", "0"],
			["VG USP", "5000", "0"],
		]);
		await expect(reserveBatch(sql, staff, big.id, TODAY)).rejects.toThrow(
			"Not enough usable stock, so nothing was reserved: Nic base 100 is short by 180 mL (needs 480, 300 usable); Mango concentrate is short by 100 mL (needs 400, 300 usable).",
		);
		expect(await balances("PG-1")).toBe("5000 on hand, 0 reserved");
		expect(await listAllocations(sql, big.id)).toEqual([]);
		expect((await getBatch(sql, big.id))?.status).toBe("planned");
		await cancelBatch(sql, staff, big.id, "Not enough stock for a batch this size", TODAY);
	});

	it("takes the lot that expires first, converts a lot kept by weight with its density, and records it all in the ledger", async () => {
		const reserved = await reserveBatch(sql, staff, ids.batch, TODAY);
		expect(reserved.status).toBe("reserved");
		expect(
			(await listAllocations(sql, ids.batch)).map((a) => [
				a.ingredientName,
				a.lotCode,
				a.requiredMl,
				a.reservedQuantity,
				a.unit,
				a.basis,
			]),
		).toEqual([
			// N-1 expires on 1 November, so it is used up before N-2 is touched.
			["Nic base 100", "N-1", "100", "100", "mL", "measured"],
			["Nic base 100", "N-2", "20", "20", "mL", "measured"],
			["Mango concentrate", "M-1", "100", "100", "mL", "measured"],
			["PG USP", "PG-1", "286", "286", "mL", "measured"],
			// 494 mL of VG at 1.261 g/mL, from a lot counted in grams.
			["VG USP", "VG-1", "494", "622.934", "g", "calculated"],
		]);
		expect(await balances("N-1")).toBe("100 on hand, 100 reserved");
		expect(await balances("N-2")).toBe("200 on hand, 20 reserved");
		expect(await balances("VG-1")).toBe("6305 on hand, 622.934 reserved");
		expect((await listMovements(sql, { lotId: lots["VG-1"] }))[0]).toMatchObject({
			kind: "reservation",
			quantity: "622.934",
			reference: "B-20261014-001",
			basis: "calculated",
		});
		await expect(reserveBatch(sql, staff, ids.batch, TODAY)).rejects.toThrow(
			"Batch B-20261014-001 is reserved, so it can't be reserved.",
		);
	});

	it("counts what another batch has reserved as no longer usable", async () => {
		// 180 mL of base is left usable, all in N-2. The half batch needs 60.
		await reserveBatch(sql, staff, ids.half, TODAY);
		expect(await balances("N-2")).toBe("200 on hand, 80 reserved");
		const third = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1500" }, TODAY);
		await expect(reserveBatch(sql, staff, third.id, TODAY)).rejects.toThrow(
			/Nic base 100 is short by 60 mL \(needs 180, 120 usable\); Mango concentrate is short by 0 mL|Nic base 100 is short by 60 mL \(needs 180, 120 usable\)/,
		);
		await cancelBatch(sql, staff, third.id, "Short of nicotine base", TODAY);
	});
});

describe("recording that a batch was made", () => {
	it("refuses more than was reserved, and changes nothing when it refuses", async () => {
		const allocations = await listAllocations(sql, ids.batch);
		const mango = allocations.find((a) => a.lotCode === "M-1");
		await expect(
			completeBatch(
				sql,
				staff,
				ids.batch,
				{ actualYieldMl: "990", used: { [mango?.id ?? ""]: "130" } },
				TODAY,
			),
		).rejects.toThrow(
			"Lot M-1: 130 mL is more than the 100 mL reserved for this batch. Reserve and record the extra on the ingredient's page, quoting B-20261014-001.",
		);
		// The base lots were processed before the refusal. They are untouched: the whole thing was undone.
		expect(await balances("N-1")).toBe("100 on hand, 100 reserved");
		expect((await getBatch(sql, ids.batch))?.status).toBe("reserved");
		await expect(completeBatch(sql, staff, ids.batch, { actualYieldMl: "" }, TODAY)).rejects.toThrow(
			"Enter the measured yield.",
		);
	});

	it("takes what was used from the reservation, returns the rest, and records the measured yield", async () => {
		const allocations = await listAllocations(sql, ids.batch);
		const mango = allocations.find((a) => a.lotCode === "M-1");
		const done = await completeBatch(
			sql,
			staff,
			ids.batch,
			{
				actualYieldMl: "992.5",
				wasteMl: "4",
				samplesMl: "3",
				notes: "Slight loss in the mixing vessel.",
				used: { [mango?.id ?? ""]: "95" },
			},
			TODAY,
		);
		expect(done).toMatchObject({
			status: "completed",
			actualYieldMl: "992.5",
			wasteMl: "4",
			samplesMl: "3",
			// Made is not released. That decision is a qualified person's and isn't recorded here.
			qualityStatus: "awaiting_review",
		});
		expect(yieldDifference(done)).toEqual({ ml: "-7.5", percent: "-0.75" });
		// 95 of the 100 mL reserved was used: 95 left the lot and 5 went back to being free. The half batch still holds 50.
		expect(await balances("M-1")).toBe("205 on hand, 50 reserved");
		expect(await balances("N-1")).toBe("0 on hand, 0 reserved");
		expect(await balances("N-2")).toBe("180 on hand, 60 reserved");
		expect(await balances("VG-1")).toBe("5682.066 on hand, 311.467 reserved");
		expect(
			(await listMovements(sql, { lotId: lots["M-1"] }))
				.slice(0, 2)
				.map((m) => [m.kind, m.quantity, m.reference])
				.sort(),
		).toEqual([
			["consumption", "95", "B-20261014-001"],
			["reservation_release", "5", "B-20261014-001"],
		]);
		expect((await listAllocations(sql, ids.batch)).find((a) => a.lotCode === "M-1")?.usedQuantity).toBe("95");
		await expect(completeBatch(sql, staff, ids.batch, { actualYieldMl: "1" }, TODAY)).rejects.toThrow(
			"Batch B-20261014-001 is completed. Reserve its ingredients before recording that it was made.",
		);
		await expect(cancelBatch(sql, staff, ids.batch, "Too late", TODAY)).rejects.toThrow(
			"is completed, so it can't be cancelled.",
		);
	});
});

describe("cancelling a batch", () => {
	it("needs a reason and gives back everything it had reserved", async () => {
		await expect(cancelBatch(sql, staff, ids.half, "  ", TODAY)).rejects.toThrow(
			"Say why the batch is being cancelled.",
		);
		const cancelled = await cancelBatch(sql, staff, ids.half, "Customer order withdrawn", TODAY);
		expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Customer order withdrawn" });
		expect(await balances("M-1")).toBe("205 on hand, 0 reserved");
		expect(await balances("N-2")).toBe("180 on hand, 0 reserved");
		expect(await balances("VG-1")).toBe("5682.066 on hand, 0 reserved");
		expect(await balances("PG-1")).toBe("4714 on hand, 0 reserved");
	});

	it("leaves a ledger that still adds up after every batch", async () => {
		expect(await verifyLedger(sql)).toEqual([]);
		await expect(
			sql.query(`update wai_batches set planned_by = 'agent:batch' where id = $1`, [ids.batch]),
		).rejects.toThrow();
	});
});
