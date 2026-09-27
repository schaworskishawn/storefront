"use client";

import { useState, type FormEvent } from "react";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const email = new FormData(form).get("email");
		setPending(true);
		try {
			const res = await fetch("/api/newsletter", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await res.json().catch(() => null)) as { message?: string } | null;
			setStatus({
				ok: res.ok,
				message: data?.message ?? (res.ok ? "You're on the list." : "Something went wrong."),
			});
			if (res.ok) form.reset();
		} catch {
			setStatus({ ok: false, message: "Something went wrong. Try again." });
		} finally {
			setPending(false);
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			className={
				compact ? "flex w-full flex-col gap-2 md:w-[320px]" : "flex w-full flex-col items-center gap-3"
			}
		>
			<div
				className={
					compact
						? "flex w-full items-center gap-3"
						: "flex w-full flex-col items-stretch gap-3 md:w-auto md:flex-row md:items-center"
				}
			>
				<input
					type="email"
					name="email"
					required
					aria-label="Email address"
					placeholder="Enter your email address"
					className={
						compact
							? "h-[46px] w-full rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-bg)] px-4 font-sans text-[13px] text-white placeholder:text-[var(--wv-disabled)] md:w-[320px]"
							: "h-12 w-full rounded-xl border border-[var(--wv-cyan)] bg-[var(--wv-bg)] px-4 font-sans text-[13px] text-white placeholder:text-[var(--wv-text-dim)] md:w-[400px]"
					}
				/>
				<button
					type="submit"
					disabled={pending}
					className={`${compact ? "sr-only " : ""}flex h-[42px] items-center justify-center rounded-xl bg-[var(--wv-cyan)] px-6 font-[family-name:var(--font-orbitron)] text-sm font-bold tracking-[1px] text-[var(--wv-bg)] disabled:opacity-60`}
				>
					SUBSCRIBE
				</button>
			</div>
			{status && (
				<p
					role="status"
					className={`text-sm ${status.ok ? "text-[var(--wv-cyan)]" : "text-[var(--wv-pink)]"}`}
				>
					{status.message}
				</p>
			)}
		</form>
	);
}

/** Stacked email + full-width submit, used inside the Payments page "Stay connected" card. */
export function CardNewsletterForm() {
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const email = new FormData(form).get("email");
		setPending(true);
		try {
			const res = await fetch("/api/newsletter", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await res.json().catch(() => null)) as { message?: string } | null;
			setStatus({
				ok: res.ok,
				message: data?.message ?? (res.ok ? "You're on the list." : "Something went wrong."),
			});
			if (res.ok) form.reset();
		} catch {
			setStatus({ ok: false, message: "Something went wrong. Try again." });
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="flex w-full flex-col gap-3 md:gap-4">
			<input
				type="email"
				name="email"
				required
				aria-label="Email address"
				placeholder="Enter your registry email..."
				className="h-11 w-full rounded-xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] px-4 font-[family-name:var(--font-hey-comic)] text-sm text-white placeholder:text-[var(--wv-text-dim)] md:h-12"
			/>
			<button
				type="submit"
				disabled={pending}
				className="flex h-[41px] w-full items-center justify-center rounded-xl bg-[var(--wv-cyan-soft)] font-[family-name:var(--font-hey-comic)] text-base text-[var(--wv-ink)] disabled:opacity-60 md:h-[49px]"
			>
				Subscribe Now
			</button>
			{status && (
				<p
					role="status"
					className={`text-sm ${status.ok ? "text-[var(--wv-cyan)]" : "text-[var(--wv-pink)]"}`}
				>
					{status.message}
				</p>
			)}
		</form>
	);
}

/** Email + SUBSCRIBE (inline on desktop, stacked below `xl`), used on the Learn page. */
export function LearnNewsletterForm() {
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const email = new FormData(form).get("email");
		setPending(true);
		try {
			const res = await fetch("/api/newsletter", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await res.json().catch(() => null)) as { message?: string } | null;
			setStatus({
				ok: res.ok,
				message: data?.message ?? (res.ok ? "You're on the list." : "Something went wrong."),
			});
			if (res.ok) form.reset();
		} catch {
			setStatus({ ok: false, message: "Something went wrong. Try again." });
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
			<div className="flex w-full flex-col gap-3 xl:flex-row">
				<input
					type="email"
					name="email"
					required
					aria-label="Email address"
					placeholder="Enter your email address..."
					className="h-11 w-full min-w-0 flex-1 rounded-lg border border-[var(--wv-disabled)] bg-[var(--wv-ink)] px-4 font-sans text-sm text-white placeholder:text-[var(--wv-text-dim)]"
				/>
				<button
					type="submit"
					disabled={pending}
					className="h-11 shrink-0 rounded-lg bg-[var(--wv-cyan-soft)] px-6 font-[family-name:var(--font-outfit)] text-sm font-extrabold text-[var(--wv-bg)] disabled:opacity-60"
				>
					SUBSCRIBE
				</button>
			</div>
			{status && (
				<p
					role="status"
					className={`text-sm ${status.ok ? "text-[var(--wv-cyan-soft)]" : "text-[var(--wv-pink)]"}`}
				>
					{status.message}
				</p>
			)}
		</form>
	);
}
