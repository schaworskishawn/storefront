/**
 * Builds the Android app icons and splash screens from the brand badge (public/home/imgHeroLogo.png).
 *
 *   node scripts/make-app-assets.mjs
 *
 * Writes into android/app/src/main/res (launcher icons in every density, the adaptive-icon foreground, the Android 12 splash
 * icon, and full-screen splash bitmaps for older Android) plus 1024px/512px masters in assets/ for the Play Store listing and
 * for the iOS App Store icon later. It uses the `sharp` that Next.js already installs, so there is nothing extra to add. Re-run it whenever the
 * badge or the background colour changes, then `pnpm cap:sync`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const SOURCE = "public/home/imgHeroLogo.png";
/** --wv-bg in src/styles/brand.css — the same dark the site and the app's web view use, so nothing flashes white. */
const BACKGROUND = "#05030a";
const RES = "android/app/src/main/res";

/** The badge sits in the middle of a tall canvas with a transparent surround; this square crop frames it and its glow. */
const CROP = { left: 12, top: 250, width: 1000, height: 1000 };
/** Share of the crop's width taken up by the badge itself (the rest is glow), measured from the artwork. */
const BADGE_SHARE = 0.87;

const badge = sharp(SOURCE).extract(CROP);

async function badgeAt(widthPx) {
	return badge.clone().resize(widthPx, widthPx).png().toBuffer();
}

/** A square canvas, optionally filled with the background colour, with the badge centred at `scale` of its width. */
async function square(size, { scale, filled = true }) {
	return sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: filled ? BACKGROUND : { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([{ input: await badgeAt(Math.round(size * scale)), gravity: "center" }])
		.png()
		.toBuffer();
}

async function mask(buffer, size, shape) {
	const svg =
		shape === "circle"
			? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
			: `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`;
	return sharp(buffer)
		.composite([{ input: Buffer.from(svg), blend: "dest-in" }])
		.png()
		.toBuffer();
}

function write(path, buffer) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, buffer);
	console.log("wrote", path);
}

// ---- Launcher icons --------------------------------------------------------------------------------------------------
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
/** Adaptive icons are drawn on a 108dp canvas of which only the centre 72dp is guaranteed to show. */
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
/** Badge width as a share of the adaptive canvas: 62% keeps the badge itself inside the 66% safe zone. */
const FOREGROUND_SCALE = 0.62 / BADGE_SHARE;

for (const [density, size] of Object.entries(LAUNCHER)) {
	const full = await square(size, { scale: 0.96 });
	write(join(RES, `mipmap-${density}`, "ic_launcher.png"), await mask(full, size, "rounded"));
	write(join(RES, `mipmap-${density}`, "ic_launcher_round.png"), await mask(full, size, "circle"));
}
for (const [density, size] of Object.entries(FOREGROUND)) {
	write(
		join(RES, `mipmap-${density}`, "ic_launcher_foreground.png"),
		await square(size, { scale: FOREGROUND_SCALE, filled: false }),
	);
}

// ---- Android 12+ splash icon ------------------------------------------------------------------------------------------
// A 288dp canvas shown inside a circle two-thirds of its width, so the badge is kept within that circle.
write(
	join(RES, "drawable-nodpi", "splash_icon.png"),
	await square(1152, { scale: 0.64 / BADGE_SHARE, filled: false }),
);

// ---- Full-screen splash bitmaps (Android 11 and older, and the launch window background) ------------------------------
const SPLASH = {
	mdpi: [320, 480],
	hdpi: [480, 800],
	xhdpi: [720, 1280],
	xxhdpi: [960, 1600],
	xxxhdpi: [1280, 1920],
};

async function splash(width, height) {
	const badgeWidth = Math.round(Math.min(width, height) * 0.8);
	return sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
		.composite([{ input: await badgeAt(badgeWidth), gravity: "center" }])
		.png({ compressionLevel: 9 })
		.toBuffer();
}

for (const [density, [w, h]] of Object.entries(SPLASH)) {
	write(join(RES, `drawable-port-${density}`, "splash.png"), await splash(w, h));
	write(join(RES, `drawable-land-${density}`, "splash.png"), await splash(h, w));
}
write(join(RES, "drawable", "splash.png"), await splash(480, 320));

// ---- Masters ----------------------------------------------------------------------------------------------------------
write("assets/icon-only.png", await square(1024, { scale: 0.96 }));
write("assets/play-store-icon.png", await square(512, { scale: 0.96 }));
console.log("done");
