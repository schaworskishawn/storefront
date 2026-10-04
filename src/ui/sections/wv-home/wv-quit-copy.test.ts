import { describe, expect, it } from "vitest";
import { STAGE_TEXT, TIPS_BY_STAGE, puffRange, puffStatus, stageTitle } from "./wv-quit-copy";
import { generateStages } from "./wv-quit-model";

describe("stageTitle", () => {
	const [baseline, firstDrop, , , , , , , , , last] = generateStages(20, 7);

	it("names each kind of step in plain words", () => {
		expect(stageTitle(baseline)).toBe("Get started: track your normal use");
		expect(stageTitle(firstDrop)).toBe("Step down to 18 mg");
		expect(stageTitle(last)).toBe("Final step: ease off puffs at 0 mg");
		expect(stageTitle({ name: "Stabilize", strength: 14, days: 7 })).toBe("Hold steady at 14 mg");
	});

	it("falls back to the stage's own name", () => {
		expect(stageTitle({ name: "Custom", strength: 5, days: 3 })).toBe("Custom");
	});
});

describe("every stage the plan makes has copy", () => {
	for (const start of [3, 12, 20]) {
		it(`for a plan starting at ${start} mg`, () => {
			for (const st of generateStages(start, 7)) {
				expect(STAGE_TEXT[st.name], st.name).toBeTruthy();
				expect(TIPS_BY_STAGE[st.name]?.length, st.name).toBeGreaterThan(0);
			}
		});
	}
});

describe("puffRange", () => {
	const [baseline, reduction] = generateStages(20, 7);

	it("shows the range a step moves through", () => {
		expect(puffRange(reduction, 190)).toBe(" · 228 → 190 puffs/day");
	});

	it("shows a single number when it does not move", () => {
		expect(puffRange(baseline, 190)).toBe(" · 190 puffs/day");
	});

	it("shows nothing without a baseline", () => {
		expect(puffRange(reduction, 0)).toBe("");
	});
});

describe("puffStatus", () => {
	it("says how many puffs are left while under the target", () => {
		expect(puffStatus(100, 228)).toMatchObject({ tone: "ok", pct: 44, text: "128 puffs left today." });
		expect(puffStatus(227, 228).text).toBe("1 puff left today.");
	});

	it("warns gently when close to the target", () => {
		expect(puffStatus(190, 228).tone).toBe("near");
		expect(puffStatus(228, 228)).toMatchObject({
			tone: "near",
			pct: 100,
			text: "You're right at your target.",
		});
	});

	it("is kind about going over, and keeps the meter full", () => {
		const over = puffStatus(240, 228);
		expect(over.tone).toBe("over");
		expect(over.pct).toBe(100);
		expect(over.text).toContain("12 over");
		expect(over.text).not.toMatch(/fail|bad|wrong/i);
	});

	it("handles a target of zero (the end of the final taper)", () => {
		expect(puffStatus(0, 0).tone).toBe("ok");
		expect(puffStatus(3, 0).tone).toBe("over");
	});

	it("has nothing to compare with when there is no target yet", () => {
		expect(puffStatus(40, null)).toMatchObject({ tone: "none", pct: 0 });
	});

	it("never fills past 100%", () => {
		expect(puffStatus(9999, 50).pct).toBe(100);
	});
});
