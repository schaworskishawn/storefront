"use client";

import { Lightbulb } from "lucide-react";
import Link from "next/link";
import {
	PUFF_BUMP,
	STRENGTH_STEP,
	addDays,
	addPuffsToday,
	advanceStage,
	computeStats,
	dayLabel,
	goBackStage,
	logsBetween,
	puffTargetFor,
	resetPuffsToday,
	streak,
	todayPuffTarget,
	type QuitData,
	type Stage,
} from "./wv-quit-model";
import {
	STAGE_TEXT,
	TIPS_BY_STAGE,
	puffRange,
	puffStatus,
	stageTitle,
	type PuffStatus,
} from "./wv-quit-copy";
import { cardClass, eyebrowClass, primaryBtn, stageFrame } from "./wv-quit-ui";

/** The puff meter's fill in the status colour, glowing (`.wv-quit-fill--*`). */
const TONE_BAR: Record<PuffStatus["tone"], string> = {
	ok: "wv-quit-fill--ok",
	near: "wv-quit-fill--near",
	over: "wv-quit-fill--over",
	none: "wv-quit-fill--none",
};
const TONE_TEXT: Record<PuffStatus["tone"], string> = {
	ok: "text-[var(--qp-success)]",
	near: "text-[var(--qp-warning)]",
	over: "text-[var(--qp-error)]",
	none: "text-[var(--qp-muted)]",
};

/** A log button: neon glass that lifts and glows under the pointer (`.wv-quit-log`; `--pink` for Reset). */
const logButton =
	"wv-quit-log flex min-h-[60px] flex-col items-start justify-center gap-0.5 rounded-xl px-4 py-3 text-left";

/** A progress bar: a track set into the glass, its fill glowing (cyan into pink unless a status colour is given). */
function Bar({ pct, className = "", label }: { pct: number; className?: string; label: string }) {
	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(pct)}
			className="wv-quit-track h-3 overflow-hidden rounded-full"
		>
			<div
				className={`wv-quit-fill h-full rounded-full transition-all ${className}`}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

/** A fact tile: glass inside a glowing edge, its value glowing in the tile's colour (`.wv-quit-fact`). */
function Fact({
	label,
	value,
	hint,
	pink = false,
}: {
	label: string;
	value: string;
	hint: string;
	pink?: boolean;
}) {
	return (
		<div className={`wv-quit-fact rounded-xl p-4 ${pink ? "wv-quit-fact--pink" : ""}`}>
			<span className="block text-xs text-[var(--qp-muted)]">{label}</span>
			<strong className="wv-quit-fact-value mt-1 block text-3xl font-black leading-none">{value}</strong>
			<span className="mt-2 block text-xs leading-snug text-[var(--qp-muted)]">{hint}</span>
		</div>
	);
}

/** How today's puffs compare with the target: a number, a bar, and one kind sentence. */
function PuffMeter({ used, target }: { used: number; target: number | null }) {
	const status = puffStatus(used, target);
	return (
		<div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-sm font-bold">Puffs so far today</span>
				<span className="text-sm text-[var(--qp-muted)]">
					<strong className="wv-quit-big text-2xl text-[var(--qp-text)]">{used}</strong>
					{target !== null ? ` of ${target}` : ""}
				</span>
			</div>
			<div className="mt-2">
				<Bar pct={status.pct} className={TONE_BAR[status.tone]} label="Puffs used today" />
			</div>
			<p className={`wv-quit-glow-text mt-2 text-sm font-semibold ${TONE_TEXT[status.tone]}`}>
				{status.text}
			</p>
		</div>
	);
}

/** Every step from the starting strength to 0 mg, at a glance: done, now, still to come. */
function StepChips({ stages, currentIndex }: { stages: Stage[]; currentIndex: number }) {
	return (
		<ol className="flex flex-wrap gap-2" aria-label="Every step, from your starting strength down to 0 mg">
			{stages.map((st, i) => {
				const done = i < currentIndex;
				const now = i === currentIndex;
				return (
					<li
						key={i}
						aria-current={now ? "step" : undefined}
						data-state={done ? "done" : now ? "now" : "next"}
						className="wv-quit-chip flex min-w-[58px] flex-col items-center rounded-lg px-2.5 py-1.5 text-center"
					>
						<b className="text-sm">{st.strength}</b>
						<span className="text-[10px]">{done ? "✓ done" : now ? "now" : "mg"}</span>
						<span className="sr-only">
							{`Step ${i + 1}, ${st.strength} mg, ${done ? "done" : now ? "current step" : "coming up"}`}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

/** Daily puffs for the last 14 days, with today's target as a dashed line. */
function PuffChart({ data, today, target }: { data: QuitData; today: string; target: number | null }) {
	const from = addDays(today, -13);
	const points = logsBetween(data, from, today);
	if (points.length < 2) {
		return (
			<div className={`${cardClass} flex h-[190px] items-center justify-center p-5 text-center`}>
				<p className="text-sm text-[var(--qp-dim)]">
					Log your puffs for a couple of days and your trend will show up here.
				</p>
			</div>
		);
	}
	const max = Math.max(...points.map((p) => p.puffs), target ?? 0, 1);
	const w = 600;
	const h = 190;
	const step = w / Math.max(1, points.length - 1);
	const y = (v: number) => Math.round(h - (v / max) * (h - 30) - 15);
	const line = points.map((p, i) => `${Math.round(i * step)},${y(p.puffs)}`).join(" ");
	return (
		<div className={`${cardClass} wv-quit-chart relative h-[190px] overflow-hidden p-0`}>
			<svg
				viewBox={`0 0 ${w} ${h}`}
				preserveAspectRatio="none"
				className="size-full"
				role="img"
				aria-label="Puffs per day over the last two weeks"
			>
				<defs>
					<linearGradient id="quit-chart-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" style={{ stopColor: "var(--wv-cyan)", stopOpacity: 0.3 }} />
						<stop offset="100%" style={{ stopColor: "var(--wv-pink)", stopOpacity: 0 }} />
					</linearGradient>
					<linearGradient id="quit-chart-line" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" style={{ stopColor: "var(--wv-cyan-soft)" }} />
						<stop offset="100%" style={{ stopColor: "var(--wv-pink)" }} />
					</linearGradient>
				</defs>
				<polyline points={`${line} ${w},${h} 0,${h}`} fill="url(#quit-chart-fill)" stroke="none" />
				{target !== null && (
					<line
						x1={0}
						x2={w}
						y1={y(target)}
						y2={y(target)}
						stroke="var(--qp-warning)"
						strokeWidth="2"
						strokeDasharray="8 6"
						vectorEffect="non-scaling-stroke"
					/>
				)}
				<polyline
					points={line}
					fill="none"
					stroke="url(#quit-chart-line)"
					strokeWidth="4"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<span className="pointer-events-none absolute left-3 top-2 text-[11px] text-[var(--qp-dim)]">
				{max} puffs
			</span>
			{target !== null && (
				<span className="pointer-events-none absolute right-3 top-2 text-[11px] text-[var(--qp-warning)]">
					- - today&apos;s target
				</span>
			)}
			<span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-[var(--qp-dim)]">
				{dayLabel(points[0].date)}
			</span>
			<span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-[var(--qp-dim)]">
				{dayLabel(points[points.length - 1].date)}
			</span>
		</div>
	);
}

export function Dashboard({
	data,
	today,
	update,
	onRestart,
}: {
	data: QuitData;
	today: string;
	update: (fn: (d: QuitData) => QuitData) => void;
	onRestart: () => void;
}) {
	const s = computeStats(data, today);
	const p = data.plan;
	const cur = !s.complete ? p.stages[p.currentIndex] : null;
	const nextStage = p.stages[p.currentIndex + 1];
	const prevStage = p.stages[p.currentIndex - 1];
	const puffsToday = data.logs[today]?.puffs ?? 0;
	const puffTarget = todayPuffTarget(data, today);
	const puffsLimit = puffTarget ?? (data.baselinePuffs > 0 ? data.baselinePuffs : null);
	const stepsToGo = s.n - p.currentIndex;
	const weeksLeft = Math.max(1, Math.round(s.remainingDays / 7));
	const streakDays = streak(data, today);

	// When the next step would start if this one runs its planned length, and what happens to the puff target then.
	const nextStarts = cur ? dayLabel(addDays(p.stageStartedAt, cur.days)) : "";
	const nextPuffs = nextStage ? puffTargetFor(nextStage, data.baselinePuffs, 0) : null;
	const nextLine = nextStage
		? `Next: ${nextStage.strength} mg, starting ${nextStarts}.${
				nextPuffs !== null ? ` Your puff target then goes up to ${nextPuffs} and eases back down.` : ""
			}`
		: "Next: you're done. Nicotine-free!";

	const stepPct = s.stageDays ? Math.min(100, Math.round(((s.inStage + 1) / s.stageDays) * 100)) : 0;
	const puffFact = (() => {
		if (puffsLimit === null) return { value: "—", hint: "Shown once you've logged a few days" };
		if (puffTarget === null) return { value: String(puffsLimit), hint: "your usual amount" };
		return cur?.puffs && cur.puffs.from !== cur.puffs.to
			? { value: String(puffTarget), hint: "at most today, and it comes down each day" }
			: {
					value: String(puffTarget),
					hint: cur?.puffs?.to === 0 ? "ease these off to none" : "your usual amount",
				};
	})();

	return (
		<div className="flex flex-col gap-6 md:gap-8">
			{data.sample && (
				<p className={`${cardClass} px-4 py-3 text-sm`}>
					You&apos;re viewing <strong>sample data</strong> from the design.{" "}
					<button type="button" className="wv-quit-textlink font-bold underline" onClick={onRestart}>
						Start fresh
					</button>
				</p>
			)}

			{/* Today: what to do, how it's going, how to log, and when to move on */}
			<section id="dashboard" className={`${stageFrame} flex scroll-mt-28 flex-col gap-6 p-5 md:p-8`}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className={eyebrowClass}>
						{s.complete
							? "Plan complete"
							: `Step ${p.currentIndex + 1} of ${s.n} · Day ${Math.min(s.inStage + 1, s.stageDays)} of ${s.stageDays}`}
					</p>
					<span className="text-xs text-[var(--qp-dim)]">{dayLabel(today)}</span>
				</div>

				{cur ? (
					<>
						<div>
							<h1 className="wv-title-glow wv-hero-title text-[28px] font-black leading-[1.1] tracking-[-0.02em] md:text-[38px]">
								{s.strength === 0 ? (
									<>
										<span>Go</span> <span className="text-[var(--qp-secondary)]">nicotine-free</span>{" "}
										<span>today</span>
									</>
								) : (
									<>
										<span>Use</span> <span className="text-[var(--qp-primary)]">{s.strength} mg</span>{" "}
										<span>today</span>
									</>
								)}
							</h1>
							<p className="mt-2 max-w-[600px] text-[15px] leading-[1.55] text-[var(--qp-muted)]">
								{STAGE_TEXT[cur.name] ?? `Hold at ${cur.strength} mg for ${cur.days} days.`}
							</p>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div className="grid grid-cols-2 content-start gap-3">
								<Fact
									label="Your strength"
									value={`${s.strength} mg`}
									hint={prevStage ? `down from ${prevStage.strength} mg` : "where you're starting"}
								/>
								<Fact label="Puff target" value={puffFact.value} hint={puffFact.hint} pink />
							</div>

							<div id="quick-log" className="flex scroll-mt-32 flex-col gap-4">
								<PuffMeter used={puffsToday} target={puffsLimit} />
								<div>
									<p className="mb-2 text-sm font-bold">Log your puffs</p>
									<div className="grid grid-cols-3 gap-3">
										<button
											type="button"
											className={logButton}
											onClick={() => update((d) => addPuffsToday(d, today, 1))}
										>
											<b>+1 puff</b>
											<span className="text-xs text-[var(--qp-dim)]">Each time</span>
										</button>
										<button
											type="button"
											className={logButton}
											onClick={() => update((d) => addPuffsToday(d, today, 10))}
										>
											<b>+10 puffs</b>
											<span className="text-xs text-[var(--qp-dim)]">Quick add</span>
										</button>
										<button
											type="button"
											className={logButton}
											onClick={() => update((d) => resetPuffsToday(d, today))}
											data-tone="pink"
										>
											<b>Reset</b>
											<span className="text-xs text-[var(--qp-dim)]">Clear today</span>
										</button>
									</div>
								</div>
							</div>
						</div>

						<div
							data-ready={s.ready || undefined}
							className="wv-quit-panel flex flex-col gap-3 rounded-xl p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
								<span className="font-bold">
									{s.ready
										? "You've finished this step. Ready for the next one?"
										: `${s.remainingCurrent} ${s.remainingCurrent === 1 ? "day" : "days"} left in this step`}
								</span>
								<span className="text-xs text-[var(--qp-dim)]">
									Step {p.currentIndex + 1} of {s.n}
								</span>
							</div>
							<Bar
								pct={s.ready ? 100 : stepPct}
								className={s.ready ? "wv-quit-fill--ok" : ""}
								label="Progress through this step"
							/>
							<p className="text-xs leading-snug text-[var(--qp-muted)]">{nextLine}</p>
							<div className="flex flex-wrap items-center gap-4">
								{s.ready && (
									<button
										type="button"
										className={primaryBtn}
										onClick={() => update((d) => advanceStage(d, today))}
									>
										{nextStage ? `Move to ${nextStage.strength} mg →` : "Finish the plan →"}
									</button>
								)}
								{p.currentIndex > 0 && (
									<button
										type="button"
										className="wv-quit-textlink text-xs font-bold underline"
										onClick={() => update((d) => goBackStage(d, today))}
									>
										← Back a step
									</button>
								)}
							</div>
						</div>
					</>
				) : (
					<div>
						<h1 className="wv-title-glow wv-hero-title text-[28px] font-black leading-[1.1] tracking-[-0.02em] md:text-[38px]">
							<span>You made it.</span> <span className="text-[var(--qp-secondary)]">Nicotine-free!</span>
						</h1>
						<p className="mt-2 max-w-[600px] text-[15px] leading-[1.55] text-[var(--qp-muted)]">
							Every step is done. Be proud of yourself, and keep taking it one day at a time. You can start
							over any time from the top of the page.
						</p>
					</div>
				)}
			</section>

			{/* A short explainer, tucked away once it's understood */}
			<details className={`${cardClass} group p-4 md:p-5`}>
				<summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold [&::-webkit-details-marker]:hidden">
					How does this plan work?
					<span
						aria-hidden="true"
						className="wv-quit-textlink text-[var(--qp-primary)] transition-transform group-open:rotate-180"
					>
						▾
					</span>
				</summary>
				<ol className="mt-4 grid gap-4 md:grid-cols-3">
					{[
						{
							title: "Lower your strength",
							text: `Every step drops your e-liquid by ${STRENGTH_STEP} mg, from where you started down to 0 mg.`,
						},
						{
							title: "Puff a bit more, then ease back",
							text: `A weaker liquid is less satisfying, so your puff target starts about ${Math.round(PUFF_BUMP * 100)}% higher, then comes down a little every day.`,
						},
						{
							title: "Move on when you're ready",
							text: "When a step's days are up, tap the button to lower your strength again. Taking longer is always fine.",
						},
					].map((item, i) => (
						<li key={item.title} className="grid grid-cols-[34px_1fr] items-start gap-3">
							<span className="wv-quit-stage-ring wv-quit-stage-ring--pink flex size-[30px] items-center justify-center rounded-full text-sm font-black">
								{i + 1}
							</span>
							<span>
								<b className="wv-pc-name block text-[var(--qp-text)]">{item.title}</b>
								<small className="text-[var(--qp-muted)]">{item.text}</small>
							</span>
						</li>
					))}
				</ol>
			</details>

			{/* The whole plan: a strip to scan, and the details when you want them */}
			<section id="plan" className="flex scroll-mt-28 flex-col gap-4">
				<div>
					<p className={eyebrowClass}>Your plan</p>
					<h2 className="wv-quit-heading text-xl font-bold">
						{s.complete
							? "Every step is done"
							: `${stepsToGo} ${stepsToGo === 1 ? "step" : "steps"} to go, about ${weeksLeft} ${weeksLeft === 1 ? "week" : "weeks"} left`}
					</h2>
					{!s.complete && (
						<p className="mt-1 text-sm text-[var(--qp-muted)]">
							You&apos;d finish around {dayLabel(addDays(today, s.remainingDays))} at this pace. Taking longer
							is completely fine.
						</p>
					)}
				</div>
				<div className={`${cardClass} flex flex-col gap-4 p-4 md:p-5`}>
					<Bar pct={s.pct} label="Progress through the whole plan" />
					<StepChips stages={p.stages} currentIndex={p.currentIndex} />
					<details className="group">
						<summary className="wv-quit-textlink flex cursor-pointer list-none items-center gap-2 text-sm font-bold [&::-webkit-details-marker]:hidden">
							See the details of every step
							<span aria-hidden="true" className="transition-transform group-open:rotate-180">
								▾
							</span>
						</summary>
						<div className="mt-3 flex flex-col gap-2">
							{p.stages.map((st, i) => {
								const done = i < p.currentIndex;
								const isCur = i === p.currentIndex;
								const badge =
									s.complete && i === p.stages.length - 1
										? "Goal"
										: done
											? "Done"
											: isCur
												? "Now"
												: "Coming up";
								return (
									<div
										key={i}
										data-state={done ? "done" : isCur ? "now" : "next"}
										className="wv-quit-row grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl p-3"
									>
										<span className="wv-quit-row-num flex size-[34px] items-center justify-center rounded-full font-bold">
											{i + 1}
										</span>
										<div>
											<b className="wv-pc-name block">{stageTitle(st)}</b>
											<small className="block text-[var(--qp-dim)]">
												{STAGE_TEXT[st.name] ?? `Hold at ${st.strength} mg for ${st.days} days.`}
											</small>
											<small className="mt-0.5 block text-[var(--qp-muted)]">
												{st.strength} mg · {st.days} days
												{puffRange(st, data.baselinePuffs)}
											</small>
										</div>
										<span className="wv-quit-pill whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold">
											{badge}
										</span>
									</div>
								);
							})}
						</div>
					</details>
				</div>
			</section>

			{/* Progress + tips */}
			<section className="grid gap-6 xl:grid-cols-2">
				<div id="progress" className="flex scroll-mt-28 flex-col gap-3">
					<div>
						<p className={eyebrowClass}>Your progress</p>
						<h2 className="wv-quit-heading text-lg font-bold">Puffs per day, last two weeks</h2>
					</div>
					<PuffChart data={data} today={today} target={puffsLimit} />
					<div className="grid grid-cols-3 gap-3">
						{[
							{ label: "Logging streak", value: `${streakDays} ${streakDays === 1 ? "day" : "days"}` },
							{ label: "Started", value: dayLabel(p.startedAt) },
							{ label: "Days to go", value: s.complete ? "0" : String(s.remainingDays) },
						].map((m) => (
							<div key={m.label} className="wv-quit-fact rounded-xl p-3">
								<span className="block text-[11px] text-[var(--qp-muted)]">{m.label}</span>
								<strong className="wv-quit-fact-value mt-1 block text-base">{m.value}</strong>
							</div>
						))}
					</div>
				</div>
				<div id="tips" className="flex scroll-mt-28 flex-col gap-3">
					<div>
						<p className={eyebrowClass}>Tips</p>
						<h2 className="wv-quit-heading text-lg font-bold">For this step</h2>
					</div>
					<div className="grid gap-3">
						{(TIPS_BY_STAGE[cur?.name ?? "Baseline"] ?? TIPS_BY_STAGE.Baseline).map((t) => (
							<div key={t.title} className={`${cardClass} grid grid-cols-[40px_1fr] items-start gap-3 p-4`}>
								<span
									aria-hidden
									className="wv-quit-mark flex size-9 items-center justify-center rounded-[11px]"
								>
									<Lightbulb className="size-[18px]" strokeWidth={2.25} />
								</span>
								<span>
									<b className="wv-pc-name block">{t.title}</b>
									<span className="text-sm text-[var(--qp-muted)]">{t.text}</span>
								</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<div aria-hidden className="wv-glow-line !h-[2px] w-full" />
			<footer className="-mt-2 flex flex-col gap-2 text-xs text-[var(--qp-dim)] md:-mt-4 md:flex-row md:items-center md:justify-between">
				<span>Quit Nicotine: Reduce. Stabilize. Quit.</span>
				<Link href="/learn" className="wv-quit-textlink underline">
					Read more in the Learning Library
				</Link>
			</footer>
		</div>
	);
}
