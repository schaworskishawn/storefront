import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listDocuments, listPendingVersions } from "../atlas/service";
import { buildBriefing } from "../briefing";
import { readConfig } from "../config";
import { listFindings } from "../findings";
import { listBatches, listRecipes } from "../lab/batches";
import { listInventory, verifyLedger } from "../lab/inventory";
import { listCases } from "../support/cases";
import { countTasksByState } from "../tasks/repo";
import { DEMO_PREFIX, seedDemoData } from "./demo-seed";
import { createMigratedPglite } from "./pglite";
import type { SqlClient } from "./sql";

vi.setConfig({ testTimeout: 60_000 });

let sql: SqlClient;
const now = new Date("2026-10-11T15:00:00Z");
beforeAll(async () => {
	sql = await createMigratedPglite();
	await seedDemoData(sql, now);
});
afterAll(async () => {
	await sql.close();
});

describe("the demonstration store's sample data", () => {
	it("labels every record as a demonstration", async () => {
		const documents = await listDocuments(sql, {}, { now });
		const cases = await listCases(sql);
		const findings = await listFindings(sql);
		expect(documents).toHaveLength(6);
		expect(cases).toHaveLength(4);
		expect(findings).toHaveLength(1);
		for (const title of [
			...documents.map((d) => d.title),
			...cases.map((c) => c.subject),
			...findings.map((f) => f.title),
		])
			expect(title.startsWith(DEMO_PREFIX), title).toBe(true);
		expect(cases.every((c) => c.source === "demo")).toBe(true);
		expect(cases.every((c) => c.customerEmail === "customer@example.com")).toBe(true);
	});

	it("covers the states the workspace has to show: current, stale, expired, and waiting for approval", async () => {
		const documents = await listDocuments(sql, {}, { now });
		expect(documents.map((d) => d.freshness?.state).sort()).toEqual([
			"current",
			"current",
			"current",
			"current",
			"expired",
			"stale",
		]);
		expect((await listPendingVersions(sql)).map((v) => `${v.documentTitle} v${v.version}`)).toEqual([
			"[DEMO] Returns and refunds v2",
		]);
		const briefing = await buildBriefing(sql, readConfig({}), now);
		expect(briefing.items.map((i) => i.text)).toEqual([
			"1 document version waiting for the owner's approval.",
			"1 document expired and no longer used as sources.",
			"1 document past its review date.",
		]);
		expect(briefing.findings.medium).toBe(1);
	});

	it("includes a case that tries to give the assistant instructions, and creates no task or result", async () => {
		const cases = await listCases(sql);
		expect(cases.some((c) => /Ignore your previous instructions/.test(c.message))).toBe(true);
		expect(Object.values(await countTasksByState(sql)).reduce((a, b) => a + b, 0)).toBe(0);
		expect((await sql.query("select count(*)::int as n from wai_work_products")).rows[0].n).toBe(0);
	});

	it("stocks a small fictional Lab, labelled throughout, with a ledger that adds up and a batch ready to reserve", async () => {
		const items = await listInventory(sql, "2026-10-11");
		expect(items.map((item) => item.ingredient.name)).toEqual([
			"[DEMO] 30 mL bottle",
			"[DEMO] Mango concentrate",
			"[DEMO] Nicotine base 100",
			"[DEMO] PG",
			"[DEMO] VG",
		]);
		expect(items.flatMap((item) => item.lots).every((lot) => lot.lotCode.startsWith("DEMO-"))).toBe(true);
		// The nicotine base is below its minimum and has a lot expiring soon, so the preview has something to flag.
		expect(items[2].flags).toEqual([
			"Low stock: 300 mL usable, below the minimum of 500.",
			"Lot DEMO-N-1 expires on 2026-11-01.",
			"Lot DEMO-N-1 has no documented density, so its weight is unavailable.",
			"Lot DEMO-N-2 has no documented density, so its weight is unavailable.",
		]);
		expect(await verifyLedger(sql)).toEqual([]);
		expect(await listRecipes(sql)).toMatchObject([{ name: "[DEMO] Mango 12", versions: 1, approved: 1 }]);
		const batches = await listBatches(sql);
		expect(batches).toMatchObject([{ status: "planned", plannedMl: "1000", recipeName: "[DEMO] Mango 12" }]);
		expect(batches[0].plan.lines.map((line) => line.requiredMl)).toEqual(["120", "100", "286", "494"]);
	});
});
