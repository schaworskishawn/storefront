"use client";

import { useMemo, useState } from "react";
import {
	PACES,
	addDays,
	dayLabel,
	defaultData,
	generateStages,
	type Pace,
	type QuitData,
	type Stage,
} from "./wv-quit-model";
import { fieldClass, ghostBtn, primaryBtn, stageFrame } from "./wv-quit-ui";

const TOTAL_STEPS = 6;
const STRENGTHS = [3, 6, 12, 18, 20, 24, 35, 50];
const PRODUCTS = [
	{ id: "Vape", icon: "▯", label: "Vape", sub: "E-liquids / pods" },
	{ id: "Cigarettes", icon: "／", label: "Cigarettes", sub: "Traditional tobacco" },
	{ id: "Pouches", icon: "◫", label: "Nicotine pouches", sub: "ZYN, On!, etc." },
	{ id: "Other", icon: "▥", label: "Other", sub: "Lozenges, snus, etc." },
];
const PUFF_PRESETS = [
	{ label: "< 20", value: 15 },
	{ label: "20–50", value: 50 },
	{ label: "50–100", value: 80 },
	{ label: "100+", value: 120 },
];
const PACE_ICON: Record<Pace["id"], string> = { gentle: "↗", steady: "⚡", faster: "◎" };
const FLOW_ICON = ["▥", "↓", "⚙", "▥", "⚑"];

function StepDots({ step, total }: { step: number; total: number }) {
	return (
		<div className="flex items-center gap-[10px]" aria-hidden>
			{Array.from({ length: total }, (_, i) => i + 1).map((n) => (
				<span
					key={n}
					className={`relative size-[13px] rounded-full border ${
						n <= step
							? "border-[var(--qp-primary)] bg-[var(--qp-primary)] shadow-[0_0_14px_rgba(105,235,255,0.85)]"
							: "border-[var(--qp-border)] bg-[var(--qp-field)]"
					} ${n !== total ? "after:absolute after:left-[12px] after:top-1/2 after:h-px after:w-[12px] after:-translate-y-1/2 after:bg-[var(--qp-border)]" : ""}`}
				/>
			))}
		</div>
	);
}

function StepHead({ step, label }: { step: number; label: string }) {
	return (
		<div className="mb-6 flex flex-wrap items-center gap-4">
			<span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--qp-primary)] text-xl font-black text-[var(--qp-primary)] shadow-[0_0_18px_rgba(105,235,255,0.22)]">
				{step}
			</span>
			<span className="flex-1 font-bold text-[var(--qp-muted)]">
				Step {step} of {TOTAL_STEPS} · {label}
			</span>
			<StepDots step={step} total={TOTAL_STEPS} />
		</div>
	);
}

function Radio({ on }: { on: boolean }) {
	return (
		<span
			aria-hidden
			className={`absolute right-3 top-3 size-5 rounded-full border ${on ? "border-[var(--qp-primary)] bg-[var(--qp-primary)] shadow-[inset_0_0_0_5px_var(--qp-surface)]" : "border-[var(--qp-dim)]"}`}
		/>
	);
}

const choiceCard = (on: boolean) =>
	`relative flex flex-col gap-3 rounded-xl border p-5 text-left transition-colors ${on ? "border-2 border-[var(--qp-primary)] bg-[var(--qp-field)] shadow-[0_0_20px_rgba(105,235,255,0.18)]" : "border-[var(--qp-border)] bg-[var(--qp-surface)] hover:border-[var(--qp-primary)]/60"}`;

/**
 * First-run setup wizard: 6 steps mirroring the reference design exactly — welcome, product,
 * strength, daily baseline, pace, and a generated plan summary. Nothing leaves this browser.
 */
export function Onboarding({
	today,
	onDone,
	onSample,
}: {
	today: string;
	onDone: (d: QuitData) => void;
	onSample: () => void;
}) {
	const [step, setStep] = useState(1);
	const [product, setProduct] = useState("Vape");
	const [strength, setStrength] = useState(20);
	const [custom, setCustom] = useState("");
	const [puffs, setPuffs] = useState(50);
	const [pace, setPace] = useState<Pace["id"]>("steady");

	const days = PACES.find((p) => p.id === pace)?.days ?? 7;
	const stages = useMemo(() => generateStages(strength, days), [strength, days]);
	const totalDays = stages.reduce((a, s) => a + s.days, 0);
	const finish = addDays(today, totalDays);

	const start = () => {
		const base = defaultData(today);
		onDone({
			...base,
			setup: true,
			product,
			baselinePuffs: puffs,
			plan: { ...base.plan, stages },
			logs: { [today]: { date: today, strength, puffs } },
		});
	};

	const back = () => setStep((s) => Math.max(1, s - 1));
	const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

	if (step === 1) {
		return (
			<div className="flex flex-col gap-6">
				<section className={`${stageFrame} grid gap-8 p-6 md:p-9 xl:grid-cols-[1.1fr_0.9fr] xl:items-center`}>
					<div className="flex flex-col gap-5">
						<p className="text-lg font-extrabold text-[var(--qp-primary)]">Welcome</p>
						<h1 className="text-[38px] font-black leading-[0.98] tracking-[-0.045em] md:text-[54px]">
							Build Your <span className="text-[var(--qp-secondary)]">Quit Plan</span>
						</h1>
						<p className="max-w-[560px] text-lg leading-[1.55] text-[var(--qp-muted)]">
							A personalized, step-by-step plan to help you reduce nicotine and take back control.
						</p>
						<ul className="flex flex-col gap-4">
							{[
								{ icon: "✦", title: "Science-backed approach", text: "Small steps. Real progress." },
								{ icon: "▥", title: "Personalized to you", text: "Based on your habits and goals." },
								{ icon: "♡", title: "A healthier, brighter future", text: "You've got this." },
							].map((b) => (
								<li key={b.title} className="grid grid-cols-[34px_1fr] items-start gap-3">
									<span className="flex size-[30px] items-center justify-center rounded-[10px] border-2 border-[var(--qp-secondary)] text-sm font-black text-[var(--qp-secondary)]">
										{b.icon}
									</span>
									<span>
										<b className="block text-[var(--qp-text)]">{b.title}</b>
										<small className="text-[var(--qp-dim)]">{b.text}</small>
									</span>
								</li>
							))}
						</ul>
						<div className="flex flex-wrap gap-3">
							<button type="button" className={primaryBtn} onClick={next}>
								Begin Setup →
							</button>
							<button type="button" className={ghostBtn} onClick={onSample}>
								Look around with sample data
							</button>
						</div>
					</div>
					<div className="relative hidden min-h-[320px] overflow-hidden rounded-2xl border border-[var(--qp-border)] bg-gradient-to-b from-[var(--qp-field)] via-[var(--qp-surface)] to-[var(--qp-bg)] xl:block">
						<div
							aria-hidden
							className="bg-[var(--qp-secondary)]/40 absolute left-1/2 top-[22%] size-40 -translate-x-1/2 rounded-full blur-3xl"
						/>
						<div
							aria-hidden
							className="bg-[var(--qp-border-strong)]/50 absolute left-[58%] top-[35%] size-28 -translate-x-1/2 rounded-full blur-2xl"
						/>
						<p className="absolute right-7 top-28 text-right text-sm font-extrabold leading-[1.5] tracking-[0.12em] text-[var(--qp-secondary)]">
							CLEANER
							<br />
							BRIGHTER
							<br />
							YOU
						</p>
					</div>
				</section>
				<p className="text-xs text-[var(--qp-dim)]">
					Everything you enter stays in this browser. Nothing is uploaded. This is a general guide, not
					medical advice.
				</p>
			</div>
		);
	}

	if (step === 2) {
		return (
			<div className="flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					<StepHead step={2} label="What do you use?" />
					<h2 className="mb-1 text-[26px] font-black">What do you use?</h2>
					<p className="mb-5 text-[var(--qp-muted)]">Select the one you use most.</p>
					<div role="radiogroup" aria-label="Product" className="grid gap-4 md:grid-cols-2">
						{PRODUCTS.map((p) => {
							const on = product === p.id;
							return (
								<button
									key={p.id}
									type="button"
									role="radio"
									aria-checked={on}
									onClick={() => setProduct(p.id)}
									className={choiceCard(on)}
								>
									<Radio on={on} />
									<span className="flex size-11 items-center justify-center rounded-[11px] border border-[var(--qp-border)] text-lg font-black text-[var(--qp-primary)]">
										{p.icon}
									</span>
									<span>
										<b className="block text-base text-[var(--qp-text)]">{p.label}</b>
										<small className="text-[var(--qp-dim)]">{p.sub}</small>
									</span>
								</button>
							);
						})}
					</div>
					<div className="mt-8 flex justify-between gap-3">
						<button type="button" className={ghostBtn} onClick={back}>
							← Back
						</button>
						<button type="button" className={primaryBtn} onClick={next}>
							Continue →
						</button>
					</div>
				</section>
			</div>
		);
	}

	if (step === 3) {
		return (
			<div className="flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					<StepHead step={3} label="Current nicotine strength" />
					<h2 className="mb-1 text-[26px] font-black">What nicotine strength do you use now?</h2>
					<p className="mb-5 text-[var(--qp-muted)]">
						Not sure? Check the bottle or device label — it&apos;s printed as mg/mL, or as a percent (2% = 20
						mg).
					</p>
					<div
						role="radiogroup"
						aria-label="Nicotine strength in mg/mL"
						className="grid grid-cols-2 gap-4 md:grid-cols-4"
					>
						{STRENGTHS.map((v) => {
							const on = strength === v && !custom;
							return (
								<button
									key={v}
									type="button"
									role="radio"
									aria-checked={on}
									onClick={() => {
										setStrength(v);
										setCustom("");
									}}
									className={`relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-xl border p-5 text-center transition-colors ${on ? "border-2 border-[var(--qp-primary)] bg-[var(--qp-field)] shadow-[0_0_20px_rgba(105,235,255,0.18)]" : "hover:border-[var(--qp-primary)]/60 border-[var(--qp-border)] bg-[var(--qp-surface)]"}`}
								>
									<Radio on={on} />
									<span className="flex size-11 items-center justify-center rounded-[11px] border border-[var(--qp-border)] text-lg font-black text-[var(--qp-primary)]">
										▥
									</span>
									<b className="text-base text-[var(--qp-text)]">{v} mg</b>
								</button>
							);
						})}
					</div>
					<label className="mt-5 flex max-w-[240px] flex-col gap-1 text-xs text-[var(--qp-dim)]">
						Something else?
						<input
							type="number"
							min={1}
							max={100}
							placeholder="mg/mL"
							value={custom}
							onChange={(e) => {
								setCustom(e.target.value);
								const n = Number(e.target.value);
								if (n >= 1 && n <= 100) setStrength(Math.round(n));
							}}
							className={fieldClass}
						/>
					</label>
					<div className="mt-8 flex justify-between gap-3">
						<button type="button" className={ghostBtn} onClick={back}>
							← Back
						</button>
						<button type="button" className={primaryBtn} onClick={next}>
							Continue →
						</button>
					</div>
				</section>
			</div>
		);
	}

	if (step === 4) {
		return (
			<div className="flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					<StepHead step={4} label="Daily use / baseline" />
					<h2 className="mb-1 text-[26px] font-black">About how much do you use in a typical day?</h2>
					<p className="mb-6 text-[var(--qp-muted)]">
						This helps us set the right pace for you. You can always adjust this later.
					</p>
					<div className="mx-auto flex max-w-[420px] items-center gap-4 rounded-2xl border border-[var(--qp-border)] bg-[var(--qp-surface)] p-4">
						<button
							type="button"
							aria-label="Decrease"
							onClick={() => setPuffs((v) => Math.max(0, v - 5))}
							className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-[var(--qp-border)] bg-[var(--qp-field)] text-2xl font-black text-white"
						>
							−
						</button>
						<div className="flex-1 text-center">
							<strong className="block text-3xl font-black">{puffs}</strong>
							<span className="text-sm text-[var(--qp-muted)]">puffs per day</span>
						</div>
						<button
							type="button"
							aria-label="Increase"
							onClick={() => setPuffs((v) => v + 5)}
							className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-[var(--qp-border)] bg-[var(--qp-field)] text-2xl font-black text-white"
						>
							+
						</button>
					</div>
					<div className="mx-auto mt-4 grid max-w-[420px] grid-cols-2 gap-3 md:grid-cols-4">
						{PUFF_PRESETS.map((p) => (
							<button
								key={p.label}
								type="button"
								aria-pressed={puffs === p.value}
								onClick={() => setPuffs(p.value)}
								className={`rounded-lg border px-3 py-2 text-sm font-bold ${puffs === p.value ? "border-[var(--qp-primary)] bg-[var(--qp-primary)] text-[var(--qp-ink)]" : "border-[var(--qp-border)] bg-[var(--qp-surface)] text-[var(--qp-muted)]"}`}
							>
								{p.label}
							</button>
						))}
					</div>
					<div className="mt-8 flex justify-between gap-3">
						<button type="button" className={ghostBtn} onClick={back}>
							← Back
						</button>
						<button type="button" className={primaryBtn} onClick={next}>
							Continue →
						</button>
					</div>
				</section>
			</div>
		);
	}

	if (step === 5) {
		return (
			<div className="flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					<StepHead step={5} label="Your goal and pace" />
					<h2 className="mb-1 text-[26px] font-black">How would you like to quit?</h2>
					<p className="mb-5 text-[var(--qp-muted)]">
						You can adjust your pace anytime — this is your journey.
					</p>
					<div role="radiogroup" aria-label="Pace" className="grid gap-4 md:grid-cols-3">
						{PACES.map((p) => {
							const on = pace === p.id;
							return (
								<button
									key={p.id}
									type="button"
									role="radio"
									aria-checked={on}
									onClick={() => setPace(p.id)}
									className={`${choiceCard(on)} min-h-[176px]`}
								>
									<Radio on={on} />
									<span className="text-2xl font-black text-[var(--qp-primary)]">{PACE_ICON[p.id]}</span>
									<span>
										<b className="block text-base text-[var(--qp-text)]">{p.label}</b>
										<small className="text-[var(--qp-dim)]">
											{p.days} days per step
											<br />
											{p.blurb}
										</small>
									</span>
									{p.id === "steady" && (
										<span className="mt-auto text-xs font-extrabold text-[var(--qp-primary)]">
											Most popular
										</span>
									)}
								</button>
							);
						})}
					</div>
					<div className="mt-8 flex justify-between gap-3">
						<button type="button" className={ghostBtn} onClick={back}>
							← Back
						</button>
						<button type="button" className={primaryBtn} onClick={next}>
							Continue →
						</button>
					</div>
				</section>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<section className={`${stageFrame} p-6 md:p-9`}>
				<StepHead step={6} label="Your starting plan" />
				<h2 className="mb-1 text-[26px] font-black">Your starting plan</h2>
				<p className="mb-6 text-[var(--qp-muted)]">Here&apos;s your personalized quit plan.</p>

				<ol className="mb-8 grid gap-3 md:grid-cols-5">
					{stages.slice(0, 5).map((s: Stage, i) => (
						<li key={i} className="flex items-center gap-3 md:flex-col md:items-center md:text-center">
							<span
								className={`flex size-[52px] shrink-0 items-center justify-center rounded-full border-2 text-lg font-black ${i === 0 ? "border-[var(--qp-primary)] text-[var(--qp-primary)] shadow-[0_0_18px_rgba(105,235,255,0.18)]" : "border-[var(--qp-secondary)] text-[var(--qp-secondary)]"}`}
							>
								{FLOW_ICON[i] ?? "▥"}
							</span>
							<span className="md:mt-1">
								<b className="block text-sm text-[var(--qp-text)]">
									{i + 1}. {s.name}
								</b>
								<small className="text-[var(--qp-dim)]">
									{s.strength} mg · {s.days} days
								</small>
							</span>
						</li>
					))}
				</ol>

				<div className="grid gap-px overflow-hidden rounded-xl border border-[var(--qp-border)] bg-[var(--qp-border)] md:grid-cols-3">
					<div className="bg-[var(--qp-field)] p-4 text-center">
						<b className="block text-[var(--qp-text)]">Goal</b>
						<small className="text-[var(--qp-muted)]">Be nicotine free</small>
					</div>
					<div className="bg-[var(--qp-field)] p-4 text-center">
						<b className="block text-[var(--qp-text)]">Estimated timeline</b>
						<small className="text-[var(--qp-muted)]">
							about {Math.round(totalDays / 7)} weeks · around {dayLabel(finish)}
						</small>
					</div>
					<div className="bg-[var(--qp-field)] p-4 text-center">
						<b className="block text-[var(--qp-text)]">Starting point</b>
						<small className="text-[var(--qp-muted)]">
							{strength} mg · {puffs} puffs/day
						</small>
					</div>
				</div>
				<p className="mt-5 text-xs text-[var(--qp-dim)]">
					You can edit any stage later, and pause or slow down whenever you need to.
				</p>

				<div className="mt-8 flex justify-between gap-3">
					<button type="button" className={ghostBtn} onClick={back}>
						← Back
					</button>
					<button type="button" className={primaryBtn} onClick={start}>
						Create My Plan →
					</button>
				</div>
			</section>
		</div>
	);
}
