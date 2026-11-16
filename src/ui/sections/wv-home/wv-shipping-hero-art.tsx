/**
 * The shipping hero's art: a delivery through a neon city at night. A van speeds along the road in front of the
 * skyline, its tail lights streaking behind it; a plane crosses the sky on a dotted air route; both lead to a map pin
 * over a plain, sealed parcel (a shield on its side for "safe and discreet") waiting on a glowing pad at the doorstep;
 * a crescent moon over it all, the street wet enough to mirror the city. Drawn in the site's neon style (dark glass
 * edged in neon, a tight glow and a wide bloom, pink, purple and cyan on near-black, a vignette and fine grain), so it
 * sits with the other heroes' art, stays sharp and costs a few KB where the photo it replaces was ~2 MB.
 *
 * The drawing is 480 × 360 (4:3). The hero's frame runs from 1.2:1 on desktop to 2.15:1 on tablets, so everything that
 * matters sits in the band every crop keeps: x 21–459, y 68–291. The pin and the plane bob gently (`.wv-float`,
 * motion.css), only for visitors who haven't asked for less motion.
 */

const W = 480;
const H = 360;
/** The far edge of the road, where the buildings stand, and its near edge. */
const HORIZON = 206;
const ROAD_FRONT = 224;

const TONES = ["cyan", "pink", "soft"] as const;
type Tone = (typeof TONES)[number];
const TONE_COLOR: Record<Tone, string> = {
	cyan: "var(--wv-cyan)",
	pink: "var(--wv-pink)",
	soft: "var(--wv-cyan-soft)",
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A small seeded random number generator (mulberry32), so the city comes out the same on the server and the client. */
function random(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Building = { x: number; w: number; top: number; tone: Tone; windows: string; antenna: boolean };

/**
 * A row of buildings standing on the horizon across the whole width, taller toward the edges so the middle stays
 * clear for the plane's route, with lit windows scattered over them and the odd antenna.
 */
function skyline(seed: number, minH: number, maxH: number, windowChance: number): Building[] {
	const rand = random(seed);
	const buildings: Building[] = [];
	let x = -12;
	while (x < W + 12) {
		const w = 22 + rand() * 24;
		const edge = 0.62 + (0.38 * Math.abs(x + w / 2 - W / 2)) / (W / 2);
		const top = HORIZON - (minH + rand() * (maxH - minH)) * edge;
		const tone = TONES[Math.floor(rand() * TONES.length)] ?? "cyan";
		let windows = "";
		for (let wy = top + 7; wy < HORIZON - 9; wy += 8)
			for (let wx = x + 5; wx < x + w - 7; wx += 7)
				if (rand() < windowChance) windows += `M${r1(wx)} ${r1(wy)}h3v4h-3Z`;
		buildings.push({ x: r1(x), w: r1(w), top: r1(top), tone, windows, antenna: rand() < 0.22 });
		x += w + 2 + rand() * 5;
	}
	return buildings;
}

const CITY_BACK = skyline(5, 70, 140, 0);
const CITY_FRONT = skyline(11, 36, 96, 0.3);

const STARS = (() => {
	const rand = random(31);
	return Array.from({ length: 22 }, () => ({
		cx: r1(rand() * W),
		cy: r1(16 + rand() * 120),
		r: r1(0.5 + rand() * 0.8),
		opacity: r1(0.35 + rand() * 0.5),
	}));
})();

/** The van, facing right, in its own box (113 × 55): the body, cab window, a parcel on its side, and its wheels. */
const VAN = {
	at: { x: 128, y: 164 },
	body: "M2 46 L2 8 Q2 2 8 2 L74 2 Q78 2 78 6 L78 14 L95 14 Q100 14 103 19 L111 33 Q113 36 113 40 L113 44 Q113 46 111 46 Z",
	window: "M82 18 L95 18 Q98 18 100 21 L106 31 L82 31 Z",
	details: [
		"M78 14 L78 46",
		"M28 13 L52 13 L52 35 L28 35 Z",
		"M40 13 L40 21",
		"M8 20 L20 20",
		"M8 27 L17 27",
	],
	wheels: [24, 92],
} as const;

/** The parcel, a plain box seen from its front-left corner: its three faces, the tape over it, the seal and a label. */
const PARCEL = {
	front: "M310 222 L380 222 L380 274 L310 274 Z",
	top: "M310 222 L380 222 L404 206 L334 206 Z",
	side: "M380 222 L404 206 L404 258 L380 274 Z",
	tape: "M340 222 L350 222 L374 206 L364 206 Z M340 222 L350 222 L350 238 L340 238 Z",
	shield: "M345 243 L355 247 L355 254 C355 261 350 265 345 268 C340 265 335 261 335 254 L335 247 Z",
	check: "M340 255 L344 259 L350 251",
	label: "M385 241 L399 231.7 L399 241.7 L385 251 Z",
} as const;

/** The map pin over the parcel. */
const PIN = {
	head: "M360 194 C353 185 347 179 347 168 A13 13 0 1 1 373 168 C373 179 367 185 360 194 Z",
	dot: { cx: 360, cy: 168, r: 4.5 },
} as const;

/** The plane, facing right, in its own box (40 × 18), and its route: in from the left, then on to the pin. */
const PLANE = {
	at: "translate(96 80) scale(1.2)",
	body: "M2 9 C2 7 4 6 8 6 L32 6 C37 6 40 8 40 9 C40 10 37 12 32 12 L8 12 C4 12 2 11 2 9 Z",
	parts: ["M18 9 L12 18 L17 18 L26 9", "M6 6 L3 0 L7 0 L12 6"],
	behind: "M-10 128 C30 104 62 94 94 92",
	ahead: "M150 90 C226 62 318 86 352 150",
} as const;

const MOON = { cx: 410, cy: 96, r: 20 } as const;

/** Where the van's wheels and the parcel's front edge meet the street, to mirror them there. */
const VAN_GROUND = 219;
const PARCEL_GROUND = 274;

/** Neon from the city and the traffic, caught as short streaks in the wet street. */
const STREAKS = (() => {
	const rand = random(53);
	return Array.from({ length: 16 }, () => ({
		x: r1(rand() * (W - 30)),
		y: r1(ROAD_FRONT + 10 + rand() * 96),
		w: r1(10 + rand() * 34),
		tone: TONES[Math.floor(rand() * TONES.length)] ?? "cyan",
	}));
})();
const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";
const screen = { mixBlendMode: "screen" } as const;

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

export function ShippingHeroArt({ idPrefix }: { idPrefix: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;

	const van = (
		<g transform={`translate(${VAN.at.x} ${VAN.at.y})`} strokeLinecap="round" strokeLinejoin="round">
			<path d={VAN.body} fill="var(--wv-deep)" fillOpacity="0.92" />
			<path d={VAN.window} fill="var(--wv-cyan)" fillOpacity="0.2" />
			<g fill="none" stroke={url("neon")} strokeWidth="2.8" filter={url("neon-glow")}>
				<path d={VAN.body} />
				<path d={VAN.window} />
				{VAN.details.map((d) => (
					<path key={d} d={d} />
				))}
			</g>
			<g fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="0.9">
				<path d={VAN.body} />
				<path d={VAN.window} />
				{VAN.details.map((d) => (
					<path key={d} d={d} />
				))}
			</g>
			<path d="M2 31 L6 31 L6 38 L2 38 Z" fill="var(--wv-pink)" filter={url("glow")} />
			<circle cx="110" cy="37.5" r="2.2" fill="white" filter={url("glow")} />
			{VAN.wheels.map((cx) => (
				<g key={cx}>
					<circle
						cx={cx}
						cy="46"
						r="9"
						fill="var(--wv-bg)"
						stroke="var(--wv-pink)"
						strokeWidth="2.4"
						filter={url("glow")}
					/>
					<circle cx={cx} cy="46" r="3" fill="none" stroke="var(--wv-cyan-soft)" strokeWidth="1.4" />
				</g>
			))}
		</g>
	);
	const mirror = (ground: number) => `translate(0 ${2 * ground}) scale(1 -1)`;

	const front = (
		<>
			<g fill="var(--wv-ink)" strokeWidth="1" strokeOpacity="0.8">
				{CITY_FRONT.map((b) => (
					<rect
						key={b.x}
						x={b.x}
						y={b.top}
						width={b.w}
						height={HORIZON - b.top + 1}
						stroke={TONE_COLOR[b.tone]}
					/>
				))}
			</g>
			{TONES.map((tone) => (
				<path
					key={tone}
					d={CITY_FRONT.filter((b) => b.tone === tone)
						.map((b) => b.windows)
						.join("")}
					fill={TONE_COLOR[tone]}
					opacity="0.85"
				/>
			))}
			<g stroke="var(--wv-cyan-soft)" strokeOpacity="0.7" strokeWidth="1">
				{CITY_FRONT.filter((b) => b.antenna).map((b) => (
					<path key={b.x} d={`M${r1(b.x + b.w / 2)} ${b.top} L${r1(b.x + b.w / 2)} ${r1(b.top - 11)}`} />
				))}
			</g>
			<g fill="var(--wv-pink)">
				{CITY_FRONT.filter((b) => b.antenna).map((b) => (
					<circle key={b.x} cx={r1(b.x + b.w / 2)} cy={r1(b.top - 12)} r="1.6" />
				))}
			</g>
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
				<radialGradient id={id("sky")} gradientUnits="userSpaceOnUse" cx={W / 2} cy={HORIZON} r="270">
					{stop("0%", "var(--wv-pink)", 0.42)}
					{stop("26%", "var(--wv-purple)", 0.55)}
					{stop("58%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<linearGradient id={id("ground")} gradientUnits="userSpaceOnUse" x1="0" y1={ROAD_FRONT} x2="0" y2={H}>
					{stop("0%", "var(--wv-purple)", 0.32)}
					{stop("75%", "var(--wv-bg)")}
				</linearGradient>
				<linearGradient
					id={id("haze")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={HORIZON - 70}
					x2="0"
					y2={HORIZON}
				>
					{stop("0%", "var(--wv-pink)", 0)}
					{stop("100%", "var(--wv-pink)", 0.28)}
				</linearGradient>
				{/* The street mirrors the city, fading out a short way below the road. */}
				<linearGradient
					id={id("reflection-fade")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={HORIZON}
					x2="0"
					y2={HORIZON + 80}
				>
					{stop("0%", "white", 0.4)}
					{stop("100%", "white", 0)}
				</linearGradient>
				<mask
					id={id("reflection")}
					maskUnits="userSpaceOnUse"
					x="0"
					y={HORIZON}
					width={W}
					height={H - HORIZON}
				>
					<rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={url("reflection-fade")} />
				</mask>
				{/* The van and the parcel mirrored in the wet street, each fading out below where it stands. */}
				{(
					[
						["van-fade", VAN_GROUND, 50],
						["parcel-fade", PARCEL_GROUND, 56],
					] as const
				).map(([name, from, depth]) => (
					<mask
						key={name}
						id={id(name)}
						maskUnits="userSpaceOnUse"
						x="0"
						y={from}
						width={W}
						height={H - from}
					>
						<linearGradient
							id={id(`${name}-ramp`)}
							gradientUnits="userSpaceOnUse"
							x1="0"
							y1={from}
							x2="0"
							y2={from + depth}
						>
							{stop("0%", "white", 0.45)}
							{stop("100%", "white", 0)}
						</linearGradient>
						<rect x="0" y={from} width={W} height={H - from} fill={url(`${name}-ramp`)} />
					</mask>
				))}
				{/* The light trails fade in from the left, up to the van. */}
				<linearGradient id={id("trail")} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VAN.at.x} y2="0">
					{stop("0%", "white", 0)}
					{stop("100%", "white")}
				</linearGradient>
				<mask
					id={id("trail-fade")}
					maskUnits="userSpaceOnUse"
					x="-20"
					y="150"
					width={VAN.at.x + 20}
					height="80"
				>
					<rect x="-20" y="150" width={VAN.at.x + 20} height="80" fill={url("trail")} />
				</mask>
				<linearGradient
					id={id("beam")}
					gradientUnits="userSpaceOnUse"
					x1={VAN.at.x + 113}
					y1="0"
					x2="322"
					y2="0"
				>
					{stop("0%", "white", 0.55)}
					{stop("100%", "var(--wv-cyan-soft)", 0)}
				</linearGradient>
				<radialGradient id={id("pool")}>
					{stop("0%", "var(--wv-pink)", 0.75)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>
				<radialGradient id={id("moon")} cx="35%" cy="35%" r="75%">
					{stop("0%", "white")}
					{stop("100%", "var(--wv-pink)")}
				</radialGradient>
				<mask id={id("crescent")} maskUnits="userSpaceOnUse" x="380" y="66" width="60" height="60">
					<circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} fill="white" />
					<circle cx={MOON.cx + 9} cy={MOON.cy - 6} r={MOON.r - 3} fill="black" />
				</mask>

				{/* The van, parcel and pin: cyan at the top to pink at the foot, over smoked glass. */}
				<linearGradient id={id("neon")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("parcel-neon")} gradientUnits="userSpaceOnUse" x1="0" y1="206" x2="0" y2="274">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("parcel-top")} gradientUnits="userSpaceOnUse" x1="0" y1="206" x2="0" y2="222">
					{stop("0%", "var(--wv-purple)", 0.75)}
					{stop("100%", "var(--wv-purple)", 0.45)}
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
				{/* The road's edges: a glow in the drawing's own units, so a box around a thin line doesn't crop it flat. */}
				<filter
					id={id("line-glow")}
					filterUnits="userSpaceOnUse"
					x="-20"
					y={HORIZON - 30}
					width={W + 40}
					height="80"
				>
					<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="tight" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="wide" />
					<feMerge>
						<feMergeNode in="wide" />
						<feMergeNode in="tight" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("shadow")} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="5" />
				</filter>
				<filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="6" />
				</filter>
				<filter id={id("halo")} x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="12" />
				</filter>
				<filter id={id("grain")} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
			</defs>

			{/* The sky: a city glow low down, stars, and the moon. */}
			<rect width={W} height={H} fill={url("sky")} />
			<g fill="white">
				{STARS.map((s) => (
					<circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} opacity={s.opacity} />
				))}
			</g>
			<circle
				cx={MOON.cx}
				cy={MOON.cy}
				r={MOON.r + 4}
				fill="var(--wv-pink)"
				opacity="0.45"
				filter={url("halo")}
			/>
			<circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} fill={url("moon")} mask={`url(#${id("crescent")})`} />

			{/* The city: a far row in silhouette, haze, then the near row edged in neon with its windows lit. */}
			<g fill="var(--wv-purple)" opacity="0.4">
				{CITY_BACK.map((b) => (
					<rect key={b.x} x={b.x} y={b.top} width={b.w} height={HORIZON - b.top} />
				))}
			</g>
			<rect x="0" y={HORIZON - 70} width={W} height="70" fill={url("haze")} />
			<g filter={url("glow")}>{front}</g>

			{/* The street: dark, wet enough to mirror the city, with the road across it. */}
			<rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={url("ground")} />
			<g mask={`url(#${id("reflection")})`}>
				<g transform={`translate(0 ${2 * HORIZON}) scale(1 -1)`}>{front}</g>
			</g>
			<rect x="0" y={HORIZON} width={W} height={ROAD_FRONT - HORIZON} fill="var(--wv-bg)" opacity="0.45" />
			<g filter={url("line-glow")}>
				<path d={`M0 ${HORIZON} L${W} ${HORIZON}`} stroke="var(--wv-cyan)" strokeWidth="1.6" />
				<path d={`M0 ${ROAD_FRONT} L${W} ${ROAD_FRONT}`} stroke="var(--wv-pink)" strokeWidth="2" />
				<path
					d={`M0 ${(HORIZON + ROAD_FRONT) / 2} L${W} ${(HORIZON + ROAD_FRONT) / 2}`}
					stroke="white"
					strokeOpacity="0.45"
					strokeWidth="1"
					strokeDasharray="10 8"
				/>
			</g>

			<g filter={url("glow")} opacity="0.5" style={screen}>
				{STREAKS.map((k) => (
					<rect
						key={`${k.x}-${k.y}`}
						x={k.x}
						y={k.y}
						width={k.w}
						height="2.4"
						rx="1.2"
						fill={TONE_COLOR[k.tone]}
					/>
				))}
			</g>

			{/* Swiftly: the van's lights streaking out behind it, and its headlight on the road ahead. */}
			<g mask={`url(#${id("trail-fade")})`} fill="none" strokeLinecap="round" filter={url("glow")}>
				<path d={`M-20 199 L${VAN.at.x + 2} 199`} stroke="var(--wv-pink)" strokeWidth="3" />
				<path d={`M-20 205 L${VAN.at.x + 2} 205`} stroke="var(--wv-cyan)" strokeWidth="1.6" />
				<path d={`M-20 211 L${VAN.at.x + 2} 211`} stroke="var(--wv-pink)" strokeWidth="1.4" />
				<path
					d={`M30 176 L${VAN.at.x - 8} 176 M52 184 L${VAN.at.x - 8} 184`}
					stroke="white"
					strokeWidth="1.2"
				/>
			</g>
			<polygon
				points={`${VAN.at.x + 113},${VAN.at.y + 35} ${VAN.at.x + 113},${VAN.at.y + 40} 322,${VAN.at.y + 50} 322,${VAN.at.y + 20}`}
				fill={url("beam")}
				filter={url("soft")}
				style={screen}
			/>

			{/* The van: neon over dark glass, wheels in front, mirrored in the street below. */}
			<g mask={`url(#${id("van-fade")})`}>
				<g transform={mirror(VAN_GROUND)}>{van}</g>
			</g>
			<path
				d={VAN.body}
				transform={`translate(${VAN.at.x} ${VAN.at.y})`}
				fill="var(--wv-bg)"
				opacity="0.7"
				filter={url("shadow")}
			/>
			{van}

			{/* By air: the plane on its dotted route, which runs on to the pin. */}
			<g fill="none" strokeLinecap="round" strokeWidth="2" strokeDasharray="0.1 6" filter={url("glow")}>
				<path d={PLANE.behind} stroke="var(--wv-cyan-soft)" />
				<path d={PLANE.ahead} stroke="var(--wv-pink)" />
			</g>
			<g className="wv-float" style={{ animationDelay: "-2.5s" }}>
				<g transform={PLANE.at} strokeLinecap="round" strokeLinejoin="round">
					<path d={PLANE.body} fill="var(--wv-deep)" fillOpacity="0.9" />
					<g fill="none" stroke="var(--wv-cyan-soft)" strokeWidth="2" filter={url("neon-glow")}>
						<path d={PLANE.body} />
						{PLANE.parts.map((d) => (
							<path key={d} d={d} />
						))}
					</g>
					<g fill="none" stroke="white" strokeWidth="0.7">
						<path d={PLANE.body} />
						{PLANE.parts.map((d) => (
							<path key={d} d={d} />
						))}
					</g>
				</g>
			</g>

			{/* To your doorstep: the parcel on its glowing pad, mirrored in the street. */}
			<g mask={`url(#${id("parcel-fade")})`}>
				<g
					transform={mirror(PARCEL_GROUND)}
					fill="none"
					stroke={url("parcel-neon")}
					strokeWidth="2.6"
					strokeLinejoin="round"
					filter={url("glow")}
				>
					<path d={PARCEL.front} />
					<path d={PARCEL.side} />
					<path d={PARCEL.shield} />
				</g>
			</g>
			<ellipse cx="357" cy="270" rx="96" ry="14" fill={url("pool")} style={screen} />
			<g fill="none" filter={url("neon-glow")}>
				<ellipse cx="357" cy="268" rx="76" ry="13" stroke="var(--wv-pink)" strokeWidth="1.8" />
				<ellipse
					cx="357"
					cy="268"
					rx="57"
					ry="9"
					stroke="var(--wv-cyan)"
					strokeWidth="1.4"
					strokeOpacity="0.8"
				/>
			</g>
			<g strokeLinecap="round" strokeLinejoin="round">
				<path d={`${PARCEL.front} ${PARCEL.side}`} fill="var(--wv-bg)" opacity="0.8" filter={url("shadow")} />
				<path d={PARCEL.front} fill="var(--wv-deep)" fillOpacity="0.94" />
				<path d={PARCEL.side} fill="var(--wv-purple)" fillOpacity="0.4" />
				<path d={PARCEL.side} fill="var(--wv-deep)" fillOpacity="0.55" />
				<path d={PARCEL.top} fill={url("parcel-top")} />
				<path d={PARCEL.tape} fill="var(--wv-cyan)" fillOpacity="0.16" />
				<path d={PARCEL.shield} fill="var(--wv-pink)" fillOpacity="0.16" />
				<g fill="none" stroke={url("parcel-neon")} strokeWidth="2.6" filter={url("neon-glow")}>
					{[PARCEL.front, PARCEL.top, PARCEL.side].map((d) => (
						<path key={d} d={d} />
					))}
				</g>
				<g fill="none" filter={url("glow")}>
					<path d={PARCEL.tape} stroke="var(--wv-cyan-soft)" strokeWidth="1.2" />
					<path d={PARCEL.label} stroke="var(--wv-cyan-soft)" strokeWidth="1.2" />
					<path d={PARCEL.shield} stroke="var(--wv-pink)" strokeWidth="2" />
					<path d={PARCEL.check} stroke="white" strokeWidth="2" />
				</g>
				<g fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="0.9">
					{[PARCEL.front, PARCEL.top, PARCEL.side].map((d) => (
						<path key={d} d={d} />
					))}
				</g>
			</g>

			{/* The pin over it, with a pulse ring on the parcel's lid. */}
			<ellipse
				cx="369"
				cy="214"
				rx="12"
				ry="4"
				fill="none"
				stroke="var(--wv-pink)"
				strokeWidth="1.2"
				opacity="0.8"
				filter={url("glow")}
			/>
			<g className="wv-float">
				<path d={PIN.head} fill="var(--wv-bg)" opacity="0.7" filter={url("shadow")} />
				<path d={PIN.head} fill="var(--wv-deep)" fillOpacity="0.9" />
				<path d={PIN.head} fill="none" stroke="var(--wv-pink)" strokeWidth="2.6" filter={url("neon-glow")} />
				<path d={PIN.head} fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="0.9" />
				<circle {...PIN.dot} fill="white" filter={url("glow")} />
			</g>

			{/* Sparks in the air. */}
			<g fill="white" filter={url("neon-glow")}>
				<path d={SPARK} transform="translate(214 120) scale(0.4)" />
				<path d={SPARK} transform="translate(300 54) scale(0.34)" />
				<path d={SPARK} transform="translate(440 150) scale(0.42)" />
				<path d={SPARK} transform="translate(46 70) scale(0.38)" />
			</g>

			{/* Over everything: the vignette, then the grain. */}
			<rect width={W} height={H} fill={url("vignette")} />
			<rect width={W} height={H} filter={url("grain")} opacity="0.07" style={{ mixBlendMode: "overlay" }} />
		</svg>
	);
}
