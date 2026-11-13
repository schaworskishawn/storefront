import type { CategoryBadgeIcon } from "./wv-category-art";

/**
 * A category badge in the site's look: a neon hexagon (cyan into pink) over a dark nebula, a glowing line drawing of what
 * the category holds, and its name on a plate across the bottom in the headline font. Drawn here rather than shipped as
 * pictures, so the six read as one set, stay sharp at any size, cost a few KB instead of ~2.4 MB each, and carry the name
 * as text. Colours are the brand tokens; the hover glow is in wv-home.css (`.wv-badge`).
 */

/** Line drawings in a 100 × 100 box, stroked with the icon gradient; `dots` are small filled accents. Shared with the
 * promo art (wv-promo-art.tsx), so the products there are drawn the same way. */
export const BADGE_DRAWINGS: Record<CategoryBadgeIcon, { strokes: string[]; dots?: string[] }> = {
	// A disposable bar: body, tapered mouthpiece, a band, the LED, and two curls of vapour.
	disposables: {
		strokes: [
			"M38 30 Q38 22 46 22 L54 22 Q62 22 62 30 L62 80 Q62 88 54 88 L46 88 Q38 88 38 80 Z",
			"M43 22 L45 10 L55 10 L57 22",
			"M38 38 L62 38",
			"M66 14 C72 8 76 16 82 10",
			"M68 24 C76 18 80 28 88 20",
		],
		dots: ["M50 77 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0"],
	},
	// A dropper bottle with its label, and a drop.
	eliquid: {
		strokes: [
			"M30 52 Q30 44 38 44 L62 44 Q70 44 70 52 L70 84 Q70 92 62 92 L38 92 Q30 92 30 84 Z",
			"M38 44 L40 36 L60 36 L62 44",
			"M40 26 L60 26 L60 36 L40 36 Z",
			"M44 26 C42 10 58 10 56 26",
			"M37 58 L63 58 L63 76 L37 76 Z",
			"M84 50 C84 50 76 60 76 66 A8 8 0 0 0 92 66 C92 60 84 50 84 50 Z",
		],
	},
	// A box mod with its screen, fire button, tank and drip tip, beside a pod.
	hardware: {
		strokes: [
			"M28 46 Q28 40 34 40 L56 40 Q62 40 62 46 L62 86 Q62 92 56 92 L34 92 Q28 92 28 86 Z",
			"M34 48 L48 48 L48 66 L34 66 Z",
			"M54 48 L57 48 L57 64 L54 64 Z",
			"M36 26 L54 26 L54 40 L36 40 Z",
			"M40 16 L50 16 L50 26 L40 26 Z",
			"M68 46 Q68 36 77 36 Q86 36 86 46 L86 84 Q86 92 77 92 Q68 92 68 84 Z",
			"M72 44 L82 44 L82 56 L72 56 Z",
		],
	},
	// A replacement coil head: the housing, the coil wound inside, and the thread.
	coils: {
		strokes: [
			"M30 24 Q30 16 38 16 L62 16 Q70 16 70 24 L70 76 Q70 82 64 82 L36 82 Q30 82 30 76 Z",
			"M38 30 A12 3.5 0 0 0 62 30",
			"M38 38 A12 3.5 0 0 0 62 38",
			"M38 46 A12 3.5 0 0 0 62 46",
			"M38 54 A12 3.5 0 0 0 62 54",
			"M38 62 A12 3.5 0 0 0 62 62",
			"M38 82 L38 92 L62 92 L62 82",
			"M38 87 L62 87",
		],
	},
	// A battery with a bolt, and a charging plug on its cable.
	accessories: {
		strokes: [
			"M22 40 Q22 34 28 34 L44 34 Q50 34 50 40 L50 84 Q50 90 44 90 L28 90 Q22 90 22 84 Z",
			"M30 34 L30 28 L42 28 L42 34",
			"M39 46 L31 62 L37 62 L33 76 L43 58 L37 58 Z",
			"M64 30 Q64 24 70 24 L74 24 Q80 24 80 30 L80 46 Q80 50 76 50 L68 50 Q64 50 64 46 Z",
			"M68 24 L68 16 L76 16 L76 24",
			"M72 50 C72 70 90 66 86 90",
		],
	},
	// A star bursting open, with two sparks.
	"new-arrivals": {
		strokes: [
			"M50 10 C53 34 58 42 82 46 C58 50 53 58 50 84 C47 58 42 50 18 46 C42 42 47 34 50 10 Z",
			"M80 12 C81 19 83 21 90 22 C83 23 81 25 80 32 C79 25 77 23 70 22 C77 21 79 19 80 12 Z",
			"M22 70 L22 86 M14 78 L30 78",
		],
	},
};

/** A pointy-topped hexagon filling the 200 × 220 box, and the same one inset. */
const HEX = "M100 8 L188 58 L188 162 L100 212 L12 162 L12 58 Z";
const HEX_INNER = "M100 22 L176 65 L176 155 L100 198 L24 155 L24 65 Z";
/** The name plate across the bottom, with pointed ends that cross the frame. */
const PLATE = "M26 150 L174 150 L188 167 L174 184 L26 184 L12 167 Z";

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

export function CategoryBadge({
	icon,
	name,
	idPrefix,
	active = false,
}: {
	icon: CategoryBadgeIcon;
	name: string;
	/** Unique on the page: the badge's gradients and filters are found by id. */
	idPrefix: string;
	/** Selected (the shop's category filter): the frame and glow light up. */
	active?: boolean;
}) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const label = name.toUpperCase();
	// The headline font is wide: a long name is fitted to the plate rather than spilling over it.
	const fit = label.length > 8 ? { textLength: 150, lengthAdjust: "spacingAndGlyphs" as const } : {};
	const drawing = BADGE_DRAWINGS[icon];

	return (
		<svg
			viewBox="0 0 200 220"
			className="wv-badge size-full"
			data-active={active ? "" : undefined}
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				<linearGradient id={id("frame")} x1="0.2" y1="0" x2="0.8" y2="1">
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("icon")} x1="0" y1="0" x2="0" y2="1">
					{stop("0%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-cyan)")}
				</linearGradient>
				{/* A nebula: hot pink at the heart, through purple, to the page's black at the edge. */}
				<radialGradient id={id("field")} cx="50%" cy="42%" r="62%">
					{stop("0%", "var(--wv-pink)", 0.75)}
					{stop("38%", "var(--wv-purple)", 0.95)}
					{stop("75%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<linearGradient id={id("plate")} x1="0" y1="0" x2="1" y2="0">
					{stop("0%", "var(--wv-purple)")}
					{stop("50%", "var(--wv-pink)")}
					{stop("100%", "var(--wv-purple)")}
				</linearGradient>
				<clipPath id={id("clip")}>
					<path d={HEX} />
				</clipPath>
				<filter id={id("glow")} x="-40%" y="-40%" width="180%" height="180%">
					<feGaussianBlur stdDeviation="3.2" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={id("halo")} x="-25%" y="-25%" width="150%" height="150%">
					<feGaussianBlur stdDeviation="6" />
				</filter>
			</defs>

			{/* A wide halo behind the whole frame. */}
			<path
				d={HEX}
				fill="none"
				stroke={`url(#${id("frame")})`}
				strokeWidth="12"
				opacity={active ? 1 : 0.8}
				filter={`url(#${id("halo")})`}
			/>

			{/* Inside: the nebula, beams of light crossing it, a scatter of stars. */}
			<g clipPath={`url(#${id("clip")})`}>
				<path d={HEX} fill={`url(#${id("field")})`} />
				<g strokeWidth="2" strokeLinecap="round" opacity="0.5">
					<path d="M-10 150 L120 20" stroke="var(--wv-cyan)" />
					<path d="M80 230 L210 100" stroke="var(--wv-pink)" />
					<path d="M30 230 L210 50" stroke="var(--wv-cyan-soft)" strokeOpacity="0.5" />
				</g>
				<g fill="white">
					<circle cx="46" cy="78" r="1.4" opacity="0.9" />
					<circle cx="156" cy="70" r="1.8" opacity="0.8" />
					<circle cx="142" cy="128" r="1.2" opacity="0.7" />
					<circle cx="62" cy="128" r="1.6" opacity="0.6" />
					<circle cx="128" cy="40" r="1.1" opacity="0.8" />
					<circle cx="36" cy="110" r="1" opacity="0.6" />
				</g>
			</g>

			{/* The frame as a neon tube: a coloured stroke with a white-hot core, and a thin pink bevel inside it. */}
			<path d={HEX_INNER} fill="none" stroke="var(--wv-pink)" strokeOpacity="0.55" strokeWidth="1.5" />
			<path
				d={HEX}
				fill="none"
				stroke={`url(#${id("frame")})`}
				strokeWidth={active ? 6.5 : 5}
				strokeLinejoin="round"
				filter={`url(#${id("glow")})`}
			/>
			<path
				d={HEX}
				fill="none"
				stroke="white"
				strokeOpacity="0.85"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>

			{/* Lights on the frame: a pink gem at the top, cyan bars at the sides. */}
			<path
				d="M100 0 L108 8 L100 16 L92 8 Z"
				fill="var(--wv-pink)"
				stroke="white"
				strokeWidth="1.2"
				filter={`url(#${id("glow")})`}
			/>
			<path
				d="M188 102 L188 118 M12 102 L12 118"
				stroke="var(--wv-cyan)"
				strokeWidth="6"
				strokeLinecap="round"
				filter={`url(#${id("glow")})`}
			/>

			{/* The drawing, also as neon: a glowing coloured stroke under a white core. */}
			<g transform="translate(50 40)" fill="none" strokeLinecap="round" strokeLinejoin="round">
				<g stroke={`url(#${id("icon")})`} strokeWidth="5.5" filter={`url(#${id("glow")})`}>
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

			{/* The name plate: hot pink, edged in the frame's neon, with outlined white lettering. */}
			<path
				d={PLATE}
				fill={`url(#${id("plate")})`}
				stroke={`url(#${id("frame")})`}
				strokeWidth="3"
				strokeLinejoin="round"
				filter={`url(#${id("glow")})`}
			/>
			<path d={PLATE} fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1" strokeLinejoin="round" />
			<text
				x="100"
				y="174.5"
				textAnchor="middle"
				fill="white"
				stroke="var(--wv-ink)"
				strokeWidth="3.5"
				strokeLinejoin="round"
				paintOrder="stroke"
				style={{ fontFamily: "var(--font-bungee), system-ui, sans-serif", fontSize: 18 }}
				{...fit}
			>
				{label}
			</text>
		</svg>
	);
}
