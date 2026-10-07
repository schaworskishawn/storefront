// Writes the site's mouse cursors to public/cursors/*.svg: node scripts/generate-cursors.mjs
//
// Every cursor is a 32 x 32 SVG (the size browsers draw reliably) in the brand colours, with a dark outline so it reads on the
// dark page and on the cyan buttons alike. The hotspots (the pixel that does the clicking) are noted per file and must match
// src/styles/cursors.css. The loading cursor is eight frames of a spinner: browsers can't animate a cursor, so
// PageMotion swaps the frame while a page loads.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "cursors");

const CYAN = "#00e5ff";
const CYAN_SOFT = "#69ebff";
// A near-white cyan: the arrow stays visible on the dark page and on the cyan buttons (a pure cyan arrow would vanish there).
const ICE = "#e6fcff";
const PINK = "#f179fb";
const INK = "#05030a";
const MUTED = "#7e7487";

/** The classic arrow, tip at (4, 3), in a 32 x 32 box. */
const ARROW = "M4 3 L4 24 L9.4 19.2 L13.4 28 L17.6 26.2 L13.6 17.5 L21 17.5 Z";

const svg = (body) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">\n${body}\n</svg>\n`;

const arrow = ({ fill, stroke = INK, transform = "", width = 1.6 }) =>
	`  <path d="${ARROW}"${transform ? ` transform="${transform}"` : ""} fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;

/** An arrow with a coloured copy offset behind it: the duotone "neon" look. */
const duotone = (front, back) =>
	[arrow({ fill: back, transform: "translate(2 2)", width: 2 }), arrow({ fill: front })].join("\n");

const files = {};

// Hotspot 4 3.
files["default.svg"] = svg(duotone(ICE, PINK));

// Hotspot 12 3 (the fingertip). A pointing hand: pink with a dark outline and a cyan copy offset behind it.
const HAND =
	"M10.5 15 L10.5 5.2 Q10.5 3 12.5 3 Q14.5 3 14.5 5.2 L14.5 12 Q15 11 16.8 11.2 Q18.5 11.4 18.8 12.8 Q19.8 12 21.5 12.3 Q23 12.6 23.2 14 Q24.4 13.6 25.6 14.6 Q26.5 15.5 26.5 17 L26.5 22 Q26.5 27 22 28.5 L14.5 28.5 Q11 28.5 9.5 25.5 L5.5 19.5 Q4.8 18 6.2 17.2 Q7.6 16.6 8.8 17.8 L10.5 19.6 Z";
files["pointer.svg"] = svg(
	[
		`  <path d="${HAND}" transform="translate(1.6 1.6)" fill="${CYAN}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
		`  <path d="${HAND}" fill="${PINK}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
		`  <path d="M18.8 13.4 L18.8 19 M23.2 14.6 L23.2 19" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`,
	].join("\n"),
);

// Hotspot 3 3. A muted arrow with a "no" badge.
files["disabled.svg"] = svg(
	[
		arrow({ fill: MUTED, transform: "scale(0.85)" }),
		`  <circle cx="23.5" cy="23.5" r="6.2" fill="${INK}"/>`,
		`  <circle cx="23.5" cy="23.5" r="4.6" fill="none" stroke="${PINK}" stroke-width="2"/>`,
		`  <path d="M20.2 26.8 L26.8 20.2" stroke="${PINK}" stroke-width="2" stroke-linecap="round"/>`,
	].join("\n"),
);

// Hotspot 16 16. A ring with arrows pointing out: "you can drag this".
const ring = (r, fill, stroke) =>
	`  <circle cx="16" cy="16" r="${r + 1.6}" fill="none" stroke="${INK}" stroke-width="2"/>\n  <circle cx="16" cy="16" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>`;
const chevron = (d, color) =>
	`  <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
files["grab.svg"] = svg(
	[
		ring(11, "rgba(5,3,10,0.7)", CYAN),
		chevron("M12 12.5 L8.5 16 L12 19.5", PINK),
		chevron("M20 12.5 L23.5 16 L20 19.5", PINK),
		`  <circle cx="16" cy="16" r="1.6" fill="${CYAN_SOFT}"/>`,
	].join("\n"),
);

// Hotspot 16 16. The same ring squeezed, arrows pointing in: "you are dragging it".
files["grabbing.svg"] = svg(
	[
		ring(9, "rgba(241,121,251,0.28)", PINK),
		chevron("M9 12.5 L12.5 16 L9 19.5", CYAN_SOFT),
		chevron("M23 12.5 L19.5 16 L23 19.5", CYAN_SOFT),
	].join("\n"),
);

// Hotspot 3 3. A smaller arrow with a spinner; frame n turns the bright arc by n x 45 degrees.
const CIRCUMFERENCE = 2 * Math.PI * 6;
for (let frame = 0; frame < 8; frame += 1) {
	files[`loading-${frame}.svg`] = svg(
		[
			arrow({ fill: ICE, transform: "scale(0.85)" }),
			`  <circle cx="23.5" cy="23.5" r="7.4" fill="${INK}" fill-opacity="0.92"/>`,
			`  <circle cx="23.5" cy="23.5" r="6" fill="none" stroke="${CYAN_SOFT}" stroke-opacity="0.25" stroke-width="2.6"/>`,
			`  <circle cx="23.5" cy="23.5" r="6" fill="none" stroke="${PINK}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${(CIRCUMFERENCE * 0.28).toFixed(2)} ${(CIRCUMFERENCE * 0.72).toFixed(2)}" transform="rotate(${frame * 45} 23.5 23.5)"/>`,
		].join("\n"),
	);
}

mkdirSync(OUT, { recursive: true });
for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT, name), content);
console.log(`Wrote ${Object.keys(files).length} cursors to ${OUT}`);
