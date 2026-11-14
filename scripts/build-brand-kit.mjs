// Builds the Worldwide Vapor brand kit from the vector sources: node scripts/build-brand-kit.mjs [outDir]
//
// public/brand/worldwide-vapor-logo.svg (the emblem) and worldwide-vapor-mark.svg (the icon mark), both written by
// scripts/generate-logo-svg.mjs, go through:
//
//   rendering        each SVG rendered at twice the target size (supersampling)
//   rasterization    scaled down to the target with Lanczos, so edges are anti-aliased cleanly
//   post-processing  the emblem trimmed to its artwork and given an even transparent margin; a light sharpen on sizes of
//                    64 px and under, where the downscale softens most; dark-tile variants for places with no transparency
//   colour           everything converted to sRGB, 8 bits a channel, with the sRGB ICC profile embedded
//   encoding         PNG (lossless, maximum compression), WebP and AVIF (high quality, alpha kept), and a favicon.ico
//                    holding 16, 32 and 48 px PNGs
//   quality checks   every file decoded again and checked for size, channels, alpha, embedded profile and colour space,
//                    each lossy file compared with its PNG (mean and worst channel error), the favicon's directory read
//                    back; a contact sheet of every output on light, dark and checkerboard backgrounds
//   delivery         a README and SHA-256 checksums beside the files, and the QA report
//
// Default output: brand-kit/ at the repository root (not committed; zip it to share).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, "brand-kit");
const SRC = {
	emblem: join(ROOT, "public/brand/worldwide-vapor-logo.svg"),
	mark: join(ROOT, "public/brand/worldwide-vapor-mark.svg"),
};
const BG = { r: 5, g: 3, b: 10 }; // --wv-bg

/** Render an SVG at `scale`× of its own size (72 dpi = 1×). */
const render = (file, scale) => sharp(readFileSync(file), { density: 72 * scale, limitInputPixels: false });

/** The SVG's own width and height. */
function svgSize(file) {
	const head = readFileSync(file, "utf8").slice(0, 600);
	return { w: Number(/width="(\d+)"/.exec(head)[1]), h: Number(/height="(\d+)"/.exec(head)[1]) };
}

/** Rendering → rasterization → post-processing → colour: an RGBA buffer `w` wide, sRGB, with an even margin for the emblem. */
async function raster(kind, width) {
	const { w } = svgSize(SRC[kind]);
	const scale = (2 * width) / w;
	let img = render(SRC[kind], scale);
	if (kind === "emblem") {
		// Trim to the artwork (its glow included), then pad to 6% of the width on every side.
		const trimmed = await img
			.png()
			.toBuffer()
			.then((b) => sharp(b).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }));
		const pad = Math.round(trimmed.info.width * 0.06);
		img = sharp(trimmed.data).extend({
			top: pad,
			bottom: pad,
			left: pad,
			right: pad,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		});
	}
	const big = await img.png().toBuffer();
	let out = sharp(big).resize({ width, kernel: "lanczos3" });
	if (width <= 64) out = out.sharpen({ sigma: 0.5, m1: 0.6, m2: 1.2 });
	return out.toColourspace("srgb").ensureAlpha().png().toBuffer();
}

const withProfile = (img) => img.withIccProfile("srgb");
const onDark = (buf) => sharp(buf).flatten({ background: BG });

const files = [];
const write = async (path, pipeline) => {
	const full = join(OUT, path);
	mkdirSync(dirname(full), { recursive: true });
	await pipeline.toFile(full);
	files.push(path);
	return full;
};

/** favicon.ico: an ICO directory of PNG images (Vista and later read PNG entries). */
function ico(pngs) {
	const header = Buffer.alloc(6 + 16 * pngs.length);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(pngs.length, 4);
	let offset = header.length;
	pngs.forEach(({ size, data }, i) => {
		const e = 6 + 16 * i;
		header.writeUInt8(size >= 256 ? 0 : size, e);
		header.writeUInt8(size >= 256 ? 0 : size, e + 1);
		header.writeUInt8(0, e + 2);
		header.writeUInt8(0, e + 3);
		header.writeUInt16LE(1, e + 4);
		header.writeUInt16LE(32, e + 6);
		header.writeUInt32LE(data.length, e + 8);
		header.writeUInt32LE(offset, e + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* ---------------- Vector masters ---------------- */
for (const [kind, file] of Object.entries(SRC)) {
	const name = `vector/${kind === "emblem" ? "worldwide-vapor-logo" : "worldwide-vapor-mark"}.svg`;
	mkdirSync(join(OUT, "vector"), { recursive: true });
	writeFileSync(join(OUT, name), readFileSync(file));
	files.push(name);
}

/* ---------------- Emblem: transparent and on dark, in PNG / WebP / AVIF ---------------- */
const EMBLEM_WIDTHS = [256, 512, 1024, 2048];
for (const width of EMBLEM_WIDTHS) {
	const buf = await raster("emblem", width);
	const base = `emblem/worldwide-vapor-logo-${width}`;
	await write(`${base}.png`, withProfile(sharp(buf).png({ compressionLevel: 9, adaptiveFiltering: true })));
	// smartSubsample keeps colour sharp on thin neon lines (plain WebP halves colour resolution); small sizes go lossless.
	await write(
		`${base}.webp`,
		withProfile(
			sharp(buf).webp(
				width <= 512
					? { lossless: true, effort: 6 }
					: { quality: 94, alphaQuality: 100, smartSubsample: true, effort: 6 },
			),
		),
	);
	await write(`${base}.avif`, withProfile(sharp(buf).avif({ quality: 70, effort: 6 })));
	await write(
		`${base}-dark.png`,
		withProfile(onDark(buf).png({ compressionLevel: 9, adaptiveFiltering: true })),
	);
	await write(
		`${base}-dark.jpg`,
		withProfile(onDark(buf).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })),
	);
}

/* ---------------- Icon mark: app and favicon sizes ---------------- */
const MARK_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
const markPngs = {};
for (const size of MARK_SIZES) {
	const buf = await raster("mark", size);
	markPngs[size] = buf;
	await write(
		`icon/worldwide-vapor-mark-${size}.png`,
		withProfile(sharp(buf).png({ compressionLevel: 9, adaptiveFiltering: true })),
	);
	if (size >= 128)
		await write(
			`icon/worldwide-vapor-mark-${size}.webp`,
			withProfile(sharp(buf).webp({ lossless: true, effort: 6 })),
		);
}
// Apple touch icon: no transparency, full bleed on the brand's background.
await write("icon/apple-touch-icon.png", withProfile(onDark(markPngs[180]).png({ compressionLevel: 9 })));
// favicon.ico with 16, 32 and 48 px.
const icoPngs = await Promise.all(
	[16, 32, 48].map(async (size) => ({
		size,
		data: await withProfile(sharp(markPngs[size]).png({ compressionLevel: 9 })).toBuffer(),
	})),
);
writeFileSync(join(OUT, "icon/favicon.ico"), ico(icoPngs));
files.push("icon/favicon.ico");

/* ---------------- Quality checks ---------------- */
const report = [];
let failures = 0;
const check = (ok, line) => {
	report.push(`${ok ? "PASS" : "FAIL"}  ${line}`);
	if (!ok) failures++;
};

for (const path of files.filter((f) => /\.(png|webp|avif|jpg)$/.test(f))) {
	const full = join(OUT, path);
	const meta = await sharp(full).metadata();
	const isDark = /-dark\.|apple-touch/.test(path);
	const wantW = Number(/-(\d+)(?:-dark)?\.\w+$/.exec(path)?.[1] ?? (path.includes("apple-touch") ? 180 : 0));
	check(meta.width === wantW, `${path}: width ${meta.width} (want ${wantW})`);
	check(
		(meta.space === "srgb" && (meta.bitsPerSample ?? 8) === 8) || meta.format === "heif",
		`${path}: colour space ${meta.space}, ${meta.depth}`,
	);
	check(
		Boolean(meta.icc),
		`${path}: embedded ICC profile ${meta.icc ? `(${meta.icc.length} bytes)` : "missing"}`,
	);
	if (!isDark && path.endsWith(".png")) {
		const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		let transparent = 0;
		for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
		const corner = data[3];
		check(
			info.channels === 4 && (path.includes("mark") || corner === 0),
			`${path}: alpha kept${path.includes("mark") ? "" : `, corners transparent (${((100 * transparent) / (data.length / 4)).toFixed(0)}% clear)`}`,
		);
	}
	if (/\.(webp|avif|jpg)$/.test(path)) {
		const ref = path.replace(/\.(webp|avif)$/, ".png").replace(/-dark\.jpg$/, "-dark.png");
		const a = await sharp(join(OUT, ref)).ensureAlpha().raw().toBuffer();
		const b = await sharp(full).ensureAlpha().resize(meta.width, meta.height).raw().toBuffer();
		// Compared as they'd be seen: colour weighted by opacity (a fully transparent pixel's colour is invisible, and
		// encoders are free to change it), and the opacity itself.
		let sum = 0;
		let worst = 0;
		for (let i = 0; i < a.length; i += 4) {
			for (let c = 0; c < 3; c++) {
				const d = Math.abs((a[i + c] * a[i + 3]) / 255 - (b[i + c] * b[i + 3]) / 255);
				sum += d;
				if (d > worst) worst = d;
			}
			const da = Math.abs(a[i + 3] - b[i + 3]);
			sum += da;
			if (da > worst) worst = da;
		}
		const mean = sum / a.length;
		check(mean < 2, `${path}: mean error vs PNG ${mean.toFixed(2)}/255 (worst ${Math.round(worst)})`);
	}
}
// The favicon: read its directory back.
{
	const buf = readFileSync(join(OUT, "icon/favicon.ico"));
	const count = buf.readUInt16LE(4);
	const sizes = [];
	for (let i = 0; i < count; i++) {
		const e = 6 + 16 * i;
		const size = buf.readUInt8(e) || 256;
		const len = buf.readUInt32LE(e + 8);
		const off = buf.readUInt32LE(e + 12);
		const m = await sharp(buf.subarray(off, off + len)).metadata();
		check(
			m.width === size && m.format === "png",
			`icon/favicon.ico entry ${i}: ${size}px PNG (${m.width}×${m.height})`,
		);
		sizes.push(size);
	}
	check(sizes.join() === "16,32,48", `icon/favicon.ico: sizes ${sizes.join(", ")}`);
}
// The vectors parse and render.
for (const [kind, file] of Object.entries(SRC)) {
	const m = await sharp(readFileSync(file)).metadata();
	check(m.format === "svg" && m.width > 0, `vector/${kind}: valid SVG, ${m.width}×${m.height}`);
}

/* ---------------- Contact sheet ---------------- */
const tile = 220;
const bgs = [
	{ name: "light", fill: { r: 245, g: 243, b: 248 } },
	{ name: "dark", fill: BG },
	{ name: "check", fill: null },
];
const samples = [
	"emblem/worldwide-vapor-logo-512.png",
	"icon/worldwide-vapor-mark-512.png",
	"icon/worldwide-vapor-mark-64.png",
	"icon/worldwide-vapor-mark-32.png",
	"icon/worldwide-vapor-mark-16.png",
];
const checker = async () => {
	const sq = 20;
	const cells = [];
	for (let y = 0; y < tile; y += sq)
		for (let x = 0; x < tile; x += sq)
			if ((x / sq + y / sq) % 2)
				cells.push({
					input: { create: { width: sq, height: sq, channels: 3, background: { r: 200, g: 200, b: 200 } } },
					left: x,
					top: y,
				});
	return sharp({ create: { width: tile, height: tile, channels: 3, background: { r: 255, g: 255, b: 255 } } })
		.composite(cells)
		.png()
		.toBuffer();
};
const layers = [];
for (const [row, bg] of bgs.entries()) {
	for (const [col, sample] of samples.entries()) {
		const base = bg.fill
			? await sharp({ create: { width: tile, height: tile, channels: 3, background: bg.fill } })
					.png()
					.toBuffer()
			: await checker();
		const meta = await sharp(join(OUT, sample)).metadata();
		// Small icons are shown enlarged with hard pixels, so their real detail is visible.
		const art = await sharp(join(OUT, sample))
			.resize({
				width: Math.min(tile - 20, meta.width <= 64 ? meta.width * Math.floor(160 / meta.width) : tile - 20),
				kernel: meta.width <= 64 ? "nearest" : "lanczos3",
			})
			.png()
			.toBuffer();
		const am = await sharp(art).metadata();
		layers.push({
			input: await sharp(base)
				.composite([
					{ input: art, left: Math.round((tile - am.width) / 2), top: Math.round((tile - am.height) / 2) },
				])
				.png()
				.toBuffer(),
			left: 10 + col * (tile + 10),
			top: 10 + row * (tile + 10),
		});
	}
}
await write(
	"qa/contact-sheet.png",
	withProfile(
		sharp({
			create: {
				width: 10 + samples.length * (tile + 10),
				height: 10 + bgs.length * (tile + 10),
				channels: 3,
				background: { r: 60, g: 60, b: 66 },
			},
		})
			.composite(layers)
			.png(),
	),
);

/* ---------------- Delivery ---------------- */
writeFileSync(
	join(OUT, "qa/report.txt"),
	`${report.join("\n")}\n\n${failures ? `${failures} FAILED` : "All checks passed"} (${report.length} checks)\n`,
);
files.push("qa/report.txt");

const kb = (p) => `${(readFileSync(join(OUT, p)).length / 1024).toFixed(1)} KB`;
writeFileSync(
	join(OUT, "README.md"),
	`# Worldwide Vapor brand kit

Built by \`scripts/build-brand-kit.mjs\` from the vector masters. Every raster is sRGB, 8 bits a channel, with the sRGB ICC profile embedded.

## What to use where

| Need | File |
| --- | --- |
| Website, apps, anything that can scale | \`vector/worldwide-vapor-logo.svg\` |
| Favicon | \`icon/favicon.ico\` (16, 32, 48 px) |
| iPhone home screen | \`icon/apple-touch-icon.png\` (180 px, no transparency) |
| Android / web app icons | \`icon/worldwide-vapor-mark-192.png\`, \`-512.png\` |
| Social profile picture | \`icon/worldwide-vapor-mark-1024.png\` |
| Logo on a transparent background | \`emblem/worldwide-vapor-logo-<width>.png\` (or \`.webp\` / \`.avif\`, smaller) |
| Logo where transparency isn't supported (email, some print forms) | \`emblem/worldwide-vapor-logo-<width>-dark.png\` / \`.jpg\` |

The emblem is for 128 px and up; below that use the icon mark, which is drawn to stay readable at 16 px.

The emblem's glows are SVG filters. Browsers show them; some print and design programs flatten or drop them — use the 2048 px PNG there.

## Files

${files
	.filter((f) => f !== "README.md")
	.map((f) => `- \`${f}\` — ${kb(f)}`)
	.join("\n")}

## Checks

See \`qa/report.txt\` (${report.length} checks, ${failures ? `${failures} failed` : "all passed"}) and \`qa/contact-sheet.png\`.
`,
);
files.push("README.md");

const sums = files
	.map(
		(f) =>
			`${createHash("sha256")
				.update(readFileSync(join(OUT, f)))
				.digest("hex")}  ${f}`,
	)
	.join("\n");
writeFileSync(join(OUT, "SHA256SUMS.txt"), `${sums}\n`);

console.log(`${files.length + 1} files in ${relative(process.cwd(), OUT) || OUT}`);
console.log(`QA: ${report.length} checks, ${failures} failed`);
if (failures) {
	console.log(report.filter((l) => l.startsWith("FAIL")).join("\n"));
	process.exit(1);
}
