// Rasterizes the promotional-bundles art to PNG: node scripts/rasterize-promo-art.mjs [outDir]
//
// The source is the site's own drawing, src/ui/sections/wv-home/wv-promo-art.tsx: it is compiled with TypeScript and
// rendered to SVG with react-dom/server, the brand tokens it uses (var(--wv-*)) are filled in from src/styles/brand.css,
// and its font (Bungee, src/fonts) is loaded through fontconfig. So the pixels are the drawing itself, not a copy of it.
//
// Each image is rendered at twice its size and scaled down with Lanczos (supersampling), so edges, hairlines and text
// are anti-aliased cleanly; the 4K canvas, already fine-grained, is rendered directly. Every image is opaque RGB on the
// site's background colour, 8 bits a channel, lossless PNG.
//
//   canvas/   the whole drawing (640 × 360, 16:9) at 1280 × 720, 1920 × 1080 and 3840 × 2160
//   frames/   cut as the site cuts it (the drawing fills its frame, centred) at each frame's design size, 1×, 2× and 3×:
//             mobile 328 × 200 · tablet 672 × 320 · home desktop 540 × 360 · shop desktop 480 × 260
//
// Then every file is decoded again and checked (size, channels, not blank), the font is checked to really be Bungee,
// and a contact sheet and a manifest (size, bytes, SHA-256) are written beside them.
//
// Default output: brand-kit/promo-art/ at the repository root (not committed).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, "brand-kit", "promo-art");
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
const BG = tokens["--wv-bg"];

/** The drawing at `w` × `h` pixels, cut to that shape as the site cuts it (`slice`: fill, centred). */
async function rasterize(w, h) {
	const k = Math.max(w, h) <= 2000 ? 2 : 1; // supersampling factor
	const sized = svg.replace("<svg", `<svg width="${w * k}" height="${h * k}"`);
	let img = sharp(Buffer.from(sized), { density: 72, limitInputPixels: false }).flatten({ background: BG });
	if (k > 1) img = sharp(await img.png().toBuffer()).resize(w, h, { kernel: "lanczos3" });
	return img.removeAlpha().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

// 2. The outputs.
const CANVAS = [
	[1280, 720],
	[1920, 1080],
	[3840, 2160],
];
const FRAMES = {
	mobile: [328, 200],
	tablet: [672, 320],
	"home-desktop": [540, 360],
	"shop-desktop": [480, 260],
};
const jobs = [
	...CANVAS.map(([w, h]) => ({ path: `canvas/promo-bundles-${w}x${h}.png`, w, h })),
	...Object.entries(FRAMES).flatMap(([name, [w, h]]) =>
		[1, 2, 3].map((x) => ({ path: `frames/promo-bundles-${name}@${x}x.png`, w: w * x, h: h * x })),
	),
];
rmSync(OUT, { recursive: true, force: true });
const results = [];
for (const job of jobs) {
	const png = await rasterize(job.w, job.h);
	const file = join(OUT, job.path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, png);
	results.push({ ...job, png });
	console.log(
		`${job.path.padEnd(44)} ${`${job.w} × ${job.h}`.padStart(12)}  ${(png.length / 1024).toFixed(0).padStart(5)} KB`,
	);
}

// 3. Checks: every file decodes at its size as opaque RGB and isn't blank, and the text is really set in Bungee
// (rendered against a serif, the two must differ).
const failures = [];
for (const { path, w, h, png } of results) {
	const meta = await sharp(png).metadata();
	const stats = await sharp(png).stats();
	if (meta.width !== w || meta.height !== h)
		failures.push(`${path}: ${meta.width} × ${meta.height}, wanted ${w} × ${h}`);
	if (meta.channels !== 3 || meta.hasAlpha) failures.push(`${path}: ${meta.channels} channels`);
	if (stats.channels.every((c) => c.stdev < 8)) failures.push(`${path}: looks blank`);
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
	results.map(async ({ path, w, h, png }) => {
		const img = await sharp(png).resize(THUMB).png().toBuffer();
		const th = Math.round((THUMB * h) / w);
		const label = Buffer.from(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB}" height="34"><text x="0" y="13" font-family="sans-serif" font-size="11" fill="#e8e8ef">${path.split("/").pop()}</text><text x="0" y="28" font-family="sans-serif" font-size="11" fill="#9a9aae">${w} × ${h} · ${(png.length / 1024).toFixed(0)} KB</text></svg>`,
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

const manifest = results.map(({ path, w, h, png }) => ({
	file: path,
	width: w,
	height: h,
	bytes: png.length,
	sha256: createHash("sha256").update(png).digest("hex"),
}));
writeFileSync(
	join(OUT, "manifest.json"),
	`${JSON.stringify({ source: relative(ROOT, SOURCE).replaceAll("\\", "/"), files: manifest }, null, "\t")}\n`,
);
console.log(`\n${results.length} images, all checks passed → ${relative(process.cwd(), OUT) || "."}`);
