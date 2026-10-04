import { describe, expect, it } from "vitest";
import {
	MAX_LOG_DAYS,
	MAX_STAGES,
	generateStages,
	needsUpload,
	parseQuitData,
	pickNewest,
	stamp,
	startingData,
	updatedAt,
	type QuitData,
} from "./wv-quit-model";

const plan = (over: Partial<QuitData> = {}): QuitData => ({
	...startingData("2026-10-04", { product: "Vape", baselinePuffs: 50, stages: generateStages(20, 7) }),
	...over,
});
const roundTrip = (d: unknown) => parseQuitData(JSON.stringify(d));

describe("parseQuitData", () => {
	it("round-trips a plan, including its timestamp and logs", () => {
		const d = stamp(
			plan({ logs: { "2026-10-04": { date: "2026-10-04", strength: 20, puffs: 12 } } }),
			1_700_000_000_000,
		);
		expect(roundTrip(d)).toEqual(d);
	});

	it("accepts a plan saved before puff targets and timestamps existed", () => {
		const old = {
			v: 3,
			plan: {
				stages: [
					{ name: "Baseline", strength: 20, days: 7 },
					{ name: "Final Taper", strength: 0, days: 14, taper: true },
				],
				currentIndex: 0,
				stageStartedAt: "2026-09-01",
				startedAt: "2026-09-01",
			},
			logs: {},
			setup: true,
			product: "Vape",
			baselinePuffs: 50,
			sample: false,
		};
		const parsed = roundTrip(old);
		expect(parsed).not.toBeNull();
		expect(parsed?.plan.stages[0].puffs).toBeUndefined();
		expect(parsed?.savedAt).toBeUndefined();
	});

	it("gives nothing for things that are not a plan", () => {
		for (const raw of [
			undefined,
			null,
			"",
			"not json",
			"[]",
			"null",
			'{"v":2}',
			'{"v":3}',
			'{"v":3,"plan":{}}',
		]) {
			expect(parseQuitData(raw)).toBeNull();
		}
	});

	it("rejects a plan with a bad shape", () => {
		const base = plan();
		expect(roundTrip({ ...base, plan: { ...base.plan, stages: [] } })).toBeNull();
		expect(roundTrip({ ...base, plan: { ...base.plan, currentIndex: 99 } })).toBeNull();
		expect(roundTrip({ ...base, plan: { ...base.plan, currentIndex: -1 } })).toBeNull();
		expect(roundTrip({ ...base, plan: { ...base.plan, startedAt: "yesterday" } })).toBeNull();
		expect(
			roundTrip({ ...base, plan: { ...base.plan, stages: [{ name: "x", strength: "20", days: 7 }] } }),
		).toBeNull();
		expect(
			roundTrip({ ...base, plan: { ...base.plan, stages: [{ name: "x", strength: 20, days: 0 }] } }),
		).toBeNull();
		const tooMany = Array.from({ length: MAX_STAGES + 1 }, () => ({ name: "x", strength: 1, days: 1 }));
		expect(roundTrip({ ...base, plan: { ...base.plan, stages: tooMany } })).toBeNull();
	});

	it("drops anything it does not know about", () => {
		const parsed = roundTrip({ ...plan(), admin: true, plan: { ...plan().plan, secret: "x" } }) as Record<
			string,
			unknown
		>;
		expect(parsed).not.toHaveProperty("admin");
		expect(parsed.plan).not.toHaveProperty("secret");
	});

	it("skips malformed log entries and keeps the good ones", () => {
		const parsed = roundTrip({
			...plan(),
			logs: {
				a: { date: "2026-10-01", strength: 20, puffs: 5 },
				b: { date: "nope", strength: 20, puffs: 5 },
				c: { date: "2026-10-02", strength: 20, puffs: -3 },
				d: null,
				e: { date: "2026-10-03", strength: 20, puffs: "7" },
			},
		});
		expect(Object.keys(parsed?.logs ?? {})).toEqual(["2026-10-01"]);
	});

	it("keeps only the most recent days when there are too many", () => {
		const logs: Record<string, unknown> = {};
		for (let i = 0; i < MAX_LOG_DAYS + 5; i++) {
			const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
			logs[date] = { date, strength: 10, puffs: i };
		}
		const kept = Object.keys(roundTrip({ ...plan(), logs })?.logs ?? {});
		expect(kept).toHaveLength(MAX_LOG_DAYS);
		expect(kept).not.toContain("2024-01-01");
	});

	it("tidies the product name and baseline", () => {
		const parsed = roundTrip({ ...plan(), product: "x".repeat(200), baselinePuffs: -5 });
		expect(parsed?.product).toHaveLength(30);
		expect(parsed?.baselinePuffs).toBe(0);
	});
});

describe("which copy is newest", () => {
	const older = stamp(plan(), 1_000);
	const newer = stamp(plan(), 2_000);

	it("uses a copy's timestamp, or its latest activity for copies saved before timestamps", () => {
		expect(updatedAt(newer)).toBe(2_000);
		const legacy = plan({ logs: { "2026-10-09": { date: "2026-10-09", strength: 20, puffs: 1 } } });
		expect(updatedAt(legacy)).toBeGreaterThan(updatedAt(plan()));
	});

	it("uses whichever exists when only one does", () => {
		expect(pickNewest(null, null)).toEqual({ data: null, source: "none" });
		expect(pickNewest(older, null)).toEqual({ data: older, source: "local" });
		expect(pickNewest(null, newer)).toEqual({ data: newer, source: "account" });
	});

	it("takes the account's copy when it is newer, this browser's when it is", () => {
		expect(pickNewest(older, newer).source).toBe("account");
		expect(pickNewest(newer, older).source).toBe("local");
	});

	it("keeps this browser's copy on a tie", () => {
		expect(pickNewest(newer, { ...newer }).source).toBe("local");
	});

	it("says when the account needs this copy", () => {
		expect(needsUpload(newer, null)).toBe(true);
		expect(needsUpload(newer, older)).toBe(true);
		expect(needsUpload(older, newer)).toBe(false);
		expect(needsUpload(newer, { ...newer })).toBe(false);
	});
});

describe("stamp", () => {
	it("marks a copy as changed at the given time without touching the original", () => {
		const d = plan();
		expect(stamp(d, 123).savedAt).toBe(123);
		expect(d.savedAt).toBeUndefined();
	});
});
