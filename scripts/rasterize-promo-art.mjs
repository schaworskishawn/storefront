// Rasterizes the promotional-bundles art to PNG and WebP: node scripts/rasterize-promo-art.mjs [outDir]
//
// The source is the site's own drawing, src/ui/sections/wv-home/wv-promo-art.tsx: it is compiled with TypeScript and
// rendered to SVG with react-dom/server, the brand tokens it uses (var(--wv-*)) are filled in from src/styles/brand.css,
// and its font (Bungee, src/fonts) is loaded through fontconfig. So the pixels are the drawing itself, not a copy of it.
//
// Each image is rendered at twice its size and halved (supersampling), so edges, hairlines and text are anti-aliased
// cleanly; the 4K canvas, already fine-grained, is rendered directly. Every image is opaque, on the site's background
// colour.
//
// Post-processing (scripts/brand/post-process.mjs) works in floating point from the render to a single rounding at the end:
//   retouching   the halving is Lanczos3 with each sample clamped to the source pixels under it, which keeps Lanczos's
//                sharpness without its ringing (dark and bright halos along every neon line, up to 35 levels)
//   denoising    debanding: the long, dark gradients that 8 bits cut into bands are smoothed back into ramps. The
//                drawing's grain layer is left out of the render: it is sized to the drawing, so it turns to sub-pixel
//                noise in the small frames and to blotches in the 4K canvas (it comes back as grain, below)
//   sharpening   a light unsharp mask on lightness for the softness halving leaves, never darkening enough for a halo
//   grading      none, on purpose: the renders match the site's own colours (checked against Chrome: median ΔE 0.4,
//                worst 2), and the images must look like the site; each one is checked to stay within 3 levels of its
//                render, cell by cell
//   compositing  grain made in pixels, sized for the screen the image is for and as strong as the drawing's own, then
//                dithered to 8 bits on the site's background colour
//
// Encoding: each image is written twice, both 8 bits a channel, RGB without alpha, and tagged sRGB with a compact ICC v2
// profile (scripts/brand/icc.mjs; v2 because Firefox ignores v4 profiles by default, and libvips's own is v4):
//   .png    the lossless master, for editing and re-encoding
//   .webp   lossy, for delivery: quality 95, the photo preset (it blocks least in the dark gradients), sharp YUV (the
//           neon's colour edges stay clean through 4:2:0 chroma) and the most effort. 95 is the knee: within about 15 %
//           of the fidelity lossy WebP reaches at 100, for 50–65 % of its bytes. WebP has no deeper bit depth (lossy is
//           8-bit YUV 4:2:0, lossless 8-bit RGB); lossless WebP would only be 20–25 % smaller than the PNG.
//
//   canvas/   the whole drawing (640 × 360, 16:9) at 1280 × 720, 1920 × 1080 and 3840 × 2160
//   frames/   cut as the site cuts it (the drawing fills its frame, centred) at each frame's design size, 1×, 2× and 3×:
//             mobile 328 × 200 · tablet 672 × 320 · home desktop 540 × 360 · shop desktop 480 × 260
//
// Then every file is decoded again and checked (size, channels, bit depth, profile, not blank, no halos, colours
// unchanged, and each WebP close to its PNG), the font is checked to really be Bungee, and a contact sheet and a manifest
// (size, bytes, SHA-256) are written beside them. The grain and dither are seeded, so the same drawing always makes the
// same files.
//
// Default output: brand-kit/promo-art/ at the repository root (not committed).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "brand-kit", "promo-art");
const SOURCE = join(ROOT, "src/ui/sections/wv-home/wv-promo-art.tsx");
const require = createRequire(import.meta.url);

// fontconfig reads its configuration when libvips first sets text, so point it at the repository's fonts (and the
// system's, for the font check below) before sharp loads.
const FONT_DIRS = [
	join(ROOT, "src/fonts"),
	...(process.platform === "win32"
		? ["C:/Windows/Fonts"]
		: process.platform === "darwin"
			? ["/System/Library/Fonts", "/Library/Fonts"]
			: ["/usr/share/fonts"]),
];
const fcDir = join(tmpdir(), "wv-promo-art-fontconfig");
mkdirSync(fcDir, { recursive: true });
writeFileSync(
	join(fcDir, "fonts.conf"),
	`<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${FONT_DIRS.map((d) => `  <dir>${d.replaceAll("\\", "/")}</dir>`).join("\n")}\n  <cachedir>${join(fcDir, "cache").replaceAll("\\", "/")}</cachedir>\n</fontconfig>\n`,
);
process.env.FONTCONFIG_FILE = join(fcDir, "fonts.conf");
const { default: sharp } = await import("sharp");
const { average2, cellMeans, darkHalos, deband, grain, meanDeltaE, quantize, reduce2, sharpen } =
	await import("./brand/post-process.mjs");
const { srgbV2Profile } = await import("./brand/icc.mjs");
// The sRGB profile every file carries (sharp attaches a profile from a file).
const ICC = srgbV2Profile();
const ICC_FILE = join(fcDir, "sRGB-v2.icc");
writeFileSync(ICC_FILE, ICC);

/** Load a .tsx/.ts module from src: compiled by TypeScript to CommonJS, its relative and `@/` imports loaded the same way. */
const ts = require("typescript");
const modules = new Map();
function load(file) {
	if (modules.has(file)) return modules.get(file).exports;
	const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
		fileName: file,
		compilerOptions: {
			jsx: ts.JsxEmit.ReactJSX,
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			esModuleInterop: true,
		},
	});
	const mod = { exports: {} };
	modules.set(file, mod);
	const localRequire = (spec) => {
		const base = spec.startsWith("@/")
			? join(ROOT, "src", spec.slice(2))
			: spec.startsWith(".")
				? join(dirname(file), spec)
				: null;
		if (!base) return require(spec);
		for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
			try {
				readFileSync(base + ext);
				return load(base + ext);
			} catch {}
		}
		throw new Error(`cannot resolve ${spec} from ${relative(ROOT, file)}`);
	};
	new Function("module", "exports", "require", outputText)(mod, mod.exports, localRequire);
	return mod.exports;
}

// 1. The drawing as SVG, with the brand tokens and the font filled in.
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { PromoBundleArt } = load(SOURCE);
const tokens = {};
for (const [, name, value] of readFileSync(join(ROOT, "src/styles/brand.css"), "utf8").matchAll(
	/(--wv-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g,
))
	tokens[name] ??= value;
let svg = renderToStaticMarkup(
	createElement(PromoBundleArt, { idPrefix: "promo", label: "Promotional bundles" }),
).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
svg = svg.replace(/var\((--wv-[a-z0-9-]+)\)/g, (_, name) => {
	if (!tokens[name]) throw new Error(`no value for ${name} in brand.css`);
	return tokens[name];
});
svg = svg.replace(/font-family:var\(--font-bungee\)[^;"]*/g, "font-family:Bungee");
if (svg.includes("var(")) throw new Error(`unresolved CSS variable: ${/var\([^)]*\)/.exec(svg)[0]}`);
// The drawing's grain layer is replaced by grain made in pixels (see post-processing above).
const GRAIN_LAYER = /<rect[^>]*filter="url\(#promo-grain\)"[^>]*><\/rect>/;
if (!GRAIN_LAYER.test(svg)) throw new Error("the drawing's grain layer (filter #promo-grain) was not found");
svg = svg.replace(GRAIN_LAYER, "");
const BG = tokens["--wv-bg"];

/** The drawing's own grain, an overlay at 7 %, moves the mid-tones by about a level and the darks by about a quarter. */
const GRAIN_STRENGTH = 0.008;
const SHARPEN = { sigma: 0.6, amount: 0.35, threshold: 2, maxDark: 2 };
const WEBP = { quality: 95, preset: "photo", smartSubsample: true, effort: 6 };
/** The most a WebP may differ from its PNG: mean ΔE76, both seen at about a CSS pixel (measured: 0.4–1.34). */
const WEBP_MAX_DELTA_E = 1.5;

/**
 * The drawing at `w` × `h` pixels, cut to that shape as the site cuts it (`slice`: fill, centred) and post-processed,
 * for a screen of `density` device pixels per CSS pixel (which sets the grain's size).
 */
async function rasterize(w, h, density, seed) {
	const k = Math.max(w, h) <= 2000 ? 2 : 1; // supersampling factor
	const sized = svg.replace("<svg", `<svg width="${w * k}" height="${h * k}"`);
	const src = await sharp(Buffer.from(sized), { density: 72, limitInputPixels: false })
		.flatten({ background: BG })
		.removeAlpha()
		.raw()
		.toBuffer();
	let img = k === 2 ? reduce2(src, w * k, h * k) : Float32Array.from(src);
	const scale = Math.max(w / 640, h / 360); // pixels per unit of the drawing
	img = deband(img, w, h, Math.max(3, Math.round(6 * scale)));
	if (k === 2) img = sharpen(img, w, h, SHARPEN);
	// Halos: samples more than 4 levels darker than every source pixel near them. Sharpening may darken an edge by 2 and
	// debanding move a pixel by 1, by design; Lanczos's ringing went to 35.
	const halos = k === 2 ? darkHalos(img, src, w, h, 4) : 0;
	img = grain(img, w, h, { size: density, strength: GRAIN_STRENGTH, seed });
	const out = quantize(img, seed + 1);
	// How far post-processing moved the colour: the largest change in any channel of 16 × 9 cells, in levels, against
	// the render plainly averaged down to the same size (so the cells are the same pixels).
	const rendered = cellMeans(k === 2 ? average2(src, w * k, h * k) : src, w, h, 16, 9);
	const shift = Math.max(
		...cellMeans(out, w, h, 16, 9).flatMap((cell, i) => cell.map((v, c) => Math.abs(v - rendered[i][c]))),
	);
	// Encode, tagged sRGB (the profile is sRGB, so tagging moves no pixel; checked below).
	const raw = { raw: { width: w, height: h, channels: 3 } };
	const png = await sharp(out, raw)
		.withIccProfile(ICC_FILE)
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	const webp = await sharp(out, raw).withIccProfile(ICC_FILE).webp(WEBP).toBuffer();
	const lossless = (await sharp(png).raw().toBuffer()).equals(out);
	// The WebP against the PNG, both blurred to about a CSS pixel, the scale they are seen at.
	const seen = (b) => sharp(b, raw).blur(density).raw().toBuffer();
	const decoded = await sharp(webp).removeAlpha().raw().toBuffer();
	const deltaE = meanDeltaE(await seen(out), await seen(decoded), w, h);
	return { png, webp, halos, shift, lossless, deltaE };
}

// 2. The outputs.
// The canvas sizes, with the screen density each is for: HD and Full HD at 1×, 4K at 2×.
const CANVAS = [
	[1280, 720, 1],
	[1920, 1080, 1],
	[3840, 2160, 2],
];
const FRAMES = {
	mobile: [328, 200],
	tablet: [672, 320],
	"home-desktop": [540, 360],
	"shop-desktop": [480, 260],
};
const jobs = [
	...CANVAS.map(([w, h, density]) => ({ name: `canvas/promo-bundles-${w}x${h}`, w, h, density })),
	...Object.entries(FRAMES).flatMap(([name, [w, h]]) =>
		[1, 2, 3].map((x) => ({
			name: `frames/promo-bundles-${name}@${x}x`,
			w: w * x,
			h: h * x,
			density: x,
		})),
	),
];
rmSync(OUT, { recursive: true, force: true });
const results = [];
const kb = (b) => `${(b.length / 1024).toFixed(0)} KB`;
for (const job of jobs) {
	const result = await rasterize(job.w, job.h, job.density, job.w * 7919 + job.h);
	mkdirSync(dirname(join(OUT, job.name)), { recursive: true });
	writeFileSync(join(OUT, `${job.name}.png`), result.png);
	writeFileSync(join(OUT, `${job.name}.webp`), result.webp);
	results.push({ ...job, ...result });
	console.log(
		`${job.name.padEnd(40)} ${`${job.w} × ${job.h}`.padStart(12)}  PNG ${kb(result.png).padStart(7)}  WebP ${kb(result.webp).padStart(6)} (ΔE ${result.deltaE.toFixed(2)})  colour moved ≤ ${result.shift.toFixed(2)}`,
	);
}

// 3. Checks: every file decodes at its size as 8-bit RGB without alpha, carrying the sRGB profile, and isn't blank; the
// PNG holds exactly the post-processed pixels and the WebP is close to it; post-processing drew no halos and moved no
// colour (no cell of the image more than 3 levels from the render); and the text is really set in Bungee (rendered
// against a serif, the two must differ).
const failures = [];
for (const { name, w, h, png, webp, halos, shift, lossless, deltaE } of results) {
	if (halos > 0) failures.push(`${name}: dark halos in ${(halos * 100).toFixed(3)} % of samples`);
	if (shift > 3) failures.push(`${name}: colour moved ${shift.toFixed(1)} levels from the render`);
	if (!lossless) failures.push(`${name}.png: pixels differ from the post-processed image`);
	if (deltaE > WEBP_MAX_DELTA_E) failures.push(`${name}.webp: ΔE ${deltaE.toFixed(2)} from the PNG`);
	for (const [ext, buf] of [
		["png", png],
		["webp", webp],
	]) {
		const file = `${name}.${ext}`;
		const meta = await sharp(buf).metadata();
		if (meta.format !== ext) failures.push(`${file}: is ${meta.format}`);
		if (meta.width !== w || meta.height !== h)
			failures.push(`${file}: ${meta.width} × ${meta.height}, wanted ${w} × ${h}`);
		if (meta.channels !== 3 || meta.hasAlpha) failures.push(`${file}: ${meta.channels} channels`);
		if (meta.depth !== "uchar") failures.push(`${file}: ${meta.depth}, not 8 bits a channel`);
		if (!meta.icc?.equals(ICC)) failures.push(`${file}: not tagged with the sRGB profile`);
		const stats = await sharp(buf).stats();
		if (stats.channels.every((c) => c.stdev < 8)) failures.push(`${file}: looks blank`);
	}
}
const sample = (family) =>
	sharp(
		Buffer.from(
			`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><text x="10" y="45" font-family="${family}" font-size="36">BUNDLE</text></svg>`,
		),
	)
		.raw()
		.toBuffer();
if ((await sample("Bungee")).equals(await sample("serif")))
	failures.push("Bungee did not load: text fell back to another font");
if (failures.length) {
	console.error(`\n${failures.length} check(s) failed:\n  ${failures.join("\n  ")}`);
	process.exit(1);
}

// 4. A contact sheet (each image scaled to 300 px wide, labelled) and the manifest.
const THUMB = 300;
const tiles = await Promise.all(
	results.map(async ({ name, w, h, png, webp }) => {
		const img = await sharp(png).resize(THUMB).png().toBuffer();
		const th = Math.round((THUMB * h) / w);
		const label = Buffer.from(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB}" height="34"><text x="0" y="13" font-family="sans-serif" font-size="11" fill="#e8e8ef">${name.split("/").pop()}</text><text x="0" y="28" font-family="sans-serif" font-size="11" fill="#9a9aae">${w} × ${h} · PNG ${kb(png)} · WebP ${kb(webp)}</text></svg>`,
		);
		return { img, label, th };
	}),
);
const COLS = 3;
const GAP = 20;
const rows = [];
for (let i = 0; i < tiles.length; i += COLS) rows.push(tiles.slice(i, i + COLS));
const rowHeights = rows.map((r) => Math.max(...r.map((t) => t.th)) + 34 + GAP);
const sheet = [];
let top = GAP;
rows.forEach((row, r) => {
	row.forEach((t, c) => {
		const left = GAP + c * (THUMB + GAP);
		sheet.push({ input: t.img, left, top }, { input: t.label, left, top: top + t.th + 4 });
	});
	top += rowHeights[r];
});
await sharp({
	create: { width: GAP + COLS * (THUMB + GAP), height: top, channels: 3, background: "#202028" },
})
	.composite(sheet)
	.png()
	.toFile(join(OUT, "contact-sheet.png"));

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const manifest = {
	source: relative(ROOT, SOURCE).replaceAll("\\", "/"),
	colour: {
		space: "sRGB IEC61966-2.1",
		profile: `ICC v2.1, ${ICC.length} bytes, embedded in every file`,
		bitsPerChannel: 8,
		channels: "RGB, no alpha",
	},
	png: "lossless, compression level 9, adaptive filtering",
	webp: { ...WEBP, fidelity: "mean ΔE76 from the PNG, both seen at about a CSS pixel" },
	files: results.flatMap(({ name, w, h, png, webp, deltaE }) => [
		{ file: `${name}.png`, width: w, height: h, bytes: png.length, sha256: sha256(png) },
		{
			file: `${name}.webp`,
			width: w,
			height: h,
			bytes: webp.length,
			sha256: sha256(webp),
			deltaE: Math.round(deltaE * 100) / 100,
		},
	]),
};
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
const total = (key) => `${(results.reduce((s, r) => s + r[key].length, 0) / 1024 / 1024).toFixed(1)} MB`;
console.log(
	`\n${results.length} images (PNG ${total("png")}, WebP ${total("webp")}), all checks passed → ${relative(process.cwd(), OUT) || "."}`,
);
