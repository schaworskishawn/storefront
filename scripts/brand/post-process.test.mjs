import { describe, expect, it } from "vitest";
import {
	average2,
	cellMeans,
	darkHalos,
	deband,
	grain,
	meanDeltaE,
	quantize,
	random,
	reduce2,
	sharpen,
} from "./post-process.mjs";

/** A w × h RGB image whose every channel is `f(x, y)`. */
const image = (w, h, f, Type = Float32Array) => {
	const img = new Type(w * h * 3);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) img.fill(f(x, y), (y * w + x) * 3, (y * w + x) * 3 + 3);
	return img;
};
const at = (img, w, x, y) => img[(y * w + x) * 3];
const range = (img) => [Math.min(...img), Math.max(...img)];

describe("reduce2 (Lanczos3 halving, clamped)", () => {
	it("keeps a flat image flat", () => {
		const out = reduce2(
			image(16, 12, () => 77, Uint8Array),
			16,
			12,
		);
		expect(out).toHaveLength(8 * 6 * 3);
		for (const v of out) expect(v).toBeCloseTo(77, 4);
	});

	it("reproduces a smooth ramp", () => {
		const out = reduce2(
			image(64, 8, (x) => 40 + 2 * x, Uint8Array),
			64,
			8,
		);
		// output pixel x covers source pixels 2x and 2x + 1, so it should be their mean, 40 + 4x + 1
		for (let x = 4; x < 28; x++) expect(at(out, 32, x, 2)).toBeCloseTo(41 + 4 * x, 1);
	});

	it("draws no halo either side of a thin bright line on a dark ground", () => {
		// two source pixels wide, exactly under output pixel 16
		const src = image(64, 8, (x) => (x === 32 || x === 33 ? 250 : 10), Uint8Array);
		const out = reduce2(src, 64, 8);
		const [lo, hi] = range(out);
		expect(lo).toBeGreaterThanOrEqual(10); // plain Lanczos3 dips below the ground here
		expect(hi).toBeLessThanOrEqual(250);
		expect(at(out, 32, 16, 2)).toBeGreaterThan(200); // the line itself stays bright
		expect(darkHalos(quantize(out, 1), src, 32, 4, 2)).toBe(0);
	});
});

describe("deband", () => {
	it("turns an 8-bit staircase back into a smooth ramp", () => {
		// a gentle gradient, 10 levels over 400 px, cut into 40-px bands as 8 bits would
		const stairs = image(400, 4, (x) => 20 + Math.floor(x / 40));
		const out = deband(stairs, 400, 4, 24);
		let worstStep = 0;
		for (let x = 60; x < 340; x++)
			worstStep = Math.max(worstStep, Math.abs(at(out, 400, x + 1, 1) - at(out, 400, x, 1)));
		expect(worstStep).toBeLessThan(0.15); // was a jump of 1 level every 40 px
		expect(at(out, 400, 200, 1)).toBeCloseTo(at(stairs, 400, 200, 1), 0);
	});

	it("leaves an edge alone", () => {
		const edge = image(100, 4, (x) => (x < 50 ? 10 : 200));
		const out = deband(edge, 100, 4, 12);
		expect(at(out, 100, 49, 1)).toBe(10);
		expect(at(out, 100, 50, 1)).toBe(200);
	});
});

describe("sharpen", () => {
	it("leaves flat areas and gentle gradients alone", () => {
		const ramp = image(40, 40, (x) => 50 + x * 0.5);
		const out = sharpen(ramp, 40, 40);
		for (let i = 0; i < ramp.length; i++) expect(out[i]).toBeCloseTo(ramp[i], 4);
	});

	it("lifts an edge's bright side and darkens its dark side by no more than maxDark", () => {
		const edge = image(20, 4, (x) => (x < 10 ? 20 : 220));
		const out = sharpen(edge, 20, 4, { amount: 1, maxDark: 2 });
		expect(at(out, 20, 10, 1)).toBeGreaterThan(220);
		expect(Math.min(...out)).toBeGreaterThanOrEqual(18);
	});
});

describe("grain", () => {
	const grey = image(256, 256, () => 127.5);
	const stats = (img) => {
		let s = 0;
		let sq = 0;
		for (let i = 0; i < img.length; i += 3) {
			s += img[i] - 127.5;
			sq += (img[i] - 127.5) ** 2;
		}
		const n = img.length / 3;
		return { mean: s / n, spread: Math.sqrt(sq / n) };
	};

	it("adds no brightness on average, at the strength asked for, the same at every grain size", () => {
		for (const size of [1, 2, 3]) {
			const { mean, spread } = stats(grain(grey, 256, 256, { size, strength: 0.01, seed: 7 }));
			expect(Math.abs(mean)).toBeLessThan(0.1);
			expect(spread).toBeCloseTo(2 * 0.01 * 127.5, 0); // 2.55 levels
		}
	});

	it("is grey (the same in each channel), faint in the darks, and repeatable", () => {
		const img = image(64, 64, (x) => (x < 32 ? 8 : 127.5));
		const a = grain(img, 64, 64, { strength: 0.01, seed: 3 });
		const b = grain(img, 64, 64, { strength: 0.01, seed: 3 });
		expect(a).toEqual(b);
		expect(a[300]).toBe(a[301]);
		const dark = Math.abs(at(a, 64, 5, 5) - 8);
		expect(dark).toBeLessThan(0.1 * 8);
	});
});

describe("quantize", () => {
	it("dithers a value between two levels so its average survives", () => {
		const out = quantize(
			image(200, 200, () => 10.25),
			1,
		);
		const mean = out.reduce((a, b) => a + b, 0) / out.length;
		expect(mean).toBeCloseTo(10.25, 1);
		const [lo, hi] = range(out);
		expect(lo).toBeGreaterThanOrEqual(9);
		expect(hi).toBeLessThanOrEqual(12);
	});

	it("is repeatable and stays in 0–255", () => {
		const img = image(32, 32, (x) => x * 9 - 10);
		expect(quantize(img, 5)).toEqual(quantize(img, 5));
		const [lo, hi] = range(quantize(img, 5));
		expect(lo).toBe(0);
		expect(hi).toBe(255);
	});
});

describe("helpers", () => {
	it("random is repeatable for a seed", () => {
		const a = random(42);
		const b = random(42);
		for (let i = 0; i < 5; i++) expect(a()).toBe(b());
	});

	it("meanDeltaE is 0 for the same image and 100 from black to white", () => {
		const black = Buffer.alloc(4 * 3);
		const white = Buffer.alloc(4 * 3, 255);
		expect(meanDeltaE(black, black, 2, 2)).toBe(0);
		expect(meanDeltaE(black, white, 2, 2)).toBeCloseTo(100, 1);
	});

	it("average2 averages each 2 × 2 block", () => {
		const out = average2(
			image(4, 2, (x) => [0, 4, 10, 30][x], Uint8Array),
			4,
			2,
		);
		expect([...out]).toEqual([2, 2, 2, 20, 20, 20]);
	});

	it("cellMeans averages each cell", () => {
		const cells = cellMeans(
			image(4, 2, (x) => (x < 2 ? 10 : 30)),
			4,
			2,
			2,
			1,
		);
		expect(cells).toEqual([
			[10, 10, 10],
			[30, 30, 30],
		]);
	});
});
