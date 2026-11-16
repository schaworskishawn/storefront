/**
 * The Learn hero's art: a neon library at night. Shelves of glowing books line an aisle that runs back to an arched
 * doorway full of light; in the middle of the aisle an open book floats, vapour curling up from its pages, and the
 * page's kinds of content drift out of it as glass cards (an article, a review, a tip and a beginner's guide), joined to
 * it by trails of light. Drawn in the site's neon style (dark glass edged in neon, a tight glow and a wide bloom, pink,
 * purple and cyan on near-black, a vignette and fine grain), so it sits with the other heroes' art, stays sharp and costs
 * a few KB.
 *
 * The drawing is 480 × 320 (3:2), in one-point perspective toward the doorway at the centre, so it crops evenly: the
 * book and the cards sit in the middle band, which is all a wide banner frame shows. The cards and the book bob gently
 * (`.wv-float`, motion.css), only for visitors who haven't asked for less motion.
 */

const W = 480;
const H = 320;
/** The vanishing point: the far end of the aisle, in the doorway. */
const VP = { x: 240, y: 150 } as const;
/** Where the side walls end and the far wall begins (the right wall mirrors the left). */
const FAR_X = 150;
/** The side walls run past the frame's top and bottom at its near edge. */
const WALL_TOP = -60;
const WALL_BOTTOM = 380;

/** How much of its near size a point on the left wall keeps at `x`: 1 at the near edge, less toward the far end. */
const depth = (x: number) => (VP.x - x) / VP.x;
/** Where a height `y` at the left wall's near edge lands at `x`, along its line to the vanishing point. */
const onWall = (x: number, y: number) => VP.y + (y - VP.y) * depth(x);

const FAR_TOP = onWall(FAR_X, WALL_TOP);
const FAR_BOTTOM = onWall(FAR_X, WALL_BOTTOM);
/** Where a line on the floor from the far wall's foot at `x` meets the frame's bottom edge. */
const floorEdge = (x: number) => VP.x + ((x - VP.x) * (H - VP.y)) / (FAR_BOTTOM - VP.y);

/** Each shelf's plank, as its height at the side wall's near edge, and how tall a shelf is there. */
const SHELF_BOTTOMS = [70, 150, 230, 310] as const;
const SHELF_HEIGHT = 80;

const TONES = ["cyan", "pink", "soft"] as const;
type Tone = (typeof TONES)[number];
const TONE_COLOR: Record<Tone, string> = {
	cyan: "var(--wv-cyan)",
	pink: "var(--wv-pink)",
	soft: "var(--wv-cyan-soft)",
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A small seeded random number generator (mulberry32), so the shelves come out the same on the server and the client. */
function random(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Books grouped by colour, so a wall is a handful of paths: their outlines (closed, so they fill) and the bands across
 * their spines. */
type Spines = Record<Tone, { books: string; bands: string }>;

/**
 * Fills shelves with books from `x0` to `x1`: `bottomAt(x, plank)` is where a shelf's plank is at `x` and `scaleAt(x)`
 * how far away it is there (the side walls shrink toward the doorway; the far wall is flat). Books vary in width,
 * height and colour, with the odd gap.
 */
function shelves(
	seed: number,
	x0: number,
	x1: number,
	bottomAt: (x: number, plank: number) => number,
	scaleAt: (x: number) => number,
): Spines {
	const rand = random(seed);
	const spines: Spines = {
		cyan: { books: "", bands: "" },
		pink: { books: "", bands: "" },
		soft: { books: "", bands: "" },
	};
	for (const plank of SHELF_BOTTOMS) {
		let x = x0;
		while (x < x1 - 2) {
			const scale = scaleAt(x);
			const width = (6 + rand() * 7) * scale;
			if (rand() < 0.08) {
				x += width * 1.5;
				continue;
			}
			const xEnd = Math.min(x + width, x1);
			const height = (0.58 + rand() * 0.32) * SHELF_HEIGHT;
			const b1 = bottomAt(x, plank);
			const b2 = bottomAt(xEnd, plank);
			const t1 = b1 - height * scale;
			const t2 = b2 - height * scaleAt(xEnd);
			const tone = TONES[Math.floor(rand() * TONES.length)] ?? "cyan";
			spines[tone].books +=
				`M${r1(x)} ${r1(b1)}L${r1(x)} ${r1(t1)}L${r1(xEnd)} ${r1(t2)}L${r1(xEnd)} ${r1(b2)}Z`;
			for (const k of [0.18, 0.8])
				spines[tone].bands += `M${r1(x)} ${r1(t1 + k * (b1 - t1))}L${r1(xEnd)} ${r1(t2 + k * (b2 - t2))}`;
			x = xEnd + 0.9 * scale;
		}
	}
	return spines;
}

const sideWall = (seed: number) => shelves(seed, 2, FAR_X - 2, onWall, depth);
const LEFT_WALL = sideWall(7);
const RIGHT_WALL = sideWall(23);
/** The far wall's shelves, either side of the doorway: flat, at the far end's size. */
const FAR_SCALE = depth(FAR_X);
const farWall = (seed: number, x0: number, x1: number) =>
	shelves(
		seed,
		x0,
		x1,
		(_x, plank) => onWall(FAR_X, plank),
		() => FAR_SCALE,
	);
const FAR_LEFT = farWall(41, FAR_X + 4, 200);
const FAR_RIGHT = farWall(59, 280, W - FAR_X - 4);

/** The doorway: an arch at the end of the aisle, standing on the floor. */
const DOOR = { left: 204, right: 276, archY: 140 } as const;
const DOOR_PATH = `M${DOOR.left} ${FAR_BOTTOM} L${DOOR.left} ${DOOR.archY} A36 36 0 0 1 ${DOOR.right} ${DOOR.archY} L${DOOR.right} ${FAR_BOTTOM} Z`;

/** Dust in the light from the doorway. */
const MOTES = (() => {
	const rand = random(97);
	return Array.from({ length: 28 }, () => ({
		cx: r1(160 + rand() * 160),
		cy: r1(70 + rand() * 180),
		r: r1(0.5 + rand() * 0.9),
		opacity: r1(0.3 + rand() * 0.5),
	}));
})();

/** The open book, floating in the aisle in front of the doorway: its two pages (closed, so they fill with glass), then
 * its cover and the lines of text. */
const BOOK = {
	pages: [
		"M240 186 C224 174 196 170 170 176 L170 224 C196 218 224 222 240 234 Z",
		"M240 186 C256 174 284 170 310 176 L310 224 C284 218 256 222 240 234 Z",
	],
	open: [
		"M162 184 L162 232 C192 226 222 230 240 242 C258 230 288 226 318 232 L318 184",
		...[191, 200, 209].flatMap((y) => [
			`M180 ${y} C194 ${y - 4} 212 ${y - 3} 230 ${y + 3}`,
			`M250 ${y + 3} C268 ${y - 3} 286 ${y - 4} 300 ${y}`,
		]),
		"M180 218 C190 215 198 215 206 216",
		"M274 216 C282 215 290 215 300 218",
	],
};

/** The trails of light from the book out to each card, and the vapour curling up from its spine. */
const TRAILS = [
	{ d: "M234 184 C220 160 186 160 162 140", tone: "cyan" },
	{ d: "M246 184 C260 160 294 160 318 140", tone: "pink" },
	{ d: "M178 206 C158 194 140 196 124 194", tone: "pink" },
	{ d: "M302 206 C322 194 340 196 356 194", tone: "cyan" },
] as const;
const VAPOUR = [
	"M240 184 C230 168 250 158 240 142 C232 130 248 120 242 106",
	"M244 184 C254 172 238 162 248 150 C256 140 244 132 250 120",
];

/** The glass cards, each with a glyph and a few lines of "text": what the page offers. */
const CARDS: ReadonlyArray<{
	x: number;
	y: number;
	w: number;
	h: number;
	rotate: number;
	delay: string;
	strokes: readonly string[];
	dots?: readonly string[];
}> = [
	// An article: a picture with a hill and the sun, a headline and lines of text.
	{
		x: 150,
		y: 112,
		w: 66,
		h: 48,
		rotate: -10,
		delay: "0s",
		strokes: [
			"M-26 -17 L-4 -17 L-4 1 L-26 1 Z",
			"M-24 -1 L-18 -8 L-13 -3 L-10 -6 L-6 -1",
			"M2 -14 L26 -14",
			"M2 -7 L26 -7",
			"M2 0 L20 0",
			"M-26 9 L26 9",
			"M-26 16 L12 16",
		],
		dots: ["M-9 -12 m-1.8 0 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0"],
	},
	// A review: a star, the rating bars beside it and the score in dots.
	{
		x: 330,
		y: 112,
		w: 66,
		h: 48,
		rotate: 10,
		delay: "-3s",
		strokes: [
			"M-15 -15 L-12.1 -7.1 L-3.6 -6.7 L-10.2 -1.5 L-7.9 6.7 L-15 2 L-22.1 6.7 L-19.8 -1.5 L-26.4 -6.7 L-17.9 -7.1 Z",
			"M4 -12 L26 -12",
			"M4 -4 L20 -4",
			"M4 4 L24 4",
			"M14 15 L26 15",
		],
		dots: [-24, -17, -10, -3, 4].map((cx) => `M${cx} 15 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0`),
	},
	// A tip: a lightbulb and its note.
	{
		x: 96,
		y: 192,
		w: 52,
		h: 38,
		rotate: -6,
		delay: "-1.5s",
		strokes: [
			"M-11 -13 C-17 -13 -20 -8 -20 -4 C-20 0 -17 2 -15 5 L-15 7 L-7 7 L-7 5 C-5 2 -2 0 -2 -4 C-2 -8 -5 -13 -11 -13 Z",
			"M-14 10.5 L-8 10.5",
			"M4 -8 L19 -8",
			"M4 -1 L17 -1",
			"M4 6 L14 6",
		],
	},
	// A beginner's guide: a mortarboard and its note.
	{
		x: 384,
		y: 192,
		w: 52,
		h: 38,
		rotate: 6,
		delay: "-4.5s",
		strokes: [
			"M-11 -11 L2 -6 L-11 -1 L-24 -6 Z",
			"M-18 -3 L-18 4 Q-11 9 -4 4 L-4 -3",
			"M-11 -6 L-1 -4 L-1 4",
			"M6 -8 L20 -8",
			"M6 -1 L18 -1",
			"M6 6 L15 6",
		],
	},
];

const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";
const isClosed = (d: string) => d.trimEnd().endsWith("Z");
const screen = { mixBlendMode: "screen" } as const;

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

export function LearnHeroArt({ idPrefix }: { idPrefix: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;

	const sideWallPolygon = `0,${WALL_TOP} ${FAR_X},${FAR_TOP} ${FAR_X},${FAR_BOTTOM} 0,${WALL_BOTTOM}`;
	const books = (spines: Spines) =>
		TONES.map((tone) => (
			<g key={tone} stroke={TONE_COLOR[tone]} strokeLinejoin="round">
				<path
					d={spines[tone].books}
					fill={TONE_COLOR[tone]}
					fillOpacity="0.1"
					strokeOpacity="0.8"
					strokeWidth="0.9"
				/>
				<path d={spines[tone].bands} fill="none" strokeOpacity="0.55" strokeWidth="0.6" />
			</g>
		));
	const sideWall = (spines: Spines) => (
		<>
			<polygon points={sideWallPolygon} fill="var(--wv-ink)" />
			<polygon points={sideWallPolygon} fill={url("wall-light")} />
			{/* The planks: a dark board with a neon edge, each running back to the doorway. */}
			{SHELF_BOTTOMS.map((plank) => (
				<polygon
					key={plank}
					points={`0,${plank} ${FAR_X},${onWall(FAR_X, plank)} ${FAR_X},${onWall(FAR_X, plank + 5)} 0,${plank + 5}`}
					fill="var(--wv-deep)"
				/>
			))}
			<g filter={url("glow")}>
				{books(spines)}
				<g stroke="var(--wv-pink)" strokeOpacity="0.85" strokeWidth="1.4">
					{SHELF_BOTTOMS.map((plank) => (
						<path key={plank} d={`M0 ${plank} L${FAR_X} ${onWall(FAR_X, plank)}`} />
					))}
				</g>
			</g>
			<polygon points={sideWallPolygon} fill={url("wall-haze")} />
		</>
	);

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="xMidYMid slice"
			// `isolate`: the screen and overlay blends mix only with the drawing, never with the page behind it.
			className="absolute inset-0 isolate size-full"
			aria-hidden
			focusable="false"
		>
			<defs>
				<linearGradient
					id={id("ceiling")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={WALL_TOP}
					x2="0"
					y2={FAR_TOP}
				>
					{stop("0%", "var(--wv-bg)")}
					{stop("100%", "var(--wv-purple)", 0.4)}
				</linearGradient>
				<linearGradient id={id("floor")} gradientUnits="userSpaceOnUse" x1="0" y1={FAR_BOTTOM} x2="0" y2={H}>
					{stop("0%", "var(--wv-purple)", 0.6)}
					{stop("100%", "var(--wv-bg)")}
				</linearGradient>
				<linearGradient id={id("far-wall")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-purple)", 0.3)}
					{stop("100%", "var(--wv-purple)", 0.55)}
				</linearGradient>
				{/* The side walls catch the doorway's light toward the far end, and fade into its haze. */}
				<linearGradient id={id("wall-light")} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={FAR_X} y2="0">
					{stop("0%", "var(--wv-purple)", 0.05)}
					{stop("100%", "var(--wv-purple)", 0.5)}
				</linearGradient>
				<linearGradient id={id("wall-haze")} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={FAR_X} y2="0">
					{stop("45%", "var(--wv-pink)", 0)}
					{stop("100%", "var(--wv-pink)", 0.22)}
				</linearGradient>

				<radialGradient id={id("door")} gradientUnits="userSpaceOnUse" cx={VP.x} cy="168" r="78">
					{stop("0%", "white")}
					{stop("32%", "var(--wv-cyan-soft)", 0.95)}
					{stop("72%", "var(--wv-pink)", 0.9)}
					{stop("100%", "var(--wv-purple)", 0.95)}
				</radialGradient>
				<linearGradient id={id("door-rim")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<radialGradient id={id("rays")} gradientUnits="userSpaceOnUse" cx={VP.x} cy="165" r="250">
					{stop("0%", "white", 0.22)}
					{stop("100%", "white", 0)}
				</radialGradient>
				<linearGradient id={id("spill")} gradientUnits="userSpaceOnUse" x1="0" y1={FAR_BOTTOM} x2="0" y2={H}>
					{stop("0%", "var(--wv-cyan-soft)", 0.5)}
					{stop("100%", "var(--wv-cyan-soft)", 0)}
				</linearGradient>
				<radialGradient id={id("pool")}>
					{stop("0%", "var(--wv-pink)", 0.7)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>

				{/* The book and the cards: cyan at the top to pink at the foot, over smoked glass. */}
				<linearGradient id={id("neon")} gradientUnits="userSpaceOnUse" x1="0" y1="170" x2="0" y2="242">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("card-edge")} x1="0" y1="0" x2="1" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("card-glass")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-deep)", 0.86)}
					{stop("100%", "var(--wv-purple)", 0.72)}
				</linearGradient>
				<linearGradient id={id("card-sheen")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "white", 0.16)}
					{stop("100%", "white", 0)}
				</linearGradient>

				<radialGradient id={id("vignette")} r="72%">
					{stop("58%", "var(--wv-bg)", 0)}
					{stop("100%", "var(--wv-bg)", 0.7)}
				</radialGradient>
				<filter id={id("glow")} x="-40%" y="-40%" width="180%" height="180%">
					<feGaussianBlur stdDeviation="1.6" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("neon-glow")} x="-60%" y="-60%" width="220%" height="220%">
					<feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="tight" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="wide" />
					<feMerge>
						<feMergeNode in="wide" />
						<feMergeNode in="tight" />
						<feMergeNode in="tight" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("shadow")} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="5" />
				</filter>
				<filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="7" />
				</filter>
				<filter id={id("halo")} x="-80%" y="-80%" width="260%" height="260%">
					<feGaussianBlur stdDeviation="18" />
				</filter>
				<filter id={id("grain")} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
			</defs>

			{/* The room: the ceiling with its light strips running back to the doorway, and the floor with its boards. */}
			<rect width={W} height={H} fill="var(--wv-bg)" />
			<polygon
				points={`0,${WALL_TOP} ${FAR_X},${FAR_TOP} ${W - FAR_X},${FAR_TOP} ${W},${WALL_TOP}`}
				fill={url("ceiling")}
			/>
			<g stroke="var(--wv-cyan-soft)" strokeWidth="2" strokeLinecap="round" filter={url("neon-glow")}>
				{[-25, 25].map((dx) => (
					<path
						key={dx}
						d={`M${VP.x + dx} ${FAR_TOP} L${r1(VP.x + (dx * (VP.y - WALL_TOP)) / (VP.y - FAR_TOP))} ${WALL_TOP}`}
					/>
				))}
			</g>
			<polygon
				points={`0,${WALL_BOTTOM} ${FAR_X},${FAR_BOTTOM} ${W - FAR_X},${FAR_BOTTOM} ${W},${WALL_BOTTOM}`}
				fill={url("floor")}
			/>
			<g stroke="var(--wv-pink)" strokeOpacity="0.22" strokeWidth="1">
				{Array.from({ length: 9 }, (_, i) => FAR_X + 6 + i * 21).map((x) => (
					<path key={x} d={`M${x} ${FAR_BOTTOM} L${r1(floorEdge(x))} ${H}`} />
				))}
			</g>
			<polygon
				points={`${DOOR.left},${FAR_BOTTOM} ${DOOR.right},${FAR_BOTTOM} ${r1(floorEdge(DOOR.right + 20))},${H} ${r1(floorEdge(DOOR.left - 20))},${H}`}
				fill={url("spill")}
				filter={url("soft")}
				style={screen}
			/>

			{/* The far wall: shelves either side of the doorway, and the doorway full of light. */}
			<rect x={FAR_X} y={FAR_TOP} width={W - 2 * FAR_X} height={FAR_BOTTOM - FAR_TOP} fill="var(--wv-ink)" />
			<rect
				x={FAR_X}
				y={FAR_TOP}
				width={W - 2 * FAR_X}
				height={FAR_BOTTOM - FAR_TOP}
				fill={url("far-wall")}
			/>
			<g filter={url("glow")} opacity="0.85">
				{books(FAR_LEFT)}
				{books(FAR_RIGHT)}
				<g stroke="var(--wv-pink)" strokeOpacity="0.8" strokeWidth="1">
					{SHELF_BOTTOMS.map((plank) => {
						const y = r1(onWall(FAR_X, plank));
						return <path key={plank} d={`M${FAR_X} ${y} L200 ${y} M280 ${y} L${W - FAR_X} ${y}`} />;
					})}
				</g>
			</g>
			<path d={DOOR_PATH} fill="var(--wv-pink)" opacity="0.55" filter={url("halo")} />
			<path d={DOOR_PATH} fill={url("door")} />
			<g stroke="var(--wv-deep)" strokeOpacity="0.5" strokeWidth="2">
				<path d={`M${VP.x} ${DOOR.archY - 36} L${VP.x} ${FAR_BOTTOM}`} />
				<path d={`M${DOOR.left} 150 L${DOOR.right} 150 M${DOOR.left} 196 L${DOOR.right} 196`} />
			</g>
			<path d={DOOR_PATH} fill="none" stroke={url("door-rim")} strokeWidth="2.4" filter={url("neon-glow")} />

			{/* The side walls of shelves; the right one is the left drawn mirrored, with its own books. */}
			{sideWall(LEFT_WALL)}
			<g transform={`translate(${W} 0) scale(-1 1)`}>{sideWall(RIGHT_WALL)}</g>

			{/* Light pouring out of the doorway into the aisle, and the dust caught in it. */}
			<g fill={url("rays")} filter={url("soft")} style={screen}>
				<polygon points={`236,160 244,160 140,${WALL_TOP} 96,${WALL_TOP}`} />
				<polygon points={`236,160 244,160 384,${WALL_TOP} 340,${WALL_TOP}`} />
				<polygon points="236,166 244,166 0,96 0,62" />
				<polygon points="236,166 244,166 480,62 480,96" />
			</g>
			<g fill="white" style={screen}>
				{MOTES.map((m) => (
					<circle key={`${m.cx}-${m.cy}`} cx={m.cx} cy={m.cy} r={m.r} opacity={m.opacity} />
				))}
			</g>

			{/* The book: light pooling on the floor beneath it, a shadow, then neon over dark glass. */}
			<ellipse cx={VP.x} cy="268" rx="92" ry="10" fill={url("pool")} style={screen} />
			<g className="wv-float" style={{ animationDelay: "-0.8s" }}>
				<g fill="var(--wv-bg)" fillOpacity="0.8" filter={url("shadow")}>
					{BOOK.pages.map((d) => (
						<path key={d} d={d} />
					))}
				</g>
				<g fill="var(--wv-deep)" fillOpacity="0.88">
					{BOOK.pages.map((d) => (
						<path key={d} d={d} />
					))}
				</g>
				<g fill="none" strokeLinecap="round" strokeLinejoin="round">
					<g stroke={url("neon")} strokeWidth="3.2" filter={url("neon-glow")}>
						{[...BOOK.pages, ...BOOK.open].map((d) => (
							<path key={d} d={d} />
						))}
					</g>
					<g stroke="white" strokeOpacity="0.9" strokeWidth="1">
						{[...BOOK.pages, ...BOOK.open].map((d) => (
							<path key={d} d={d} />
						))}
					</g>
				</g>
			</g>

			{/* Vapour curling up from the book, and the trails of light out to the cards. */}
			<g fill="none" strokeLinecap="round">
				<g stroke="var(--wv-pink)" strokeWidth="2.4" opacity="0.7" filter={url("glow")}>
					{VAPOUR.map((d) => (
						<path key={d} d={d} />
					))}
				</g>
				{TRAILS.map(({ d, tone }) => (
					<path
						key={d}
						d={d}
						stroke={TONE_COLOR[tone]}
						strokeWidth="2.2"
						strokeDasharray="0.1 6"
						filter={url("glow")}
					/>
				))}
			</g>

			{/* The cards: smoked glass edged in neon, a sheen across the top, and each one's glyph and lines. */}
			{CARDS.map((card) => {
				const box = { x: -card.w / 2, y: -card.h / 2, width: card.w, height: card.h, rx: 6 };
				return (
					<g key={`${card.x}-${card.y}`} className="wv-float" style={{ animationDelay: card.delay }}>
						<g transform={`translate(${card.x} ${card.y}) rotate(${card.rotate})`}>
							<rect {...box} fill="var(--wv-bg)" opacity="0.7" filter={url("shadow")} />
							<rect {...box} fill={url("card-glass")} />
							<rect {...box} height={card.h / 2} fill={url("card-sheen")} />
							<rect
								{...box}
								fill="none"
								stroke={url("card-edge")}
								strokeWidth="1.8"
								filter={url("neon-glow")}
							/>
							<rect {...box} fill="none" stroke="white" strokeOpacity="0.75" strokeWidth="0.6" />
							<g
								fill="none"
								stroke="var(--wv-cyan-soft)"
								strokeWidth="1.6"
								strokeLinecap="round"
								strokeLinejoin="round"
								filter={url("glow")}
							>
								{card.strokes.map((d) => (
									<path key={d} d={d} fill={isClosed(d) ? "var(--wv-cyan)" : "none"} fillOpacity="0.12" />
								))}
							</g>
							<g fill="var(--wv-pink)" filter={url("glow")}>
								{card.dots?.map((d) => (
									<path key={d} d={d} />
								))}
							</g>
						</g>
					</g>
				);
			})}

			{/* Sparks in the air. */}
			<g fill="white" filter={url("neon-glow")}>
				<path d={SPARK} transform="translate(204 92) scale(0.45)" />
				<path d={SPARK} transform="translate(282 84) scale(0.36)" />
				<path d={SPARK} transform="translate(56 132) scale(0.42)" />
				<path d={SPARK} transform="translate(428 140) scale(0.5)" />
			</g>

			{/* Over everything: the vignette, then the grain. */}
			<rect width={W} height={H} fill={url("vignette")} />
			<rect width={W} height={H} filter={url("grain")} opacity="0.07" style={{ mixBlendMode: "overlay" }} />
		</svg>
	);
}
