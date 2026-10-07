// Draws the footer's retro web badges to public/badges/*.svg: node scripts/generate-badges.mjs
//
// Each badge is 88 x 31, the size of the small collectible buttons of the early web, and is built from whole pixels (a
// 5 x 7 bitmap font and hand-drawn 9 x 9 icons) so it stays crisp at 1x and scales cleanly. Everything is original artwork.
// The footer's list of badges and where they link is src/ui/sections/wv-home/wv-badges.ts; a test checks the two agree.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "badges");
const W = 88;
const H = 31;

const C = {
	ink: "#05030a",
	deep: "#0d0d1a",
	purple: "#3a1260",
	violet: "#7a1fa2",
	cyan: "#00e5ff",
	ice: "#e6fcff",
	pink: "#f179fb",
	hot: "#ff4fd8",
	gold: "#ffd84a",
	amber: "#ff9f1c",
	teal: "#0e6b7a",
};

/** A 5 x 7 pixel font. "#" is a lit pixel. */
const FONT = {
	A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
	B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
	C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
	D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
	E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
	F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
	G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
	H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
	I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
	J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
	K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
	L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
	M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
	N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
	O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
	P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
	Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
	R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
	S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
	T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
	U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
	V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
	W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
	X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
	Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
	Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
	0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
	1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
	2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
	3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
	4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
	5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
	6: [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
	7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
	8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
	9: [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
	"%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
	"-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
	".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
	"!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
	"+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
	"&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
	" ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

/** Merges lit pixels into one path per colour (horizontal runs become one rectangle each), keeping the files small. */
function pixelPaths(pixels) {
	const byColor = new Map();
	for (const { x, y, color } of pixels) {
		if (!byColor.has(color)) byColor.set(color, []);
		byColor.get(color).push([x, y]);
	}
	return [...byColor]
		.map(([color, points]) => {
			points.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
			const runs = [];
			for (const [x, y] of points) {
				const last = runs[runs.length - 1];
				if (last && last.y === y && last.x + last.w === x) last.w += 1;
				else runs.push({ x, y, w: 1 });
			}
			const d = runs.map((r) => `M${r.x} ${r.y}h${r.w}v1h-${r.w}z`).join("");
			return `<path fill="${color}" d="${d}"/>`;
		})
		.join("");
}

/** Pixels of a string of text at (x, y): 6px per letter (5 wide plus a gap), 7 tall. */
function text(str, x, y, color) {
	const pixels = [];
	[...str.toUpperCase()].forEach((ch, i) => {
		const glyph = FONT[ch];
		if (!glyph) throw new Error(`No glyph for "${ch}" in "${str}"`);
		glyph.forEach((row, dy) => {
			[...row].forEach((cell, dx) => {
				if (cell === "#") pixels.push({ x: x + i * 6 + dx, y: y + dy, color });
			});
		});
	});
	return pixelPaths(pixels);
}

/** Draws a bitmap whose characters are palette keys ("." is empty) at (x, y). */
function icon(rows, palette, x, y) {
	const pixels = [];
	rows.forEach((row, dy) => {
		[...row].forEach((cell, dx) => {
			if (cell !== "." && palette[cell]) pixels.push({ x: x + dx, y: y + dy, color: palette[cell] });
		});
	});
	return pixelPaths(pixels);
}

const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** The frame: flat colour bands for the background, a 1px dark outline, and a light top-left / dark bottom-right bevel. */
function frame(bands, light, dark) {
	let y = 0;
	const parts = bands.map(([height, fill]) => {
		const part = rect(0, y, W, height, fill);
		y += height;
		return part;
	});
	return [
		...parts,
		rect(0, 0, W, 1, light),
		rect(0, 0, 1, H, light),
		rect(0, H - 1, W, 1, dark),
		rect(W - 1, 0, 1, H, dark),
		// The outline sits outside the bevel's corners.
		rect(0, 0, 1, 1, C.ink),
		rect(W - 1, 0, 1, 1, C.ink),
		rect(0, H - 1, 1, 1, C.ink),
		rect(W - 1, H - 1, 1, 1, C.ink),
	].join("");
}

const badge = (body) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${body}</svg>\n`;

// ---- Icons: 9 x 9 ----
const CLOUD = [
	"..###....",
	".#####.##",
	"#########",
	"#########",
	".#######.",
	"..#####..",
	"...###...",
	"....#....",
	".........",
];
const COIN = [
	"..#####..",
	".#######.",
	"##.###.##",
	"#########",
	"#########",
	"##.###.##",
	".#######.",
	"..#####..",
	".........",
];
const HEART = [
	".........",
	".##...##.",
	"#####.###",
	"#########",
	"#########",
	".#######.",
	"..#####..",
	"...###...",
	"....#....",
];
const BOOK = [
	".........",
	"########.",
	"#aaa#bbb#",
	"#aaa#bbb#",
	"#aaa#bbb#",
	"#aaa#bbb#",
	"#aaa#bbb#",
	"########.",
	".........",
];
const STAR = [
	"....#....",
	"....#....",
	"...###...",
	"#########",
	".#######.",
	"..#####..",
	".###.###.",
	".##...##.",
	".#.....#.",
];

const MONITOR = [
	".........",
	"#########",
	"#aaaaaaa#",
	"#abbbbba#",
	"#abbbbba#",
	"#aaaaaaa#",
	"#########",
	"...###...",
	"..#####..",
];

const files = {};

// 1. The site emblem (links home).
files["worldwide-vapor.svg"] = badge(
	[
		frame(
			[
				[11, C.purple],
				[10, C.deep],
				[10, C.ink],
			],
			C.pink,
			C.violet,
		),
		rect(2, 2, 84, 1, C.cyan),
		rect(2, 28, 84, 1, C.pink),
		icon(CLOUD, { "#": C.ice }, 5, 11),
		icon(CLOUD, { "#": C.cyan }, 5, 12),
		text("WORLDWIDE", 20, 6, C.cyan),
		text("VAPOR", 20, 16, C.pink),
		text("VAPOR", 21, 16, C.hot),
		icon(STAR, { "#": C.gold }, 70, 18),
	].join(""),
);

// 2. The theme badge (a joke on "best viewed in…"). Not a link.
files["neon-theme.svg"] = badge(
	[
		frame(
			[
				[6, C.ink],
				[6, C.deep],
				[7, C.purple],
				[6, C.deep],
				[6, C.ink],
			],
			C.cyan,
			C.violet,
		),
		rect(2, 3, 84, 1, C.cyan),
		rect(2, 27, 84, 1, C.pink),
		text("BEST VIEWED", 11, 7, C.ice),
		text("IN NEON", 23, 16, C.cyan),
		text("IN NEON", 24, 16, C.pink),
	].join(""),
);

// 3. Vapor Tokens (links to the rewards page).
files["vapor-tokens.svg"] = badge(
	[
		frame(
			[
				[11, C.amber],
				[10, "#d97a0a"],
				[10, "#a85a06"],
			],
			C.gold,
			"#5c3003",
		),
		rect(2, 2, 84, 1, C.gold),
		text("VAPOR TOKENS", 3, 5, C.ink),
		text("EARN & SAVE", 3, 16, C.ice),
		icon(COIN, { "#": C.ink }, 78, 12),
		icon(COIN, { "#": C.gold }, 77, 11),
	].join(""),
);

// 4. The quit plan builder (links to /quit).
files["quit-plan.svg"] = badge(
	[
		frame(
			[
				[11, C.violet],
				[10, C.purple],
				[10, C.deep],
			],
			C.pink,
			C.ink,
		),
		rect(2, 2, 84, 1, C.pink),
		icon(HEART, { "#": C.hot }, 5, 11),
		icon(HEART, { "#": C.pink }, 5, 10),
		text("QUIT PLAN", 20, 6, C.ice),
		text("BUILDER", 20, 16, C.pink),
		text("BUILDER", 21, 16, C.cyan),
	].join(""),
);

// 5. The guides (links to /learn).
files["learn.svg"] = badge(
	[
		frame(
			[
				[11, C.teal],
				[10, "#0a4a56"],
				[10, C.deep],
			],
			C.cyan,
			C.ink,
		),
		rect(2, 2, 84, 1, C.cyan),
		icon(BOOK, { "#": C.ice, a: C.cyan, b: C.pink }, 5, 11),
		text("VAPE GUIDES", 20, 6, C.ice),
		text("& HOW-TOS", 20, 16, C.gold),
	].join(""),
);

// 6. My Desk (links to /desk).
files["my-desk.svg"] = badge(
	[
		frame(
			[
				[11, "#2b0f52"],
				[10, C.purple],
				[10, C.deep],
			],
			C.gold,
			C.ink,
		),
		rect(2, 2, 84, 1, C.gold),
		icon(MONITOR, { "#": C.ice, a: C.deep, b: C.cyan }, 5, 11),
		text("MY DESK", 20, 6, C.gold),
		text("YOUR CORNER", 20, 16, C.pink),
	].join(""),
);

mkdirSync(OUT, { recursive: true });
for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT, name), content);
console.log(`Wrote ${Object.keys(files).length} badges to ${OUT}`);
