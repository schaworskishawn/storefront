/**
 * The rewards hero's art: the idea behind Vapor Tokens, told left to right as a neon scene at night. A shopping bag
 * (a "$" on its front) throws tokens up along a dotted cyan trail of light, with little "+" sparks along the way: you
 * earn as you shop. They land on a glowing stack of tokens in the middle, under a big Vapor Token floating in front of
 * a striped neon sun: your balance. From the stack a dotted pink trail carries a token on to a price tag whose price is
 * struck through and replaced by a lower one: you spend them at checkout. All on a neon grid floor running to the
 * horizon, with two small tokens drifting in the sky.
 *
 * Drawn in the site's neon style (dark glass edged in neon, a tight glow and a wide bloom, pink, purple and cyan on
 * near-black, a vignette and fine grain), so it sits with the other heroes' art, stays sharp and costs a few KB. No
 * numbers are drawn, so the art can never disagree with the program's live rate or token value.
 *
 * The drawing is 480 × 360 (4:3), shown whole from tablets up; phones show it at 16:10, which keeps y 30–330, where
 * everything that matters sits. The big token and the tokens on the trails and in the sky bob gently (`.wv-float`,
 * motion.css), only for visitors who haven't asked for less motion.
 */

const W = 480;
const H = 360;
const HORIZON = 228;
/** Where the grid floor's lines meet. */
const VP = { x: 240, y: HORIZON };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A small seeded random number generator (mulberry32), so the stars come out the same on the server and the client. */
function random(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const STARS = (() => {
	const rand = random(17);
	return Array.from({ length: 26 }, () => ({
		cx: r1(rand() * W),
		cy: r1(12 + rand() * 170),
		r: r1(0.5 + rand() * 0.8),
		opacity: r1(0.3 + rand() * 0.5),
	}));
})();

/** The grid floor: lines across, closer together toward the horizon, and lines running out from the vanishing point. */
const GRID = (() => {
	let d = "";
	for (let k = 0; ; k++) {
		const y = HORIZON + 4 * Math.pow(1.5, k);
		if (y > H + 10) break;
		d += `M0 ${r1(y)}H${W}`;
	}
	for (let i = -10; i <= 10; i++) d += `M${VP.x} ${VP.y}L${r1(VP.x + i * 62)} ${H + 20}`;
	return d;
})();

/** The striped sun behind the big token: a half disc on the horizon, its stripes thickening toward the bottom. */
const SUN = { cx: 240, r: 96 } as const;
const SUN_STRIPES = [
	{ y: HORIZON - 58, h: 1.6 },
	{ y: HORIZON - 45, h: 2.4 },
	{ y: HORIZON - 33, h: 3.4 },
	{ y: HORIZON - 22, h: 4.4 },
	{ y: HORIZON - 11, h: 5.4 },
] as const;

/** "VT", as neon-tube strokes around (0, 0), about 32 × 18. */
const VT = "M-16 -9 L-9.5 9 L-3 -9 M2 -9 L16 -9 M9 -9 L9 9";
/** "$", as one stroke and a bar through it, about 10 × 24. */
const DOLLAR = "M5 -7 C3 -9.5 -5 -9.5 -5 -4 C-5 1 5 -1 5 4 C5 9.5 -3 9.5 -5 7 M0 -12 L0 12";
const PLUS = "M-4 0 H4 M0 -4 V4";
const MINUS = "M-4.5 0 H4.5";
const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";

/** The big token, floating over the stack in front of the sun. */
const BIG = { cx: 240, cy: 122, r: 42 } as const;

/** The stack: five tokens seen from a little above, each a top face over a rim, jostled slightly. */
const STACK = { rx: 40, ry: 11, rim: 7 } as const;
const STACK_COINS = [0, -3, 2, -1, 3].map((dx, i) => ({ cx: 240 + dx, cy: 296 - i * 8 }));
const STACK_TOP = STACK_COINS[STACK_COINS.length - 1] ?? { cx: 240, cy: 264 };
const rimPath = (cx: number, cy: number) =>
	`M${cx - STACK.rx} ${cy} A${STACK.rx} ${STACK.ry} 0 0 0 ${cx + STACK.rx} ${cy} L${cx + STACK.rx} ${cy + STACK.rim} A${STACK.rx} ${STACK.ry} 0 0 1 ${cx - STACK.rx} ${cy + STACK.rim} Z`;

/** The shopping bag, seen from its front-left corner: front, side, the open top, its handles, and a "$" on its front. */
const BAG = {
	front: "M58 230 L126 230 L132 302 L52 302 Z",
	side: "M126 230 L144 220 L150 290 L132 302 Z",
	opening: "M58 230 L76 220 L144 220 L126 230 Z",
	handleFront: "M74 230 C74 200 108 200 108 230",
	handleBack: "M92 220 C92 196 124 196 124 220",
	dollar: { x: 92, y: 268 },
} as const;

/** The price tag on the right, tilted: its body and hole, the old price struck through, the new one lower down. */
const TAG = {
	tilt: "rotate(-7 383 248)",
	body: "M383 192 L430 222 L430 294 Q430 302 422 302 L344 302 Q336 302 336 294 L336 222 Z",
	hole: { cx: 383, cy: 214, r: 5.5 },
	string: "M383 208.5 C384 196 392 188 402 184",
	oldPrice: "M352 246 L414 246",
	strike: "M348 255 L418 236",
	newPrice: "M352 272 L398 272",
	coin: { cx: 423, cy: 294 },
} as const;

/** The trails: earning (bag to stack) and spending (stack to tag), each a cubic curve so tokens can ride along it. */
type Pt = readonly [number, number];
const EARN: readonly [Pt, Pt, Pt, Pt] = [
	[100, 214],
	[110, 148],
	[188, 138],
	[226, 252],
];
const SPEND: readonly [Pt, Pt, Pt, Pt] = [
	[262, 254],
	[290, 194],
	[338, 178],
	[372, 206],
];
const curve = ([a, b, c, d]: readonly [Pt, Pt, Pt, Pt]) =>
	`M${a[0]} ${a[1]} C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}`;
const along = ([a, b, c, d]: readonly [Pt, Pt, Pt, Pt], t: number): Pt => {
	const u = 1 - t;
	const f = (i: 0 | 1) =>
		r1(u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
	return [f(0), f(1)];
};
const RIDERS = [
	{ at: along(EARN, 0.3), r: 9, delay: "-1s" },
	{ at: along(EARN, 0.66), r: 10, delay: "-3s" },
	{ at: along(SPEND, 0.5), r: 9, delay: "-2s" },
] as const;

const screen = { mixBlendMode: "screen" } as const;

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

export function RewardsHeroArt({ idPrefix }: { idPrefix: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;

	/** A token seen face on: glass rim, a lit face, a dashed inner ring and "VT" in neon, with a glint. */
	const coin = (cx: number, cy: number, r: number, glyph = true) => (
		<g>
			<circle cx={cx + r * 0.12} cy={cy + r * 0.07} r={r} fill="var(--wv-deep)" stroke="var(--wv-purple)" />
			<circle cx={cx} cy={cy} r={r} fill={url("face")} />
			<circle
				cx={cx}
				cy={cy}
				r={r}
				fill="none"
				stroke={url("neon")}
				strokeWidth={Math.max(1.6, r * 0.07)}
				filter={url("neon-glow")}
			/>
			<circle cx={cx} cy={cy} r={r} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="0.8" />
			<circle
				cx={cx}
				cy={cy}
				r={r * 0.78}
				fill="none"
				stroke="var(--wv-cyan-soft)"
				strokeOpacity="0.8"
				strokeWidth={Math.max(0.8, r * 0.035)}
				strokeDasharray={`${r1(r * 0.08)} ${r1(r * 0.1)}`}
			/>
			{glyph && (
				<g transform={`translate(${cx} ${cy}) scale(${r1(r / 25)})`} fill="none" strokeLinecap="round">
					<path d={VT} stroke="var(--wv-cyan-soft)" strokeWidth="3" filter={url("glow")} />
					<path d={VT} stroke="white" strokeWidth="1.1" />
				</g>
			)}
			<path
				d={`M${r1(cx - r * 0.72)} ${r1(cy - r * 0.32)} A${r * 0.8} ${r * 0.8} 0 0 1 ${r1(cx - r * 0.3)} ${r1(cy - r * 0.72)}`}
				fill="none"
				stroke="white"
				strokeOpacity="0.55"
				strokeWidth={Math.max(1, r * 0.05)}
				strokeLinecap="round"
			/>
		</g>
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
				<radialGradient id={id("sky")} gradientUnits="userSpaceOnUse" cx={VP.x} cy={HORIZON} r="280">
					{stop("0%", "var(--wv-pink)", 0.4)}
					{stop("28%", "var(--wv-purple)", 0.55)}
					{stop("60%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<linearGradient id={id("floor")} gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2={H}>
					{stop("0%", "var(--wv-purple)", 0.38)}
					{stop("80%", "var(--wv-bg)")}
				</linearGradient>
				{/* The grid fades in from the horizon, so its lines don't knot where they meet. */}
				<linearGradient id={id("grid-ramp")} gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2={H}>
					{stop("0%", "white", 0)}
					{stop("30%", "white", 0.75)}
					{stop("100%", "white", 0.9)}
				</linearGradient>
				<mask
					id={id("grid-fade")}
					maskUnits="userSpaceOnUse"
					x="0"
					y={HORIZON}
					width={W}
					height={H - HORIZON}
				>
					<rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={url("grid-ramp")} />
				</mask>

				{/* The sun: white-hot at the top, through pink, to purple at the horizon, cut by its stripes. */}
				<linearGradient
					id={id("sun")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={HORIZON - SUN.r}
					x2="0"
					y2={HORIZON}
				>
					{stop("0%", "white", 0.95)}
					{stop("32%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-purple)")}
				</linearGradient>
				<mask
					id={id("sun-cut")}
					maskUnits="userSpaceOnUse"
					x="0"
					y={HORIZON - SUN.r - 4}
					width={W}
					height={SUN.r + 4}
				>
					<rect x="0" y={HORIZON - SUN.r - 4} width={W} height={SUN.r + 4} fill="white" />
					{SUN_STRIPES.map((s) => (
						<rect key={s.y} x="0" y={s.y} width={W} height={s.h} fill="black" />
					))}
				</mask>

				{/* A token's face: lit pink near the top-left, deepening to purple and dark glass. */}
				<radialGradient id={id("face")} cx="0.36" cy="0.3" r="0.85">
					{stop("0%", "var(--wv-pink)", 0.95)}
					{stop("52%", "var(--wv-purple)")}
					{stop("100%", "var(--wv-deep)")}
				</radialGradient>
				{/* A stacked token's rim, shaded like a cylinder: dark at the sides, lit purple in front. */}
				<linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="0">
					{stop("0%", "var(--wv-deep)")}
					{stop("45%", "var(--wv-purple)")}
					{stop("100%", "var(--wv-deep)")}
				</linearGradient>
				<linearGradient id={id("neon")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("bag-neon")} gradientUnits="userSpaceOnUse" x1="0" y1="196" x2="0" y2="302">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("tag-neon")} gradientUnits="userSpaceOnUse" x1="0" y1="192" x2="0" y2="302">
					{stop("0%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-cyan)")}
				</linearGradient>
				<radialGradient id={id("pool")}>
					{stop("0%", "var(--wv-pink)", 0.75)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>
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
				{/* The floor's lines: a glow in the drawing's own units, so a box around a thin line doesn't crop it flat. */}
				<filter
					id={id("line-glow")}
					filterUnits="userSpaceOnUse"
					x="-20"
					y={HORIZON - 30}
					width={W + 40}
					height={H - HORIZON + 60}
				>
					<feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="tight" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="wide" />
					<feMerge>
						<feMergeNode in="wide" />
						<feMergeNode in="tight" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("shadow")} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="5" />
				</filter>
				<filter id={id("halo")} x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="12" />
				</filter>
				<filter id={id("grain")} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
			</defs>

			{/* The sky: a pink glow low down and stars. */}
			<rect width={W} height={H} fill={url("sky")} />
			<g fill="white">
				{STARS.map((s) => (
					<circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} opacity={s.opacity} />
				))}
			</g>

			{/* The striped sun on the horizon, in a pink halo. */}
			<circle
				cx={SUN.cx}
				cy={HORIZON}
				r={SUN.r + 8}
				fill="var(--wv-pink)"
				opacity="0.4"
				filter={url("halo")}
			/>
			<path
				d={`M${SUN.cx - SUN.r} ${HORIZON} A${SUN.r} ${SUN.r} 0 0 1 ${SUN.cx + SUN.r} ${HORIZON} Z`}
				fill={url("sun")}
				mask={`url(#${id("sun-cut")})`}
				opacity="0.88"
			/>

			{/* The floor: dark glass with a neon grid running to the horizon, which glows pink. */}
			<rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={url("floor")} />
			<g mask={`url(#${id("grid-fade")})`}>
				<path
					d={GRID}
					fill="none"
					stroke="var(--wv-cyan)"
					strokeOpacity="0.55"
					strokeWidth="1"
					filter={url("line-glow")}
				/>
			</g>
			<path d={`M0 ${HORIZON} H${W}`} stroke="var(--wv-pink)" strokeWidth="2" filter={url("line-glow")} />

			{/* Two small tokens drifting in the sky. */}
			<g opacity="0.75">
				<g className="wv-float" style={{ animationDelay: "-2s" }}>
					{coin(62, 92, 13)}
				</g>
				<g className="wv-float" style={{ animationDelay: "-4s" }}>
					{coin(424, 78, 11)}
				</g>
			</g>

			{/* The trails: earning, cyan, from the bag to the stack; spending, pink, from the stack to the tag. */}
			<g fill="none" strokeLinecap="round" strokeWidth="2.2" strokeDasharray="0.1 6.5" filter={url("glow")}>
				<path d={curve(EARN)} stroke="var(--wv-cyan-soft)" />
				<path d={curve(SPEND)} stroke="var(--wv-pink)" />
			</g>
			<g fill="none" strokeLinecap="round" strokeWidth="2" filter={url("neon-glow")}>
				<path d={PLUS} transform="translate(94 170)" stroke="var(--wv-cyan-soft)" />
				<path d={PLUS} transform="translate(150 145) scale(0.8)" stroke="var(--wv-cyan-soft)" />
				<path d={MINUS} transform="translate(336 160)" stroke="var(--wv-pink)" />
			</g>

			{/* The big token, floating in front of the sun. */}
			<circle
				cx={BIG.cx}
				cy={BIG.cy}
				r={BIG.r + 14}
				fill="var(--wv-pink)"
				opacity="0.32"
				filter={url("halo")}
			/>
			<g className="wv-float">{coin(BIG.cx, BIG.cy, BIG.r)}</g>
			<g fill="white" filter={url("neon-glow")}>
				<path d={SPARK} transform={`translate(${BIG.cx + 36} ${BIG.cy - 34}) scale(0.5)`} />
			</g>

			{/* The stack on its glowing pad. */}
			<ellipse cx="240" cy="304" rx="96" ry="15" fill={url("pool")} style={screen} />
			<g fill="none" filter={url("neon-glow")}>
				<ellipse cx="240" cy="304" rx="72" ry="12" stroke="var(--wv-pink)" strokeWidth="1.8" />
				<ellipse
					cx="240"
					cy="304"
					rx="54"
					ry="8.5"
					stroke="var(--wv-cyan)"
					strokeWidth="1.3"
					strokeOpacity="0.8"
				/>
			</g>
			<ellipse cx="240" cy="303" rx="44" ry="8" fill="var(--wv-bg)" opacity="0.8" filter={url("shadow")} />
			{STACK_COINS.map((c) => (
				<g key={c.cy}>
					<path d={rimPath(c.cx, c.cy)} fill={url("rim")} />
					<path
						d={rimPath(c.cx, c.cy)}
						fill="none"
						stroke="var(--wv-pink)"
						strokeWidth="1.6"
						strokeLinejoin="round"
						filter={url("glow")}
					/>
					<path
						d={`M${c.cx - STACK.rx + 3} ${c.cy + STACK.rim / 2 + 2} A${STACK.rx} ${STACK.ry} 0 0 0 ${c.cx + STACK.rx - 3} ${c.cy + STACK.rim / 2 + 2}`}
						fill="none"
						stroke="white"
						strokeOpacity="0.35"
						strokeWidth="0.8"
					/>
				</g>
			))}
			<ellipse cx={STACK_TOP.cx} cy={STACK_TOP.cy} rx={STACK.rx} ry={STACK.ry} fill={url("face")} />
			<ellipse
				cx={STACK_TOP.cx}
				cy={STACK_TOP.cy}
				rx={STACK.rx}
				ry={STACK.ry}
				fill="none"
				stroke="var(--wv-cyan)"
				strokeWidth="2"
				filter={url("neon-glow")}
			/>
			<ellipse
				cx={STACK_TOP.cx}
				cy={STACK_TOP.cy}
				rx={STACK.rx * 0.78}
				ry={STACK.ry * 0.78}
				fill="none"
				stroke="var(--wv-cyan-soft)"
				strokeOpacity="0.8"
				strokeWidth="1"
				strokeDasharray="2.5 3"
			/>
			<g
				transform={`translate(${STACK_TOP.cx} ${STACK_TOP.cy}) scale(1.05 0.36)`}
				fill="none"
				strokeLinecap="round"
			>
				<path
					d={VT}
					stroke="var(--wv-cyan-soft)"
					strokeWidth="3"
					vectorEffect="non-scaling-stroke"
					filter={url("glow")}
				/>
				<path d={VT} stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />
			</g>

			{/* The shopping bag: neon over dark glass, its "$" glowing pink. */}
			<ellipse cx="101" cy="304" rx="58" ry="7" fill="var(--wv-bg)" opacity="0.85" filter={url("shadow")} />
			<g strokeLinecap="round" strokeLinejoin="round">
				<path
					d={BAG.handleBack}
					fill="none"
					stroke="var(--wv-cyan-soft)"
					strokeOpacity="0.55"
					strokeWidth="2.2"
				/>
				<path d={BAG.opening} fill="var(--wv-bg)" fillOpacity="0.9" />
				<path d={BAG.front} fill="var(--wv-deep)" fillOpacity="0.94" />
				<path d={BAG.side} fill="var(--wv-purple)" fillOpacity="0.4" />
				<path d={BAG.side} fill="var(--wv-deep)" fillOpacity="0.55" />
				<g fill="none" stroke={url("bag-neon")} strokeWidth="2.6" filter={url("neon-glow")}>
					<path d={BAG.front} />
					<path d={BAG.side} />
					<path d={BAG.opening} />
					<path d={BAG.handleFront} />
				</g>
				<g fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="0.9">
					<path d={BAG.front} />
					<path d={BAG.side} />
					<path d={BAG.handleFront} />
				</g>
				<g
					transform={`translate(${BAG.dollar.x} ${BAG.dollar.y}) scale(1.7)`}
					fill="none"
					strokeLinecap="round"
				>
					<path d={DOLLAR} stroke="var(--wv-pink)" strokeWidth="2.2" filter={url("glow")} />
					<path d={DOLLAR} stroke="white" strokeWidth="0.7" />
				</g>
			</g>

			{/* The price tag: the old price struck through, a lower one beneath, a token clipped to its corner. */}
			<g transform={TAG.tilt} strokeLinecap="round" strokeLinejoin="round">
				<path d={TAG.body} fill="var(--wv-bg)" opacity="0.8" filter={url("shadow")} />
				<path d={TAG.body} fill="var(--wv-deep)" fillOpacity="0.94" />
				<path d={TAG.string} fill="none" stroke="var(--wv-cyan-soft)" strokeOpacity="0.7" strokeWidth="1.4" />
				<g fill="none" stroke={url("tag-neon")} strokeWidth="2.6" filter={url("neon-glow")}>
					<path d={TAG.body} />
					<circle {...TAG.hole} />
				</g>
				<g fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="0.9">
					<path d={TAG.body} />
					<circle {...TAG.hole} />
				</g>
				<path d={TAG.oldPrice} stroke="white" strokeOpacity="0.45" strokeWidth="4" />
				<path d={TAG.strike} stroke="var(--wv-pink)" strokeWidth="2.6" filter={url("glow")} />
				<path d={TAG.newPrice} stroke="var(--wv-cyan-soft)" strokeWidth="5" filter={url("neon-glow")} />
				<path d={TAG.newPrice} stroke="white" strokeWidth="1.4" />
				{coin(TAG.coin.cx, TAG.coin.cy, 14)}
			</g>

			{/* Tokens riding the trails. */}
			{RIDERS.map((t) => (
				<g key={`${t.at[0]}-${t.at[1]}`} className="wv-float" style={{ animationDelay: t.delay }}>
					{coin(t.at[0], t.at[1], t.r, false)}
				</g>
			))}

			{/* Sparks in the air. */}
			<g fill="white" filter={url("neon-glow")}>
				<path d={SPARK} transform="translate(160 64) scale(0.34)" />
				<path d={SPARK} transform="translate(332 108) scale(0.4)" />
				<path d={SPARK} transform="translate(40 168) scale(0.36)" />
				<path d={SPARK} transform="translate(454 160) scale(0.34)" />
			</g>

			{/* Over everything: the vignette, then the grain. */}
			<rect width={W} height={H} fill={url("vignette")} />
			<rect width={W} height={H} filter={url("grain")} opacity="0.07" style={{ mixBlendMode: "overlay" }} />
		</svg>
	);
}
