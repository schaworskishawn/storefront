import { describe, expect, it } from "vitest";
import {
	PUFF_BUMP,
	STRENGTH_STEP,
	addPuffsToday,
	advanceStage,
	defaultData,
	generateStages,
	puffTargetFor,
	startingData,
	streak,
	todayPuffTarget,
	type QuitData,
} from "./wv-quit-model";

const levels = (start: number) => generateStages(start, 7).map((s) => s.strength);

describe("generateStages: strength", () => {
	it("steps down 2 mg at a time from 20 mg to 0", () => {
		expect(levels(20)).toEqual([20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 0]);
		expect(STRENGTH_STEP).toBe(2);
	});

	it("works from any starting strength, always ending at 0", () => {
		expect(levels(12)).toEqual([12, 10, 8, 6, 4, 2, 0]);
		expect(levels(3)).toEqual([3, 1, 0]);
		expect(levels(1)).toEqual([1, 0]);
		for (const start of [3, 6, 12, 18, 20]) {
			const l = levels(start);
			expect(l[0]).toBe(start);
			expect(l.at(-1)).toBe(0);
			expect(l).toEqual([...l].sort((a, b) => b - a));
			expect(new Set(l).size).toBe(l.length);
		}
	});

	it("gives each step the chosen number of days and the last one double", () => {
		const stages = generateStages(20, 5);
		expect(stages.slice(0, -1).every((s) => s.days === 5)).toBe(true);
		expect(stages.at(-1)?.days).toBe(10);
	});

	it("names the first stage Baseline, the last Final Taper and the rest Reduction", () => {
		const names = generateStages(20, 7).map((s) => s.name);
		expect(names[0]).toBe("Baseline");
		expect(names.at(-1)).toBe("Final Taper");
		expect(names.slice(1, -1).every((n) => n === "Reduction")).toBe(true);
	});
});

describe("generateStages: puffs", () => {
	const stages = generateStages(20, 7);

	it("tracks normal puffs during the baseline", () => {
		expect(stages[0].puffs).toEqual({ from: 1, to: 1 });
	});

	it("raises puffs when the strength drops, then eases them back to the baseline", () => {
		for (const s of stages.slice(1, -1)) expect(s.puffs).toEqual({ from: 1 + PUFF_BUMP, to: 1 });
	});

	it("raises puffs at 0 mg too, then weans them all the way off", () => {
		expect(stages.at(-1)?.puffs).toEqual({ from: 1 + PUFF_BUMP, to: 0 });
	});
});

describe("puffTargetFor", () => {
	const reduction = generateStages(20, 7)[1];

	it("starts a reduction step 20% above the baseline and eases back to it", () => {
		expect(puffTargetFor(reduction, 50, 0)).toBe(60);
		expect(puffTargetFor(reduction, 50, 3)).toBe(55);
		expect(puffTargetFor(reduction, 50, 6)).toBe(50);
	});

	it("only ever goes down within a step", () => {
		const targets = Array.from({ length: 7 }, (_, d) => puffTargetFor(reduction, 80, d) ?? -1);
		expect(targets).toEqual([...targets].sort((a, b) => b - a));
	});

	it("keeps the baseline flat during the baseline stage", () => {
		const base = generateStages(20, 7)[0];
		for (let d = 0; d < 7; d++) expect(puffTargetFor(base, 50, d)).toBe(50);
	});

	it("weans off to zero by the end of the final taper", () => {
		const last = generateStages(20, 7).at(-1);
		expect(puffTargetFor(last, 50, 0)).toBe(60);
		expect(puffTargetFor(last, 50, (last?.days ?? 1) - 1)).toBe(0);
	});

	it("stays within the step even for days past its end or before its start", () => {
		expect(puffTargetFor(reduction, 50, 99)).toBe(50);
		expect(puffTargetFor(reduction, 50, -3)).toBe(60);
	});

	it("gives nothing without a baseline or for a plan saved before puff targets existed", () => {
		expect(puffTargetFor(reduction, 0, 0)).toBeNull();
		expect(puffTargetFor({ name: "Reduction", strength: 16, days: 7 }, 50, 0)).toBeNull();
		expect(puffTargetFor(undefined, 50, 0)).toBeNull();
	});
});

const withPlan = (over: Partial<QuitData> = {}): QuitData => {
	const base = defaultData("2026-10-01");
	return { ...base, setup: true, baselinePuffs: 50, ...over };
};

describe("todayPuffTarget", () => {
	it("follows the day within the current stage", () => {
		let d = withPlan();
		d = advanceStage(d, "2026-10-08"); // now in the first Reduction stage, day 0
		expect(todayPuffTarget(d, "2026-10-08")).toBe(60);
		expect(todayPuffTarget(d, "2026-10-14")).toBe(50);
	});

	it("is null once the plan is complete", () => {
		let d = withPlan();
		for (let i = 0; i < d.plan.stages.length; i++) d = advanceStage(d, "2026-12-01");
		expect(todayPuffTarget(d, "2026-12-02")).toBeNull();
	});
});

describe("advanceStage", () => {
	it("moves to the next, weaker stage", () => {
		const d = advanceStage(withPlan(), "2026-10-08");
		expect(d.plan.currentIndex).toBe(1);
		expect(d.plan.stages[d.plan.currentIndex].strength).toBe(18);
		expect(d.plan.stageStartedAt).toBe("2026-10-08");
	});

	it("keeps an existing puff baseline", () => {
		const d = withPlan({
			baselinePuffs: 50,
			logs: { "2026-10-01": { date: "2026-10-01", strength: 20, puffs: 90 } },
		});
		expect(advanceStage(d, "2026-10-08").baselinePuffs).toBe(50);
	});

	it("uses what was logged as the baseline for someone switching from cigarettes", () => {
		const logs = {
			"2026-10-01": { date: "2026-10-01", strength: 18, puffs: 40 },
			"2026-10-02": { date: "2026-10-02", strength: 18, puffs: 60 },
			"2026-10-03": { date: "2026-10-03", strength: 18, puffs: 0 },
		};
		const d = advanceStage(withPlan({ baselinePuffs: 0, logs }), "2026-10-08");
		expect(d.baselinePuffs).toBe(50);
	});

	it("leaves the baseline at 0 when nothing was logged", () => {
		expect(advanceStage(withPlan({ baselinePuffs: 0, logs: {} }), "2026-10-08").baselinePuffs).toBe(0);
	});

	it("does nothing once the plan is complete", () => {
		let d = withPlan();
		for (let i = 0; i < d.plan.stages.length; i++) d = advanceStage(d, "2026-12-01");
		expect(advanceStage(d, "2026-12-02")).toBe(d);
	});
});

describe("startingData", () => {
	const stages = generateStages(20, 7);
	const fresh = startingData("2026-10-04", { product: "Vape", baselinePuffs: 50, stages });

	it("starts with nothing logged, so today's puffs read 0 and climb as you log", () => {
		expect(fresh.logs).toEqual({});
		expect(fresh.setup).toBe(true);
		expect(fresh.baselinePuffs).toBe(50);
		expect(fresh.plan.currentIndex).toBe(0);
		expect(fresh.plan.stageStartedAt).toBe("2026-10-04");
	});

	it("counts puffs up from zero as they are logged", () => {
		const after = addPuffsToday(addPuffsToday(fresh, "2026-10-04", 1), "2026-10-04", 10);
		expect(after.logs["2026-10-04"].puffs).toBe(11);
		expect(after.logs["2026-10-04"].strength).toBe(20);
	});

	it("has no logging streak until something is logged", () => {
		expect(streak(fresh, "2026-10-04")).toBe(0);
		expect(streak(addPuffsToday(fresh, "2026-10-04", 1), "2026-10-04")).toBe(1);
	});
});
