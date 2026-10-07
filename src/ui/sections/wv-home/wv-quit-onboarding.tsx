"use client";

import { useMemo, useState } from "react";
import {
	PACES,
	addDays,
	dayLabel,
	MAX_STRENGTH,
	PUFF_BUMP,
	STRENGTHS,
	STRENGTH_STEP,
	generateStages,
	startingData,
	type Pace,
	type QuitData,
	type Stage,
} from "./wv-quit-model";
import { DEFAULT_SWITCH_STRENGTH, SWITCH_BANDS } from "./wv-quit-switch";
import { fieldClass, ghostBtn, primaryBtn, stageFrame } from "./wv-quit-ui";

const PRODUCTS = [
	{ id: "Vape", icon: "▯", label: "Vape", sub: "E-liquids / pods" },
	{ id: "Cigarettes", icon: "／", label: "Cigarettes", sub: "Switching to vape" },
];
/** Most puffs per day the setup accepts (three digits). */
const MAX_PUFFS = 999;
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

function StepHead({ step, total, label }: { step: number; total: number; label: string }) {
	return (
		<div className="mb-6 flex flex-wrap items-center gap-4">
			<span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--qp-primary)] text-xl font-black text-[var(--qp-primary)] shadow-[0_0_18px_rgba(105,235,255,0.22)]">
				{step}
			</span>
			<span className="flex-1 font-bold text-[var(--qp-muted)]">
				Step {step} of {total} · {label}
			</span>
			<StepDots step={step} total={total} />
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
export function Onboarding({ today, onDone }: { today: string; onDone: (d: QuitData) => void }) {
	const [step, setStep] = useState(1);
	const [product, setProduct] = useState("Vape");
	const [strength, setStrength] = useState(20);
	const [custom, setCustom] = useState("");
	const [puffs, setPuffs] = useState(50);
	// What is typed in the puffs box while it is being edited (so it can be emptied and retyped); null shows `puffs`.
	const [puffsDraft, setPuffsDraft] = useState<string | null>(null);
	// The −/+ and preset buttons set the number outright, so they also drop whatever was half-typed in the box.
	const adjustPuffs = (fn: (v: number) => number) => {
		setPuffs((v) => Math.min(MAX_PUFFS, Math.max(0, fn(v))));
		setPuffsDraft(null);
	};
	// Cigarette smokers are switching to vape: they say how much they smoke (not a strength they don't have yet), skip
	// the puffs-per-day question, and start from a suggested strength.
	const switching = product === "Cigarettes";
	const [pace, setPace] = useState<Pace["id"]>("steady");

	const days = PACES.find((p) => p.id === pace)?.days ?? 7;
	const stages = useMemo(() => generateStages(strength, days), [strength, days]);
	const totalDays = stages.reduce((a, s) => a + s.days, 0);
	const finish = addDays(today, totalDays);

	const flow = switching ? [1, 2, 3, 5, 6] : [1, 2, 3, 4, 5, 6];
	const position = Math.max(0, flow.indexOf(step)) + 1;
	const head = (label: string) => <StepHead step={position} total={flow.length} label={label} />;

	// Each way in starts from its own answers, so a strength picked for one never carries over to the other.
	const chooseProduct = (id: string) => {
		setProduct(id);
		setStrength(id === "Cigarettes" ? DEFAULT_SWITCH_STRENGTH : 20);
		setCustom("");
	};

	const start = () => {
		// Someone switching from cigarettes has no puff baseline yet; it is learned from what they log in the first step.
		onDone(startingData(today, { product, baselinePuffs: switching ? 0 : puffs, stages }));
	};

	const back = () => setStep((s) => flow[Math.max(0, flow.indexOf(s) - 1)]);
	const next = () => setStep((s) => flow[Math.min(flow.length - 1, flow.indexOf(s) + 1)]);

	// Step 3's choices: what a vaper uses now, or how much a smoker smokes (each with the strength it suggests).
	const strengthChoices: { value: number; label: string; sub?: string }[] = switching
		? SWITCH_BANDS.map((b) => ({ value: b.strength, label: b.label, sub: `Start at ${b.strength} mg` }))
		: STRENGTHS.map((v) => ({ value: v, label: `${v} mg` }));

	if (step === 1) {
		return (
			<div key="step-1" className="wv-fade flex flex-col gap-6">
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
			<div key="step-2" className="wv-fade flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					{head("What do you use?")}
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
									onClick={() => chooseProduct(p.id)}
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
			<div key="step-3" className="wv-fade flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					{head(switching ? "Your smoking" : "Current nicotine strength")}
					<h2 className="mb-1 text-[26px] font-black">
						{switching
							? "How many cigarettes do you smoke on a typical day?"
							: "What nicotine strength do you use now?"}
					</h2>
					<p className="mb-5 text-[var(--qp-muted)]">
						{switching
							? `We'll suggest a vape nicotine strength to switch to, then step it down from there. A pack is about 20 cigarettes. Our strongest e-liquid is ${MAX_STRENGTH} mg/mL, so heavier smokers start there.`
							: "Not sure? Check the bottle or device label — it's printed as mg/mL, or as a percent (2% = 20 mg)."}
					</p>
					<div
						role="radiogroup"
						aria-label={switching ? "Cigarettes per day" : "Nicotine strength in mg/mL"}
						className="grid grid-cols-2 gap-4 md:grid-cols-4"
					>
						{strengthChoices.map((o) => {
							const on = strength === o.value && !custom;
							return (
								<button
									key={o.value}
									type="button"
									role="radio"
									aria-checked={on}
									onClick={() => {
										setStrength(o.value);
										setCustom("");
									}}
									className={`relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-xl border p-5 text-center transition-colors ${on ? "border-2 border-[var(--qp-primary)] bg-[var(--qp-field)] shadow-[0_0_20px_rgba(105,235,255,0.18)]" : "hover:border-[var(--qp-primary)]/60 border-[var(--qp-border)] bg-[var(--qp-surface)]"}`}
								>
									<Radio on={on} />
									<span className="flex size-11 items-center justify-center rounded-[11px] border border-[var(--qp-border)] text-lg font-black text-[var(--qp-primary)]">
										▥
									</span>
									<b className="text-base text-[var(--qp-text)]">{o.label}</b>
									{o.sub && <small className="text-[var(--qp-dim)]">{o.sub}</small>}
								</button>
							);
						})}
					</div>
					<label className="mt-5 flex max-w-[240px] flex-col gap-1 text-xs text-[var(--qp-dim)]">
						{switching ? "Prefer a different strength?" : "Something else?"} (up to {MAX_STRENGTH} mg/mL)
						<input
							type="number"
							min={1}
							max={MAX_STRENGTH}
							placeholder="mg/mL"
							value={custom}
							onChange={(e) => {
								// Nothing above the strongest e-liquid we sell: a bigger number is pulled back to it.
								const n = Math.min(Number(e.target.value), MAX_STRENGTH);
								setCustom(e.target.value === "" ? "" : String(n));
								if (n >= 1) setStrength(Math.round(n));
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
			<div key="step-4" className="wv-fade flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					{head("Daily use / baseline")}
					<h2 className="mb-1 text-[26px] font-black">About how much do you use in a typical day?</h2>
					<p className="mb-6 text-[var(--qp-muted)]">
						This helps us set the right pace for you. You can always adjust this later.
					</p>
					<div className="mx-auto flex max-w-[420px] items-center gap-4 rounded-2xl border border-[var(--qp-border)] bg-[var(--qp-surface)] p-4">
						<button
							type="button"
							aria-label="Decrease"
							onClick={() => adjustPuffs((v) => v - 5)}
							className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-[var(--qp-border)] bg-[var(--qp-field)] text-2xl font-black text-white"
						>
							−
						</button>
						<div className="flex-1 text-center">
							<input
								type="text"
								inputMode="numeric"
								pattern="[0-9]*"
								aria-label="Puffs per day"
								value={puffsDraft ?? String(puffs)}
								onFocus={(e) => e.target.select()}
								onChange={(e) => {
									const digits = e.target.value.replace(/\D/g, "").slice(0, String(MAX_PUFFS).length);
									setPuffsDraft(digits);
									if (digits !== "") setPuffs(Number(digits));
								}}
								onBlur={() => setPuffsDraft(null)}
								className="block w-full rounded-md bg-transparent text-center text-3xl font-black text-[var(--qp-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--qp-primary)]"
							/>
							<span className="text-sm text-[var(--qp-muted)]">puffs per day</span>
						</div>
						<button
							type="button"
							aria-label="Increase"
							onClick={() => adjustPuffs((v) => v + 5)}
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
								onClick={() => adjustPuffs(() => p.value)}
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
			<div key="step-5" className="wv-fade flex flex-col gap-6">
				<section className={`${stageFrame} p-6 md:p-9`}>
					{head("Your goal and pace")}
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
		<div key="step-6" className="wv-fade flex flex-col gap-6">
			<section className={`${stageFrame} p-6 md:p-9`}>
				{head("Your starting plan")}
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
							{strength} mg · {switching ? "switching from cigarettes" : `${puffs} puffs/day`}
						</small>
					</div>
				</div>
				<p className="mt-5 text-xs text-[var(--qp-dim)]">
					Each step lowers your strength by {STRENGTH_STEP} mg. When it drops you can puff a little more (up
					to {Math.round(PUFF_BUMP * 100)}% above your usual), then ease those puffs back down before the next
					step. {switching ? "Your usual puffs are measured from what you log in the first step. " : ""}You
					can pause or slow down whenever you need to.
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
