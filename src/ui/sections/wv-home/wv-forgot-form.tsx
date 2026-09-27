"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;
const card =
	"flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5 md:p-7";

/** Forgot password card (Figma 6.32). Asks Saleor to email a reset link. Always answers neutrally so it can't be used to discover accounts. */
export function ForgotForm({ channel }: { channel: string }) {
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [sentTo, setSentTo] = useState<string | null>(null);

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");
		const value = email.trim();
		if (!EMAIL_RE.test(value)) return setError("Enter a valid email address.");
		setBusy(true);
		try {
			const res = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: value,
					channel,
					redirectUrl: `${window.location.origin}/reset-password`,
				}),
			});
			const data = (await res.json()) as { errors?: { code?: string; field?: string }[] };
			if (res.status === 429 || data.errors?.some((x) => x.code === "RATE_LIMITED"))
				return setError("Too many requests. Please wait a while and try again.");
			if (data.errors?.some((x) => x.field === "redirectUrl"))
				return setError(
					`Reset emails aren't enabled for this web address yet (${window.location.origin}). Add it to "Trusted client origins" in Saleor.`,
				);
			if (data.errors?.length) return setError("We couldn't send a reset link. Please try again.");
			setSentTo(value);
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setBusy(false);
		}
	};

	if (sentTo) {
		return (
			<div role="status" className={card}>
				<h1 className={`${bungee} text-[30px] text-white`}>CHECK YOUR EMAIL</h1>
				<p className={`${orbitron} text-xs leading-5 text-[var(--ac-muted)]`}>
					If an account exists for <span className="text-[var(--ac-cyan)]">{sentTo}</span>, a reset link is on
					its way. It may take a minute to arrive.
				</p>
				<Link href="/login" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
					BACK TO SIGN IN
				</Link>
			</div>
		);
	}

	return (
		<form onSubmit={submit} noValidate className={card}>
			<h1 className={`${bungee} text-[30px] text-white`}>FORGOT PASSWORD</h1>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
				Enter your email to receive a reset link.
			</p>
			<div className="flex flex-col gap-2">
				<label
					htmlFor="fp-email"
					className={`${bungee} flex gap-1 text-[11px] uppercase text-[var(--ct-text)]`}
				>
					Email <span className="text-[var(--ct-cyan)]">*</span>
				</label>
				<input
					id="fp-email"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					autoComplete="email"
					placeholder="you@example.com"
					className={field}
				/>
			</div>
			{error && (
				<p role="alert" className="text-xs text-[var(--q-red)]">
					{error}
				</p>
			)}
			<button
				type="submit"
				disabled={busy}
				className={`${orbitron} mt-2 flex h-[45px] items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-6 text-sm font-bold tracking-[1px] text-[var(--ac-input)] disabled:opacity-60 md:w-fit`}
			>
				{busy ? "SENDING…" : "CONTINUE"}
			</button>
			<Link href="/login" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
				BACK TO SIGN IN
			</Link>
		</form>
	);
}
