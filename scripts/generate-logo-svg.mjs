// Writes the Worldwide Vapor logo as a vector: node scripts/generate-logo-svg.mjs
//
// A redraw of the emblem (public/home/imgHeroLogo.png) in the site's neon style, as one standalone SVG: a neon ring with
// WORLDWIDE set round its top in Bungee, a glowing globe, the vape tank (no WS marks), smoke clouds either side, "Vapor"
// as a neon-sign script (hand-drawn tubes with a white-hot core, a dark 3D edge and drips), and a circuit-board base
// with the globe-in-a-hexagon mark. WORLDWIDE is turned into outlines straight from the project's Bungee font file
// (src/fonts), so the file looks the same anywhere, without the font installed. Colours are the brand's (src/styles/brand.css), written out because a
// standalone file can't read the site's CSS.
//
// Output: public/brand/worldwide-vapor-logo.svg (transparent background).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "brand", "worldwide-vapor-logo.svg");

// Brand colours (brand.css), plus two blues the emblem's smoke and globe use.
const C = {
	cyan: "#00e5ff",
	cyanSoft: "#69ebff",
	pink: "#f179fb",
	pinkLight: "#f8c9fd",
	purple: "#7a1fa2",
	violet: "#8a5cff",
	blue: "#3b5bff",
	deep: "#0d0d1a",
	bg: "#05030a",
	ink: "#0b0712",
	section: "#1a1a2e",
	white: "#ffffff",
};

/* ---------------- A minimal TrueType reader: enough to turn text into outlines. ---------------- */

function readFont(file) {
	const buf = readFileSync(file);
	const u16 = (o) => buf.readUInt16BE(o);
	const i16 = (o) => buf.readInt16BE(o);
	const u32 = (o) => buf.readUInt32BE(o);
	const tables = {};
	for (let i = 0, n = u16(4); i < n; i++) {
		const rec = 12 + i * 16;
		tables[buf.toString("latin1", rec, rec + 4)] = u32(rec + 8);
	}
	for (const tag of ["head", "maxp", "hhea", "hmtx", "cmap", "loca", "glyf"]) {
		if (tables[tag] === undefined)
			throw new Error(`${file} has no ${tag} table (not a TrueType outline font)`);
	}
	const unitsPerEm = u16(tables.head + 18);
	const longLoca = i16(tables.head + 50) === 1;
	const numGlyphs = u16(tables.maxp + 4);
	const numHMetrics = u16(tables.hhea + 34);

	// cmap: the Windows Unicode BMP subtable, format 4.
	let sub = -1;
	for (let i = 0, n = u16(tables.cmap + 2); i < n; i++) {
		const rec = tables.cmap + 4 + i * 8;
		const platform = u16(rec);
		const encoding = u16(rec + 2);
		const off = tables.cmap + u32(rec + 4);
		if (((platform === 3 && encoding === 1) || platform === 0) && u16(off) === 4) sub = off;
	}
	if (sub < 0) throw new Error(`${file}: no format-4 cmap`);
	const segX2 = u16(sub + 6);
	const ends = sub + 14;
	const starts = ends + segX2 + 2;
	const deltas = starts + segX2;
	const ranges = deltas + segX2;
	const glyphFor = (code) => {
		for (let s = 0; s < segX2; s += 2) {
			if (u16(ends + s) < code) continue;
			const start = u16(starts + s);
			if (start > code) return 0;
			const delta = i16(deltas + s);
			const range = u16(ranges + s);
			if (range === 0) return (code + delta) & 0xffff;
			const g = u16(ranges + s + range + 2 * (code - start));
			return g === 0 ? 0 : (g + delta) & 0xffff;
		}
		return 0;
	};
	const advance = (g) => u16(tables.hmtx + 4 * Math.min(g, numHMetrics - 1));
	const locaAt = (g) => (longLoca ? u32(tables.loca + g * 4) : u16(tables.loca + g * 2) * 2);

	// Contours of a glyph as arrays of { x, y, on }, composites resolved.
	function contours(g, depth = 0) {
		if (g >= numGlyphs || depth > 8) return [];
		const start = locaAt(g);
		if (locaAt(g + 1) === start) return [];
		const o = tables.glyf + start;
		const n = i16(o);
		if (n < 0) {
			const out = [];
			let p = o + 10;
			for (;;) {
				const flags = u16(p);
				const child = u16(p + 2);
				p += 4;
				let dx;
				let dy;
				if (flags & 1) {
					dx = i16(p);
					dy = i16(p + 2);
					p += 4;
				} else {
					dx = buf.readInt8(p);
					dy = buf.readInt8(p + 1);
					p += 2;
				}
				let a = 1;
				let b = 0;
				let c = 0;
				let d = 1;
				const f2 = (q) => i16(q) / 16384;
				if (flags & 8) {
					a = d = f2(p);
					p += 2;
				} else if (flags & 0x40) {
					a = f2(p);
					d = f2(p + 2);
					p += 4;
				} else if (flags & 0x80) {
					a = f2(p);
					b = f2(p + 2);
					c = f2(p + 4);
					d = f2(p + 6);
					p += 8;
				}
				if (!(flags & 2)) {
					dx = 0;
					dy = 0;
				}
				for (const contour of contours(child, depth + 1)) {
					out.push(
						contour.map((pt) => ({ x: a * pt.x + c * pt.y + dx, y: b * pt.x + d * pt.y + dy, on: pt.on })),
					);
				}
				if (!(flags & 0x20)) break;
			}
			return out;
		}
		const endPts = [];
		for (let i = 0; i < n; i++) endPts.push(u16(o + 10 + i * 2));
		const count = n ? endPts[n - 1] + 1 : 0;
		let p = o + 10 + n * 2;
		p += 2 + u16(p);
		const flags = [];
		while (flags.length < count) {
			const f = buf[p++];
			flags.push(f);
			if (f & 8) for (let r = buf[p++]; r > 0; r--) flags.push(f);
		}
		const coord = (shortBit, sameBit) => {
			const vals = [];
			let v = 0;
			for (const f of flags) {
				if (f & shortBit) {
					const d = buf[p++];
					v += f & sameBit ? d : -d;
				} else if (!(f & sameBit)) {
					v += i16(p);
					p += 2;
				}
				vals.push(v);
			}
			return vals;
		};
		const xs = coord(2, 16);
		const ys = coord(4, 32);
		const out = [];
		let first = 0;
		for (const end of endPts) {
			const pts = [];
			for (let i = first; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
			out.push(pts);
			first = end + 1;
		}
		return out;
	}

	return { unitsPerEm, glyphFor, advance, contours };
}

/** A contour (TrueType quadratic, y up) as SVG path data, through a point transform. */
function contourPath(pts, tf) {
	if (pts.length === 0) return "";
	const P = (pt) => tf(pt.x, pt.y);
	const f = (n) => Math.round(n * 100) / 100;
	// Start on an on-curve point; if there is none, at the midpoint of the first two.
	let start = pts.findIndex((pt) => pt.on);
	const seq = [];
	if (start < 0) {
		const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true };
		seq.push(mid, ...pts.slice(1), pts[0]);
	} else {
		seq.push(...pts.slice(start), ...pts.slice(0, start));
	}
	const [sx, sy] = P(seq[0]);
	let d = `M${f(sx)} ${f(sy)}`;
	let ctrl = null;
	for (let i = 1; i <= seq.length; i++) {
		const pt = seq[i % seq.length];
		if (pt.on) {
			const [x, y] = P(pt);
			if (ctrl) {
				d += `Q${f(ctrl[0])} ${f(ctrl[1])} ${f(x)} ${f(y)}`;
				ctrl = null;
			} else {
				d += `L${f(x)} ${f(y)}`;
			}
		} else {
			const c = P(pt);
			if (ctrl) {
				const mx = (ctrl[0] + c[0]) / 2;
				const my = (ctrl[1] + c[1]) / 2;
				d += `Q${f(ctrl[0])} ${f(ctrl[1])} ${f(mx)} ${f(my)}`;
			}
			ctrl = c;
		}
	}
	if (ctrl) d += `Q${f(ctrl[0])} ${f(ctrl[1])} ${f(sx)} ${f(sy)}`;
	return `${d}Z`;
}

/** Text round the top of a circle, reading left to right, letters standing outward. */
function arcTextPath(font, text, { cx, cy, radius, size, tracking = 0 }) {
	const scale = size / font.unitsPerEm;
	const glyphs = [...text].map((ch) => font.glyphFor(ch.codePointAt(0)));
	const widths = glyphs.map((g) => font.advance(g) * scale);
	const total = widths.reduce((a, b) => a + b, 0) + tracking * (glyphs.length - 1);
	let s = -total / 2;
	let d = "";
	glyphs.forEach((g, i) => {
		const mid = s + widths[i] / 2;
		const theta = -Math.PI / 2 + mid / radius;
		const rot = theta + Math.PI / 2;
		const ox = cx + radius * Math.cos(theta);
		const oy = cy + radius * Math.sin(theta);
		const cos = Math.cos(rot);
		const sin = Math.sin(rot);
		for (const c of font.contours(g))
			d += contourPath(c, (x, y) => {
				const lx = x * scale - widths[i] / 2;
				const ly = -y * scale;
				return [ox + lx * cos - ly * sin, oy + lx * sin + ly * cos];
			});
		s += widths[i] + tracking;
	});
	return d;
}

/* ---------------- The emblem. ---------------- */

const bungee = readFont(join(ROOT, "src", "fonts", "Bungee-Regular.ttf"));

const CX = 500;
const CY = 440;
const R_OUT = 338;
const R_IN = 266;
const R_GLOBE = 252;

const hex = (cx, cy, r) => {
	const w = r * 0.866;
	return `M${cx} ${cy - r}L${cx + w} ${cy - r / 2}L${cx + w} ${cy + r / 2}L${cx} ${cy + r}L${cx - w} ${cy + r / 2}L${cx - w} ${cy - r / 2}Z`;
};
const ring = (r1, r2) =>
	`M${CX - r1} ${CY}a${r1} ${r1} 0 1 0 ${2 * r1} 0a${r1} ${r1} 0 1 0 ${-2 * r1} 0Z` +
	`M${CX - r2} ${CY}a${r2} ${r2} 0 1 1 ${2 * r2} 0a${r2} ${r2} 0 1 1 ${-2 * r2} 0Z`;

const worldwide = arcTextPath(bungee, "WORLDWIDE", {
	cx: CX,
	cy: CY,
	radius: R_IN + 16,
	size: 62,
	tracking: 6,
});
// "Vapor" as a neon-sign script: each stroke is one tube. Drawn for a baseline at y 652 and an x-height of about 80.
const VAPOR = [
	// V: an entry curl, the left arm down to the point, the right arm up with a curl at its top.
	"M196 560C188 512 226 470 270 474C300 478 314 560 336 654C356 584 384 512 418 474C432 458 456 456 460 476",
	// a: the bowl, then its stem, leaving to the right.
	"M494 590C484 568 452 566 438 590C422 618 432 652 458 650C480 648 492 620 498 592L488 636C486 652 500 656 512 646",
	// p: up to the x-height, down past the baseline, and the bowl.
	"M512 646C522 622 528 600 534 584L512 732",
	"M528 604C538 578 578 572 590 598C600 626 572 656 540 648",
	// o, and the stroke that joins it to the r.
	"M640 584C612 582 600 620 612 642C624 662 660 654 668 624C674 600 660 582 640 584Z",
	"M666 604C676 600 686 602 694 606",
	// r: the stem, the shoulder, and a closing flourish.
	"M694 606L686 652",
	"M690 620C698 596 718 580 742 586C756 590 766 600 784 590C798 582 814 586 822 600",
];
// Drips falling from the letters: x, top, length.
const VAPOR_DRIPS = [
	[336, 650, 46],
	[458, 650, 26],
	[512, 734, 30],
	[612, 646, 38],
	[686, 652, 52],
];

// Smoke: overlapping puffs filled with one gradient across the whole cloud, so they merge into a single soft shape, with
// blurred light on top and shade underneath; the right cloud mirrors the left.
const PUFFS = [
	[262, 470, 66],
	[200, 512, 62],
	[310, 410, 50],
	[150, 572, 56],
	[232, 578, 74],
	[318, 534, 64],
	[122, 640, 44],
	[200, 640, 58],
	[372, 474, 42],
	[286, 618, 50],
];
const LIGHTS = [
	[246, 440, 40],
	[178, 500, 34],
	[300, 396, 26],
];
const SHADES = [
	[220, 640, 56],
	[300, 600, 44],
	[140, 650, 34],
];
const cloud = (mirror) => {
	const X = (x) => (mirror ? 1000 - x : x);
	return (
		`<g>${PUFFS.map(([x, y, r]) => `<circle cx="${X(x)}" cy="${y}" r="${r}"/>`).join("")}</g>` +
		`<g filter="url(#soft)">${SHADES.map(([x, y, r]) => `<circle cx="${X(x)}" cy="${y}" r="${r}" fill="${C.blue}" opacity="0.55"/>`).join("")}` +
		`${LIGHTS.map(([x, y, r]) => `<circle cx="${X(x)}" cy="${y}" r="${r}" fill="${C.pinkLight}" opacity="0.6"/>`).join("")}</g>`
	);
};

// Continents: loose shapes, enough to read as a globe.
const LAND = [
	"M312 330C340 300 392 296 410 326C424 350 400 372 404 398C408 430 380 446 356 432C332 418 330 392 312 382C296 372 296 346 312 330Z",
	"M560 270C600 256 650 270 664 300C676 326 648 340 652 364C656 392 690 402 684 428C676 456 636 452 618 430C600 408 600 380 580 366C556 350 528 330 534 302C538 286 546 276 560 270Z",
	"M640 470C668 460 700 474 704 502C708 528 684 548 662 540C640 532 624 510 640 470Z",
	"M420 220C444 210 474 214 482 232C490 250 468 262 448 260C428 258 410 238 420 220Z",
];

// The tank, drawn upright about its own axis and then leaned.
const TANK = `
	<g transform="rotate(-14 500 430) translate(75 92) scale(0.85)">
		<rect x="476" y="172" width="48" height="52" rx="8" fill="url(#metal)" stroke="${C.cyanSoft}" stroke-width="3"/>
		<rect x="462" y="222" width="76" height="22" rx="6" fill="url(#metal)" stroke="${C.cyanSoft}" stroke-width="3"/>
		<rect x="452" y="244" width="96" height="70" rx="10" fill="url(#metal)" stroke="${C.violet}" stroke-width="3"/>
		<path d="M458 268H542M458 290H542" stroke="${C.cyan}" stroke-width="3" opacity="0.8"/>
		<rect x="446" y="314" width="108" height="20" rx="6" fill="url(#metal)" stroke="${C.cyanSoft}" stroke-width="3"/>
		<rect x="452" y="334" width="96" height="62" rx="8" fill="url(#glass)" stroke="${C.cyanSoft}" stroke-width="3"/>
		<rect x="440" y="396" width="120" height="22" rx="6" fill="url(#metal)" stroke="${C.pink}" stroke-width="3"/>
		<rect x="430" y="418" width="140" height="200" rx="14" fill="url(#metal)" stroke="${C.violet}" stroke-width="3.5"/>
		<rect x="452" y="430" width="16" height="176" rx="8" fill="${C.white}" opacity="0.18"/>
		<path d="M436 452H564" stroke="${C.cyan}" stroke-width="3" opacity="0.7"/>
	</g>`;

// The base: a chevron plate with circuit traces, and the globe in a hexagon.
const BASE_PLATE = "M210 720L790 720L760 790L560 790L500 850L440 790L240 790Z";
const TRACES = ["M262 742H380L398 760H448", "M738 742H620L602 760H552", "M282 768H372", "M718 768H628"];
const DOTS = [
	[262, 742],
	[738, 742],
	[282, 768],
	[718, 768],
];

// Drips under "Vapor".
const DRIPS = [
	[322, 700, 34],
	[402, 704, 22],
	[566, 706, 40],
	[672, 702, 26],
	[728, 698, 46],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 60 880 840" width="880" height="840" role="img" aria-labelledby="t">
<title id="t">Worldwide Vapor</title>
<defs>
	<linearGradient id="ringFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.purple}"/><stop offset="1" stop-color="${C.deep}"/></linearGradient>
	<linearGradient id="neon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.pink}"/><stop offset="0.5" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
	<linearGradient id="word" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.white}"/><stop offset="1" stop-color="${C.pinkLight}"/></linearGradient>
	<radialGradient id="globe" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#2b2a8a"/><stop offset="0.55" stop-color="#1a1650"/><stop offset="1" stop-color="${C.deep}"/></radialGradient>
	<linearGradient id="cloud" gradientUnits="userSpaceOnUse" x1="0" y1="360" x2="0" y2="700"><stop offset="0" stop-color="${C.pinkLight}"/><stop offset="0.3" stop-color="${C.pink}"/><stop offset="0.65" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.blue}"/></linearGradient>
	<linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2550"/><stop offset="0.35" stop-color="#5a4f9a"/><stop offset="0.55" stop-color="#1c1838"/><stop offset="1" stop-color="#0f0d22"/></linearGradient>
	<linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0.35"/><stop offset="0.5" stop-color="${C.violet}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.pink}" stop-opacity="0.35"/></linearGradient>
	<linearGradient id="vapor" gradientUnits="userSpaceOnUse" x1="0" y1="460" x2="0" y2="740"><stop offset="0" stop-color="${C.white}"/><stop offset="0.35" stop-color="${C.cyanSoft}"/><stop offset="0.75" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient>
	<linearGradient id="drip" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="790"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0.7"/></linearGradient>
	<linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.section}"/><stop offset="1" stop-color="${C.bg}"/></linearGradient>
	<clipPath id="globeClip"><circle cx="${CX}" cy="${CY}" r="${R_GLOBE}"/></clipPath>
	<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
	<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
</defs>

<!-- Halo behind the ring -->
<circle cx="${CX}" cy="${CY}" r="${R_OUT + 4}" fill="none" stroke="${C.pink}" stroke-width="18" opacity="0.55" filter="url(#soft)"/>

<!-- Globe -->
<circle cx="${CX}" cy="${CY}" r="${R_GLOBE}" fill="url(#globe)"/>
<g clip-path="url(#globeClip)">
	<g fill="${C.violet}" opacity="0.65">${LAND.map((d) => `<path d="${d}"/>`).join("")}</g>
	<g fill="none" stroke="${C.cyanSoft}" stroke-opacity="0.18" stroke-width="2">
		<ellipse cx="${CX}" cy="${CY}" rx="${R_GLOBE}" ry="90"/><ellipse cx="${CX}" cy="${CY}" rx="${R_GLOBE}" ry="190"/>
		<ellipse cx="${CX}" cy="${CY}" rx="90" ry="${R_GLOBE}"/><ellipse cx="${CX}" cy="${CY}" rx="190" ry="${R_GLOBE}"/>
		<path d="M${CX} ${CY - R_GLOBE}V${CY + R_GLOBE}M${CX - R_GLOBE} ${CY}H${CX + R_GLOBE}"/>
	</g>
	<circle cx="${CX - 60}" cy="${CY - 80}" r="160" fill="${C.cyanSoft}" opacity="0.08"/>
</g>

<!-- Ring with WORLDWIDE -->
<path d="${ring(R_OUT, R_IN)}" fill="url(#ringFill)" fill-rule="evenodd"/>
<circle cx="${CX}" cy="${CY}" r="${R_OUT}" fill="none" stroke="url(#neon)" stroke-width="7" filter="url(#glow)"/>
<circle cx="${CX}" cy="${CY}" r="${R_IN}" fill="none" stroke="url(#neon)" stroke-width="5" filter="url(#glow)"/>
<circle cx="${CX}" cy="${CY}" r="${R_OUT}" fill="none" stroke="${C.white}" stroke-opacity="0.7" stroke-width="1.6"/>
<path d="${worldwide}" fill="url(#word)" stroke="${C.ink}" stroke-width="3" paint-order="stroke" filter="url(#glow)"/>

<!-- Tank -->
${TANK}

<!-- Smoke -->
<clipPath id="cloudL">${PUFFS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</clipPath>
<clipPath id="cloudR">${PUFFS.map(([x, y, r]) => `<circle cx="${1000 - x}" cy="${y}" r="${r}"/>`).join("")}</clipPath>
<g filter="url(#glow)">
	<g fill="url(#cloud)" clip-path="url(#cloudL)">${cloud(false)}</g>
	<g fill="url(#cloud)" clip-path="url(#cloudR)">${cloud(true)}</g>
</g>

<!-- Base -->
<g transform="translate(0 34)">
<path d="${BASE_PLATE}" fill="url(#plate)" stroke="url(#neon)" stroke-width="5" stroke-linejoin="round" filter="url(#glow)"/>
<g fill="none" stroke="${C.cyan}" stroke-width="3" stroke-linecap="round" filter="url(#glow)">${TRACES.map((d) => `<path d="${d}"/>`).join("")}</g>
<g fill="${C.cyan}">${DOTS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join("")}</g>
<path d="${hex(500, 790, 40)}" fill="${C.deep}" stroke="${C.pink}" stroke-width="4" filter="url(#glow)"/>
<g fill="none" stroke="${C.cyanSoft}" stroke-width="3">
	<circle cx="500" cy="790" r="20"/><ellipse cx="500" cy="790" rx="9" ry="20"/><path d="M480 790H520M483 780H517M483 800H517"/>
</g>

</g>

<!-- Vapor: a dark 3D edge, a glow, the coloured tube, and its white-hot core; drips fall from the letters -->
<g transform="translate(510 610) scale(1.22) translate(-510 -610)">
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
	<g transform="translate(4 12)" stroke="${C.purple}" stroke-width="22">${VAPOR.map((d) => `<path d="${d}"/>`).join("")}</g>
	<g transform="translate(2 7)" stroke="${C.ink}" stroke-width="22">${VAPOR.map((d) => `<path d="${d}"/>`).join("")}</g>
	<g stroke="${C.cyan}" stroke-width="30" opacity="0.45" filter="url(#soft)">${VAPOR.map((d) => `<path d="${d}"/>`).join("")}</g>
</g>
<g fill="url(#drip)">${VAPOR_DRIPS.map(([x, y, h]) => `<path d="M${x - 6} ${y}C${x - 6} ${y + h * 0.6} ${x - 9} ${y + h} ${x} ${y + h + 8}C${x + 9} ${y + h} ${x + 6} ${y + h * 0.6} ${x + 6} ${y}Z"/>`).join("")}</g>
<g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">
	<g stroke="url(#vapor)" stroke-width="18">${VAPOR.map((d) => `<path d="${d}"/>`).join("")}</g>
	<g stroke="${C.white}" stroke-width="6" stroke-opacity="0.9">${VAPOR.map((d) => `<path d="${d}"/>`).join("")}</g>
</g>
</g>
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`Wrote ${OUT} (${(svg.length / 1024).toFixed(1)} KB)`);
