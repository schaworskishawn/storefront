"use client";

import Link from "next/link";
import {
	addDays,
	addPuffsToday,
	computeStats,
	dayLabel,
	logsBetween,
	resetPuffsToday,
	streak,
	type QuitData,
} from "./wv-quit-model";
import { cardClass, eyebrowClass, ghostBtn, primaryBtn } from "./wv-quit-ui";

const STAGE_TEXT: Record<string, string> = {
	Baseline: "Track normal use before changing strength.",
	Reduction: "Lower your nicotine strength one step, then hold.",
	Stabilize: "Hold steady. Avoid compensating with extra puffs.",
	"Final Taper": "Prepare for low-dose and zero-nicotine stages.",
};

const TIPS_BY_STAGE: Record<string, { title: string; text: string }[]> = {
	Baseline: [
		{ title: "Track honestly", text: "Log your normal use so your starting point is accurate." },
		{ title: "Notice triggers", text: "Pay attention to time, place, mood, and routine." },
		{ title: "Don't change yet", text: "Baseline is about observation first, not perfection." },
	],
	Reduction: [
		{ title: "Hold the new strength", text: "Give your body a few days to adjust before judging it." },
		{ title: "Swap the habit", text: "Replace the puff reflex with water, a walk, or a stretch." },
		{ title: "Cravings fade fast", text: "Most cravings pass within a few minutes if you wait them out." },
	],
	Stabilize: [
		{ title: "Resist compensating", text: "More puffs at a lower strength cancels out the reduction." },
		{ title: "Notice the wins", text: "Fewer cravings at this level is a real sign of progress." },
		{ title: "Prepare for the next step", text: "Read ahead so the next reduction feels familiar." },
	],
	"Final Taper": [
		{ title: "You're nearly there", text: "The last stretch is the hardest — go slower if you need to." },
		{ title: "Plan for zero", text: "Decide now what you'll do instead of a puff." },
		{ title: "Celebrate the finish", text: "Line up something to mark being nicotine-free." },
	],
};

/** A simple SVG line chart of daily puffs over the last 14 days, drawn from real check-in data. */
function PuffChart({ data, today }: { data: QuitData; today: string }) {
	const from = addDays(today, -13);
	const points = logsBetween(data, from, today);
	if (points.length < 2) {
		return (
			<div className={`${cardClass} flex h-[190px] items-center justify-center p-5`}>
				<p className="text-sm text-[var(--qp-dim)]">Log a few days to see your trend here.</p>
			</div>
		);
	}
	const max = Math.max(...points.map((p) => p.puffs), 1);
	const w = 600;
	const h = 190;
	const step = w / Math.max(1, points.length - 1);
	const coords = points.map(
		(p, i) => `${Math.round(i * step)},${Math.round(h - (p.puffs / max) * (h - 20) - 10)}`,
	);
	const line = coords.join(" ");
	const area = `${line} ${w},${h} 0,${h}`;
	return (
		<div className={`${cardClass} h-[190px] overflow-hidden p-0`}>
			<svg
				viewBox={`0 0 ${w} ${h}`}
				preserveAspectRatio="none"
				className="size-full"
				aria-label="Puff trend over the last two weeks"
			>
				<polyline points={area} fill="var(--qp-primary)" fillOpacity="0.08" stroke="none" />
				<polyline
					points={line}
					fill="none"
					stroke="var(--qp-primary)"
					strokeWidth="4"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
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
	const puffsToday = data.logs[today]?.puffs ?? 0;

	return (
		<div className="flex flex-col gap-6 md:gap-8">
			{data.sample && (
				<p className={`${cardClass} px-4 py-3 text-sm`}>
					You&apos;re viewing <strong>sample data</strong> from the design.{" "}
					<button type="button" className="font-bold text-[var(--qp-primary)] underline" onClick={onRestart}>
						Start fresh
					</button>
				</p>
			)}

			{/* Hero */}
			<section id="dashboard" className={`${cardClass} grid gap-6 p-6 md:p-8 xl:grid-cols-[1.2fr_0.8fr]`}>
				<div className="flex flex-col gap-4">
					<p className={eyebrowClass}>Your journey</p>
					<h1 className="text-[30px] font-black leading-[1.05] tracking-[-0.03em] md:text-[38px]">
						Small steps. Real progress.
					</h1>
					<p className="max-w-[560px] text-[15px] leading-[1.55] text-[var(--qp-muted)]">
						Stay focused on the current phase. Track your normal use, build consistency, then move to the next
						reduction only when you are ready.
					</p>
					<div className="flex flex-wrap gap-3">
						<button
							type="button"
							className={primaryBtn}
							onClick={() => document.getElementById("quick-log")?.scrollIntoView({ behavior: "smooth" })}
						>
							Log Today&apos;s Use
						</button>
						<a href="#plan" className={ghostBtn}>
							View Full Plan
						</a>
					</div>
				</div>
				<div
					id="plan"
					className="scroll-mt-24 rounded-xl border border-[var(--qp-border)] bg-[var(--qp-field)] p-5"
				>
					<div className="flex items-center justify-between gap-3">
						<div>
							<span className={eyebrowClass}>Current phase</span>
							<strong className="mt-1 block text-2xl">{s.complete ? "Nicotine-free" : cur?.name}</strong>
						</div>
						<span className="shrink-0 text-sm font-extrabold text-[var(--qp-primary)]">
							{s.complete ? "Complete" : `Day ${Math.min(s.inStage + 1, s.stageDays)} of ${s.stageDays}`}
						</span>
					</div>
					<div className="mt-4 h-[10px] overflow-hidden rounded-full bg-[var(--qp-border)]">
						<div
							className="h-full rounded-full bg-gradient-to-r from-[var(--qp-primary)] to-[var(--qp-secondary)]"
							style={{ width: `${s.pct}%` }}
						/>
					</div>
					<p className="mt-3 text-xs text-[var(--qp-muted)]">
						{s.complete ? "Every stage is done." : "Track your normal routine without trying to reduce yet."}
					</p>
				</div>
			</section>

			{/* Today + Quick Log */}
			<section className="grid gap-4 md:grid-cols-2">
				<div className={`${cardClass} flex flex-col gap-3 p-5 md:p-6`}>
					<p className={eyebrowClass}>Today</p>
					<p className="text-sm text-[var(--qp-muted)]">Your current use at a glance.</p>
					<div className="grid grid-cols-2 gap-3">
						{[
							{ label: "Nicotine strength", value: s.complete ? "0 mg" : `${s.strength} mg` },
							{
								label: "Puffs today",
								value: `${puffsToday}${data.baselinePuffs ? ` of ${data.baselinePuffs}` : ""}`,
							},
							{
								label: "Tracking streak",
								value: `${streak(data, today)} day${streak(data, today) === 1 ? "" : "s"}`,
							},
							{ label: "Started", value: dayLabel(p.startedAt) },
						].map((m) => (
							<div
								key={m.label}
								className="rounded-xl border border-[var(--qp-border)] bg-[var(--qp-field)] p-3"
							>
								<span className="block text-[11px] text-[var(--qp-dim)]">{m.label}</span>
								<strong className="mt-2 block text-xl">{m.value}</strong>
							</div>
						))}
					</div>
				</div>

				<div id="quick-log" className={`${cardClass} flex scroll-mt-24 flex-col gap-3 p-5 md:p-6`}>
					<p className={eyebrowClass}>Quick log</p>
					<p className="text-sm text-[var(--qp-muted)]">Add use without leaving this page.</p>
					<div className="grid grid-cols-3 gap-3">
						<button
							type="button"
							onClick={() => update((d) => addPuffsToday(d, today, 10))}
							className="hover:border-[var(--qp-primary)]/60 flex flex-col items-start gap-1 rounded-xl border border-[var(--qp-border)] bg-[var(--qp-field)] px-4 py-3 text-left"
						>
							<b>+10 Puffs</b>
							<span className="text-xs text-[var(--qp-dim)]">Quick add</span>
						</button>
						<button
							type="button"
							onClick={() => update((d) => addPuffsToday(d, today, 1))}
							className="hover:border-[var(--qp-primary)]/60 flex flex-col items-start gap-1 rounded-xl border border-[var(--qp-border)] bg-[var(--qp-field)] px-4 py-3 text-left"
						>
							<b>+1 Puff</b>
							<span className="text-xs text-[var(--qp-dim)]">Single puff</span>
						</button>
						<button
							type="button"
							onClick={() => update((d) => resetPuffsToday(d, today))}
							className="hover:border-[var(--qp-primary)]/60 flex flex-col items-start gap-1 rounded-xl border border-[var(--qp-border)] bg-[var(--qp-field)] px-4 py-3 text-left"
						>
							<b>Reset Today</b>
							<span className="text-xs text-[var(--qp-dim)]">Clear log</span>
						</button>
					</div>
				</div>
			</section>

			{/* Your Journey (roadmap) */}
			<section className="flex flex-col gap-4">
				<div>
					<p className={eyebrowClass}>Your journey</p>
					<h2 className="text-xl font-bold">Only focus on the phase you are in now.</h2>
				</div>
				<div className={`${cardClass} flex flex-col gap-2 p-4 md:p-5`}>
					{p.stages.map((st, i) => {
						const done = i < p.currentIndex;
						const isCur = i === p.currentIndex;
						const badge =
							s.complete && i === p.stages.length - 1 ? "Goal" : done ? "Done" : isCur ? "Current" : "Locked";
						return (
							<div
								key={i}
								className={`grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border p-3 ${isCur ? "border-[var(--qp-secondary)] shadow-[0_0_18px_rgba(241,121,251,0.08)]" : "border-[var(--qp-border)]"} bg-[var(--qp-field)]`}
							>
								<span
									className={`flex size-[34px] items-center justify-center rounded-full border font-bold ${isCur ? "border-[var(--qp-primary)] text-[var(--qp-primary)]" : done ? "border-[var(--qp-success)] text-[var(--qp-success)]" : "border-[var(--qp-border)] text-[var(--qp-dim)]"}`}
								>
									{i + 1}
								</span>
								<div>
									<b className="block">{st.name}</b>
									<small className="text-[var(--qp-dim)]">
										{STAGE_TEXT[st.name] ?? `Hold at ${st.strength} mg for ${st.days} days.`}
									</small>
								</div>
								<span
									className={`whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-bold ${isCur ? "border-[var(--qp-secondary)] text-[var(--qp-secondary)]" : done ? "border-[var(--qp-success)] text-[var(--qp-success)]" : "border-[var(--qp-border)] text-[var(--qp-dim)]"}`}
								>
									{badge}
								</span>
							</div>
						);
					})}
				</div>
			</section>

			{/* Progress + Tips */}
			<section className="grid gap-6 xl:grid-cols-2">
				<div className="flex flex-col gap-3">
					<p className={eyebrowClass}>Progress</p>
					<PuffChart data={data} today={today} />
				</div>
				<div className="flex flex-col gap-3">
					<p className={eyebrowClass}>Tips for this phase</p>
					<div className="grid gap-3">
						{(TIPS_BY_STAGE[cur?.name ?? "Baseline"] ?? TIPS_BY_STAGE.Baseline).map((t) => (
							<div key={t.title} className={`${cardClass} p-4`}>
								<b className="block">{t.title}</b>
								<span className="text-sm text-[var(--qp-dim)]">{t.text}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<footer className="flex flex-col gap-2 border-t border-[var(--qp-border)] pt-4 text-xs text-[var(--qp-dim)] md:flex-row md:items-center md:justify-between">
				<span>Quit Nicotine — Reduce. Stabilize. Quit.</span>
				<Link href="/learn" className="text-[var(--qp-primary)] underline">
					Read more in the Learning Library
				</Link>
			</footer>
		</div>
	);
}
