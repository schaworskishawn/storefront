import { describe, expect, it } from "vitest";
import { isRevealable, planReveal, staggerDelay, STAGGER_MAX_STEPS, STAGGER_STEP_MS } from "./reveal-plan";

describe("planReveal", () => {
	const vh = 800;

	it("hides and reveals on scroll anything below the screen, whatever the mode", () => {
		for (const mode of ["initial", "navigation", "idle"] as const) {
			expect(planReveal({ top: 900, bottom: 1400 }, vh, mode)).toBe("scroll");
		}
	});

	it("treats a block whose top is exactly at the bottom edge as below the screen", () => {
		expect(planReveal({ top: 800, bottom: 900 }, vh, "initial")).toBe("scroll");
	});

	it("leaves on-screen blocks alone on first load and later additions: they are already painted", () => {
		expect(planReveal({ top: 100, bottom: 500 }, vh, "initial")).toBe("skip");
		expect(planReveal({ top: 100, bottom: 500 }, vh, "idle")).toBe("skip");
	});

	it("plays an entrance for on-screen blocks right after a navigation", () => {
		expect(planReveal({ top: 100, bottom: 500 }, vh, "navigation")).toBe("enter");
		expect(planReveal({ top: -200, bottom: 300 }, vh, "navigation")).toBe("enter");
	});

	it("skips blocks already scrolled past", () => {
		expect(planReveal({ top: -600, bottom: -10 }, vh, "navigation")).toBe("skip");
		expect(planReveal({ top: -600, bottom: 0 }, vh, "navigation")).toBe("skip");
	});
});

describe("isRevealable", () => {
	it("accepts ordinary blocks", () => {
		expect(isRevealable({ position: "static", display: "block" }, 300)).toBe(true);
		expect(isRevealable({ position: "relative", display: "flex" }, 300)).toBe(true);
	});

	it("rejects backdrops, bars and overlays that are taken out of the flow", () => {
		for (const position of ["absolute", "fixed", "sticky"]) {
			expect(isRevealable({ position, display: "block" }, 300)).toBe(false);
		}
	});

	it("rejects hidden and wrapper-only elements", () => {
		expect(isRevealable({ position: "static", display: "none" }, 300)).toBe(false);
		expect(isRevealable({ position: "static", display: "contents" }, 300)).toBe(false);
	});

	it("rejects hairlines and empty elements", () => {
		expect(isRevealable({ position: "static", display: "block" }, 1)).toBe(false);
		expect(isRevealable({ position: "static", display: "block" }, 0)).toBe(false);
	});
});

describe("staggerDelay", () => {
	it("starts at zero and steps up", () => {
		expect(staggerDelay(0)).toBe(0);
		expect(staggerDelay(1)).toBe(STAGGER_STEP_MS);
		expect(staggerDelay(3)).toBe(3 * STAGGER_STEP_MS);
	});

	it("stops growing so a long grid never waits more than a fraction of a second", () => {
		expect(staggerDelay(STAGGER_MAX_STEPS)).toBe(STAGGER_MAX_STEPS * STAGGER_STEP_MS);
		expect(staggerDelay(40)).toBe(STAGGER_MAX_STEPS * STAGGER_STEP_MS);
	});

	it("ignores nonsense indexes", () => {
		expect(staggerDelay(-3)).toBe(0);
		expect(staggerDelay(1.9)).toBe(STAGGER_STEP_MS);
	});
});
