import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { requestFunction, runFunction } from "../functions/pipeline";
import { getProductByTask } from "../functions/products";
import { lookupFunction } from "../functions/registry";
import { freshDb, owner, staff, workflowDeps } from "../testing.test-util";
import {
	createIngredient,
	createLot,
	densityDiscrepancy,
	getInventoryItem,
	getLot,
	inventoryFindings,
	listInventory,
	listMovements,
	postMovement,
	stockSnapshot,
	verifyLedger,
	viewLot,
	type Lot,
	type MovementRequest,
} from "./inventory";

let sql: SqlClient;
const TODAY = "2026-10-14";
let serial = 0;
const key = () => `test-key-${++serial}-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

const move = (
	lotId: string,
	kind: string,
	quantity?: string,
	extra: Partial<MovementRequest> = {},
	actor = staff,
) => postMovement(sql, actor, { lotId, kind, quantity, idempotencyKey: key(), ...extra }, TODAY);

/** An ingredient with one lot that has had a quantity received into it. */
async function stocked(
	name: string,
	quantity: string,
	lot: Partial<Parameters<typeof createLot>[2]> = {},
	ingredient: Partial<Parameters<typeof createIngredient>[2]> = {},
): Promise<{ ingredientId: string; lot: Lot }> {
	const made = await createIngredient(sql, staff, { name, category: "pg", ...ingredient });
	const created = await createLot(sql, staff, {
		ingredientId: made.id,
		lotCode: `LOT-${++serial}`,
		unit: "mL",
		...lot,
	});
	const { lot: received } = await move(created.id, "receipt", quantity);
	return { ingredientId: made.id, lot: received };
}

describe("recording an ingredient", () => {
	it("needs a documented strength for a nicotine base, and refuses one on anything else", async () => {
		await expect(
			createIngredient(sql, staff, { name: "Nic base 100", category: "nicotine_base" }),
		).rejects.toThrow("A nicotine base needs its strength in mg/mL, from the supplier's documents.");
		await expect(
			createIngredient(sql, staff, { name: "Mango", category: "flavour", nicotineMgPerMl: "3" }),
		).rejects.toThrow("Only a nicotine base has a nicotine strength.");
		const base = await createIngredient(sql, staff, {
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			nicotineType: "freebase",
			pgPercent: "90",
			vgPercent: "0",
			carrierSource: "Supplier specification sheet, revision 4",
			sku: "NIC-100",
		});
		expect(base).toMatchObject({ nicotineMgPerMl: "100", pgPercent: "90", vgPercent: "0", status: "active" });
	});

	it("refuses a carrier that adds up to more than the whole, an unknown kind, and a repeated SKU", async () => {
		await expect(
			createIngredient(sql, staff, { name: "Berry", category: "flavour", pgPercent: "70", vgPercent: "40" }),
		).rejects.toThrow("PG and VG together can't be more than 100 percent.");
		await expect(createIngredient(sql, staff, { name: "Mystery", category: "potion" })).rejects.toThrow(
			"Choose what kind of ingredient it is.",
		);
		await expect(
			createIngredient(sql, staff, {
				name: "Another base",
				category: "nicotine_base",
				nicotineMgPerMl: "72",
				sku: "nic-100",
			}),
		).rejects.toThrow("Another ingredient already has the SKU nic-100.");
	});
});

describe("recording a lot", () => {
	it("needs a source for a density, a currency for a cost, and one number per lot", async () => {
		const pg = await createIngredient(sql, staff, { name: "PG USP", category: "pg" });
		await expect(
			createLot(sql, staff, { ingredientId: pg.id, lotCode: "PG-1", unit: "mL", densityGPerMl: "1.036" }),
		).rejects.toThrow("Say where the density comes from");
		await expect(
			createLot(sql, staff, { ingredientId: pg.id, lotCode: "PG-1", unit: "mL", costPerUnit: "0.012" }),
		).rejects.toThrow("A cost needs its currency, like CAD or USD.");
		await expect(
			createLot(sql, staff, {
				ingredientId: pg.id,
				lotCode: "PG-1",
				unit: "each",
				densityGPerMl: "1",
				densitySource: "x",
			}),
		).rejects.toThrow("Something counted in pieces has no density.");
		const lot = await createLot(sql, staff, {
			ingredientId: pg.id,
			lotCode: "PG-1",
			unit: "mL",
			densityGPerMl: "1.036",
			densitySource: "Certificate of analysis PG-1",
			costPerUnit: "0.012",
			currency: "cad",
			expiresOn: "2027-06-30",
			location: "Shelf A2",
		});
		expect(lot).toMatchObject({
			onHand: "0",
			reserved: "0",
			currency: "CAD",
			densityGPerMl: "1.036",
			status: "available",
		});
		await expect(createLot(sql, staff, { ingredientId: pg.id, lotCode: "PG-1", unit: "mL" })).rejects.toThrow(
			"PG USP already has a lot numbered PG-1.",
		);
	});
});

describe("moving stock", () => {
	it("receives, reserves, uses and returns stock, with every balance explained", async () => {
		const { lot } = await stocked("VG USP", "1000");
		expect(viewLot(lot, TODAY)).toMatchObject({
			onHand: "1000",
			reserved: "0",
			usable: "1000",
			quarantined: "0",
		});

		const reserved = await move(lot.id, "reservation", "400", { reference: "BATCH-17" });
		expect(viewLot(reserved.lot, TODAY)).toMatchObject({ onHand: "1000", reserved: "400", usable: "600" });
		// Use takes from what was reserved: both balances fall together.
		const used = await move(lot.id, "consumption", "380", { reference: "BATCH-17" });
		expect(viewLot(used.lot, TODAY)).toMatchObject({ onHand: "620", reserved: "20", usable: "600" });
		// What the batch didn't need goes back to being free.
		const released = await move(lot.id, "reservation_release", "20", { reference: "BATCH-17" });
		expect(viewLot(released.lot, TODAY)).toMatchObject({ onHand: "620", reserved: "0", usable: "620" });
		const returned = await move(lot.id, "return", "5", { reference: "BATCH-17" });
		expect(returned.lot.onHand).toBe("625");

		expect(
			(await listMovements(sql, { lotId: lot.id }))
				.map((m) => [m.kind, m.quantity, m.onHandAfter, m.reservedAfter])
				.reverse(),
		).toEqual([
			["receipt", "1000", "1000", "0"],
			["reservation", "400", "1000", "400"],
			["consumption", "380", "620", "20"],
			["reservation_release", "20", "620", "0"],
			["return", "5", "625", "0"],
		]);
	});

	it("refuses to reserve more than is usable, and to use what was never reserved", async () => {
		const { lot } = await stocked("PG for limits", "100");
		await expect(move(lot.id, "reservation", "100.000001")).rejects.toThrow(
			`Only 100 mL of lot ${lot.lotCode} is usable. 100.000001 can't be reserved.`,
		);
		await expect(move(lot.id, "consumption", "10")).rejects.toThrow(
			`Only 0 mL of lot ${lot.lotCode} is reserved. Reserve it before recording that it was used.`,
		);
		await move(lot.id, "reservation", "70");
		await expect(move(lot.id, "reservation", "31")).rejects.toThrow("Only 30 mL");
		await expect(move(lot.id, "reservation_release", "71")).rejects.toThrow("Only 70 mL");
		// Reserved stock can't be written off as waste without releasing it first.
		await expect(move(lot.id, "waste", "31", { reason: "Spill" })).rejects.toThrow("Only 30 mL");
		expect((await getLot(sql, lot.id))?.onHand).toBe("100");
	});

	it("does a request that arrives twice once", async () => {
		const { lot } = await stocked("PG for retries", "50");
		const request = { lotId: lot.id, kind: "reservation", quantity: "20", idempotencyKey: key() };
		const first = await postMovement(sql, staff, request, TODAY);
		const again = await postMovement(sql, staff, request, TODAY);
		expect(first.duplicate).toBe(false);
		expect(again.duplicate).toBe(true);
		expect(again.movement.id).toBe(first.movement.id);
		expect(again.lot).toMatchObject({ onHand: "50", reserved: "20" });
		expect(await listMovements(sql, { lotId: lot.id })).toHaveLength(2);
	});

	it("lets only one of two people take the last of a lot", async () => {
		const { lot } = await stocked("PG for a race", "100");
		const results = await Promise.allSettled([
			move(lot.id, "reservation", "60", { reference: "BATCH-A" }),
			move(lot.id, "reservation", "60", { reference: "BATCH-B" }),
		]);
		expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
		expect(await getLot(sql, lot.id)).toMatchObject({ onHand: "100", reserved: "60" });
	});

	it("keeps exact decimals, refuses a seventh decimal place, and never splits a piece", async () => {
		const { lot } = await stocked("Flavour drops", "0.1");
		expect((await move(lot.id, "receipt", "0.2")).lot.onHand).toBe("0.3");
		await expect(move(lot.id, "receipt", "0.0000001")).rejects.toThrow(
			"Quantity can have at most six decimal places.",
		);
		await expect(move(lot.id, "receipt", "ten")).rejects.toThrow(
			"Quantity must be a number, like 120 or 120.5.",
		);
		await expect(move(lot.id, "receipt", "0")).rejects.toThrow("Quantity must be more than zero.");
		const bottles = await stocked("30 mL bottles", "500", { unit: "each" }, { category: "packaging" });
		await expect(move(bottles.lot.id, "reservation", "12.5")).rejects.toThrow(
			"Something counted in pieces can't be moved in fractions.",
		);
	});

	it("needs a reason for waste, and limits corrections to the owner, to a reason, and to what is possible", async () => {
		const { lot } = await stocked("PG for corrections", "100");
		await expect(move(lot.id, "waste", "2")).rejects.toThrow("Say why.");
		expect((await move(lot.id, "waste", "2", { reason: "Spilled while decanting" })).lot.onHand).toBe("98");

		await expect(move(lot.id, "correction", "-3", { reason: "Count sheet 14 Oct" })).rejects.toThrow(
			"Only the owner can correct a balance.",
		);
		expect((await listAudit(sql, 1))[0]).toMatchObject({ action: "inventory.correction", outcome: "denied" });
		await expect(move(lot.id, "correction", "-3", {}, owner)).rejects.toThrow("Say why.");
		await expect(move(lot.id, "correction", "-99", { reason: "Count" }, owner)).rejects.toThrow(
			"That would leave -1 mL on hand. Stock can't be negative.",
		);
		await move(lot.id, "reservation", "90");
		await expect(move(lot.id, "correction", "-10", { reason: "Count" }, owner)).rejects.toThrow(
			"That would leave less on hand than the 90 mL reserved.",
		);
		const corrected = await move(lot.id, "correction", "-3", { reason: "Count sheet 14 Oct" }, owner);
		expect(corrected.lot.onHand).toBe("95");
		expect(corrected.movement).toMatchObject({
			kind: "correction",
			quantity: "3",
			deltaOnHand: "-3",
			reason: "Count sheet 14 Oct",
		});
	});

	it("makes a quarantined or expired lot unusable, and only the owner lifts a quarantine", async () => {
		const { lot } = await stocked("Flavour in doubt", "200");
		await move(lot.id, "reservation", "50");
		await expect(move(lot.id, "quarantine", undefined, { reason: "Supplier recall notice" })).rejects.toThrow(
			"50 mL of this lot is reserved. Release the reservations before putting it in quarantine.",
		);
		await move(lot.id, "reservation_release", "50");
		const held = await move(lot.id, "quarantine", undefined, { reason: "Supplier recall notice" });
		expect(viewLot(held.lot, TODAY)).toMatchObject({
			status: "quarantined",
			onHand: "200",
			usable: "0",
			quarantined: "200",
		});
		await expect(move(lot.id, "reservation", "1")).rejects.toThrow(
			"is in quarantine, so none of it can be used.",
		);
		await expect(move(lot.id, "quarantine_release", undefined, { reason: "Cleared" })).rejects.toThrow(
			"Only the owner can release a lot from quarantine.",
		);
		const cleared = await move(
			lot.id,
			"quarantine_release",
			undefined,
			{ reason: "Recall did not cover this lot" },
			owner,
		);
		expect(viewLot(cleared.lot, TODAY).usable).toBe("200");

		const old = await stocked("Flavour past date", "80", { expiresOn: "2026-10-13" });
		expect(viewLot(old.lot, TODAY)).toMatchObject({ expired: true, onHand: "80", usable: "0" });
		await expect(move(old.lot.id, "reservation", "1")).rejects.toThrow(
			"expired on 2026-10-13, so none of it can be used.",
		);
		// On its expiry date a lot is still usable; the day after, it isn't.
		expect(viewLot({ ...old.lot, expiresOn: TODAY }, TODAY).usable).toBe("80");
	});

	it("records a move to another place without changing any quantity", async () => {
		const { lot } = await stocked("VG to move", "300", { location: "Receiving" });
		const moved = await move(lot.id, "transfer", undefined, { toLocation: "Shelf B1" });
		expect(moved.lot).toMatchObject({ location: "Shelf B1", onHand: "300" });
		expect(moved.movement).toMatchObject({
			kind: "transfer",
			quantity: "0",
			fromLocation: "Receiving",
			toLocation: "Shelf B1",
		});
		await expect(move(lot.id, "transfer", undefined, { toLocation: "Shelf B1" })).rejects.toThrow(
			"The lot is already there.",
		);
	});
});

describe("volume and weight", () => {
	it("shows the other unit only when the lot has a documented density", async () => {
		const withDensity = await stocked("Nic base lot", "120", {
			densityGPerMl: "1.035",
			densitySource: "CoA 2291",
		});
		expect(viewLot(withDensity.lot, TODAY).other).toEqual({ unit: "g", onHand: "124.2", usable: "124.2" });
		const byWeight = await stocked("VG by weight", "1261", {
			unit: "g",
			densityGPerMl: "1.261",
			densitySource: "CoA 77",
		});
		expect(viewLot(byWeight.lot, TODAY).other).toEqual({ unit: "mL", onHand: "1000", usable: "1000" });
		// No density: the other unit is unavailable. One millilitre is never taken to weigh one gram.
		const without = await stocked("Flavour, no density", "100");
		expect(viewLot(without.lot, TODAY).other).toBeNull();
		const item = await getInventoryItem(sql, without.ingredientId, TODAY);
		expect(item?.flags).toEqual([
			`Lot ${without.lot.lotCode} has no documented density, so its weight is unavailable.`,
		]);
	});

	it("keeps both measurements when both were taken, and flags them when they disagree with the density", async () => {
		const made = await createIngredient(sql, staff, { name: "PG, weighed and measured", category: "pg" });
		const lot = await createLot(sql, staff, {
			ingredientId: made.id,
			lotCode: "PG-W",
			unit: "mL",
			densityGPerMl: "1.036",
			densitySource: "CoA PG-W",
		});
		const close = await move(lot.id, "receipt", "1000", { otherQuantity: "1040" });
		expect(close.movement).toMatchObject({ quantity: "1000", otherQuantity: "1040", otherUnit: "g" });
		expect(densityDiscrepancy(close.movement, "1.036")).toBeNull();
		const off = await move(lot.id, "receipt", "1000", { otherQuantity: "1100" });
		expect(densityDiscrepancy(off.movement, "1.036")).toBe(
			"The two measurements imply 1.1 g/mL, 6.2% away from the documented 1.036 g/mL.",
		);
		expect((await listMovements(sql, { lotId: lot.id })).map((m) => m.discrepancy !== null)).toEqual([
			true,
			false,
		]);
		// The second measurement never becomes a second balance.
		expect(await getLot(sql, lot.id)).toMatchObject({ onHand: "2000", unit: "mL" });
		await expect(move(lot.id, "waste", "1", { reason: "x", otherQuantity: "1" })).rejects.toThrow(
			"A second measurement is recorded only when a liquid lot is received.",
		);
	});
});

describe("the ledger itself", () => {
	it("always adds up to the balances, and shows when a balance was changed behind its back", async () => {
		expect(await verifyLedger(sql)).toEqual([]);
		const { lot } = await stocked("PG to tamper with", "10");
		await sql.query(`update wai_ingredient_lots set on_hand = 12 where id = $1`, [lot.id]);
		expect(await verifyLedger(sql)).toEqual([
			{ lotId: lot.id, lotCode: lot.lotCode, problem: "on hand is 12 but the ledger adds up to 10" },
		]);
		await sql.query(`update wai_ingredient_lots set on_hand = 10 where id = $1`, [lot.id]);
	});

	it("is protected by the database even from this application", async () => {
		const { lot } = await stocked("PG for constraints", "10");
		await expect(
			sql.query(`update wai_ingredient_lots set on_hand = -1 where id = $1`, [lot.id]),
		).rejects.toThrow();
		await expect(
			sql.query(`update wai_ingredient_lots set reserved = 11 where id = $1`, [lot.id]),
		).rejects.toThrow();
		// Only a person moves stock: an agent can't be the actor on a ledger line.
		await expect(
			sql.query(
				`insert into wai_stock_movements (lot_id, kind, quantity, unit, delta_on_hand, delta_reserved, on_hand_after, reserved_after, idempotency_key, actor)
				 values ($1, 'consumption', 1, 'mL', -1, 0, 9, 0, 'agent-attempt', 'agent:stock')`,
				[lot.id],
			),
		).rejects.toThrow();
		await expect(
			sql.query(
				`insert into wai_stock_movements (lot_id, kind, quantity, unit, delta_on_hand, delta_reserved, on_hand_after, reserved_after, idempotency_key, actor)
				 values ($1, 'correction', 1, 'mL', -1, 0, 9, 0, 'no-reason', 'operator:owner-1')`,
				[lot.id],
			),
		).rejects.toThrow();
	});
});

describe("what the inventory tells people and Stock", () => {
	let db: SqlClient;
	beforeAll(async () => {
		db = await freshDb();
		const post = (lotId: string, kind: string, quantity?: string, extra: Partial<MovementRequest> = {}) =>
			postMovement(db, owner, { lotId, kind, quantity, idempotencyKey: key(), ...extra }, TODAY);
		const base = await createIngredient(db, staff, {
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			sku: "NIC-100",
			minStock: "500",
			minStockUnit: "mL",
		});
		const baseLot = await createLot(db, staff, {
			ingredientId: base.id,
			lotCode: "N-1",
			unit: "mL",
			expiresOn: "2026-11-01",
		});
		await post(baseLot.id, "receipt", "300");
		await post(baseLot.id, "reservation", "100");
		const mango = await createIngredient(db, staff, {
			name: "Mango concentrate",
			category: "flavour",
			sku: "FL-MANGO",
			pgPercent: "100",
			vgPercent: "0",
		});
		const mangoMl = await createLot(db, staff, {
			ingredientId: mango.id,
			lotCode: "M-1",
			unit: "mL",
			densityGPerMl: "1.04",
			densitySource: "CoA M-1",
		});
		await post(mangoMl.id, "receipt", "250");
		const mangoG = await createLot(db, staff, {
			ingredientId: mango.id,
			lotCode: "M-2",
			unit: "g",
			expiresOn: "2026-09-30",
		});
		await post(mangoG.id, "receipt", "90");
		const held = await createLot(db, staff, {
			ingredientId: mango.id,
			lotCode: "M-3",
			unit: "mL",
			densityGPerMl: "1.04",
			densitySource: "CoA M-3",
		});
		await post(held.id, "receipt", "40");
		await post(held.id, "quarantine", undefined, { reason: "Seal broken on arrival" });
	});
	afterAll(async () => {
		await db.close();
	});

	it("adds lots up per unit, never across units, and flags what needs attention", async () => {
		const items = await listInventory(db, TODAY);
		expect(items.map((item) => item.ingredient.name)).toEqual(["Mango concentrate", "Nic base 100"]);
		const mango = items[0];
		expect(mango.totals).toEqual([
			{ unit: "mL", onHand: "290", reserved: "0", usable: "250", quarantined: "40" },
			{ unit: "g", onHand: "90", reserved: "0", usable: "0", quarantined: "0" },
		]);
		expect(mango.flags).toEqual([
			"Lot M-2 expired on 2026-09-30 with 90 g still on hand.",
			"Lot M-2 has no documented density, so its volume is unavailable.",
			"Lot M-3 is in quarantine: 40 mL can't be used.",
		]);
		expect(items[1].totals).toEqual([
			{ unit: "mL", onHand: "300", reserved: "100", usable: "200", quarantined: "0" },
		]);
		expect(items[1].flags).toEqual([
			"Low stock: 200 mL usable, below the minimum of 500.",
			"Carrier not documented: what it is carried in (PG, VG) hasn't been recorded, so a recipe can't account for it.",
			"Lot N-1 expires on 2026-11-01.",
			"Lot N-1 has no documented density, so its weight is unavailable.",
		]);
		expect(inventoryFindings(items).map((f) => f.kind)).toEqual([
			"expired",
			"low",
			"quarantine",
			"expiring",
			"density",
			"density",
			"carrier",
		]);
	});

	it("finds an ingredient by name, supplier, SKU, lot number or place", async () => {
		expect((await listInventory(db, TODAY, { search: "mango" })).map((i) => i.ingredient.sku)).toEqual([
			"FL-MANGO",
		]);
		expect((await listInventory(db, TODAY, { search: "N-1" })).map((i) => i.ingredient.sku)).toEqual([
			"NIC-100",
		]);
		expect(
			(await listInventory(db, TODAY, { category: "nicotine_base" })).map((i) => i.ingredient.sku),
		).toEqual(["NIC-100"]);
		expect(await listInventory(db, TODAY, { search: "100%" })).toEqual([]);
	});

	it("hands Stock a snapshot its own function reads, and leaves demand for a person to supply", async () => {
		const snapshot = stockSnapshot(await listInventory(db, TODAY));
		expect(snapshot.split("\n")).toEqual([
			"sku,on_hand,on_hold,reserved,unit,lot,expiry,daily_demand,min_stock,lead_time_days",
			// Within an ingredient, the lot that expires first comes first.
			"FL-MANGO,90,0,0,g,M-2,2026-09-30,,,",
			"FL-MANGO,250,0,0,mL,M-1,,,,",
			"FL-MANGO,40,40,0,mL,M-3,,,,",
			"NIC-100,300,0,100,mL,N-1,2026-11-01,,500,",
		]);
		const deps = workflowDeps(db, null, { POSTGRES_URL: "postgres://test" });
		const asked = await requestFunction(
			deps,
			staff,
			"stock.replenishment-plan",
			{ snapshot: "Stored stock", asOf: TODAY, stock: snapshot },
			{ lookup: lookupFunction },
		);
		expect((await runFunction(deps, asked.task.id, { lookup: lookupFunction })).status).toBe("completed");
		expect(JSON.stringify((await getProductByTask(db, asked.task.id))?.payload)).toContain("NIC-100");
	});
});
