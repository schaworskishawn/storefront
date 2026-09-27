"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dashboard } from "./wv-quit-dashboard";
import { defaultData, loadData, sampleData, saveData, toDateStr, type QuitData } from "./wv-quit-model";
import { Onboarding } from "./wv-quit-onboarding";
import { ghostBtn, inter, primaryBtn } from "./wv-quit-ui";

/**
 * Quit Nicotine — Figma "6.35 - High Fidelity - Nicotine Quitting Program", colored from the
 * Worldwide Vapor design-system foundation (semantic + primitive tokens, not per-page guesses).
 * A local-first program: the plan and check-ins live only in this browser (localStorage).
 * Two screens, matching the reference design: a 6-step setup wizard, then a single dashboard.
 */
export function WvQuit() {
	const [data, setData] = useState<QuitData | null>(null);
	const [today, setToday] = useState("");

	useEffect(() => {
		// Intentional: localStorage isn't available during SSR, so the server (and the client's first
		// hydration pass) render the `null` loading state; this effect then loads the real, client-only
		// data. Applying it any earlier would mismatch the server-rendered markup.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setData(loadData() ?? defaultData(toDateStr()));
		setToday(toDateStr());
	}, []);

	const update = useCallback((fn: (d: QuitData) => QuitData) => {
		setData((cur) => {
			if (!cur) return cur;
			const next = fn(cur);
			saveData(next);
			return next;
		});
	}, []);

	const restart = () => {
		const fresh = defaultData(today);
		saveData(fresh);
		setData(fresh);
	};

	return (
		<div className={`${inter} min-h-dvh overflow-x-clip bg-[var(--qp-bg)] pb-10 text-[var(--qp-text)]`}>
			<header className="bg-[var(--qp-bg)]/90 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--qp-border)] px-4 py-3 backdrop-blur-[9px] md:px-7">
				<Link href="/home" className="flex items-center gap-3" aria-label="Worldwide Vapor home">
					<span className="relative block h-9 w-[72px] shrink-0">
						<Image src="/home/imgBrand.png" alt="" fill sizes="72px" className="object-contain" priority />
					</span>
					<span className="bg-gradient-to-r from-[var(--qp-primary)] to-[var(--qp-secondary)] bg-clip-text text-base font-black tracking-[-0.01em] text-transparent">
						Quit Nicotine
					</span>
				</Link>
				{data?.setup && (
					<div className="flex gap-2">
						<button type="button" onClick={restart} className={ghostBtn}>
							Start Over
						</button>
						<a href="#quick-log" className={primaryBtn}>
							+ Log Use
						</a>
					</div>
				)}
			</header>

			<main className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-9 xl:py-10">
				{!data || !today ? (
					<p className="py-16 text-center text-[var(--qp-dim)]">Loading your program…</p>
				) : data.setup ? (
					<Dashboard data={data} today={today} update={update} onRestart={restart} />
				) : (
					<Onboarding
						today={today}
						onDone={(d) => update(() => d)}
						onSample={() => update(() => sampleData(today))}
					/>
				)}
			</main>
		</div>
	);
}
