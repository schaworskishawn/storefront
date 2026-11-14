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
		// Where the box meets the floor: its footprint's centre.
		floor: [(l + r + dx) / 2, b + dy / 2] as const,
	};
})();

const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";

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

const bungee = { fontFamily: "var(--font-bungee), system-ui, sans-serif" } as const;

export function PromoBundleArt({ idPrefix, label }: { idPrefix: string; label: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;
	const horizon = 236;
	// The floor's lines: from the vanishing point at the horizon's middle out to the bottom edge, and across it ever wider apart.
	const rays = Array.from({ length: 17 }, (_, i) => -320 + i * 80);
	const rungs = [242, 252, 266, 286, 314, 352];
	// The box's faces from back to front, each filled and then outlined, so a nearer face hides the edges behind it.
	// The side is in shadow, darker than the front; the right flap hangs in front of the side.
	const boxFaces = [
		{ d: box.flapLeft, fill: "var(--wv-deep)", opacity: 0.88 },
		{ d: box.opening, fill: "var(--wv-pink)", opacity: 0.45 },
		{ d: box.side, fill: "var(--wv-bg)", opacity: 0.94 },
		{ d: box.flapRight, fill: "var(--wv-deep)", opacity: 0.96 },
		{ d: box.front, fill: "var(--wv-deep)", opacity: 0.94 },
	];

	return (
		<svg
			viewBox="0 0 640 360"
			preserveAspectRatio="xMidYMid slice"
			className="absolute inset-0 size-full"
			role="img"
			aria-label={label}
		>
			<defs>
				<radialGradient id={id("sky")} cx="50%" cy="46%" r="70%">
					{stop("0%", "var(--wv-pink)", 0.55)}
					{stop("32%", "var(--wv-purple)", 0.9)}
					{stop("70%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<linearGradient id={id("sun")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-purple)")}
				</linearGradient>
				{/* One light for the whole box (cyan at the top left to pink at the bottom right), not one per edge. */}
				<linearGradient id={id("neon")} gradientUnits="userSpaceOnUse" x1="198" y1="160" x2="443" y2="292">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("tag-neon")} x1="0" y1="0" x2="1" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				{/* Each product cyan at its top to pink at its foot, across the whole drawing (its 100 × 100 box): lit from above
				    like the box, and cyan where it crosses the pink sun, so it stands off it. */}
				<linearGradient id={id("icon")} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="92">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("beam")} x1="0" y1="1" x2="0" y2="0">
					{stop("0%", "var(--wv-pink)", 0.7)}
					{stop("100%", "var(--wv-pink)", 0)}
				</linearGradient>
				<linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-purple)", 0.55)}
					{stop("100%", "var(--wv-bg)", 0.95)}
				</linearGradient>
				<linearGradient id={id("plate")} x1="0" y1="0" x2="1" y2="0">
					{stop("0%", "var(--wv-purple)")}
					{stop("50%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-purple)")}
				</linearGradient>
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
			</defs>

			{/* Sky, stars and the sun. */}
			<rect width="640" height="360" fill={url("sky")} />
			<g fill="white">
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
			<circle cx="320" cy="168" r="104" fill={url("sun")} opacity="0.7" />
			<circle
				cx="320"
				cy="168"
				r="104"
				fill="none"
				stroke="var(--wv-pink)"
				strokeOpacity="0.5"
				strokeWidth="2"
			/>

			{/* The floor: a dark gradient under a cyan grid, the horizon lit pink, and the box's glow on it. */}
			<rect x="0" y={horizon} width="640" height={360 - horizon} fill={url("floor")} />
			<g clipPath={`url(#${id("ground")})`} stroke="var(--wv-cyan)" strokeOpacity="0.45" strokeWidth="1.4">
				{rays.map((x) => (
					<path key={x} d={`M320 ${horizon} L${x} 360`} />
				))}
				{rungs.map((y) => (
					<path key={y} d={`M0 ${y} L640 ${y}`} />
				))}
			</g>
			<path
				d={`M0 ${horizon} L640 ${horizon}`}
				stroke="var(--wv-pink)"
				strokeWidth="2.5"
				filter={url("glow")}
			/>
			<ellipse
				cx={box.floor[0]}
				cy={box.floor[1] + 6}
				rx="112"
				ry="13"
				fill="var(--wv-pink)"
				opacity="0.45"
				filter={url("soft")}
			/>

			{/* Light pouring up out of the box. */}
			<g filter={url("soft")} opacity="0.85">
				<path d="M268 214 L150 40 L250 40 L300 214 Z" fill={url("beam")} />
				<path d="M300 214 L290 20 L350 20 L340 214 Z" fill={url("beam")} />
				<path d="M340 214 L390 40 L490 40 L372 214 Z" fill={url("beam")} />
			</g>

			{/* The products, as neon: a glowing coloured stroke under a white core. */}
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

			{/* The open box: solid faces (so the grid and sun don't show through, and the opening glows) with neon edges. */}
			{boxFaces.map(({ d, fill, opacity }) => (
				<g key={d} strokeLinejoin="round" strokeLinecap="round">
					<path d={d} fill={fill} fillOpacity={opacity} />
					<path d={d} fill="none" stroke={url("neon")} strokeWidth="5" filter={url("glow")} />
					<path d={d} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" />
				</g>
			))}

			{/* A neon hexagon with a % in the middle of the box's front. */}
			<g fill="none">
				<path
					d={hex((BOX.left + BOX.right) / 2, (BOX.top + BOX.bottom) / 2, 25)}
					stroke="var(--wv-pink)"
					strokeWidth="3.5"
					filter={url("glow")}
				/>
				<path
					d={hex((BOX.left + BOX.right) / 2, (BOX.top + BOX.bottom) / 2, 25)}
					stroke="white"
					strokeOpacity="0.85"
					strokeWidth="1.2"
				/>
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

			{/* The tag: a neon hexagon with BUNDLE & SAVE on a plate inside it. */}
			<g>
				<path d={hex(TAG.cx, TAG.cy, TAG.r)} fill="var(--wv-bg)" fillOpacity="0.6" />
				<path
					d={hex(TAG.cx, TAG.cy, TAG.r)}
					fill="none"
					stroke={url("tag-neon")}
					strokeWidth="4.5"
					filter={url("glow")}
				/>
				<path
					d={hex(TAG.cx, TAG.cy, TAG.r)}
					fill="none"
					stroke="white"
					strokeOpacity="0.85"
					strokeWidth="1.2"
				/>
				<path d={plate} fill={url("plate")} />
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
		</svg>
	);
}
