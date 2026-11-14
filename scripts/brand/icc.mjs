/**
 * A compact sRGB ICC profile, version 2.1, built from the standard's own numbers (under 1 KB).
 *
 * Why not libvips's built-in "srgb"? That one is ICC v4, and Firefox ignores v4 profiles by default
 * (gfx.color_management.enablev4), so it would treat the image as untagged and, on a wide-gamut screen, show the neon
 * over-saturated. Every colour-managed reader understands v2.
 *
 * The profile is a matrix/TRC display profile:
 *   colorants   the sRGB primaries (IEC 61966-2-1: R 0.64 0.33, G 0.30 0.60, B 0.15 0.06, white D65), adapted to the
 *               ICC's D50 connection space with Bradford, rounded so the three add up to D50 exactly
 *   tone curve  the sRGB curve as a 256-entry table, one entry per 8-bit code (exact for 8-bit images), shared by R, G, B
 *   white point D50 (the connection space's), so relative and absolute rendering agree
 */

const D50 = [0.9642, 1, 0.8249];

const mul = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const inv3 = (m) => {
	const [[a, b, c], [d, e, f], [g, h, i]] = m;
	const A = e * i - f * h;
	const B = -(d * i - f * g);
	const C = d * h - e * g;
	const det = a * A + b * B + c * C;
	return [
		[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
		[B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
		[C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
	];
};
const xyz = (x, y) => [x / y, 1, (1 - x - y) / y];

/** sRGB's RGB → XYZ matrix (columns: R, G, B), adapted from D65 to D50 with Bradford. */
export function srgbColorantsD50() {
	const primaries = [xyz(0.64, 0.33), xyz(0.3, 0.6), xyz(0.15, 0.06)];
	const P = [0, 1, 2].map((r) => primaries.map((p) => p[r])); // columns are the primaries
	const white = xyz(0.3127, 0.329);
	const S = mul(
		inv3(P),
		white.map((v) => [v]),
	).map(([v]) => v);
	const M = P.map((row) => row.map((v, j) => v * S[j]));
	const BRADFORD = [
		[0.8951, 0.2664, -0.1614],
		[-0.7502, 1.7135, 0.0367],
		[0.0389, -0.0685, 1.0296],
	];
	const cone = (v) =>
		mul(
			BRADFORD,
			v.map((x) => [x]),
		).map(([x]) => x);
	const [src, dst] = [cone(white), cone(D50)];
	const scale = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? dst[i] / src[i] : 0)));
	return mul(mul(mul(inv3(BRADFORD), scale), BRADFORD), M);
}

/** sRGB's tone curve: code value (0–1) to linear light. */
export const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const s15f16 = (v) => Math.round(v * 65536);

/** The profile's bytes. */
export function srgbV2Profile() {
	const parts = []; // [signature, bytes]
	const text = (sig, type, body) => {
		const b = Buffer.alloc(8 + body.length);
		b.write(type, 0, "latin1");
		body.copy(b, 8);
		parts.push([sig, b]);
	};
	// desc: textDescriptionType (ASCII, then empty Unicode and ScriptCode parts)
	const name = Buffer.from("sRGB IEC61966-2.1\0", "latin1");
	const desc = Buffer.alloc(4 + name.length + 4 + 4 + 2 + 1 + 67);
	desc.writeUInt32BE(name.length, 0);
	name.copy(desc, 4);
	text("desc", "desc", desc);
	text("cprt", "text", Buffer.from("No copyright, use freely\0", "latin1"));
	const xyzTag = (sig, [X, Y, Z]) => {
		const b = Buffer.alloc(12);
		b.writeInt32BE(X, 0);
		b.writeInt32BE(Y, 4);
		b.writeInt32BE(Z, 8);
		text(sig, "XYZ ", b);
	};
	const d50 = D50.map(s15f16);
	xyzTag("wtpt", d50);
	// colorants, rounded, then each row (X, Y, Z) nudged on its largest entry so the three add up to D50 exactly
	const m = srgbColorantsD50().map((row) => row.map(s15f16));
	for (let r = 0; r < 3; r++) {
		const off = d50[r] - m[r].reduce((s, v) => s + v, 0);
		const big = m[r].indexOf(Math.max(...m[r]));
		m[r][big] += off;
	}
	["rXYZ", "gXYZ", "bXYZ"].forEach((sig, c) => xyzTag(sig, [m[0][c], m[1][c], m[2][c]]));
	const curve = Buffer.alloc(4 + 256 * 2);
	curve.writeUInt32BE(256, 0);
	for (let i = 0; i < 256; i++) curve.writeUInt16BE(Math.round(srgbToLinear(i / 255) * 65535), 4 + 2 * i);
	text("rTRC", "curv", curve);

	// Lay out: header, tag table (gTRC and bTRC point at rTRC's data), tag data on 4-byte boundaries.
	const tags = [...parts.map(([sig]) => sig), "gTRC", "bTRC"];
	let offset = 128 + 4 + tags.length * 12;
	const placed = new Map();
	const chunks = [];
	for (const [sig, bytes] of parts) {
		placed.set(sig, [offset, bytes.length]);
		const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
		bytes.copy(padded);
		chunks.push(padded);
		offset += padded.length;
	}
	placed.set("gTRC", placed.get("rTRC"));
	placed.set("bTRC", placed.get("rTRC"));
	const size = offset;
	const head = Buffer.alloc(128 + 4 + tags.length * 12);
	head.writeUInt32BE(size, 0);
	head.writeUInt32BE(0x02100000, 8); // version 2.1
	head.write("mntr", 12, "latin1"); // display device
	head.write("RGB ", 16, "latin1");
	head.write("XYZ ", 20, "latin1");
	[2026, 11, 14, 0, 0, 0].forEach((v, i) => head.writeUInt16BE(v, 24 + 2 * i)); // fixed, so builds are repeatable
	head.write("acsp", 36, "latin1");
	head.writeUInt32BE(0, 64); // perceptual
	d50.forEach((v, i) => head.writeInt32BE(v, 68 + 4 * i)); // connection-space illuminant
	head.writeUInt32BE(tags.length, 128);
	tags.forEach((sig, i) => {
		const [o, len] = placed.get(sig);
		head.write(sig, 132 + 12 * i, "latin1");
		head.writeUInt32BE(o, 136 + 12 * i);
		head.writeUInt32BE(len, 140 + 12 * i);
	});
	return Buffer.concat([head, ...chunks]);
}
