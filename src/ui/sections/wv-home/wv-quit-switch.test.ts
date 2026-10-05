import { describe, expect, it } from "vitest";
import { DEFAULT_SWITCH_STRENGTH, SWITCH_BANDS } from "./wv-quit-switch";
import { MAX_STRENGTH, STRENGTHS, generateStages } from "./wv-quit-model";

describe("switching from cigarettes", () => {
	it("suggests a higher strength the more someone smokes", () => {
		const strengths = SWITCH_BANDS.map((b) => b.strength);
		expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
		expect(new Set(strengths).size).toBe(strengths.length);
	});

	it("only suggests strengths the wizard also offers vapers", () => {
		for (const b of SWITCH_BANDS) expect(STRENGTHS).toContain(b.strength);
	});

	it("never offers or suggests more than the strongest e-liquid we sell (20 mg/mL)", () => {
		expect(MAX_STRENGTH).toBe(20);
		for (const v of STRENGTHS) expect(v).toBeLessThanOrEqual(MAX_STRENGTH);
		for (const b of SWITCH_BANDS) expect(b.strength).toBeLessThanOrEqual(MAX_STRENGTH);
		expect(DEFAULT_SWITCH_STRENGTH).toBeLessThanOrEqual(MAX_STRENGTH);
	});

	it("starts a pack-a-day smoker on the default strength", () => {
		const pack = SWITCH_BANDS.find((b) => b.id === "11-20");
		expect(pack?.strength).toBe(DEFAULT_SWITCH_STRENGTH);
	});

	it("starts the heaviest smokers on the strongest strength", () => {
		expect(SWITCH_BANDS.at(-1)?.strength).toBe(MAX_STRENGTH);
	});

	it("gives every suggestion a plan that steps down to a lower strength", () => {
		for (const b of SWITCH_BANDS) {
			const levels = generateStages(b.strength, 7).map((s) => s.strength);
			expect(levels[0]).toBe(b.strength);
			expect(levels.at(-1)).toBeLessThan(b.strength);
		}
	});
});
