import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { srgbColorantsD50, srgbV2Profile } from "./icc.mjs";

const profile = srgbV2Profile();
const tags = (p) => {
	const n = p.readUInt32BE(128);
	return Object.fromEntries(
		Array.from({ length: n }, (_, i) => [
			p.toString("latin1", 132 + 12 * i, 136 + 12 * i),
			[p.readUInt32BE(136 + 12 * i), p.readUInt32BE(140 + 12 * i)],
		]),
	);
};
const s15f16 = (p, at) => p.readInt32BE(at) / 65536;

describe("sRGB ICC v2 profile", () => {
	it("has a valid v2.1 display-profile header", () => {
		expect(profile.readUInt32BE(0)).toBe(profile.length);
		expect(profile.length).toBeLessThan(1024);
		expect(profile.readUInt32BE(8)).toBe(0x02100000);
		expect(profile.toString("latin1", 12, 24)).toBe("mntrRGB XYZ ");
		expect(profile.toString("latin1", 36, 40)).toBe("acsp");
		expect([68, 72, 76].map((o) => s15f16(profile, o))).toEqual([
			expect.closeTo(0.9642, 4),
			1,
			expect.closeTo(0.8249, 4),
		]);
	});

	it("has the matrix/TRC tags, aligned and in bounds", () => {
		const t = tags(profile);
		expect(Object.keys(t).sort()).toEqual(
			["bTRC", "bXYZ", "cprt", "desc", "gTRC", "gXYZ", "rTRC", "rXYZ", "wtpt"].sort(),
		);
		for (const [offset, size] of Object.values(t)) {
			expect(offset % 4).toBe(0);
			expect(offset + size).toBeLessThanOrEqual(profile.length);
		}
		const [descAt] = t.desc;
		expect(profile.toString("latin1", descAt + 12, descAt + 29)).toBe("sRGB IEC61966-2.1");
	});

	it("has the published sRGB colorants, adding up to D50", () => {
		const t = tags(profile);
		const col = (sig) => [0, 4, 8].map((o) => s15f16(profile, t[sig][0] + 8 + o));
		const [r, g, b] = ["rXYZ", "gXYZ", "bXYZ"].map(col);
		// the values in the classic sRGB IEC61966-2.1 profile
		[
			[r, [0.4361, 0.2225, 0.0139]],
			[g, [0.3851, 0.7169, 0.0971]],
			[b, [0.1431, 0.0606, 0.7141]],
		].forEach(([got, want]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 3)));
		const sum = [0, 1, 2].map((i) => r[i] + g[i] + b[i]);
		expect(sum[0]).toBeCloseTo(0.9642, 4);
		expect(sum[1]).toBeCloseTo(1, 4);
		expect(sum[2]).toBeCloseTo(0.8249, 4);
		expect(srgbColorantsD50()[1].reduce((a, v) => a + v, 0)).toBeCloseTo(1, 6);
	});

	it("has the sRGB tone curve, one entry per 8-bit code", () => {
		const [at] = tags(profile).rTRC;
		expect(profile.toString("latin1", at, at + 4)).toBe("curv");
		expect(profile.readUInt32BE(at + 8)).toBe(256);
		const v = (i) => profile.readUInt16BE(at + 12 + 2 * i) / 65535;
		expect(v(0)).toBe(0);
		expect(v(255)).toBe(1);
		expect(v(128)).toBeCloseTo(0.21586, 4);
		for (let i = 1; i < 256; i++) expect(v(i)).toBeGreaterThan(v(i - 1));
		expect(tags(profile).gTRC).toEqual(tags(profile).rTRC);
	});

	it("is sRGB to lcms: converting sRGB into it changes no colour", async () => {
		const dir = mkdtempSync(join(tmpdir(), "wv-icc-"));
		const path = join(dir, "srgb-v2.icc");
		writeFileSync(path, profile);
		// a wrong profile (red and green colorants swapped) must change colours, or the check proves nothing
		const broken = Buffer.from(profile);
		const t = tags(broken);
		profile.copy(broken, t.rXYZ[0], t.gXYZ[0], t.gXYZ[0] + 20);
		profile.copy(broken, t.gXYZ[0], t.rXYZ[0], t.rXYZ[0] + 20);
		const brokenPath = join(dir, "broken.icc");
		writeFileSync(brokenPath, broken);

		const w = 64;
		const raw = Buffer.alloc(w * w * 3);
		let s = 7;
		for (let i = 0; i < w * w; i++) {
			for (let c = 0; c < 3; c++) {
				s = (s * 1103515245 + 12345) & 0x7fffffff;
				raw[i * 3 + c] = i < 256 ? i : s & 255; // every grey, then random colours
			}
		}
		// Tagging converts the pixels from sRGB into the profile through lcms; if the profile is sRGB, nothing moves.
		const changed = async (icc) => {
			const png = await sharp(raw, { raw: { width: w, height: w, channels: 3 } })
				.withIccProfile(icc)
				.png()
				.toBuffer();
			expect((await sharp(png).metadata()).icc.length).toBeGreaterThan(0);
			const stored = await sharp(png).keepIccProfile().raw().toBuffer();
			return stored.reduce((n, v, i) => n + (v !== raw[i] ? 1 : 0), 0);
		};
		expect(await changed(path)).toBe(0);
		expect(await changed(brokenPath)).toBeGreaterThan(1000);
	});
});
