"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuitPlan } from "@/app/(root)/quit/actions";
import { Dashboard } from "./wv-quit-dashboard";
import type { QuitAccountState, SyncState } from "./wv-quit-account";
import {
	defaultData,
	loadData,
	needsUpload,
	pickNewest,
	saveData,
	stamp,
	toDateStr,
	type QuitData,
} from "./wv-quit-model";
import { Onboarding } from "./wv-quit-onboarding";
import { ghostBtn, inter, primaryBtn } from "./wv-quit-ui";

/** How long after the last change the plan is saved to the account (so a burst of logging is one save). */
const SAVE_DELAY_MS = 900;

/** Where each quick link in the sticky bar jumps to (section ids live in the dashboard). */
const SECTIONS = [
	{ id: "dashboard", label: "Today" },
	{ id: "plan", label: "Plan" },
	{ id: "progress", label: "Progress" },
	{ id: "tips", label: "Tips" },
];

/** One quiet line saying where the plan is kept. */
function AccountNote({ account, sync }: { account: QuitAccountState; sync: SyncState }) {
	if (account.status === "loading") return null;
	if (account.status === "guest") {
		return (
			<p className="text-xs text-[var(--qp-muted)]">
				Your plan is saved in this browser.{" "}
				<Link href="/login?next=/quit" className="font-bold text-[var(--qp-primary)] underline">
					Sign in
				</Link>{" "}
				to keep it on your account too, so it follows you to any device.
			</p>
		);
	}
	if (account.status === "unavailable") {
		return (
			<p className="text-xs text-[var(--qp-muted)]">
				Your plan is saved in this browser. We can&apos;t reach your account right now.
			</p>
		);
	}
	const text =
		sync === "saving"
			? "Saving to your account…"
			: sync === "saved"
				? "✓ Saved to your account"
				: sync === "error"
					? "Couldn't save to your account just now. Your plan is safe in this browser, and we'll try again on your next change."
					: "Your plan saves to your account automatically.";
	return (
		<p
			role="status"
			aria-live="polite"
			className={`text-xs ${sync === "error" ? "text-[var(--qp-warning)]" : sync === "saved" ? "text-[var(--qp-success)]" : "text-[var(--qp-muted)]"}`}
		>
			{text}
		</p>
	);
}

/**
 * Quit Nicotine — Figma "6.35 - High Fidelity - Nicotine Quitting Program", colored from the
 * Worldwide Vapor design-system foundation (semantic + primitive tokens, not per-page guesses).
 * The plan and check-ins are kept in this browser (localStorage). Signed in, they are also saved to the visitor's
 * account, and whichever copy changed last wins when the two differ.
 * Two screens, matching the reference design: a 6-step setup wizard, then a single dashboard.
 */
export function WvQuit({ account }: { account: QuitAccountState }) {
	const [data, setData] = useState<QuitData | null>(null);
	const [today, setToday] = useState("");
	const [sync, setSync] = useState<SyncState>("idle");
	const signedIn = account.status === "signedIn";

	// The latest data, readable from event handlers without waiting for a render (rapid taps never overwrite each other).
	const dataRef = useRef<QuitData | null>(null);
	// A change waiting to be saved to the account, and the timer that will save it.
	const pending = useRef<QuitData | null>(null);
	const timer = useRef<number | undefined>(undefined);

	const flush = useCallback(async () => {
		window.clearTimeout(timer.current);
		const next = pending.current;
		if (!next) return;
		pending.current = null;
		setSync("saving");
		try {
			const result = await saveQuitPlan(next);
			if (result.status === "newer") {
				// Another device saved something more recent: use it.
				saveData(result.plan);
				dataRef.current = result.plan;
				setData(result.plan);
				setSync("saved");
			} else {
				setSync(result.status === "saved" ? "saved" : "error");
			}
		} catch {
			setSync("error");
		}
	}, []);

	const queueSave = useCallback(
		(next: QuitData) => {
			if (!signedIn) return;
			pending.current = next;
			window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
		},
		[signedIn, flush],
	);

	useEffect(() => {
		// Wait for the account: its copy may be newer than this browser's, and decides which plan to show.
		if (account.status === "loading") return;
		// Intentional: localStorage isn't available during SSR, so the server (and the client's first hydration pass)
		// render the loading state; this effect then loads the real, client-only data. Applying it any earlier would
		// mismatch the server-rendered markup.
		const local = loadData();
		const remote = account.status === "signedIn" ? account.plan : null;
		const { data: chosen, source } = pickNewest(local, remote);
		const initial = chosen ?? defaultData(toDateStr());
		dataRef.current = initial;
		/* eslint-disable react-hooks/set-state-in-effect */
		setData(initial);
		setToday(toDateStr());
		/* eslint-enable react-hooks/set-state-in-effect */
		if (!chosen) return;
		// Keep this browser's copy current, and send the account a plan it doesn't have yet (e.g. made before signing in).
		if (source === "account") saveData(chosen);
		else if (account.status === "signedIn" && needsUpload(chosen, remote)) queueSave(chosen);
	}, [account, queueSave]);

	// Don't lose a change that's still waiting when the visitor leaves or switches away.
	useEffect(() => {
		const onHide = () => {
			if (document.visibilityState === "hidden") void flush();
		};
		document.addEventListener("visibilitychange", onHide);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			void flush();
		};
	}, [flush]);

	const commit = useCallback(
		(next: QuitData) => {
			dataRef.current = next;
			setData(next);
			saveData(next);
			if (signedIn) {
				setSync("saving");
				queueSave(next);
			}
		},
		[signedIn, queueSave],
	);

	const update = useCallback(
		(fn: (d: QuitData) => QuitData) => {
			const cur = dataRef.current;
			if (cur) commit(stamp(fn(cur)));
		},
		[commit],
	);

	const restart = () => commit(stamp(defaultData(today)));

	return (
		<div className={`${inter} min-h-dvh overflow-x-clip bg-[var(--qp-bg)] pb-10 text-[var(--qp-text)]`}>
			{/* The site menu sits above (see the page); this bar is the quit program's own, and stays in view while scrolling. */}
			<header className="bg-[var(--qp-bg)]/90 sticky top-0 z-20 border-b border-[var(--qp-border)] px-4 py-2.5 backdrop-blur-[9px] md:px-7">
				<div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<span className="bg-gradient-to-r from-[var(--qp-primary)] to-[var(--qp-secondary)] bg-clip-text text-base font-black tracking-[-0.01em] text-transparent">
						Quit Nicotine
					</span>
					{data?.setup && (
						<nav
							aria-label="On this page"
							className="order-last flex w-full gap-2 overflow-x-auto pb-0.5 md:order-none md:w-auto md:overflow-visible md:pb-0"
						>
							{SECTIONS.map((section) => (
								<a
									key={section.id}
									href={`#${section.id}`}
									className="hover:border-[var(--qp-primary)]/60 shrink-0 rounded-full border border-[var(--qp-border)] bg-[var(--qp-field)] px-3.5 py-1.5 text-xs font-bold text-[var(--qp-muted)] hover:text-[var(--qp-text)]"
								>
									{section.label}
								</a>
							))}
						</nav>
					)}
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
				</div>
			</header>

			<main className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-9 xl:py-10">
				{!data || !today ? (
					<p className="py-16 text-center text-[var(--qp-dim)]">Loading your program…</p>
				) : (
					<>
						<div className="mb-4">
							<AccountNote account={account} sync={sync} />
						</div>
						{data.setup ? (
							<Dashboard data={data} today={today} update={update} onRestart={restart} />
						) : (
							<Onboarding today={today} onDone={(d) => update(() => d)} />
						)}
					</>
				)}
			</main>
		</div>
	);
}
