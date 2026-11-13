import { BADGE_DRAWINGS } from "./wv-category-badge";
import type { CategoryBadgeIcon } from "./wv-category-art";

/**
 * The promotional-bundles art, drawn in the category badges' neon style: a nebula with a striped synthwave sun over a
 * glowing perspective grid, an open neon box with light pouring out, the badges' own product drawings rising from it, and a
 * hexagon "BUNDLE & SAVE" tag. Drawn here rather than shipped as a picture so it matches the badges, stays sharp, and
 * costs a few KB instead of 2.3 MB.
 *
 * It fills its frame (`slice`); the frames differ by screen (about 1.5 to 2.1 wide per 1 high), so everything that
 * matters sits inside x 70–570, y 30–330 of the 640 × 360 drawing.
 */

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

/** Products rising out of the box: which drawing, where its 100 × 100 box goes, and its tilt. */
const PRODUCTS: ReadonlyArray<{
	icon: CategoryBadgeIcon;
	x: number;
	y: number;
	scale: number;
	tilt: number;
}> = [
	{ icon: "disposables", x: 214, y: 88, scale: 0.92, tilt: -16 },
	{ icon: "eliquid", x: 274, y: 70, scale: 0.98, tilt: 0 },
	{ icon: "hardware", x: 340, y: 86, scale: 0.92, tilt: 14 },
];

const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";

/** A pointy-topped hexagon of radius r around (cx, cy). */
const hex = (cx: number, cy: number, r: number) => {
	const w = r * 0.866;
	return `M${cx} ${cy - r} L${cx + w} ${cy - r / 2} L${cx + w} ${cy + r / 2} L${cx} ${cy + r} L${cx - w} ${cy + r / 2} L${cx - w} ${cy - r / 2} Z`;
};

export function PromoBundleArt({ idPrefix, label }: { idPrefix: string; label: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;
	const horizon = 236;
	// The floor's lines: from the vanishing point at the horizon's middle out to the bottom edge, and across it ever wider apart.
	const rays = Array.from({ length: 17 }, (_, i) => -320 + i * 80);
	const rungs = [242, 252, 266, 286, 314, 352];

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
				<linearGradient id={id("neon")} x1="0" y1="0" x2="1" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("icon")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-cyan)")}
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
				{/* The sun's lower half in bands, as on an old synthwave poster. */}
				<mask id={id("bands")}>
					<rect x="0" y="0" width="640" height="360" fill="white" />
					{[0, 1, 2, 3, 4].map((i) => (
						<rect key={i} x="0" y={176 + i * 13} width="640" height={3 + i * 1.6} fill="black" />
					))}
				</mask>
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

			{/* Sky, stars and the banded sun. */}
			<rect width="640" height="360" fill={url("sky")} />
			<g fill="white">
				{[
					[88, 52, 1.6],
					[150, 96, 1.1],
					[118, 170, 1.3],
					[560, 60, 1.4],
					[598, 150, 1.1],
					[470, 40, 1],
					[210, 30, 1.2],
					[420, 120, 0.9],
					[540, 200, 1.2],
					[70, 210, 1],
				].map(([cx, cy, r]) => (
					<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity="0.8" />
				))}
			</g>
			<circle cx="320" cy="168" r="104" fill={url("sun")} opacity="0.7" mask={`url(#${id("bands")})`} />
			<circle
				cx="320"
				cy="168"
				r="104"
				fill="none"
				stroke="var(--wv-pink)"
				strokeOpacity="0.5"
				strokeWidth="2"
			/>

			{/* The floor: a dark gradient under a cyan grid, and the horizon lit pink. */}
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

			{/* Light pouring up out of the box. */}
			<g filter={url("soft")} opacity="0.85">
				<path d="M268 214 L150 40 L250 40 L300 214 Z" fill={url("beam")} />
				<path d="M300 214 L290 20 L350 20 L340 214 Z" fill={url("beam")} />
				<path d="M340 214 L390 40 L490 40 L372 214 Z" fill={url("beam")} />
			</g>

			{/* The products, as neon: a glowing coloured stroke under a white core. */}
			{PRODUCTS.map(({ icon, x, y, scale, tilt }) => {
				const drawing = BADGE_DRAWINGS[icon];
				return (
					<g
						key={icon}
						transform={`translate(${x} ${y}) rotate(${tilt} ${50 * scale} ${50 * scale}) scale(${scale})`}
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

			{/* The box's solid faces, so the grid and sun don't show through it, and the light inside its opening. */}
			<path d="M246 214 L272 196 L420 196 L394 214 Z" fill="var(--wv-pink)" fillOpacity="0.45" />
			<path d="M394 214 L420 196 L420 268 L394 292 Z" fill="var(--wv-bg)" fillOpacity="0.92" />
			<path d="M246 214 L394 214 L394 292 L246 292 Z" fill="var(--wv-deep)" fillOpacity="0.94" />
			<path d="M246 214 L206 196 L226 176 L272 196 Z" fill="var(--wv-deep)" fillOpacity="0.85" />
			<path d="M394 214 L436 194 L452 214 L420 196 Z" fill="var(--wv-deep)" fillOpacity="0.85" />

			{/* The open box: back rim, flaps folded out, side and front, all neon. */}
			<g fill="none" strokeLinejoin="round" strokeLinecap="round">
				<g stroke={url("neon")} strokeWidth="5" filter={url("glow")}>
					<path d="M246 214 L272 196 L420 196 L394 214" />
					<path d="M246 214 L206 196 L226 176 L272 196" />
					<path d="M394 214 L436 194 L452 214 L420 196" />
					<path d="M394 214 L420 196 L420 268 L394 292 Z" />
					<path d="M246 214 L394 214 L394 292 L246 292 Z" />
				</g>
				<g stroke="white" strokeOpacity="0.85" strokeWidth="1.4">
					<path d="M246 214 L272 196 L420 196 L394 214" />
					<path d="M246 214 L206 196 L226 176 L272 196" />
					<path d="M394 214 L436 194 L452 214 L420 196" />
					<path d="M394 214 L420 196 L420 268 L394 292 Z" />
					<path d="M246 214 L394 214 L394 292 L246 292 Z" />
				</g>
				{/* A hexagon with a % on the front of the box. */}
				<path d={hex(320, 253, 25)} stroke="var(--wv-pink)" strokeWidth="3" filter={url("glow")} />
				<text
					x="320"
					y="262"
					textAnchor="middle"
					fill="white"
					stroke="none"
					style={{ fontFamily: "var(--font-bungee), system-ui, sans-serif", fontSize: 24 }}
				>
					%
				</text>
			</g>

			{/* Sparks around the products. */}
			<g fill="white" filter={url("glow")}>
				<path d={SPARK} transform="translate(196 92) scale(0.9)" />
				<path d={SPARK} transform="translate(454 112) scale(0.7)" />
				<path d={SPARK} transform="translate(410 58) scale(0.5)" />
			</g>

			{/* The tag: a pink neon hexagon with BUNDLE & SAVE on a plate. */}
			<g>
				<path d={hex(506, 104, 52)} fill="var(--wv-bg)" fillOpacity="0.55" />
				<path d={hex(506, 104, 52)} fill="none" stroke={url("neon")} strokeWidth="4.5" filter={url("glow")} />
				<path d={hex(506, 104, 52)} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.2" />
				<path d="M462 90 L550 90 L558 104 L550 118 L462 118 L454 104 Z" fill={url("plate")} />
				<text
					x="506"
					y="101"
					textAnchor="middle"
					fill="white"
					stroke="var(--wv-ink)"
					strokeWidth="3"
					paintOrder="stroke"
					style={{ fontFamily: "var(--font-bungee), system-ui, sans-serif", fontSize: 13 }}
				>
					BUNDLE
				</text>
				<text
					x="506"
					y="115"
					textAnchor="middle"
					fill="white"
					stroke="var(--wv-ink)"
					strokeWidth="3"
					paintOrder="stroke"
					style={{ fontFamily: "var(--font-bungee), system-ui, sans-serif", fontSize: 13 }}
				>
					& SAVE
				</text>
			</g>
		</svg>
	);
}
