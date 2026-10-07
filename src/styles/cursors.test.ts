import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The cursor rules and the files they point at are written by hand in two places (src/styles/cursors.css and
// scripts/generate-cursors.mjs), so these checks keep them from drifting apart.
const css = readFileSync("src/styles/cursors.css", "utf8");
const uses = [...css.matchAll(/url\("\/cursors\/([a-z0-9-]+\.svg)"\)\s+(\d+)\s+(\d+)/g)].map((m) => ({
	file: m[1],
	x: Number(m[2]),
	y: Number(m[3]),
}));

describe("cursors", () => {
	it("uses the cursor files and nothing else", () => {
		expect(uses.length).toBeGreaterThan(0);
		expect(new Set(uses.map((u) => u.file))).toEqual(
			new Set([
				"default.svg",
				"pointer.svg",
				"disabled.svg",
				"grab.svg",
				"grabbing.svg",
				...Array.from({ length: 8 }, (_, i) => `loading-${i}.svg`),
			]),
		);
	});

	it("only points at files that exist", () => {
		for (const { file } of uses) expect(existsSync(`public/cursors/${file}`), file).toBe(true);
	});

	it("gives each file the same hotspot every time it is used", () => {
		const seen = new Map<string, string>();
		for (const { file, x, y } of uses) {
			const spot = `${x},${y}`;
			expect(seen.get(file) ?? spot, file).toBe(spot);
			seen.set(file, spot);
		}
	});

	it("keeps every hotspot inside the 32 x 32 image", () => {
		for (const { file, x, y } of uses) {
			expect(x, file).toBeGreaterThanOrEqual(0);
			expect(y, file).toBeGreaterThanOrEqual(0);
			expect(x, file).toBeLessThan(32);
			expect(y, file).toBeLessThan(32);
		}
	});

	it("draws every file at 32 x 32 with explicit dimensions (Safari needs them to size a cursor)", () => {
		for (const { file } of uses) {
			const svg = readFileSync(`public/cursors/${file}`, "utf8");
			expect(svg, file).toContain('width="32"');
			expect(svg, file).toContain('height="32"');
			expect(svg, file).toContain('viewBox="0 0 32 32"');
		}
	});

	it("ends every custom cursor in a standard keyword, so a browser that can't load the image still gets one", () => {
		for (const declaration of css.match(/cursor:[^;]*url\([^;]*;/g) ?? []) {
			expect(declaration).toMatch(
				/,\s*(auto|default|pointer|not-allowed|grab|grabbing|progress)(\s*!important)?;/,
			);
		}
	});

	it("only applies to a real mouse, and leaves forced-colours users their system cursor", () => {
		expect(css).toContain("@media (hover: hover) and (pointer: fine) and (forced-colors: none)");
	});
});
