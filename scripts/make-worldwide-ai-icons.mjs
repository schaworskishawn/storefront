/**
 * Draws the Worldwide AI icon and writes every size the workspace's apps use:
 *
 *   node scripts/make-worldwide-ai-icons.mjs
 *
 * The icon is the W of Worldwide AI OS (the desktop's mark), lit from cyan to pink, on the purple-to-black of its wallpaper.
 * It writes the installable web app's icons into public/worldwide-ai/, and, when the Android app's project is there, its
 * launcher icons (classic, round and adaptive), the Android 12+ splash icon and the older full-screen splashes into
 * worldwide-ai-android/android/app/src/main/res. It uses the `sharp` that Next.js already installs. Re-run it whenever the
 * mark or the colours change.
 *
 * The colours are the brand tokens in src/styles/brand.css: --wv-bg #05030a, --wv-cyan-soft #69ebff, --wv-pink #f179fb.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const BG = "#05030a";
const CYAN = "#69ebff";
const PINK = "#f179fb";
const HAZE = "#2a0f45";

/** The desktop's W: a 30 by 24 box. */
const W_PATH = "M2 3 L8.5 21 L15 7 L21.5 21 L28 3";
const W_BOX = { width: 30, height: 24 };

/**
 * One square SVG. `mark` is the W's width as a share of the square; `field` draws the purple-to-black ground, without it
 * the square is transparent (adaptive-icon foregrounds, the Android 12 splash icon).
 */
function svg(size, { mark, field = true }) {
	const scale = (size * mark) / W_BOX.width;
	const x = (size - W_BOX.width * scale) / 2;
	const y = (size - W_BOX.height * scale) / 2;
	const glow = (size * mark) / 26;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	<defs>
		<radialGradient id="field" cx="50%" cy="36%" r="78%">
			<stop offset="0" stop-color="${HAZE}"/>
			<stop offset="0.55" stop-color="#12071f"/>
			<stop offset="1" stop-color="${BG}"/>
		</radialGradient>
		<linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${CYAN}"/>
			<stop offset="1" stop-color="${PINK}"/>
		</linearGradient>
		<filter id="glow" x="-100%" y="-100%" width="300%" height="300%" filterUnits="objectBoundingBox">
			<feGaussianBlur stdDeviation="${glow.toFixed(2)}"/>
		</filter>
	</defs>
	${field ? `<rect width="${size}" height="${size}" fill="url(#field)"/>` : ""}
	${
		mark > 0
			? `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})" fill="none" stroke="url(#ink)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
		<path d="${W_PATH}" filter="url(#glow)" opacity="0.85"/>
		<path d="${W_PATH}"/>
	</g>`
			: ""
	}
</svg>`;
}

async function png(size, options) {
	return sharp(Buffer.from(svg(size, options)))
		.png({ compressionLevel: 9 })
		.toBuffer();
}

/** Cuts a square to the rounded square or circle that launchers without adaptive icons show. */
async function mask(buffer, size, shape) {
	const cut =
		shape === "circle"
			? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
			: `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`;
	return sharp(buffer)
		.composite([{ input: Buffer.from(cut), blend: "dest-in" }])
		.png()
		.toBuffer();
}

function write(path, buffer) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, buffer);
	console.log("wrote", path);
}

// ---- The installable web app (public/worldwide-ai/manifest.webmanifest) -----------------------------------------------
// "any" icons are shown as drawn, so they get the rounded square. The maskable one is cut by the phone to its own shape and
// only its centre circle (80% across) is sure to show, so the W is smaller and the field runs to the edges.
const WEB = "public/worldwide-ai";
for (const size of [192, 512]) {
	write(join(WEB, `icon-${size}.png`), await mask(await png(size, { mark: 0.6 }), size, "rounded"));
}
write(join(WEB, "icon-maskable-512.png"), await png(512, { mark: 0.5 }));
// iOS rounds its own corners.
write(join(WEB, "apple-touch-icon.png"), await png(180, { mark: 0.6 }));

// ---- The Android app (worldwide-ai-android) --------------------------------------------------------------------------
const RES = "worldwide-ai-android/android/app/src/main/res";
if (!existsSync(RES)) {
	console.log(`${RES} isn't there; skipped the Android app's icons.`);
	process.exit(0);
}

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(LAUNCHER)) {
	const square = await png(size, { mark: 0.6 });
	write(join(RES, `mipmap-${density}`, "ic_launcher.png"), await mask(square, size, "rounded"));
	write(
		join(RES, `mipmap-${density}`, "ic_launcher_round.png"),
		await mask(await png(size, { mark: 0.54 }), size, "circle"),
	);
}

// Adaptive icons (Android 8+): a 108dp field and a foreground of which only the centre 66dp circle is sure to show. The W
// (its corners reach 1.28 times its width across) is kept inside that circle.
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [density, size] of Object.entries(ADAPTIVE)) {
	write(
		join(RES, `mipmap-${density}`, "ic_launcher_foreground.png"),
		await png(size, { mark: 0.44, field: false }),
	);
	write(
		join(RES, `mipmap-${density}`, "ic_launcher_background.png"),
		await png(size, { mark: 0, field: true }),
	);
}

// Android 12+ splash: a 288dp icon shown inside a circle two thirds across, on the window's dark background.
write(join(RES, "drawable-nodpi", "splash_icon.png"), await png(1152, { mark: 0.42, field: false }));

// Android 11 and older: full-screen splash bitmaps, the W in the middle of the dark.
const SPLASH = {
	mdpi: [320, 480],
	hdpi: [480, 800],
	xhdpi: [720, 1280],
	xxhdpi: [960, 1600],
	xxxhdpi: [1280, 1920],
};
async function splash(width, height) {
	const side = Math.round(Math.min(width, height) * 0.5);
	return sharp({ create: { width, height, channels: 4, background: BG } })
		.composite([{ input: await png(side, { mark: 0.7, field: false }), gravity: "center" }])
		.png({ compressionLevel: 9 })
		.toBuffer();
}
for (const [density, [w, h]] of Object.entries(SPLASH)) {
	write(join(RES, `drawable-port-${density}`, "splash.png"), await splash(w, h));
	write(join(RES, `drawable-land-${density}`, "splash.png"), await splash(h, w));
}
write(join(RES, "drawable", "splash.png"), await splash(480, 320));
console.log("done");
