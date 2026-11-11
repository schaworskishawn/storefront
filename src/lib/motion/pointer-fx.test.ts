import { describe, expect, it } from "vitest";
import {
	MAGNET_SIZE,
	follow,
	hasArrived,
	isMagneticTarget,
	magnetOffset,
	type MagnetFacts,
} from "./pointer-fx";

const button = (overrides: Partial<MagnetFacts> = {}): MagnetFacts => ({
	tag: "A",
	width: 185,
	height: 46,
	radius: 12,
	bgAlpha: 1,
	borderWidth: 1,
	borderAlpha: 1,
	disabled: false,
	hasText: true,
	excluded: false,
	...overrides,
});

describe("follow", () => {
	it("moves a share of the way toward the target", () => {
		expect(follow({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.25)).toEqual({ x: 25, y: 12.5 });
	});

	it("reaches the target with an ease of 1 and stays put with 0", () => {
		expect(follow({ x: 10, y: 10 }, { x: 40, y: 80 }, 1)).toEqual({ x: 40, y: 80 });
		expect(follow({ x: 10, y: 10 }, { x: 40, y: 80 }, 0)).toEqual({ x: 10, y: 10 });
	});

	it("gets arbitrarily close but the loop can rest once it is within a fifth of a pixel", () => {
		let at = { x: 0, y: 0 };
		const target = { x: 300, y: 200 };
		let frames = 0;
		while (!hasArrived(at, target) && frames < 500) {
			at = follow(at, target, 0.09);
			frames += 1;
		}
		expect(frames).toBeLessThan(150);
		expect(hasArrived(at, target)).toBe(true);
	});
});

describe("hasArrived", () => {
	it("is true only when both directions are within a fifth of a pixel", () => {
		expect(hasArrived({ x: 10, y: 10 }, { x: 10.1, y: 9.9 })).toBe(true);
		expect(hasArrived({ x: 10, y: 10 }, { x: 10.5, y: 10 })).toBe(false);
		expect(hasArrived({ x: 10, y: 10 }, { x: 10, y: 11 })).toBe(false);
	});
});

describe("isMagneticTarget", () => {
	it("accepts a filled button and an outlined one", () => {
		expect(isMagneticTarget(button())).toBe(true);
		expect(isMagneticTarget(button({ tag: "BUTTON", bgAlpha: 0 }))).toBe(true);
		expect(isMagneticTarget(button({ borderWidth: 0 }))).toBe(true);
	});

	it("counts a 1px border the browser reports thinner on a scaled display", () => {
		expect(isMagneticTarget(button({ bgAlpha: 0, borderWidth: 0.8 }))).toBe(true);
	});

	it("needs a surface: a bare text link is not a button", () => {
		expect(isMagneticTarget(button({ bgAlpha: 0, borderWidth: 0 }))).toBe(false);
		expect(isMagneticTarget(button({ bgAlpha: 0.2, borderWidth: 0 }))).toBe(false);
	});

	it("needs rounded corners, a label, and to be enabled and not excluded", () => {
		expect(isMagneticTarget(button({ radius: 2 }))).toBe(false);
		expect(isMagneticTarget(button({ hasText: false }))).toBe(false);
		expect(isMagneticTarget(button({ disabled: true }))).toBe(false);
		expect(isMagneticTarget(button({ excluded: true }))).toBe(false);
	});

	it("only takes links and buttons", () => {
		expect(isMagneticTarget(button({ tag: "DIV" }))).toBe(false);
		expect(isMagneticTarget(button({ tag: "INPUT" }))).toBe(false);
		expect(isMagneticTarget(button({ tag: "SPAN" }))).toBe(false);
	});

	it("skips icon buttons (too small) and cards (too big), by both width and height", () => {
		expect(isMagneticTarget(button({ width: 32, height: 32 }))).toBe(false);
		expect(isMagneticTarget(button({ width: MAGNET_SIZE.minWidth - 1 }))).toBe(false);
		expect(isMagneticTarget(button({ width: MAGNET_SIZE.maxWidth + 1 }))).toBe(false);
		expect(isMagneticTarget(button({ height: MAGNET_SIZE.minHeight - 1 }))).toBe(false);
		expect(isMagneticTarget(button({ height: MAGNET_SIZE.maxHeight + 1 }))).toBe(false);
	});

	it("takes the site's real buttons: the tallest (49px) yes, a 54px card-sized link no", () => {
		expect(isMagneticTarget(button({ width: 300, height: 49 }))).toBe(true);
		expect(isMagneticTarget(button({ width: 300, height: 54 }))).toBe(false);
	});
});

describe("magnetOffset", () => {
	const rect = { left: 100, top: 200, width: 200, height: 40 };

	it("is zero with the pointer in the middle", () => {
		expect(magnetOffset(rect, 200, 220)).toEqual({ x: 0, y: 0 });
	});

	it("runs from -1 at the left and top edges to 1 at the right and bottom edges", () => {
		expect(magnetOffset(rect, 100, 200)).toEqual({ x: -1, y: -1 });
		expect(magnetOffset(rect, 300, 240)).toEqual({ x: 1, y: 1 });
		expect(magnetOffset(rect, 250, 220)).toEqual({ x: 0.5, y: 0 });
	});

	it("stays within -1 and 1 even with the pointer well outside the button", () => {
		expect(magnetOffset(rect, 5000, -5000)).toEqual({ x: 1, y: -1 });
	});

	it("copes with an empty box", () => {
		expect(magnetOffset({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({ x: 0, y: 0 });
	});
});
