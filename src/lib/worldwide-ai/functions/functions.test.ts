import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { approveVersion, createDocument } from "../atlas/service";
import { runBackup, runRestoreDrill } from "../backup/drill";
import type { SqlClient } from "../db/sql";
import { recordHealth } from "../integrations/health";
import { createFolderStorage } from "../storage/files";
import { getTask } from "../tasks/repo";
import { freshDb, mockModel, owner, staff, system, workflowDeps, type MockReply } from "../testing.test-util";
import type { TaskKind } from "../types";
import type { WorkflowDeps } from "../workflows/types";
import { errorSignature } from "./operations";
import { requestFunction, reviewProduct, runFunction } from "./pipeline";
import { getProductByTask, type WorkProduct } from "./products";
import { ALL_FUNCTIONS, FUNCTIONS, lookupFunction } from "./registry";

vi.setConfig({ testTimeout: 90_000 });

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

const env = { POSTGRES_URL: "postgres://test", ANTHROPIC_API_KEY: "sk-ant-test" };
const lookup = lookupFunction;
let unique = 0;

type Ran = { status: string; error?: string; product: WorkProduct | null; payload: any; taskId: string };

/** Asks for a function and runs it, as the dashboard and the job runner do between them. */
async function run(
	id: TaskKind,
	input: Record<string, unknown>,
	options: { reply?: MockReply; deps?: Partial<WorkflowDeps> } = {},
): Promise<Ran & { model: ReturnType<typeof mockModel> }> {
	const model = mockModel(options.reply ?? new Error("no model reply was set for this test"));
	const deps = { ...workflowDeps(sql, model.handle, env), ...options.deps };
	const asked = await requestFunction(deps, staff, id, input, { lookup });
	const outcome = await runFunction(deps, asked.task.id, { lookup });
	const product = await getProductByTask(sql, asked.task.id);
	// A request identical to an earlier one finds that task; report where it stands rather than "skipped".
	const status = outcome.status === "skipped" ? outcome.task.state : outcome.status;
	return {
		status,
		error: "error" in outcome ? outcome.error : undefined,
		product,
		payload: product?.payload,
		taskId: asked.task.id,
		model,
	};
}

/** A function's own labelled sample, with one value changed so every test makes a fresh request. */
const sample = (id: TaskKind, changes: Record<string, unknown> = {}) => {
	const make = FUNCTIONS.get(id)?.sample;
	if (!make) throw new Error(`${id} has no sample`);
	return { ...make(), ...changes };
};

describe("every code-only function runs on its own sample and stores a typed result", () => {
	const code = ALL_FUNCTIONS.filter((f) => f.uses === "code" && !f.external && f.sample);
	it.each(code.map((f) => [f.id, f] as const))("%s", async (id, definition) => {
		const ran = await run(id, sample(id));
		expect(ran.error).toBeUndefined();
		expect(ran.status).toBe(definition.review === "required" ? "needs_review" : "completed");
		expect(ran.product).toMatchObject({
			functionId: id,
			agentId: definition.agent,
			outputType: definition.outputType,
			model: null,
		});
		expect(definition.output.safeParse(ran.payload).success).toBe(true);
		expect(ran.product?.summary.length).toBeGreaterThan(10);
		expect(ran.model.calls()).toBe(0);
	});

	it("covers every agent whose baseline is calculated by code", () => {
		expect(code.map((f) => f.agent).sort()).toEqual(
			"assay assure atlas batch check clean coach comply duty forecast gauge guard insight ledger link nexus patch qualify restore return review route safeguard source stock tally tempo trace vault watch".split(
				" ",
			),
		);
	});
});

describe("Check: validating records", () => {
	it("finds each kind of problem by row and proposes a correction, editing nothing", async () => {
		const { payload, status } = await run(
			"check.record-validation",
			sample("check.record-validation", { dataset: "Lots A" }),
		);
		expect(status).toBe("completed");
		expect(payload.rowsChecked).toBe(4);
		expect(payload.clean).toBe(false);
		expect(payload.issues.map((i: any) => `${i.row}:${i.rule}:${i.column}`)).toEqual([
			"2:Required field is filled in:supplier",
			"2:Date is valid:expiry",
			"2:Unit is one of the allowed units:unit",
			"3:Key is unique:lot",
			"4:Number is valid:quantity",
			"4:Unit is one of the allowed units:unit",
		]);
		expect(payload.issues[2].proposal).toBe('Write the unit as "mL".');
		expect(payload.issues[3].proposal).toMatch(/Identical to row 1/);
		expect(payload.issues[5].proposal).toMatch(/Do not convert without a documented factor/);
		expect(payload.duplicateKeys).toEqual([{ key: "L-100", rows: [1, 3] }]);
		expect(payload.rules.find((r: any) => r.rule === "Key is unique")).toEqual({
			rule: "Key is unique",
			rowsChecked: 4,
			rowsFailed: 1,
		});
	});

	it("reports a clean dataset as clean, and tells conflicting duplicates from identical ones", async () => {
		const clean = await run("check.record-validation", {
			dataset: "Clean",
			keyColumn: "id",
			records: "id,name\n1,a\n2,b",
		});
		expect(clean.payload).toMatchObject({ clean: true, issues: [] });
		const conflict = await run("check.record-validation", {
			dataset: "Conflict",
			keyColumn: "id",
			records: "id,name\n1,a\n1,b",
		});
		expect(conflict.payload.issues[0].proposal).toMatch(/Conflicts with row 1: same key, different values/);
	});
});

describe("Review: deadlines", () => {
	it("sorts items into overdue, due soon, upcoming and no date on the Winnipeg calendar, keeping confirmed apart from suggested", async () => {
		const { payload, product } = await run(
			"review.deadline-register",
			sample("review.deadline-register", { warnDays: "30", asOf: "2026-10-07" }),
		);
		expect(payload.counts).toEqual({ overdue: 1, dueSoon: 1, upcoming: 1, noDate: 1 });
		expect(payload.items.map((i: any) => [i.status, i.basis, i.daysUntil])).toEqual([
			["overdue", "confirmed", -7],
			["due_soon", "confirmed", 25],
			["upcoming", "suggested", 69],
			["no_date", "none", null],
		]);
		expect(payload.followUps).toHaveLength(2);
		expect(product?.missing).toEqual([
			'"[DEMO] Insurance renewal" has no date, so nothing can be said about when it is due.',
		]);
		expect(product?.assumptions).toEqual(["Suggested dates are internal targets, not obligations."]);
	});

	it("uses today in Winnipeg when no date is given, and doesn't repeat the same item", async () => {
		// The test clock is 2026-10-07 15:00 UTC, which is 10:00 that morning in Winnipeg.
		const { payload } = await run("review.deadline-register", {
			items: "item,due_date,source\nLicence,2026-10-07,Letter\nLicence,2026-10-07,Letter\nLease,2026-10-06,",
		});
		expect(payload.asOf).toBe("2026-10-07");
		expect(payload.items.map((i: any) => [i.item, i.daysUntil])).toEqual([
			["Lease", -1],
			["Licence", 0],
		]);
	});
});

describe("Insight: a metric over two periods", () => {
	it("calculates the rate, the change and each segment from the supplied counts", async () => {
		const { payload } = await run(
			"insight.metric-analysis",
			sample("insight.metric-analysis", { metric: "Corrected drafts A" }),
		);
		expect(payload.current).toMatchObject({
			period: "2026-09",
			numerator: "11",
			denominator: "50",
			value: "22.00",
		});
		expect(payload.baseline).toMatchObject({ numerator: "15", denominator: "50", value: "30.00" });
		expect(payload.change).toEqual({ absolute: "-8.00", percent: "-26.67", direction: "down" });
		expect(payload.segments).toEqual([
			{ segment: "Shipping", current: "15.63", baseline: "30.00", absolute: "-14.38" },
			{ segment: "Returns", current: "33.33", baseline: "30.00", absolute: "3.33" },
		]);
		expect(payload.conclusive).toBe(true);
		expect(payload.findings.at(-1)).toBe(
			"These figures show a difference between two periods. They do not show what caused it.",
		);
	});

	it("calls a small sample inconclusive and refuses a period with no data", async () => {
		const small = await run(
			"insight.metric-analysis",
			sample("insight.metric-analysis", { metric: "Corrected drafts B", minSample: "60" }),
		);
		expect(small.payload.conclusive).toBe(false);
		expect(small.payload.findings.join(" ")).toMatch(
			/below your minimum sample of 60, so this comparison is inconclusive/,
		);
		const missing = await run(
			"insight.metric-analysis",
			sample("insight.metric-analysis", { metric: "Corrected drafts C", baselinePeriod: "2026-07" }),
		);
		expect(missing).toMatchObject({
			status: "failed",
			error: expect.stringMatching(
				/no observations for the baseline period "2026-07"\. Baseline unavailable/,
			),
			product: null,
		});
	});
});

describe("Ledger, Tally, Vault, Forecast, Duty, Source: exact figures", () => {
	it("Ledger keeps recorded accounts, proposes from keywords, and leaves the rest unclassified", async () => {
		const { payload, status, product } = await run(
			"ledger.period-workpaper",
			sample("ledger.period-workpaper", { entity: "Ledger test" }),
		);
		expect(status).toBe("needs_review");
		expect(payload.totals).toEqual([
			{ account: "5000", name: "Ingredients", transactions: 1, total: "-310.00" },
			{ account: "6100", name: "Software", transactions: 1, total: "-28.00" },
			{ account: "6200", name: "Shipping", transactions: 1, total: "-412.50" },
		]);
		expect(payload.grandTotal).toBe("-750.50");
		expect(payload.unclassifiedTotal).toBe("-75.25");
		expect(payload.proposedEntries.map((p: any) => `${p.transactionId}>${p.account}`)).toEqual([
			"T1>6100",
			"T2>6200",
		]);
		expect(payload.classified.find((c: any) => c.transactionId === "T3").basis).toBe("As recorded");
		expect(payload.unclassified.map((u: any) => [u.transactionId, u.reason])).toEqual([
			["T4", "No keyword in the chart matches its description."],
			["T5", "In USD, not CAD. It is not converted here; classify it in its own currency."],
		]);
		expect(product?.coverage).toMatchObject({
			"Transactions in the period": 5,
			"Outside the period (ignored)": 1,
		});
	});

	it("Tally applies only the rules in effect, rounds per line, and never treats a missing rule as zero", async () => {
		const { payload } = await run(
			"tally.tax-workpaper",
			sample("tally.tax-workpaper", { entity: "Tally test" }),
		);
		expect(payload.lines.map((l: any) => [l.lineId, l.tax, l.calculated, l.rule])).toEqual([
			["S1", "GST", "5.00", "DEMO-GST v1"],
			["S1", "PST", "7.00", "DEMO-PST v3"],
			["S2", "GST", "2.50", "DEMO-GST v1"],
			["S2", "PST", "3.50", "DEMO-PST v3"],
		]);
		expect(payload.totals).toEqual([
			{ tax: "GST", taxable: "149.99", calculated: "7.50" },
			{ tax: "PST", taxable: "149.99", calculated: "10.50" },
		]);
		expect(payload.unresolved).toEqual([
			{
				lineId: "S3",
				date: "2026-09-18",
				category: "services",
				taxable: "80.00",
				reason: 'No approved rule covers category "services" on 2026-09-18.',
			},
		]);
		expect(payload.reconciliation).toEqual({
			calculated: "18.00",
			collected: "18.00",
			difference: "0.00",
			linesWithCollected: 2,
		});
	});

	it("Tally leaves a line unresolved when a rule has lapsed or two rules overlap", async () => {
		const lapsed = await run(
			"tally.tax-workpaper",
			sample("tally.tax-workpaper", {
				entity: "Lapsed",
				rules:
					"rule_id,version,tax,category,rate_percent,effective_from,effective_to\nOLD,1,GST,goods,5,2020-01-01,2026-08-31",
			}),
		);
		expect(lapsed.payload.lines).toEqual([]);
		expect(lapsed.payload.reconciliation.calculated).toBe("0.00");
		expect(lapsed.payload.unresolved).toHaveLength(3);
		const overlap = await run(
			"tally.tax-workpaper",
			sample("tally.tax-workpaper", {
				entity: "Overlap",
				rules:
					"rule_id,version,tax,category,rate_percent,effective_from\nA,1,GST,goods,5,2020-01-01\nB,1,GST,goods,6,2026-01-01",
			}),
		);
		expect(overlap.payload.unresolved[0].reason).toMatch(
			/More than one GST rule is in effect on 2026-09-02 \(A v1, B v1\)/,
		);
	});

	it("Vault matches exact amounts, lets the reference decide, and leaves real ambiguity for a person", async () => {
		const { payload, status } = await run(
			"vault.settlement-match",
			sample("vault.settlement-match", { toleranceDays: "3" }),
		);
		expect(status).toBe("needs_review");
		expect(payload.matched).toEqual([
			{
				bankId: "B1",
				settlementId: "P-1001",
				amount: "1482.15",
				daysApart: 1,
				basis: "Same amount, reference names the settlement",
			},
			{
				bankId: "B2",
				settlementId: "P-1002",
				amount: "920.40",
				daysApart: 1,
				basis: "Same amount, reference names the settlement",
			},
		]);
		expect(payload.ambiguous).toEqual([
			{ bankId: "B3", amount: "300.00", candidates: ["P-1003"] },
			{ bankId: "B4", amount: "300.00", candidates: ["P-1003"] },
		]);
		expect(payload.unmatchedBank).toEqual([
			{
				bankId: "B5",
				date: "2026-09-12",
				amount: "57.00",
				reason: "No settlement has a net of exactly 57.00 in the 3 days before it.",
			},
		]);
		expect(payload.unmatchedSettlements.map((u: any) => u.settlementId)).toEqual(["P-1004"]);
		expect(payload.feeExceptions).toEqual([
			{ settlementId: "P-1004", detail: "Gross 1200.00 less fees 37.20 is 1162.80, but the net is 1160.80." },
		]);
		expect(payload.totals).toMatchObject({
			bank: "3059.55",
			matched: "2402.55",
			feesOnMatched: "77.45",
			unmatchedBank: "57.00",
		});
	});

	it("Vault never matches approximately, across currencies, or a deposit dated before its settlement", async () => {
		const { payload } = await run("vault.settlement-match", {
			currency: "CAD",
			bank: "id,date,amount,currency\nB1,2026-09-03,100.01,CAD\nB2,2026-09-03,50.00,USD\nB3,2026-09-01,75.00,CAD",
			settlements: "id,date,net\nP1,2026-09-02,100.00\nP2,2026-09-02,50.00\nP3,2026-09-02,75.00",
		});
		expect(payload.matched).toEqual([]);
		expect(payload.unmatchedBank.map((u: any) => u.bankId).sort()).toEqual(["B1", "B2", "B3"]);
		expect(payload.unmatchedBank.find((u: any) => u.bankId === "B2").reason).toBe("In USD, not CAD.");
	});

	it("Forecast projects the balance exactly and shows the low point moving when assumed receipts fall short", async () => {
		const { payload, product } = await run(
			"forecast.cash-scenario",
			sample("forecast.cash-scenario", { scenario: "Forecast test" }),
		);
		expect(payload.timeline.map((t: any) => t.balance)).toEqual([
			"5500.00",
			"9700.00",
			"1900.00",
			"6100.00",
			"9100.00",
			"1300.00",
		]);
		expect(payload.lowest).toEqual({ date: "2026-10-24", balance: "1300.00" });
		expect(payload.closingBalance).toBe("1300.00");
		expect(payload.firstNegativeDate).toBeNull();
		expect(payload.totals).toEqual({
			confirmedIn: "0.00",
			confirmedOut: "22100.00",
			assumedIn: "11400.00",
			assumedOut: "0.00",
		});
		expect(payload.sensitivity).toEqual({
			shortfallPercent: "25",
			lowestBalance: "-1550.00",
			lowestDate: "2026-10-24",
			firstNegativeDate: "2026-10-24",
		});
		expect(payload.excluded).toEqual([
			{ description: "Rent", date: "2026-11-02", reason: "Outside the forecast dates." },
		]);
		expect(product?.assumptions[0]).toBe(
			"Items marked assumed are estimates. Only confirmed items are commitments.",
		);
	});

	it("Duty calculates tiered duty from the supplied rule, reconciles stamps, and never invents a rate", async () => {
		const { payload, status } = await run("duty.excise-workpaper", sample("duty.excise-workpaper"));
		expect(status).toBe("needs_review");
		expect(payload.events).toEqual([
			{
				eventId: "PK-1",
				date: "2026-09-04",
				containerMl: "30",
				units: 200,
				dutyPerContainer: "7.00",
				duty: "1400.00",
				rule: "DEMO-DUTY v2",
			},
			{
				eventId: "PK-2",
				date: "2026-09-11",
				containerMl: "60",
				units: 100,
				dutyPerContainer: "10.00",
				duty: "1000.00",
				rule: "DEMO-DUTY v2",
			},
		]);
		expect(payload.liability).toEqual({ total: "2400.00", containers: 300, complete: true });
		expect(payload.notDutiable).toEqual([{ eventId: "BT-9", type: "batch_mixed" }]);
		expect(payload.stamps).toEqual({
			opening: 500,
			received: 1000,
			applied: 298,
			damaged: 4,
			returned: 0,
			expectedOnHand: 1198,
			counted: 1190,
			difference: -8,
			containersPackaged: 300,
			appliedVersusPackaged: -2,
		});
		expect(payload.exceptions).toEqual([
			"298 stamps were applied but 300 containers were packaged (a difference of -2).",
			"The count of 1190 stamps differs from the 1198 the ledger expects by -8.",
			"4 stamps are recorded as damaged. Recording damage here is not authorization to dispose of them.",
		]);
	});

	it("Duty rounds part units up only when the rule says so, and leaves uncovered containers unresolved", async () => {
		const base = sample("duty.excise-workpaper");
		const partial = await run("duty.excise-workpaper", {
			...base,
			jurisdiction: "Part units",
			rules: (base.rules as string).replace(/\[DEMO\] Demoland/g, "Part units"),
			events: "id,date,type,container_ml,units\nPK-9,2026-09-04,packaged,15,10",
			stamps: "",
		});
		// 10 mL in the first tier is 5 units; the remaining 5 mL is half a unit of 10 mL, which rounds up to one.
		expect(partial.payload.events[0]).toMatchObject({ dutyPerContainer: "6.00", duty: "60.00" });
		const noRule = await run("duty.excise-workpaper", { ...base, jurisdiction: "Elsewhere" });
		expect(noRule.payload.liability).toEqual({ total: "0.00", containers: 300, complete: false });
		expect(noRule.payload.unresolved.map((u: any) => u.reason)).toEqual(
			Array(2)
				.fill("No approved duty rule for Elsewhere is in effect on 2026-09-04.")
				.map((r, i) => (i ? r.replace("09-04", "09-11") : r)),
		);
		expect(noRule.product?.warnings).toEqual([
			"The liability is incomplete: unresolved events are not included in the total.",
		]);
	});

	it("Source compares landed cost in one currency and won't rank a quote with a missing cost", async () => {
		const { payload, status, product } = await run(
			"source.quote-comparison",
			sample("source.quote-comparison", { item: "Bottles test" }),
		);
		expect(status).toBe("needs_review");
		expect(payload.ranking).toEqual([
			{ rank: 1, supplier: "Demo Glass Co", landedTotal: "2280.00", landedPerUnit: "0.4560" },
			{ rank: 2, supplier: "Demo Import Ltd", landedTotal: "4538.13", landedPerUnit: "0.4538" },
		]);
		expect(payload.quotes[1]).toMatchObject({
			orderQuantity: "10000",
			extraUnits: "5000",
			goods: "2500.00 USD",
			duty: "162.50 USD",
		});
		expect(payload.quotes[2]).toMatchObject({
			supplier: "Demo Bargain Inc",
			landedTotal: null,
			qualified: "unknown",
		});
		expect(payload.purchaseOrderDraft).toMatchObject({
			status: "DRAFT, not submitted",
			supplier: "Demo Glass Co",
			quantity: "5000",
			landedTotal: "2280.00 CAD",
		});
		expect(product?.missing).toEqual(["Demo Bargain Inc: No shipping cost was given."]);
	});
});

describe("Route, Trace, Stock, Link, Return", () => {
	it("Route lists missing documents and exact charge differences, and what it couldn't check", async () => {
		const { payload } = await run(
			"route.exception-package",
			sample("route.exception-package", { shipment: "SHIP-A" }),
		);
		expect(payload.missingDocuments).toEqual(["Proof of delivery"]);
		expect(payload.discrepancies.map((d: any) => [d.charge, d.difference])).toEqual([
			["Fuel surcharge", "2.96"],
			["Residential surcharge", "35.00"],
		]);
		expect(payload.agreed).toEqual([{ charge: "Base freight", amount: "148.00" }]);
		expect(payload.unverified.map((u: any) => u.charge)).toEqual(["Liftgate"]);
		expect(payload.totals).toEqual({ invoiced: "250.20", expectedWhereKnown: "167.24", overcharge: "37.96" });
		expect(payload.actions).toHaveLength(4);
	});

	it("Trace orders the events it was given, keeps estimates apart, and adds nothing", async () => {
		const { payload } = await run(
			"trace.shipment-timeline",
			sample("trace.shipment-timeline", { order: "ORD-A" }),
		);
		expect(payload.confirmed.map((e: any) => e.status)).toEqual(["Label created", "Picked up", "In transit"]);
		expect(payload.confirmed[0].winnipegTime).toMatch(/Oct 5, 2026, 9:00 a\.m\. CDT/);
		expect(payload.estimates).toEqual([
			{ timestamp: "2026-10-10T17:00:00-04:00", status: "Estimate: Expected delivery" },
		]);
		expect(payload.latestConfirmed).toMatchObject({ status: "In transit", location: "Thunder Bay ON" });
		expect(payload.delivered).toBe(false);
		expect(payload.issues).toEqual([
			"1 duplicate event removed (same time, status and place).",
			"The events were supplied out of time order; they are shown in order here.",
		]);
	});

	it("Trace reports a record that contradicts itself", async () => {
		const { payload } = await run("trace.shipment-timeline", {
			order: "ORD-B",
			shipment: "T-1",
			events: "timestamp,status\n2026-10-01T10:00:00Z,Delivered\n2026-10-02T10:00:00Z,In transit",
		});
		expect(payload.delivered).toBe(true);
		expect(payload.issues).toContain(
			'An event ("In transit") is recorded after delivery. The record contradicts itself.',
		);
	});

	it("Stock nets out holds, expired lots and reservations, and won't guess a SKU with no demand", async () => {
		const { payload } = await run(
			"stock.replenishment-plan",
			sample("stock.replenishment-plan", { snapshot: "Count A" }),
		);
		const by = Object.fromEntries(payload.lines.map((l: any) => [l.sku, l]));
		expect(by["PG-BASE"]).toMatchObject({
			onHand: "5800",
			expired: "800",
			reserved: "1200",
			usable: "3800",
			target: "8920",
			shortage: "5120",
			status: "low",
			daysOfCover: "21.1",
		});
		expect(by["VG-BASE"]).toMatchObject({
			onHold: "2000",
			usable: "6500",
			target: "6090",
			shortage: "0",
			status: "ok",
		});
		expect(by["FLAV-A"]).toMatchObject({ usable: "120", target: "170", shortage: "50", status: "low" });
		expect(by["BOTTLE-30"]).toMatchObject({ status: "cannot_calculate", shortage: null });
		expect(payload.counts).toEqual({ reorder: 0, low: 2, ok: 1, cannotCalculate: 1 });
		const mixed = await run("stock.replenishment-plan", {
			snapshot: "Mixed units",
			stock: "sku,on_hand,unit\nX,10,mL\nX,5,g",
		});
		expect(mixed.payload.lines[0]).toMatchObject({
			status: "cannot_calculate",
			notes: [expect.stringMatching(/different units \(mL, g\)\. They are not added together/)],
		});
	});

	it("Link counts a repeated read once and never counts a carton and its units twice", async () => {
		const { payload, product } = await run(
			"link.scan-reconciliation",
			sample("link.scan-reconciliation", { session: "Session A" }),
		);
		expect(payload.reads).toEqual({ events: 7, replayedEvents: 1, distinctTags: 6, repeatedReads: 1 });
		expect(payload.bySku).toEqual([
			{ sku: "BOTTLE-30", expectedUnits: 6, observedUnits: 2, viaCartonOnly: 3, difference: -1 },
			{ sku: "COIL-X", expectedUnits: 2, observedUnits: 1, viaCartonOnly: 0, difference: -1 },
		]);
		expect(payload.missingTags.map((m: any) => m.tag)).toEqual(["U-03", "U-11"]);
		expect(payload.unknownTags).toEqual([{ tag: "X-99", reads: 1, firstSeen: "2026-10-09T15:00:07Z" }]);
		expect(payload.cartons.map((c: any) => c.counted)).toEqual([
			"2 units read individually (the carton tag itself adds none)",
			"Carton read, no unit inside read: 3 units come from the manifest, not from observation",
		]);
		expect(payload.matches).toBe(false);
		expect(product?.warnings).toEqual([
			"The scans are from a simulated source. This says nothing about a real reader.",
		]);
	});

	it("Return decides eligibility from the facts given and leaves it undetermined when one is missing", async () => {
		const eligible = await run("return.case-review", sample("return.case-review", { orderNumber: "R-1" }));
		expect(eligible.payload).toMatchObject({ eligibility: "eligible", unconfirmed: [] });
		expect(eligible.payload.checks[0]).toEqual({
			check: "Requested within the policy window",
			result: "met",
			detail: "Requested 6 days after delivery; the window is 30 days.",
		});
		const late = await run(
			"return.case-review",
			sample("return.case-review", { orderNumber: "R-2", deliveredOn: "2026-08-01" }),
		);
		expect(late.payload.eligibility).toBe("not_eligible");
		const unknown = await run(
			"return.case-review",
			sample("return.case-review", {
				orderNumber: "R-3",
				deliveredOn: "",
				condition: "opened",
				openedAllowed: "unknown",
			}),
		);
		expect(unknown.payload.eligibility).toBe("undetermined");
		expect(unknown.payload.unconfirmed).toEqual([
			"The delivery date.",
			"Whether the policy accepts opened items of this kind.",
		]);
		expect(unknown.payload.proposedResolution).toMatch(/^No resolution proposed yet/);
		const future = await run(
			"return.case-review",
			sample("return.case-review", { orderNumber: "R-4", requestedOn: "2026-12-01" }),
		);
		expect(future).toMatchObject({ status: "failed", error: "The request date is in the future." });
	});
});

describe("manufacturing and quality records", () => {
	it("Batch converts grams only with a documented density and reports the unexplained difference", async () => {
		const { payload } = await run(
			"batch.record-reconciliation",
			sample("batch.record-reconciliation", { batch: "B-A" }),
		);
		expect(payload.inputs[1]).toMatchObject({
			material: "VG base",
			recorded: "3050 g",
			millilitres: "2418.72",
			variance: "18.72",
		});
		expect(payload.inputs[1].basis).toMatch(
			/Calculated from g at 1\.261 g\/mL \(Supplier specification sheet rev 3/,
		);
		expect(payload.balance).toEqual({
			inputMl: "6018.72",
			finishedMl: "5820.00",
			samplesMl: "30.00",
			wasteMl: "45.00",
			remainingMl: "0.00",
			outputMl: "5895.00",
			unexplainedMl: "123.72",
			unexplainedPercent: "2.06",
			yieldPercent: "96.70",
		});
		expect(payload.complete).toBe(true);
		expect(payload.exceptions).toEqual([
			"The unexplained difference is 2.06% of input, beyond the 2% you set. It needs an investigation, not an adjustment.",
			"VG base (lot L-200) differs from plan by 18.72 mL.",
		]);
	});

	it("Batch never assumes 1 mL is 1 gram: without a density the balance is incomplete and says so", async () => {
		const { payload, product } = await run(
			"batch.record-reconciliation",
			sample("batch.record-reconciliation", { batch: "B-B", densities: "" }),
		);
		expect(payload.inputs[1]).toMatchObject({
			millilitres: null,
			basis: "Recorded in g; no documented density, so not converted",
		});
		expect(payload.complete).toBe(false);
		expect(payload.balance.unexplainedPercent).toBeNull();
		expect(payload.balance.yieldPercent).toBeNull();
		expect(product?.missing).toEqual(["A documented density for VG base."]);
		expect(product?.warnings[0]).toMatch(/Do not rely on the balance/);
	});

	it("Tempo checks materials and hours, and never calls an unchecked plan feasible", async () => {
		const { payload, product } = await run(
			"tempo.production-plan",
			sample("tempo.production-plan", { plan: "Week A" }),
		);
		expect(
			payload.orders.map((o: any) => [
				o.product,
				o.runHours,
				o.startsAtHour,
				o.endsAtHour,
				o.fits,
				o.materialsCovered,
			]),
		).toEqual([
			["Berry 6mg", "10.00", "0.00", "10.00", true, false],
			["Mango Ice 12mg", "15.00", "11.50", "26.50", true, false],
		]);
		expect(Object.fromEntries(payload.materials.map((m: any) => [m.material, m.shortBy]))).toEqual({
			"PG base": "0.00",
			"VG base": "4000.00",
			"Flavour B": "1400.00",
			"Flavour A": "0.00",
		});
		expect(payload.capacity).toEqual({ hoursNeeded: "26.50", hoursAvailable: "30.00", shortByHours: "0.00" });
		expect(payload.feasibility).toBe("not_feasible");
		expect(payload.notChecked).toContain("Staff qualifications and availability");
		expect(product?.missing[0]).toMatch(/can't be called authorized or fully feasible/);
		const enough = await run(
			"tempo.production-plan",
			sample("tempo.production-plan", {
				plan: "Week B",
				stock: "material,eligible_ml\nPG base,50000\nVG base,50000\nFlavour A,9000\nFlavour B,5000",
			}),
		);
		expect(enough.payload.feasibility).toBe("feasible_on_checked_constraints");
		expect(enough.product?.summary).toMatch(/Staffing, calibration and clearance were not checked/);
	});

	it("Qualify shows each required document's standing and never approves the supplier", async () => {
		const { payload, product } = await run(
			"qualify.supplier-package",
			sample("qualify.supplier-package", { supplier: "Supplier A" }),
		);
		expect(payload.documents.map((d: any) => [d.document, d.status])).toEqual([
			["Specification", "no_expiry_recorded"],
			["Safety data sheet", "expired"],
			["Certificate of analysis", "expiring"],
			["Quality agreement", "missing"],
		]);
		expect(payload.openIssues).toEqual([
			{ issue: "Cloudy appearance on receipt", lot: "L-190", opened: "2026-07-02" },
		]);
		expect(payload.rejectedLots).toEqual(["L-190"]);
		expect(payload.evidenceComplete).toBe(false);
		expect(product?.missing).toEqual(["Quality agreement"]);
	});

	it("Assay compares verified results only, in the same unit, and declares nothing safe", async () => {
		const { payload } = await run("assay.lab-review", sample("assay.lab-review", { lot: "LOT-A" }));
		expect(payload.comparisons.map((c: any) => [c.test, c.result])).toEqual([
			["Nicotine concentration", "within_specification"],
			["Diacetyl", "unresolved"],
		]);
		expect(payload.comparisons[1].detail).toBe(
			"Reported in mg/mL; the specification is in ppm. Not converted.",
		);
		expect(payload.outstanding).toEqual([{ test: "Appearance", reason: "No result is on file." }]);
		expect(payload.notUsed).toEqual([
			{
				test: "Nicotine concentration",
				sampleId: "S-041-2",
				reason: "The transcription hasn't been verified against the original report, so it is a draft.",
			},
		]);
		expect(payload.counts).toEqual({ planned: 3, within: 1, outside: 0, unresolved: 1, outstanding: 1 });
		expect(payload.statement).toMatch(
			/not an analysis, an acceptance of any test, or a statement that the lot is safe/,
		);
		const outside = await run(
			"assay.lab-review",
			sample("assay.lab-review", {
				lot: "LOT-B",
				results:
					"test,value,unit,sample_id,report_ref,verified\nNicotine concentration,13.0,mg/mL,S-1,R-1,yes",
			}),
		);
		expect(outside.payload.counts.outside).toBe(1);
		expect(outside.product?.warnings[0]).toMatch(/outside its approved limits/);
	});

	it("Assure says what stands in the way of a release decision and never makes one", async () => {
		const { payload } = await run(
			"assure.release-package",
			sample("assure.release-package", { batch: "B-C" }),
		);
		expect(payload.evidence.map((e: any) => [e.requirement, e.complete])).toEqual([
			["Batch record complete", true],
			["Laboratory results reviewed", false],
			["Line clearance", true],
			["Label version approved", false],
			["Equipment calibration current", true],
		]);
		expect(payload.evidence[1].problem).toBe("Needs a signature and none is recorded.");
		expect(payload.readyForDecision).toBe(false);
		expect(payload.decision).toMatch(/^Not made here/);
		expect(payload.proposedActions).toHaveLength(4);
		const ready = await run("assure.release-package", {
			batch: "B-D",
			product: "P",
			requirements: "requirement,status,evidence_ref\nBatch record complete,present,EBR-1",
			holds: "hold,status\nOld hold,closed",
		});
		expect(ready.payload.readyForDecision).toBe(true);
		expect(ready.status).toBe("needs_review");
		expect(ready.product?.summary).toMatch(/ready for a person's release decision/);
	});

	it("Gauge works out eligibility from the register and the batches a failed instrument touched", async () => {
		const { payload } = await run("gauge.equipment-review", sample("gauge.equipment-review"));
		expect(Object.fromEntries(payload.assets.map((a: any) => [a.asset, a.eligibility]))).toEqual({
			"SCALE-1": "eligible",
			"SCALE-2": "not_eligible",
			"MIXER-1": "eligible",
			"PIP-4": "not_eligible",
			"THERM-2": "undetermined",
		});
		expect(payload.assets[1].reasons).toEqual(["Calibration was due 2026-09-20, 19 days ago."]);
		expect(payload.assets[4].reasons).toEqual([
			"It needs calibration but no due date is recorded.",
			"No calibration certificate reference is recorded.",
		]);
		expect(payload.failures).toEqual([
			{
				asset: "PIP-4",
				failedOn: "2026-10-07",
				lastVerified: "2026-09-25",
				affectedBatches: ["B-2026-040", "B-2026-041"],
				note: "Failed gravimetric check",
			},
		]);
		expect(payload.counts).toEqual({ eligible: 2, notEligible: 2, undetermined: 1 });
	});

	it("Clean compares the record with the procedure and attests to nothing", async () => {
		const { payload } = await run(
			"clean.clearance-review",
			sample("clean.clearance-review", { line: "Line A" }),
		);
		expect(payload.steps.map((s: any) => s.status)).toEqual([
			"recorded",
			"verification_not_independent",
			"recorded",
			"outstanding",
		]);
		expect(payload.outstanding).toEqual([
			"Flush lines with approved solvent: verified by the same person who performed it.",
			"Inspect line for stray bottles and caps: no recorded observation.",
		]);
		expect(payload.evidenceComplete).toBe(false);
		expect(payload.statement).toMatch(/not an attestation/);
	});

	it("Coach tells an acknowledgement from an assessment, and an old version from the current one", async () => {
		const { payload } = await run(
			"coach.training-review",
			sample("coach.training-review", { task: "Task A" }),
		);
		const reasons = (person: string) =>
			payload.staff
				.find((s: any) => s.person === person)
				.requirements.map((r: any) => `${r.status}: ${r.reason}`);
		expect(reasons("Operator A")).toEqual([
			"met: assessment completed 2026-06-10, valid to 2027-06-10.",
			"met: acknowledgement completed 2026-07-01.",
			"gap: The latest record expired 2026-08-01.",
		]);
		expect(reasons("Operator C")).toEqual([
			"gap: Only an acknowledgement is on file; this requirement needs a demonstrated assessment.",
			"gap: On file for v2; the current procedure is v3.",
			"gap: No record on file.",
		]);
		expect(payload.eligible).toEqual([]);
		expect(payload.proposals).toHaveLength(4);
	});

	it("Comply maps evidence to the requirements in effect and certifies nothing", async () => {
		const { payload } = await run(
			"comply.evidence-review",
			sample("comply.evidence-review", { activity: "Activity A" }),
		);
		expect(payload.requirements.map((r: any) => [r.id, r.applicability, r.status])).toEqual([
			["R1", "applies", "expired"],
			["R2", "applies", "evidenced"],
			["R3", "uncertain", "uncertain"],
		]);
		expect(payload.notInEffect).toEqual([
			{ id: "R4", requirement: "Legacy label format", reason: "Ended 2020-12-31." },
		]);
		expect(payload.counts).toEqual({ evidenced: 1, missing: 0, expired: 1, uncertain: 1 });
		expect(payload.statement).toMatch(/not legal advice and does not certify compliance/);
	});

	it("Safeguard counts inspections against what was required and reconciles waste by stream", async () => {
		const { payload } = await run("safeguard.records-review", sample("safeguard.records-review"));
		expect(payload.inspections).toEqual([
			{ inspection: "Eyewash station check", required: 4, recorded: 2, shortBy: 2 },
			{ inspection: "Spill kit check", required: 1, recorded: 1, shortBy: 0 },
			{ inspection: "Fire extinguisher check", required: 1, recorded: 0, shortBy: 1 },
		]);
		expect(payload.incidents.map((i: any) => i.status)).toEqual(["follow_up_open", "no_follow_up_recorded"]);
		expect(payload.waste).toEqual([
			{
				stream: "Nicotine-contaminated waste",
				unit: "kg",
				generated: "20.5",
				collected: "15",
				onSite: "5.5",
				note: "Recorded as still on site at the end of the period.",
			},
			{ stream: "Solvent waste", unit: "L", generated: "20", collected: "20", onSite: "0", note: "" },
		]);
		expect(payload.undocumentedCollections).toEqual([
			{ stream: "Solvent waste", date: "2026-09-22", quantity: "20 L" },
		]);
		expect(payload.followUps).toHaveLength(5);
	});
});

describe("Patch, Watch, Guard: the workspace's own evidence", () => {
	it("Patch groups errors that differ only in times and ids, and admits when it wasn't reproduced", async () => {
		expect(
			errorSignature("2026-10-08T14:02:11Z error took 412ms for id 7b0f5f3e-9a36-4d3e-9a4d-0f8b0a4c9e11"),
		).toBe("error took <n> for id <id>");
		const { payload, product, status } = await run(
			"patch.issue-diagnosis",
			sample("patch.issue-diagnosis", { issue: "Filters A" }),
		);
		expect(status).toBe("needs_review");
		expect(payload.signatures.map((s: any) => s.occurrences)).toEqual([2, 1, 1]);
		expect(payload.signatures[0]).toMatchObject({
			firstSeen: "2026-10-08T14:02:11Z",
			lastSeen: "2026-10-08T14:05:40Z",
		});
		expect(payload.statusCodes).toEqual([
			{ code: "200", occurrences: 1 },
			{ code: "500", occurrences: 1 },
		]);
		expect(payload.implicatedFiles).toEqual([
			{ file: "src/ui/sections/wv-shop/filters.tsx", mentions: 2 },
			{ file: "src/ui/sections/wv-shop/filter-drawer.tsx", mentions: 1 },
		]);
		expect(payload.reproduction.status).toBe("not_reproduced");
		expect(product?.missing).toContain("Reproduction evidence.");
		const wrong = await run(
			"patch.issue-diagnosis",
			sample("patch.issue-diagnosis", { issue: "Filters B", inspectionTask: "not-a-task" }),
		);
		expect(wrong).toMatchObject({ status: "failed", error: expect.stringMatching(/isn't a task id/) });
	});

	it("Watch treats a pasted snapshot as a snapshot, flags stale observations and groups one outage into one incident", async () => {
		const { payload } = await run("watch.health-assessment", {
			source: "snapshot",
			freshHours: "2",
			snapshot:
				"service,status,checked_at,detail\nStorefront,healthy,2026-10-07T14:30:00Z,200\nCheckout,unhealthy,2026-10-07T14:30:00Z,503 from gateway\nGateway,unhealthy,2026-10-07T14:29:00Z,503 from gateway\nSearch,healthy,2026-10-06T03:00:00Z,ok",
		});
		expect(payload.source).toBe("An imported snapshot (a point in time, not continuous monitoring)");
		expect(payload.services.map((s: any) => [s.service, s.ageHours, s.stale])).toEqual([
			["Storefront", 0.5, false],
			["Checkout", 0.5, false],
			["Gateway", 0.5, false],
			["Search", 36, true],
		]);
		expect(payload.incidents).toEqual([
			{
				title: "2 services failing with the same symptom",
				services: ["Checkout", "Gateway"],
				detail: "503 from gateway",
			},
		]);
		expect(payload.counts).toEqual({ healthy: 1, failing: 2, stale: 1, notObserved: 0 });
	});

	it("Watch reads the checks this workspace recorded, and says which configured services were never checked", async () => {
		await recordHealth(sql, [
			{ integration: "database", status: "healthy", detail: "Answering.", latencyMs: 4 },
			{ integration: "saleor", status: "unhealthy", detail: "The store API answered 502.", latencyMs: 900 },
		]);
		const { payload } = await run("watch.health-assessment", { source: "recorded" });
		expect(payload.source).toBe("Integration checks recorded by this workspace");
		expect(payload.services.map((s: any) => s.service).sort()).toEqual([
			"Saleor store API",
			"Supabase database",
		]);
		expect(payload.incidents[0]).toMatchObject({ title: "Saleor store API is unhealthy" });
		expect(payload.notObserved).toContain(
			"Model provider (Anthropic) is configured but has never been checked.",
		);
		await expect(run("watch.health-assessment", { source: "snapshot" })).resolves.toMatchObject({
			status: "failed",
			error: expect.stringMatching(/Paste the snapshot/),
		});
	});

	it("Guard flags excessive, self-granted and unattributed access, and reports refused attempts from the real log", async () => {
		const { payload, status } = await run(
			"guard.access-review",
			sample("guard.access-review", { system: "Admin A" }),
		);
		expect(status).toBe("needs_review");
		expect(payload.findings.map((f: any) => `${f.subject}: ${f.issue}`)).toEqual([
			"sam@demo.test: Excessive permission",
			"sam@demo.test: Self-granted",
			"jo@demo.test: No record of who granted it",
			"jo@demo.test: More than one role",
		]);
		expect(payload).toMatchObject({ grantsReviewed: 4, withinPolicy: 3 });
		expect(payload.workspace.notes).toContain(
			"No owner is configured, so nobody can sign in to the workspace.",
		);
	});
});

describe("Restore: coverage against real backups", () => {
	it("says there is nothing to review without storage, and reports real coverage and the last proven restore with it", async () => {
		const bare = await run("restore.coverage-review", { maxAgeHours: "26" });
		expect(bare.payload.backups).toMatchObject({ found: 0, newest: null });
		expect(bare.product?.missing).toEqual(
			expect.arrayContaining([
				"File storage isn't configured, so no backup can be taken or listed here.",
				"No isolated restore check is on record, so restoration has never been proven here.",
			]),
		);

		const dir = await mkdtemp(join(tmpdir(), "wai-coverage-"));
		try {
			const storage = createFolderStorage(dir);
			const now = new Date("2026-10-07T12:00:00Z");
			await runBackup({ sql, storage, actor: system, now });
			const first = await run("restore.coverage-review", { maxAgeHours: "25" }, { deps: { storage } });
			expect(first.payload.backups).toMatchObject({
				found: 1,
				tablesCovered: 17,
				tablesExpected: 17,
				tablesMissing: [],
			});
			expect(first.payload.backups.newest).toMatchObject({ ageHours: 3 });
			expect(first.payload.restoreCheck).toEqual({ lastRunAt: null, passed: null, backupId: null });
			expect(first.payload.statement).toMatch(
				/Whether a backup restores is shown only by the isolated restore check/,
			);

			const drill = await runRestoreDrill({ backup: storage, sql, actor: owner, now });
			expect(drill.ok).toBe(true);
			const second = await run(
				"restore.coverage-review",
				{
					maxAgeHours: "2",
					assets: "asset,covered_by,last_restore_test\nConfiguration,Password manager,\nWorker state,,",
				},
				{ deps: { storage } },
			);
			expect(second.payload.restoreCheck).toMatchObject({ passed: true, backupId: drill.backupId });
			expect(second.payload.otherAssets.map((a: any) => a.status)).toEqual([
				"covered_untested",
				"not_covered",
			]);
			expect(second.payload.gaps).toEqual(
				expect.arrayContaining([
					"The newest backup is 3 hours old; the limit you set is 2.",
					"Worker state has no backup recorded.",
				]),
			);
			expect(second.payload.gaps.join(" ")).not.toMatch(/never been proven/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("Atlas: reviewing the library itself", () => {
	it("reports unapproved, stale and duplicated documents and topics with no approved source", async () => {
		const add = async (
			title: string,
			collection: string,
			content: string,
			extra: { approve?: boolean; reviewDue?: string } = {},
		) => {
			const { document } = await createDocument(sql, owner, {
				collection,
				title,
				owner: "Olivia",
				source: "Test",
				content,
				reviewDue: extra.reviewDue ?? "2027-06-01",
			});
			if (extra.approve !== false)
				await approveVersion(sql, owner, document.id, 1, { reviewDue: extra.reviewDue ?? "2027-06-01" });
			return document.id;
		};
		await add("Returns policy", "returns", "Unopened items can be returned within 30 days for a refund.");
		await add("Returns policy", "returns", "Unopened items can be returned within 45 days for a refund.");
		await add("Holiday shipping", "shipping", "Holiday orders ship before the break.", {
			reviewDue: "2026-09-01",
		});
		const draftId = await add("Wholesale terms", "commercial", "Minimum first order is 24 units.", {
			approve: false,
		});

		const { payload, product, status } = await run("atlas.knowledge-review", {
			collection: "all",
			topics: "refund\nwarranty",
		});
		expect(status).toBe("completed");
		expect(payload.counts).toMatchObject({ documents: 4, approved: 3, needingAttention: 2 });
		expect(payload.documents.find((d: any) => d.documentId === draftId).flags).toEqual([
			"Never approved",
			"A version is waiting for approval",
		]);
		expect(payload.documents.find((d: any) => d.title === "Holiday shipping").flags[0]).toMatch(/^Stale:/);
		expect(payload.conflicts).toHaveLength(1);
		expect(payload.conflicts[0].reason).toBe(
			'2 approved documents in "returns" share this title. Only one should be authoritative.',
		);
		expect(payload.gaps).toEqual([{ topic: "warranty", reason: "No approved document matches." }]);
		expect(payload.proposals.map((p: any) => p.action)).toEqual(
			expect.arrayContaining([
				"Review the waiting version",
				"Decide which document is authoritative",
				'Add an approved source for "warranty"',
			]),
		);
		expect(product?.sourceRefs.filter((r) => r.system === "atlas")).toHaveLength(4);

		const one = await run("atlas.knowledge-review", { collection: "shipping" });
		expect(one.payload.counts.documents).toBe(1);
	});
});

describe("Nexus: planning", () => {
	it("orders steps by their dependencies, names each step's owner and inputs, and starts nothing", async () => {
		const { payload, status } = await run("nexus.goal-plan", sample("nexus.goal-plan", { goal: "Plan A" }));
		expect(status).toBe("completed");
		expect(payload.steps.map((s: any) => [s.step, s.agent, s.order, s.readiness, s.dependsOn])).toEqual([
			[1, "Vault", 1, "ready", []],
			[2, "Tally", 2, "ready", [1]],
			[3, "Restore", 1, "ready", []],
			[4, "Verify", 3, "ready", [2]],
		]);
		expect(payload.steps[0].needs).toEqual(["Currency", "Bank lines", "Processor settlements"]);
		expect(payload.counts).toMatchObject({ steps: 4, readyNow: 2, blocked: 0 });
		expect(payload.scope).toMatch(/^Planning only: no task was started/);
		expect(payload.complete).toBe(false);
		expect(
			(
				await sql.query(
					"select count(*)::int as n from wai_tasks where parent_task_id is not null and title like 'Reconcile settlements%'",
				)
			).rows[0].n,
		).toBe(0);
	});

	it("refuses a loop, a step it doesn't know, a plan inside a plan, and shows which steps can't run yet", async () => {
		const plan = (steps: string, goal: string) =>
			run("nexus.goal-plan", { goal, expectedResult: "e", mode: "plan", steps });
		expect(
			await plan("function,depends_on\nvault.settlement-match,2\ntally.tax-workpaper,1", "Loop"),
		).toMatchObject({ status: "failed", error: expect.stringMatching(/depend on each other in a loop/) });
		expect(await plan("function\nledger.post_entry", "Unknown")).toMatchObject({
			status: "failed",
			error: 'Step 1: there is no function called "ledger.post_entry".',
		});
		expect(await plan("function\nnexus.goal-plan", "Nested")).toMatchObject({
			status: "failed",
			error: "Step 1: a plan can't contain another plan.",
		});
		expect(await plan("function,depends_on\nvault.settlement-match,7", "Bad ref")).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/"7" isn't another step's number/),
		});

		const blocked = await plan(
			"function,depends_on\npatch.site_inspection,\npatch.issue-diagnosis,1",
			"Blocked",
		);
		expect(blocked.payload.steps[0]).toMatchObject({
			readiness: "awaiting_configuration",
			needs: ["Started from /worldwide-ai/engineering"],
		});
		expect(blocked.payload.blockers).toEqual([
			expect.stringMatching(/^Step 1 \(Inspect website pages\): OpenClaw worker isn't configured\./),
			"Step 2 (Diagnose website issue) waits on step 1, which can't run yet.",
		]);
		expect(blocked.payload.counts).toMatchObject({ readyNow: 0, blocked: 1 });
	});
});

describe("Verify: an independent re-check", () => {
	it("re-reads another agent's result, recomputes its checksums and re-runs that function's own rules", async () => {
		const vault = await run(
			"vault.settlement-match",
			sample("vault.settlement-match", { toleranceDays: "2" }),
		);
		const waiting = await run("verify.workflow-acceptance", {
			task: vault.taskId,
			criteria: "Figures agree with the bank portal",
		});
		expect(waiting.status).toBe("completed");
		expect(waiting.payload).toMatchObject({
			kind: "vault.settlement-match",
			owner: "Vault",
			state: "Needs review",
			passed: true,
		});
		expect(waiting.payload.verified).toEqual({
			record: `Result ${vault.product?.id} (SettlementReconciliation)`,
			sha256: vault.product?.payloadSha256,
		});
		expect(
			waiting.payload.checks.find((c: any) => c.check === "A person's review decision is recorded"),
		).toMatchObject({ result: "not_applicable" });
		expect(waiting.payload.untested).toEqual([
			"Not automatically tested: Figures agree with the bank portal",
		]);

		await reviewProduct(workflowDeps(sql, null, env), staff, vault.product!.id, { action: "accept" });
		const accepted = await run("verify.workflow-acceptance", {
			task: `https://example.test/worldwide-ai/tasks/${vault.taskId}`,
		});
		expect(accepted.payload.state).toBe("Completed");
		expect(accepted.payload.checks.filter((c: any) => c.result === "fail")).toEqual([]);
		expect(accepted.payload.checks.map((c: any) => c.check)).toEqual(
			expect.arrayContaining([
				"The stored result matches its recorded checksum",
				"The result is tied to exactly that input",
				"The function's own consistency rules pass when re-run",
				"The task's evidence names this exact result",
				"It was accepted before the task was completed",
			]),
		);
	});

	it("fails a result that was altered after it was stored", async () => {
		const check = await run("check.record-validation", {
			dataset: "To tamper",
			keyColumn: "id",
			records: "id\n1\n2",
		});
		await sql.query(
			`update wai_work_products set payload = jsonb_set(payload, '{clean}', 'false') where task_id = $1`,
			[check.taskId],
		);
		const report = await run("verify.workflow-acceptance", { task: check.taskId });
		expect(report.payload.passed).toBe(false);
		expect(report.payload.checks.filter((c: any) => c.result === "fail").map((c: any) => c.check)).toEqual([
			"The stored result matches its recorded checksum",
		]);
		expect(report.product?.warnings).toEqual([
			"A check failed. Treat the checked result as unreliable until it is explained.",
		]);
	});

	it("won't check its own reports, someone's personal work, a task that hasn't finished, or one that doesn't exist", async () => {
		const check = await run("check.record-validation", {
			dataset: "For verify",
			keyColumn: "id",
			records: "id\n1",
		});
		const report = await run("verify.workflow-acceptance", { task: check.taskId });
		expect(await run("verify.workflow-acceptance", { task: report.taskId })).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/can't check its own reports/),
		});
		expect(
			await run("verify.workflow-acceptance", { task: "00000000-0000-4000-8000-000000000000" }),
		).toMatchObject({ status: "failed", error: "That task doesn't exist." });

		const plan = { priorities: [], leaveForLater: [], note: "n", instructionsInData: false };
		const personal = await run(
			"focus.personal-plan",
			{ horizon: "today", goals: `Private goal ${++unique}` },
			{ reply: plan },
		);
		expect((await getTask(sql, personal.taskId))?.scope).toMatch(/^personal:/);
		expect(await run("verify.workflow-acceptance", { task: personal.taskId })).toMatchObject({
			status: "failed",
			error: "That task doesn't exist.",
		});

		const queued = await requestFunction(
			workflowDeps(sql, null, env),
			staff,
			"check.record-validation",
			{ dataset: "Queued", keyColumn: "id", records: "id\n9" },
			{ lookup },
		);
		expect(await run("verify.workflow-acceptance", { task: queued.task.id })).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/is queued; there is no result to verify yet/),
		});
	});
});
