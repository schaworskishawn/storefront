/**
 * The quit program's welcome art (the panel beside "Build Your Quit Plan", desktop only): the plan as a neon staircase.
 * Five bars of dark glass edged in neon, cyan into pink, step down from 20 mg to 0 mg; a dotted path runs down their
 * tops to a glowing heart, the goal; a heartbeat line runs along the floor and beats under the heart; and "CLEANER,
 * BRIGHTER, YOU" glows in the corner. Drawn in the site's neon style (a tight glow and a wide bloom over a dark nebula,
 * a faint grid and a vignette), so it sits with the site's other art. An illustration, not anyone's actual plan.
 */

const W = 460;
const H = 320;
const FLOOR = 250;
const BARS = [
	{ label: "20 mg", height: 150 },
	{ label: "12 mg", height: 112 },
	{ label: "6 mg", height: 78 },
	{ label: "3 mg", height: 46 },
	{ label: "0 mg", height: 16 },
] as const;
const BAR_W = 44;
const BAR_X = (i: number) => 40 + i * 60;
/** The heart at the foot of the stairs, the goal. */
const HEART = { x: 392, y: 214 } as const;
const HEART_PATH =
	"M0 10 C-14 0 -22 -8 -22 -17 C-22 -25 -16 -30 -9 -30 C-4 -30 -1 -27 0 -23 C1 -27 4 -30 9 -30 C16 -30 22 -25 22 -17 C22 -8 14 0 0 10 Z";
const SPARK = "M0 -12 C1 -4 4 -1 12 0 C4 1 1 4 0 12 C-1 4 -4 1 -12 0 C-4 -1 -1 -4 0 -12 Z";

const stop = (offset: string, color: string, opacity = 1) => (
	<stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
);

export function QuitWelcomeArt({ idPrefix }: { idPrefix: string }) {
	const id = (part: string) => `${idPrefix}-${part}`;
	const url = (part: string) => `url(#${id(part)})`;
	const tops = BARS.map((b, i) => ({ x: BAR_X(i) + BAR_W / 2, y: FLOOR - b.height }));
	// The path down the stairs: from just above each bar's top to the next, then on to the heart.
	const path = [
		`M${tops[0]?.x ?? 0} ${(tops[0]?.y ?? 0) - 16}`,
		...tops.slice(1).map((t) => `L${t.x} ${t.y - 16}`),
		`Q${HEART.x - 30} ${HEART.y - 50} ${HEART.x - 6} ${HEART.y - 36}`,
	].join(" ");
	// The heartbeat along the floor, beating under the heart.
	const beat = `M0 286 L${HEART.x - 40} 286 L${HEART.x - 30} 270 L${HEART.x - 20} 300 L${HEART.x - 10} 262 L${HEART.x} 292 L${HEART.x + 8} 286 L${W} 286`;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="xMidYMid slice"
			className="absolute inset-0 isolate size-full"
			role="img"
			aria-label="Nicotine strength stepping down from 20 mg to 0 mg, toward a glowing heart: a cleaner, brighter you"
		>
			<defs>
				<radialGradient id={id("sky")} cx="55%" cy="30%" r="80%">
					{stop("0%", "var(--wv-pink)", 0.28)}
					{stop("35%", "var(--wv-purple)", 0.42)}
					{stop("70%", "var(--wv-deep)")}
					{stop("100%", "var(--wv-bg)")}
				</radialGradient>
				<radialGradient id={id("cyan-drift")}>
					{stop("0%", "var(--wv-cyan)", 0.2)}
					{stop("100%", "var(--wv-cyan)", 0)}
				</radialGradient>
				<pattern id={id("grid")} width="24" height="24" patternUnits="userSpaceOnUse">
					<path
						d="M24 0 L0 0 L0 24"
						fill="none"
						stroke="var(--wv-cyan)"
						strokeOpacity="0.08"
						strokeWidth="1"
					/>
				</pattern>
				<linearGradient id={id("bar-edge")} gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="0" y2={FLOOR}>
					{stop("0%", "var(--wv-cyan)")}
					{stop("100%", "var(--wv-pink)")}
				</linearGradient>
				<linearGradient id={id("bar-glass")} gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="0" y2={FLOOR}>
					{stop("0%", "var(--wv-purple)", 0.55)}
					{stop("100%", "var(--wv-deep)", 0.9)}
				</linearGradient>
				<radialGradient id={id("pool")}>
					{stop("0%", "var(--wv-pink)", 0.6)}
					{stop("100%", "var(--wv-pink)", 0)}
				</radialGradient>
				<radialGradient id={id("vignette")} r="75%">
					{stop("60%", "var(--wv-bg)", 0)}
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
				<filter id={id("soft-glow")} x="-30%" y="-60%" width="160%" height="220%">
					<feGaussianBlur stdDeviation="3" />
				</filter>
				<filter id={id("halo")} x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="14" />
				</filter>
				{/* The floor's lines: a glow in the drawing's own units, so a box around a thin line doesn't crop it flat. */}
				<filter id={id("line-glow")} filterUnits="userSpaceOnUse" x="-20" y="240" width={W + 40} height="80">
					<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="tight" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="wide" />
					<feMerge>
						<feMergeNode in="wide" />
						<feMergeNode in="tight" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>

			<rect width={W} height={H} fill={url("sky")} />
			<ellipse cx="60" cy="280" rx="170" ry="90" fill={url("cyan-drift")} />
			<rect width={W} height={H} fill={url("grid")} />

			{/* The floor, and the heartbeat along it. */}
			<g filter={url("line-glow")} fill="none" strokeLinecap="round" strokeLinejoin="round">
				<path
					d={`M0 ${FLOOR} L${W} ${FLOOR}`}
					stroke="var(--wv-pink)"
					strokeOpacity="0.7"
					strokeWidth="1.4"
				/>
				<path d={beat} stroke="var(--wv-cyan)" strokeWidth="2" />
			</g>

			{/* The stairs: each strength a bar of dark glass edged in neon, its label beneath. */}
			<g>
				{BARS.map((b, i) => {
					const x = BAR_X(i);
					const y = FLOOR - b.height;
					const d = `M${x} ${FLOOR} L${x} ${y + 8} Q${x} ${y} ${x + 8} ${y} L${x + BAR_W - 8} ${y} Q${x + BAR_W} ${y} ${x + BAR_W} ${y + 8} L${x + BAR_W} ${FLOOR}`;
					return (
						<g key={b.label}>
							<path d={`${d} Z`} fill={url("bar-glass")} />
							<path
								d={d}
								fill="none"
								stroke={url("bar-edge")}
								strokeWidth="2.4"
								strokeLinejoin="round"
								filter={url("neon-glow")}
							/>
							<path d={d} fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="0.8" />
							{/* A soft glow beneath, then the label crisp on top (a glow filter on small text blurs it). */}
							{[url("soft-glow"), undefined].map((filter) => (
								<text
									key={filter ?? "crisp"}
									x={x + BAR_W / 2}
									y={FLOOR + 17}
									textAnchor="middle"
									fontSize="11"
									fontWeight="800"
									fill="var(--wv-cyan-soft)"
									filter={filter}
									opacity={filter ? 0.8 : 1}
									style={{ fontFamily: "var(--font-inter)" }}
								>
									{b.label}
								</text>
							))}
						</g>
					);
				})}
			</g>

			{/* The way down: a dotted path over the tops to the heart. */}
			<path
				d={path}
				fill="none"
				stroke="var(--wv-pink)"
				strokeWidth="2.4"
				strokeLinecap="round"
				strokeDasharray="0.1 7"
				filter={url("glow")}
			/>

			{/* The goal: a heart glowing pink, light pooling under it. */}
			<ellipse cx={HEART.x} cy={FLOOR} rx="56" ry="9" fill={url("pool")} style={{ mixBlendMode: "screen" }} />
			<g transform={`translate(${HEART.x} ${HEART.y})`}>
				<path d={HEART_PATH} fill="var(--wv-pink)" opacity="0.5" filter={url("halo")} />
				<path d={HEART_PATH} fill="var(--wv-deep)" fillOpacity="0.85" />
				<path
					d={HEART_PATH}
					fill="none"
					stroke="var(--wv-pink)"
					strokeWidth="2.6"
					strokeLinejoin="round"
					filter={url("neon-glow")}
				/>
				<path d={HEART_PATH} fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="0.9" />
			</g>

			{/* The promise, glowing in the corner: a soft glow beneath, then the words crisp on top. */}
			{[url("soft-glow"), undefined].map((filter) => (
				<g
					key={filter ?? "crisp"}
					fill="var(--wv-pink)"
					fontSize="15"
					fontWeight="900"
					letterSpacing="2.5"
					textAnchor="end"
					filter={filter}
					opacity={filter ? 0.9 : 1}
					style={{ fontFamily: "var(--font-inter)" }}
				>
					<text x="430" y="62">
						CLEANER
					</text>
					<text x="430" y="84">
						BRIGHTER
					</text>
					<text x="430" y="106" fill="var(--wv-cyan-soft)">
						YOU
					</text>
				</g>
			))}

			<g fill="white" filter={url("neon-glow")}>
				<path d={SPARK} transform="translate(250 60) scale(0.45)" />
				<path d={SPARK} transform="translate(430 160) scale(0.38)" />
				<path d={SPARK} transform="translate(150 96) scale(0.32)" />
			</g>

			<rect width={W} height={H} fill={url("vignette")} />
		</svg>
	);
}
