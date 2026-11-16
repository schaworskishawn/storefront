import { BADGE_DRAWINGS } from "./wv-category-badge";
import type { CategoryBadgeIcon } from "./wv-category-art";

/**
 * The shop hero's art, in the same neon style as the promotional-bundles art (wv-promo-art.tsx) and the category badges:
 * a nebula sky with a banded sun over a perspective grid, and the store's range (the badges' own product drawings)
 * standing in a lineup on glowing pedestals, mirrored in the wet floor. Drawn rather than shipped as a photo, so it
 * matches the rest of the site, stays sharp and costs a few KB.
 *
 * The drawing is 480 × 320, the frame's own 3:2 shape. The sun, the grid's vanishing point and the tallest product share
 * the centre line, x 240. Lighting follows the promo art: neon on dark (each product is dark glass edged in neon with a
 * tight glow and a wide bloom, over a dark shadow), the sun and sky as fill, light pooling under each pedestal, and a
 * vignette and fine grain over everything.
 */

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

const W = 480;
const H = 320;
const HORIZON = 196;
/** Where the products stand: their feet, in front of the horizon, so they rise against the sun. */
const FLOOR = 254;

/** Each drawing's horizontal centre and its lowest point in its 100 × 100 box, so it can stand on the floor. */
const FOOT: Record<CategoryBadgeIcon, readonly [number, number]> = {
	disposables: [58, 88],
	eliquid: [61, 92],
	hardware: [57, 92],
	coils: [50, 92],
	accessories: [56, 90],
	"new-arrivals": [52, 86],
};

/**
 * The lineup, the hero of the picture: big enough to read in a frame only 180–240px wide. Tallest in the middle and a
 * little larger, the outer ones smaller as if further back.
 */
const LINEUP: ReadonlyArray<{ icon: CategoryBadgeIcon; x: number; scale: number }> = [
	{ icon: "accessories", x: 58, scale: 0.9 },
	{ icon: "disposables", x: 150, scale: 1.02 },
	{ icon: "eliquid", x: 240, scale: 1.14 },
	{ icon: "hardware", x: 330, scale: 1.02 },
	{ icon: "coils", x: 422, scale: 0.9 },
];

/** The bands cut out of the sun's lower half: top and height, wider toward the horizon. */
const SUN = { cx: 240, cy: 128, r: 84 } as const;
const SUN_BANDS = [
	[112, 2],
	[122, 2.5],
	[132, 3],
	[142, 4],
	[153, 5],
	[165, 6],
	[178, 7],
] as const;

const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";
const STARS = [
	[40, 34, 1.4],
	[96, 70, 1],
	[60, 132, 1.1],
	[430, 40, 1.3],
	[452, 120, 1],
	[372, 26, 0.9],
	[128, 24, 1.1],
	[344, 150, 0.8],
	[22, 172, 0.9],
	[468, 176, 0.9],
] as const;

const isClosed = (d: string) => d.trimEnd().endsWith("Z");
const screen = { mixBlendMode: "screen" } as const;

export function ShopHeroArt({ idPrefix }: { idPrefix: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;
	// The floor's lines: from the vanishing point at the horizon's middle out past the bottom edge, and across it.
	const rays = Array.from({ length: 15 }, (_, i) => -320 + i * 80);
	const rungs = [201, 209, 220, 236, 258, 288];

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
				<radialGradient id={id("sky")} cx="50%" cy="42%" r="72%">
					{stop("0%", "var(--wv-pink)", 0.42)}
					{stop("30%", "var(--wv-purple)", 0.7)}
					{stop("62%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<radialGradient id={id("drift-cyan")}>
					{stop("0%", "var(--wv-cyan)", 0.18)}
					{stop("100%", "var(--wv-cyan)", 0)}
				</radialGradient>
				<radialGradient id={id("drift-pink")}>
					{stop("0%", "var(--wv-pink)", 0.2)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>

				<linearGradient id={id("sun")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-pink)")}
					{stop("30%", "var(--wv-pink)", 0.92)}
					{stop("62%", "var(--wv-purple)", 0.55)}
					{stop("100%", "var(--wv-purple)", 0.12)}
				</linearGradient>
				<radialGradient id={id("sun-core")} cx="50%" cy="16%" r="50%">
					{stop("0%", "white", 0.14)}
					{stop("100%", "white", 0)}
				</radialGradient>
				<linearGradient id={id("sun-rim")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "white", 0.7)}
					{stop("45%", "var(--wv-pink)", 0.55)}
					{stop("100%", "var(--wv-pink)", 0.1)}
				</linearGradient>
				<mask
					id={id("sun-bands")}
					maskUnits="userSpaceOnUse"
					x={SUN.cx - SUN.r - 10}
					y={SUN.cy - SUN.r - 10}
					width={2 * SUN.r + 20}
					height={2 * SUN.r + 20}
				>
					<rect x="0" y="0" width={W} height={H} fill="white" />
					{SUN_BANDS.map(([y, h]) => (
						<rect key={y} x="0" y={y} width={W} height={h} fill="black" />
					))}
				</mask>

				<linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-purple)", 0.55)}
					{stop("100%", "var(--wv-bg)", 0.95)}
				</linearGradient>
				<linearGradient
					id={id("haze")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={HORIZON - 32}
					x2="0"
					y2={HORIZON + 40}
				>
					{stop("0%", "var(--wv-pink)", 0)}
					{stop("44%", "var(--wv-pink)", 0.34)}
					{stop("62%", "var(--wv-purple)", 0.3)}
					{stop("100%", "var(--wv-purple)", 0)}
				</linearGradient>
				<linearGradient id={id("grid-fade")} gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2={H}>
					{stop("0%", "white", 0.15)}
					{stop("100%", "white", 1)}
				</linearGradient>
				<mask
					id={id("grid-mask")}
					maskUnits="userSpaceOnUse"
					x="0"
					y={HORIZON}
					width={W}
					height={H - HORIZON}
				>
					<rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={url("grid-fade")} />
				</mask>
				<clipPath id={id("ground")}>
					<rect x="0" y={HORIZON} width={W} height={H - HORIZON} />
				</clipPath>
				{/* The products' reflections fade out within a short way of their feet. */}
				<linearGradient
					id={id("reflection-fade")}
					gradientUnits="userSpaceOnUse"
					x1="0"
					y1={FLOOR}
					x2="0"
					y2={FLOOR + 52}
				>
					{stop("0%", "white", 0.5)}
					{stop("100%", "white", 0)}
				</linearGradient>
				<mask
					id={id("reflection-mask")}
					maskUnits="userSpaceOnUse"
					x="0"
					y={FLOOR}
					width={W}
					height={H - FLOOR}
				>
					<rect x="0" y={FLOOR} width={W} height={H - FLOOR} fill={url("reflection-fade")} />
				</mask>
				<radialGradient id={id("pool")}>
					{stop("0%", "var(--wv-pink)", 0.65)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>
				<linearGradient id={id("pedestal")} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>

				{/* Products: cyan at the top to pink at the foot across each drawing's 100 × 100 box, and smoked glass inside
				    each closed outline, so the neon reads against the sun. */}
				<linearGradient id={id("icon")} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="92">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("glass")} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="92">
					{stop("0%", "var(--wv-deep)", 0.86)}
					{stop("65%", "var(--wv-deep)", 0.78)}
					{stop("100%", "var(--wv-purple)", 0.72)}
				</linearGradient>

				<radialGradient id={id("vignette")} r="72%">
					{stop("60%", "var(--wv-bg)", 0)}
					{stop("100%", "var(--wv-bg)", 0.62)}
				</radialGradient>
				<filter id={id("glow")} x="-40%" y="-40%" width="180%" height="180%">
					<feGaussianBlur stdDeviation="2.6" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("neon-glow")} x="-60%" y="-60%" width="220%" height="220%">
					<feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="tight" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="8" result="wide" />
					<feMerge>
						<feMergeNode in="wide" />
						<feMergeNode in="tight" />
						<feMergeNode in="tight" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				{/* The horizon's glow, in the drawing's own units, so a box around a thin line doesn't crop it flat. */}
				<filter
					id={id("horizon-glow")}
					filterUnits="userSpaceOnUse"
					x="-20"
					y={HORIZON - 36}
					width={W + 40}
					height="72"
				>
					<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="tight" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="9" result="wide" />
					<feMerge>
						<feMergeNode in="wide" />
						<feMergeNode in="wide" />
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
				<filter id={id("halo")} x="-60%" y="-60%" width="220%" height="220%">
					<feGaussianBlur stdDeviation="16" />
				</filter>
				<filter id={id("grain")} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
			</defs>

			{/* Sky, stars and the sun. */}
			<rect width={W} height={H} fill={url("sky")} />
			<ellipse cx="80" cy="80" rx="140" ry="84" fill={url("drift-cyan")} />
			<ellipse cx="410" cy="62" rx="130" ry="78" fill={url("drift-pink")} />
			<g fill="white" filter={url("glow")}>
				{STARS.map(([cx, cy, r]) => (
					<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity="0.8" />
				))}
			</g>
			<circle
				cx={SUN.cx}
				cy={SUN.cy}
				r={SUN.r + 8}
				fill="var(--wv-pink)"
				opacity="0.3"
				filter={url("halo")}
			/>
			<g mask={`url(#${id("sun-bands")})`}>
				<circle cx={SUN.cx} cy={SUN.cy} r={SUN.r} fill={url("sun")} opacity="0.8" />
				<circle cx={SUN.cx} cy={SUN.cy} r={SUN.r} fill={url("sun-core")} />
				<circle
					cx={SUN.cx}
					cy={SUN.cy}
					r={SUN.r}
					fill="none"
					stroke={url("sun-rim")}
					strokeWidth="2.5"
					filter={url("glow")}
				/>
			</g>

			{/* The floor: a dark gradient under a grid fading into the distance, haze and a bright horizon. */}
			<rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={url("floor")} />
			<g clipPath={`url(#${id("ground")})`} mask={`url(#${id("grid-mask")})`}>
				<g stroke="var(--wv-cyan)" strokeOpacity="0.8" strokeWidth="1.5" filter={url("glow")}>
					{rays.map((x) => (
						<path key={x} d={`M${W / 2} ${HORIZON} L${x} ${H + 40}`} />
					))}
					{rungs.map((y) => (
						<path key={y} d={`M0 ${y} L${W} ${y}`} />
					))}
				</g>
			</g>
			<rect x="0" y={HORIZON - 32} width={W} height="72" fill={url("haze")} />
			<g filter={url("horizon-glow")}>
				<path d={`M0 ${HORIZON} L${W} ${HORIZON}`} stroke="var(--wv-pink)" strokeWidth="2.5" />
				<path d={`M0 ${HORIZON} L${W} ${HORIZON}`} stroke="white" strokeOpacity="0.7" strokeWidth="0.9" />
			</g>

			{/* The lineup: each product on a glowing pedestal, light pooling on the floor around it and its reflection in the
			    wet floor below, then the product itself as neon over dark glass. */}
			{LINEUP.map(({ icon, x, scale }) => {
				const drawing = BADGE_DRAWINGS[icon];
				const [fx, fy] = FOOT[icon];
				const place = `translate(${x} ${FLOOR}) scale(${scale}) translate(${-fx} ${-fy})`;
				const mirror = `translate(${x} ${FLOOR}) scale(${scale} ${-scale}) translate(${-fx} ${-fy})`;
				const rx = 34 * scale + 6;
				return (
					<g key={icon}>
						<ellipse cx={x} cy={FLOOR + 2} rx={rx * 1.9} ry="11" fill={url("pool")} style={screen} />
						<g mask={`url(#${id("reflection-mask")})`} opacity="0.55">
							<g
								transform={mirror}
								fill="none"
								stroke={url("icon")}
								strokeWidth="5.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								filter={url("glow")}
							>
								{drawing.strokes.map((d) => (
									<path key={d} d={d} />
								))}
							</g>
						</g>
						<ellipse cx={x} cy={FLOOR} rx={rx} ry="5" fill="var(--wv-ink)" opacity="0.9" />
						<ellipse
							cx={x}
							cy={FLOOR}
							rx={rx}
							ry="5"
							fill="none"
							stroke={url("pedestal")}
							strokeWidth="2.4"
							filter={url("neon-glow")}
						/>
						<g transform={place} fill="none" strokeLinecap="round" strokeLinejoin="round">
							<g
								stroke="var(--wv-bg)"
								strokeOpacity="0.85"
								strokeWidth="16"
								fill="var(--wv-bg)"
								fillOpacity="0.8"
								filter={url("shadow")}
							>
								{drawing.strokes.map((d) => (
									<path key={d} d={d} fill={isClosed(d) ? undefined : "none"} />
								))}
							</g>
							<g stroke={url("icon")} strokeWidth="5.5" filter={url("neon-glow")}>
								{drawing.strokes.map((d) => (
									<path key={d} d={d} />
								))}
							</g>
							{/* Dark glass inside each closed outline, over the glow but not over the tubes, so the bloom can't
							    wash the small shapes out. */}
							<mask
								id={id(`glass-${icon}`)}
								maskUnits="userSpaceOnUse"
								x="-50"
								y="-50"
								width="200"
								height="200"
							>
								<g fill="white">
									{drawing.strokes.filter(isClosed).map((d) => (
										<path key={d} d={d} />
									))}
								</g>
								<g fill="none" stroke="black" strokeWidth="5.5">
									{drawing.strokes.map((d) => (
										<path key={d} d={d} />
									))}
								</g>
							</mask>
							<g fill={url("glass")} mask={`url(#${id(`glass-${icon}`)})`}>
								{drawing.strokes.filter(isClosed).map((d) => (
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
					</g>
				);
			})}

			{/* Sparks over the lineup. */}
			<g fill="white" filter={url("neon-glow")}>
				<path d={SPARK} transform="translate(104 118) scale(0.8)" />
				<path d={SPARK} transform="translate(380 110) scale(0.62)" />
				<path d={SPARK} transform="translate(300 46) scale(0.45)" />
			</g>

			{/* Over everything: the vignette, then the grain. */}
			<rect width={W} height={H} fill={url("vignette")} />
			<rect width={W} height={H} filter={url("grain")} opacity="0.07" style={{ mixBlendMode: "overlay" }} />
		</svg>
	);
}
