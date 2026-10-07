import { describe, expect, it } from "vitest";
import { colorAlpha, holoMode, holoPointer, HOLO_MAX_TILT_DEG, type PanelFacts } from "./holo";

const card = (overrides: Partial<PanelFacts> = {}): PanelFacts => ({
	tag: "ARTICLE",
	width: 300,
	height: 380,
	radius: 13,
	borderWidth: 1,
	borderAlpha: 1,
	hasShadow: false,
	bgAlpha: 1,
	hasFields: false,
	excluded: false,
	...overrides,
});

describe("colorAlpha", () => {
	it("reads the alpha in each form a browser reports", () => {
		expect(colorAlpha("rgb(20, 16, 32)")).toBe(1);
		expect(colorAlpha("rgba(20, 16, 32, 0.4)")).toBe(0.4);
		expect(colorAlpha("rgb(20 16 32 / 0.25)")).toBe(0.25);
		expect(colorAlpha("color(srgb 0 0.9 1 / 0.1)")).toBe(0.1);
		expect(colorAlpha("oklch(0.844 0.146 209.3 / 40%)")).toBe(0.4);
	});

	it("treats transparent as none and a colour with no alpha as solid", () => {
		expect(colorAlpha("transparent")).toBe(0);
		expect(colorAlpha("")).toBe(0);
		expect(colorAlpha("rgba(0, 0, 0, 0)")).toBe(0);
		expect(colorAlpha("oklch(0.12 0 0)")).toBe(1);
	});

	it("stays between 0 and 1", () => {
		expect(colorAlpha("rgba(0, 0, 0, 3)")).toBe(1);
	});
});

describe("holoMode", () => {
	it("gives a card the effect, with the tilt", () => {
		expect(holoMode(card())).toEqual({ tilt: true });
	});

	it("accepts a shadow instead of a border as the edge", () => {
		expect(holoMode(card({ borderWidth: 0, hasShadow: true }))).toEqual({ tilt: true });
	});

	it("counts a 1px border that the browser reports thinner on a scaled display or a zoomed page", () => {
		expect(holoMode(card({ borderWidth: 0.8 }))).toEqual({ tilt: true });
		expect(holoMode(card({ borderWidth: 0.67 }))).toEqual({ tilt: true });
		expect(holoMode(card({ borderWidth: 0.4 }))).toBeNull();
	});

	it("needs a rounded, bordered or shadowed, solid-filled surface", () => {
		expect(holoMode(card({ radius: 4 }))).toBeNull();
		expect(holoMode(card({ borderWidth: 0 }))).toBeNull();
		expect(holoMode(card({ borderAlpha: 0.1 }))).toBeNull();
		expect(holoMode(card({ bgAlpha: 0.2 }))).toBeNull();
	});

	it("skips chips, badges and icon boxes, and pills and circles of any size", () => {
		expect(holoMode(card({ width: 40, height: 40 }))).toBeNull();
		expect(holoMode(card({ width: 120, height: 90 }))).toBeNull();
		expect(holoMode(card({ width: 300, height: 48 }))).toBeNull();
		expect(holoMode(card({ width: 200, height: 80, radius: 9999 }))).toBeNull();
		expect(holoMode(card({ width: 200, height: 200, radius: 100 }))).toBeNull();
	});

	it("keeps a collapsed accordion row (58px) but not the tallest button (49px)", () => {
		expect(holoMode(card({ tag: "DETAILS", width: 704, height: 58 }))).toEqual({ tilt: false });
		expect(holoMode(card({ tag: "A", width: 300, height: 49 }))).toBeNull();
		expect(holoMode(card({ tag: "BUTTON", width: 704, height: 49 }))).toBeNull();
	});

	it("skips the header, the footer and anything opted out", () => {
		expect(holoMode(card({ excluded: true }))).toBeNull();
	});

	it("skips tags that are never panels", () => {
		expect(holoMode(card({ tag: "SPAN" }))).toBeNull();
		expect(holoMode(card({ tag: "INPUT" }))).toBeNull();
		expect(holoMode(card({ tag: "SELECT" }))).toBeNull();
	});

	it("allows a link or button big enough to be a card", () => {
		expect(holoMode(card({ tag: "A" }))).toEqual({ tilt: true });
		expect(holoMode(card({ tag: "BUTTON" }))).toEqual({ tilt: true });
	});

	it("doesn't tilt wide or tall panels, panels with form fields, or accordions, but still gives them the effect", () => {
		expect(holoMode(card({ width: 860 }))).toEqual({ tilt: false });
		expect(holoMode(card({ height: 700 }))).toEqual({ tilt: false });
		expect(holoMode(card({ hasFields: true }))).toEqual({ tilt: false });
		expect(holoMode(card({ tag: "DETAILS", width: 400, height: 120 }))).toEqual({ tilt: false });
	});
});

describe("holoPointer", () => {
	const rect = { left: 100, top: 200, width: 300, height: 200 };

	it("puts the glare where the pointer is, in percent of the panel", () => {
		expect(holoPointer(rect, 250, 300)).toMatchObject({ x: 50, y: 50 });
		expect(holoPointer(rect, 100, 200)).toMatchObject({ x: 0, y: 0 });
		expect(holoPointer(rect, 400, 400)).toMatchObject({ x: 100, y: 100 });
	});

	it("doesn't tilt with the pointer in the middle", () => {
		expect(holoPointer(rect, 250, 300)).toEqual({ x: 50, y: 50, rx: 0, ry: 0 });
	});

	it("presses the part under the pointer away: right edge swings positive about the vertical axis, bottom edge negative about the horizontal", () => {
		const right = holoPointer(rect, 400, 300);
		expect(right.ry).toBe(HOLO_MAX_TILT_DEG);
		expect(right.rx).toBe(0);
		const bottom = holoPointer(rect, 250, 400);
		expect(bottom.rx).toBe(-HOLO_MAX_TILT_DEG);
		expect(bottom.ry).toBe(0);
		expect(holoPointer(rect, 100, 300).ry).toBe(-HOLO_MAX_TILT_DEG);
		expect(holoPointer(rect, 250, 200).rx).toBe(HOLO_MAX_TILT_DEG);
	});

	it("never tilts further than the maximum, even with the pointer outside the panel", () => {
		const far = holoPointer(rect, 5000, -5000);
		expect(far).toEqual({ x: 100, y: 0, rx: HOLO_MAX_TILT_DEG, ry: HOLO_MAX_TILT_DEG });
	});

	it("takes a different maximum", () => {
		expect(holoPointer(rect, 400, 300, 3).ry).toBe(3);
	});

	it("copes with an empty box", () => {
		expect(holoPointer({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({
			x: 50,
			y: 50,
			rx: 0,
			ry: 0,
		});
	});
});
