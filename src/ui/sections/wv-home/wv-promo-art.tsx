import { BADGE_DRAWINGS } from "./wv-category-badge";
import type { CategoryBadgeIcon } from "./wv-category-art";

/**
 * The promotional-bundles art, drawn in the category badges' neon style: a nebula with a glowing sun over a perspective
 * grid, an open neon box with light pouring out, the badges' own product drawings rising from it in a fan, and a hexagon
 * "BUNDLE & SAVE" tag. Drawn here rather than shipped as a picture so it matches the badges, stays sharp, and costs a
 * few KB instead of 2.3 MB.
 *
 * It fills its frame (`slice`); the frames differ by screen (about 1.5 to 2.1 wide per 1 high), so everything that
 * matters sits inside x 70–570, y 30–330 of the 640 × 360 drawing. The box, the light and the products share one centre
 * line, x 320, which is also the sun's centre and the grid's vanishing point.
 *
 * Lighting: the glowing inside of the box is the key light. It lights the products' feet and the inner faces of the
 * flaps, pours up in beams, blooms over the rim and pools on the floor (with the box's reflection). The sky and sun are
 * the fill: a purple sheen on the top of the box's faces. A fine grain over everything keeps the long gradients from
 * banding, and a vignette holds the eye in the middle.
 */

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

/** Where each badge drawing's own content is centred in its 100 × 100 box, so it can be placed and turned about that point. */
const DRAWING_CENTRE: Partial<Record<CategoryBadgeIcon, readonly [number, number]>> = {
	disposables: [63, 48],
	eliquid: [61, 53],
	hardware: [57, 54],
};

/** Products rising out of the box in a fan: the middle one highest and upright, the outer two lower and leaning out. */
const PRODUCTS: ReadonlyArray<{
	icon: CategoryBadgeIcon;
	cx: number;
	cy: number;
	scale: number;
	tilt: number;
}> = [
	{ icon: "disposables", cx: 246, cy: 140, scale: 0.92, tilt: -14 },
	{ icon: "eliquid", cx: 320, cy: 130, scale: 1, tilt: 0 },
	{ icon: "hardware", cx: 394, cy: 140, scale: 0.92, tilt: 14 },
];

/**
 * The box, in an oblique view: the front face, and a depth of (26, −18) for every edge that runs away from the viewer.
 * Its outline (front plus side) is centred on x 320, and so is its opening.
 */
const BOX = { left: 233, right: 381, top: 214, bottom: 292, dx: 26, dy: -18 } as const;
const pt = (x: number, y: number) => `${x} ${y}`;
const box = (() => {
	const { left: l, right: r, top: t, bottom: b, dx, dy } = BOX;
	return {
		front: `M${pt(l, t)} L${pt(r, t)} L${pt(r, b)} L${pt(l, b)} Z`,
		side: `M${pt(r, t)} L${pt(r + dx, t + dy)} L${pt(r + dx, b + dy)} L${pt(r, b)} Z`,
		opening: `M${pt(l, t)} L${pt(l + dx, t + dy)} L${pt(r + dx, t + dy)} L${pt(r, t)} Z`,
		// The flaps are hinged on the opening's side edges, each one a true parallelogram. The left one is lifted up and
		// out; the right one hangs out and down over the side (lifted, it would be seen edge-on from this angle).
		flapLeft: `M${pt(l, t)} L${pt(l - 35, t - 20)} L${pt(l - 35 + dx, t - 20 + dy)} L${pt(l + dx, t + dy)} Z`,
		flapRight: `M${pt(r, t)} L${pt(r + 36, t + 17)} L${pt(r + 36 + dx, t + 17 + dy)} L${pt(r + dx, t + dy)} Z`,
		// The box mirrored in the floor: the front about its bottom edge, the side about its slanted one.
		reflection: [
			`M${pt(l, b)} L${pt(l, 2 * b - t)} L${pt(r, 2 * b - t)} L${pt(r, b)}`,
			`M${pt(r, 2 * b - t)} L${pt(r + dx, 2 * (b + dy) - (t + dy))} L${pt(r + dx, b + dy)}`,
		],
		// Where the box meets the floor: its footprint's centre.
		floor: [(l + r + dx) / 2, b + dy / 2] as const,
	};
})();
/** The middle of each flap's hinge and of its free edge: the light from inside the box runs from one to the other. */
const FLAP_LIGHT = {
	left: [BOX.left + BOX.dx / 2, BOX.top + BOX.dy / 2, BOX.left + BOX.dx / 2 - 35, BOX.top + BOX.dy / 2 - 20],
	right: [
		BOX.right + BOX.dx / 2,
		BOX.top + BOX.dy / 2,
		BOX.right + BOX.dx / 2 + 36,
		BOX.top + BOX.dy / 2 + 17,
	],
} as const;

const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";

/** Motes of light drifting up in the beams, clear of the products: x, y, radius. */
const MOTES = [
	[282, 190, 1.2],
	[360, 186, 1],
	[338, 72, 1.1],
	[302, 60, 0.9],
	[270, 82, 1],
	[372, 92, 0.8],
	[352, 40, 0.9],
	[288, 36, 0.8],
	[318, 186, 0.9],
] as const;

/** A pointy-topped hexagon of radius r around (cx, cy). */
const hex = (cx: number, cy: number, r: number) => {
	const w = r * 0.866;
	return `M${cx} ${cy - r} L${cx + w} ${cy - r / 2} L${cx + w} ${cy + r / 2} L${cx} ${cy + r} L${cx - w} ${cy + r / 2} L${cx - w} ${cy - r / 2} Z`;
};

/** The tag: a hexagon, and inside it a plate whose pointed ends have the hexagon's own 120° corners. */
const TAG = { cx: 504, cy: 106, r: 56, plateHalfWidth: 33, plateHalfHeight: 17 } as const;
const plate = (() => {
	const { cx, cy, plateHalfWidth: w, plateHalfHeight: h } = TAG;
	const tip = Math.round(h * Math.tan(Math.PI / 6) * 10) / 10; // a 120° point
	return `M${pt(cx - w, cy - h)} L${pt(cx + w, cy - h)} L${pt(cx + w + tip, cy)} L${pt(cx + w, cy + h)} L${pt(cx - w, cy + h)} L${pt(cx - w - tip, cy)} Z`;
})();
/** Bungee's capitals are 0.72 em tall; the two lines are centred on the plate with this much space between them. */
const TAG_FONT = 14;
const TAG_LINE_GAP = 4.5;
const tagCap = TAG_FONT * 0.72;
const tagBaseline1 = TAG.cy - (2 * tagCap + TAG_LINE_GAP) / 2 + tagCap;
const tagBaseline2 = tagBaseline1 + tagCap + TAG_LINE_GAP;
const tagHex = hex(TAG.cx, TAG.cy, TAG.r);
const badgeHex = hex((BOX.left + BOX.right) / 2, (BOX.top + BOX.bottom) / 2, 25);

const bungee = { fontFamily: "var(--font-bungee), system-ui, sans-serif" } as const;
const screen = { mixBlendMode: "screen" } as const;

export function PromoBundleArt({ idPrefix, label }: { idPrefix: string; label: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;
	const horizon = 236;
	// The floor's lines: from the vanishing point at the horizon's middle out to the bottom edge, and across it ever wider apart.
	const rays = Array.from({ length: 17 }, (_, i) => -320 + i * 80);
	const rungs = [242, 252, 266, 286, 314, 352];
	// The box's faces from back to front, each filled, shaded and then outlined, so a nearer face hides the edges behind
	// it. The side is in shadow, darker than the front; the right flap hangs in front of the side.
	const boxFaces = [
		{ d: box.flapLeft, base: "var(--wv-deep)", shade: "flap-left" },
		{ d: box.opening, base: "var(--wv-purple)", shade: "inside" },
		{ d: box.side, base: "var(--wv-bg)", shade: "side" },
		{ d: box.flapRight, base: "var(--wv-deep)", shade: "flap-right" },
		{ d: box.front, base: "var(--wv-deep)", shade: "front" },
	];

	return (
		<svg
			viewBox="0 0 640 360"
			preserveAspectRatio="xMidYMid slice"
			// `isolate`: the screen and overlay blends below mix only with the drawing, never with the page behind it.
			className="absolute inset-0 isolate size-full"
			role="img"
			aria-label={label}
		>
			<defs>
				{/* Sky: the nebula's heart behind the sun, and two drifts of colour either side of it. */}
				<radialGradient id={id("sky")} cx="50%" cy="46%" r="70%">
					{stop("0%", "var(--wv-pink)", 0.55)}
					{stop("32%", "var(--wv-purple)", 0.9)}
					{stop("70%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<radialGradient id={id("drift-cyan")}>
					{stop("0%", "var(--wv-cyan)", 0.16)}
					{stop("100%", "var(--wv-cyan)", 0)}
				</radialGradient>
				<radialGradient id={id("drift-pink")}>
					{stop("0%", "var(--wv-pink)", 0.18)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>

				{/* Sun: pink at the top, purple at the foot, a hot core high up, a rim lit from above, and a halo. */}
				<linearGradient id={id("sun")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-purple)")}
				</linearGradient>
				<radialGradient id={id("sun-core")} cx="50%" cy="28%" r="55%">
					{stop("0%", "white", 0.1)}
					{stop("100%", "white", 0)}
				</radialGradient>
				<linearGradient id={id("sun-rim")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "white", 0.7)}
					{stop("45%", "var(--wv-pink)", 0.55)}
					{stop("100%", "var(--wv-pink)", 0.1)}
				</linearGradient>

				{/* Floor: purple at the horizon to black, haze along the horizon, and the grid fading into the distance. */}
				<linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-purple)", 0.55)}
					{stop("100%", "var(--wv-bg)", 0.95)}
				</linearGradient>
				<linearGradient
					id={id("haze")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={horizon - 40}
					x2="0"
					y2={horizon + 50}
				>
					{stop("0%", "var(--wv-pink)", 0)}
					{stop("44%", "var(--wv-pink)", 0.34)}
					{stop("62%", "var(--wv-purple)", 0.3)}
					{stop("100%", "var(--wv-purple)", 0)}
				</linearGradient>
				<linearGradient
					id={id("grid-fade")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={horizon}
					x2="0"
					y2="360"
				>
					{stop("0%", "white", 0.15)}
					{stop("100%", "white", 1)}
				</linearGradient>
				<mask
					id={id("grid-mask")}
					maskUnits="userSpaceOnUse"
					x="0"
					y={horizon}
					width="640"
					height={360 - horizon}
				>
					<rect x="0" y={horizon} width="640" height={360 - horizon} fill={url("grid-fade")} />
				</mask>
				<linearGradient
					id={id("reflection-fade")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={BOX.bottom - 18}
					x2="0"
					y2={BOX.bottom + 44}
				>
					{stop("0%", "white", 0.55)}
					{stop("100%", "white", 0)}
				</linearGradient>
				<mask id={id("reflection-mask")} maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="360">
					<rect x="0" y="0" width="640" height="360" fill={url("reflection-fade")} />
				</mask>
				<radialGradient id={id("pool")}>
					{stop("0%", "var(--wv-pink)", 0.6)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>

				{/* The box. One light for all its edges (cyan at the top left to pink at the bottom right), not one per edge. */}
				<linearGradient id={id("neon")} gradientUnits="userSpaceOnUse" x1="198" y1="160" x2="443" y2="292">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				{/* Inside: white-hot in the middle, pink, then purple in the corners. */}
				<radialGradient id={id("inside")}>
					{stop("0%", "white", 0.95)}
					{stop("30%", "var(--wv-pink)", 0.95)}
					{stop("100%", "var(--wv-purple)", 0.9)}
				</radialGradient>
				{/* Front: the sky's purple on its top, dark in the middle, the floor's pink glow on its foot, and a glassy
				    sheen from the top left. */}
				<linearGradient id={id("front")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-purple)", 0.42)}
					{stop("45%", "var(--wv-purple)", 0)}
					{stop("80%", "var(--wv-pink)", 0)}
					{stop("100%", "var(--wv-pink)", 0.2)}
				</linearGradient>
				<linearGradient id={id("sheen")} x1="0" y1="0" x2="0.7" y2="1">
					{stop("0%", "white", 0.12)}
					{stop("38%", "white", 0.03)}
					{stop("39%", "white", 0)}
				</linearGradient>
				<linearGradient id={id("side")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-purple)", 0.22)}
					{stop("70%", "var(--wv-purple)", 0)}
					{stop("100%", "var(--wv-pink)", 0.14)}
				</linearGradient>
				{/* Each flap's inner face, lit by the box at its hinge and dark at its free edge. */}
				{(["left", "right"] as const).map((side) => {
					const [x1, y1, x2, y2] = FLAP_LIGHT[side];
					return (
						<linearGradient
							key={side}
							id={id(`flap-${side}`)}
							gradientUnits="userSpaceOnUse"
							x1={x1}
							y1={y1}
							x2={x2}
							y2={y2}
						>
							{stop("0%", "var(--wv-pink)", 0.55)}
							{stop("100%", "var(--wv-pink)", 0)}
						</linearGradient>
					);
				})}
				<radialGradient id={id("bloom")}>
					{stop("0%", "white", 0.75)}
					{stop("35%", "var(--wv-pink)", 0.5)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>
				<linearGradient id={id("beam")} x1="0" y1="1" x2="0" y2="0">
					{stop("0%", "white", 0.22)}
					{stop("22%", "var(--wv-pink)", 0.32)}
					{stop("100%", "var(--wv-pink)", 0)}
				</linearGradient>

				{/* Products: cyan at the top to pink at the foot across each whole drawing (its 100 × 100 box), lit from above
				    like the box and cyan where it crosses the pink sun. Where an outline closes it is smoked glass, a little darker
				    than the sun behind, so the neon reads against it. */}
				<linearGradient id={id("icon")} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="92">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("glass")} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="92">
					{stop("0%", "var(--wv-deep)", 0.32)}
					{stop("100%", "var(--wv-purple)", 0.3)}
				</linearGradient>

				{/* Tag: dark glass in the hexagon, glowing at its rim, and a glossy plate. */}
				<linearGradient id={id("tag-neon")} x1="0" y1="0" x2="1" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("tag-glass")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-bg)", 0.78)}
					{stop("100%", "var(--wv-purple)", 0.55)}
				</linearGradient>
				<clipPath id={id("tag-clip")}>
					<path d={tagHex} />
				</clipPath>
				<linearGradient id={id("plate")} x1="0" y1="0" x2="1" y2="0">
					{stop("0%", "var(--wv-purple)")}
					{stop("50%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-purple)")}
				</linearGradient>
				<linearGradient id={id("plate-gloss")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "white", 0.32)}
					{stop("48%", "white", 0.06)}
					{stop("50%", "white", 0)}
					{stop("100%", "var(--wv-ink)", 0.25)}
				</linearGradient>

				<radialGradient id={id("vignette")} r="72%">
					{stop("62%", "var(--wv-bg)", 0)}
					{stop("100%", "var(--wv-bg)", 0.6)}
				</radialGradient>
				<clipPath id={id("ground")}>
					<rect x="0" y={horizon} width="640" height={360 - horizon} />
				</clipPath>
				<filter id={id("glow")} x="-40%" y="-40%" width="180%" height="180%">
					<feGaussianBlur stdDeviation="3.2" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="8" />
				</filter>
				<filter id={id("halo")} x="-60%" y="-60%" width="220%" height="220%">
					<feGaussianBlur stdDeviation="18" />
				</filter>
				{/* Fine grey grain, laid over everything at a low strength. */}
				<filter id={id("grain")} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
			</defs>

			{/* Sky, stars and the sun. */}
			<rect width="640" height="360" fill={url("sky")} />
			<ellipse cx="120" cy="96" rx="170" ry="96" fill={url("drift-cyan")} />
			<ellipse cx="536" cy="74" rx="160" ry="90" fill={url("drift-pink")} />
			<g fill="white" filter={url("glow")}>
				{[
					[88, 52, 1.6],
					[150, 96, 1.1],
					[118, 170, 1.3],
					[580, 52, 1.4],
					[598, 150, 1.1],
					[440, 36, 1],
					[204, 32, 1.2],
					[454, 190, 0.9],
					[548, 206, 1.2],
					[70, 210, 1],
				].map(([cx, cy, r]) => (
					<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity="0.8" />
				))}
			</g>
			<circle cx="320" cy="168" r="112" fill="var(--wv-pink)" opacity="0.22" filter={url("halo")} />
			<circle cx="320" cy="168" r="104" fill={url("sun")} opacity="0.7" />
			<circle cx="320" cy="168" r="104" fill={url("sun-core")} />
			<circle cx="320" cy="168" r="104" fill="none" stroke={url("sun-rim")} strokeWidth="2" />

			{/* The floor: a dark gradient under a grid that fades into the distance, haze and a pink glow along the horizon,
			    and the box's light pooling on it with its reflection. */}
			<rect x="0" y={horizon} width="640" height={360 - horizon} fill={url("floor")} />
			<g
				clipPath={`url(#${id("ground")})`}
				mask={`url(#${id("grid-mask")})`}
				stroke="var(--wv-cyan)"
				strokeOpacity="0.6"
				strokeWidth="1.4"
			>
				{rays.map((x) => (
					<path key={x} d={`M320 ${horizon} L${x} 360`} />
				))}
				{rungs.map((y) => (
					<path key={y} d={`M0 ${y} L640 ${y}`} />
				))}
			</g>
			<rect x="0" y={horizon - 40} width="640" height="90" fill={url("haze")} />
			<path
				d={`M0 ${horizon} L640 ${horizon}`}
				stroke="var(--wv-pink)"
				strokeWidth="2.5"
				filter={url("glow")}
			/>
			<ellipse cx={box.floor[0]} cy={box.floor[1] + 8} rx="150" ry="26" fill={url("pool")} style={screen} />
			<g
				mask={`url(#${id("reflection-mask")})`}
				fill="none"
				stroke={url("neon")}
				strokeWidth="2.5"
				strokeLinejoin="round"
				filter={url("glow")}
			>
				{box.reflection.map((d) => (
					<path key={d} d={d} />
				))}
				<path
					d={hex((BOX.left + BOX.right) / 2, 2 * BOX.bottom - (BOX.top + BOX.bottom) / 2, 25)}
					stroke="var(--wv-pink)"
				/>
			</g>

			{/* Light pouring up out of the box, and motes drifting in it. */}
			<g filter={url("soft")} opacity="0.7" style={screen}>
				<path d="M268 214 L150 40 L250 40 L300 214 Z" fill={url("beam")} />
				<path d="M300 214 L290 20 L350 20 L340 214 Z" fill={url("beam")} />
				<path d="M340 214 L390 40 L490 40 L372 214 Z" fill={url("beam")} />
			</g>
			<g fill="white" filter={url("glow")}>
				{MOTES.map(([cx, cy, r]) => (
					<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity="0.75" />
				))}
			</g>

			{/* The products, as neon: tinted glass, a glowing coloured stroke, and a white core. */}
			{PRODUCTS.map(({ icon, cx, cy, scale, tilt }) => {
				const drawing = BADGE_DRAWINGS[icon];
				const [ox, oy] = DRAWING_CENTRE[icon] ?? [50, 50];
				return (
					<g
						key={icon}
						transform={`translate(${cx} ${cy}) rotate(${tilt}) scale(${scale}) translate(${-ox} ${-oy})`}
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<g fill={url("glass")}>
							{drawing.strokes
								.filter((d) => d.trimEnd().endsWith("Z"))
								.map((d) => (
									<path key={d} d={d} />
								))}
						</g>
						<g stroke={url("icon")} strokeWidth="5.5" filter={url("glow")}>
							{drawing.strokes.map((d) => (
								<path key={d} d={d} />
							))}
						</g>
						<g stroke="white" strokeOpacity="0.9" strokeWidth="1.6">
							{drawing.strokes.map((d) => (
								<path key={d} d={d} />
							))}
						</g>
						{drawing.dots?.map((d) => (
							<path key={d} d={d} fill="white" stroke="none" />
						))}
					</g>
				);
			})}

			{/* The open box: each face solid (so the grid and sun don't show through), shaded by its light, and edged in neon.
			    The front also catches a glassy sheen. */}
			{boxFaces.map(({ d, base, shade }) => (
				<g key={d} strokeLinejoin="round" strokeLinecap="round">
					<path d={d} fill={base} fillOpacity="0.97" />
					<path d={d} fill={url(shade)} />
					{d === box.front && <path d={d} fill={url("sheen")} />}
					<path d={d} fill="none" stroke={url("neon")} strokeWidth="5" filter={url("glow")} />
					<path d={d} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" />
				</g>
			))}
			{/* The light blooming over the rim. */}
			<ellipse
				cx="320"
				cy={BOX.top + BOX.dy / 2}
				rx="96"
				ry="16"
				fill={url("bloom")}
				filter={url("soft")}
				style={screen}
			/>

			{/* A neon hexagon with a % in the middle of the box's front. */}
			<g fill="none">
				<path d={badgeHex} stroke="var(--wv-pink)" strokeWidth="3.5" filter={url("glow")} />
				<path d={badgeHex} stroke="white" strokeOpacity="0.85" strokeWidth="1.2" />
			</g>
			<text
				x={(BOX.left + BOX.right) / 2}
				y={(BOX.top + BOX.bottom) / 2 + (22 * 0.72) / 2}
				textAnchor="middle"
				fill="white"
				style={{ ...bungee, fontSize: 22 }}
			>
				%
			</text>

			{/* Sparks around the products, clear of them and of the tag. */}
			<g fill="white" filter={url("glow")}>
				<path d={SPARK} transform="translate(192 96) scale(0.9)" />
				<path d={SPARK} transform="translate(440 120) scale(0.6)" />
				<path d={SPARK} transform="translate(396 58) scale(0.5)" />
			</g>

			{/* The tag: a neon hexagon of dark glass, glowing inside its rim, with BUNDLE & SAVE on a glossy plate. */}
			<g>
				<path d={tagHex} fill={url("tag-glass")} />
				<path
					d={tagHex}
					fill="none"
					stroke="var(--wv-pink)"
					strokeOpacity="0.45"
					strokeWidth="12"
					filter={url("soft")}
					clipPath={`url(#${id("tag-clip")})`}
				/>
				<path d={tagHex} fill="none" stroke={url("tag-neon")} strokeWidth="4.5" filter={url("glow")} />
				<path d={tagHex} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.2" />
				<path d={plate} fill={url("plate")} />
				<path d={plate} fill={url("plate-gloss")} />
				<path d={plate} fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
				{[
					["BUNDLE", tagBaseline1],
					["& SAVE", tagBaseline2],
				].map(([text, y]) => (
					<text
						key={text}
						x={TAG.cx}
						y={y}
						textAnchor="middle"
						fill="white"
						stroke="var(--wv-ink)"
						strokeWidth="3"
						strokeLinejoin="round"
						paintOrder="stroke"
						style={{ ...bungee, fontSize: TAG_FONT }}
					>
						{text}
					</text>
				))}
			</g>

			{/* Over everything: the vignette, then the grain. */}
			<rect width="640" height="360" fill={url("vignette")} />
			<rect
				width="640"
				height="360"
				filter={url("grain")}
				opacity="0.07"
				style={{ mixBlendMode: "overlay" }}
			/>
		</svg>
	);
}
