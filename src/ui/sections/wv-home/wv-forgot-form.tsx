"use client";

import { ArrowLeft, ArrowRight, KeyRound, Mail, MailCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A field set into the glass behind a glowing icon, lit cyan while focused (`.wv-acct-field`, `.wv-auth-input`). */
const field = `${heyComic} wv-acct-field h-12 w-full min-w-0 rounded-lg pl-11 pr-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const card = "wv-auth-card flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl p-5 md:p-7";
const title = `${bungee} wv-heading-title text-[26px] leading-[1.1] md:text-[30px]`;

/** The way back to sign in: a pink link with an arrow that glows, turning cyan under the pointer (`.wv-auth-link`). */
const backLink = (
	<Link href="/login" className={`${orbitron} wv-auth-link flex w-fit items-center gap-1.5 text-[11px]`}>
		<ArrowLeft aria-hidden className="size-3.5" strokeWidth={2.25} />
		BACK TO SIGN IN
	</Link>
);

/**
 * Forgot password card (Figma 6.32). Asks Saleor to email a reset link. Always answers neutrally so it can't be used to
 * discover accounts.
 *
 * In the site's neon style, as the login card (`.wv-auth-*` in wv-home.css): lit glass inside a glowing cyan-to-pink
 * edge, a key (or, once sent, a mail-check) in a neon tile beside a chrome title over a glowing bar, the field set into
 * the glass behind a glowing icon, the error in a pink glass strip, the glossy button, and the way back glowing under a
 * neon divider.
 */
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
				<div className="flex items-center gap-4">
					<span
						aria-hidden
						className="wv-acct-icon flex size-12 shrink-0 items-center justify-center rounded-xl"
					>
						<MailCheck className="size-5" strokeWidth={2.25} />
					</span>
					<div className="flex flex-col gap-2">
						<h1 className={title}>CHECK YOUR EMAIL</h1>
						<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
					</div>
				</div>
				<p className={`${orbitron} wv-hero-copy break-words text-xs leading-5`}>
					If an account exists for <strong className="wv-hero-key">{sentTo}</strong>, a reset link is on its
					way. It may take a minute to arrive.
				</p>
				<div aria-hidden className="wv-acct-rule mt-1 h-px" />
				{backLink}
			</div>
		);
	}

	return (
		<form onSubmit={submit} noValidate className={card}>
			<div className="flex items-center gap-4">
				<span
					aria-hidden
					className="wv-acct-icon flex size-12 shrink-0 items-center justify-center rounded-xl"
				>
					<KeyRound className="size-5" strokeWidth={2.25} />
				</span>
				<div className="flex flex-col gap-2">
					<h1 className={title}>FORGOT PASSWORD</h1>
					<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
				</div>
			</div>
			<p className={`${orbitron} wv-hero-copy text-xs`}>
				Enter your email to receive a <strong className="wv-hero-key">reset link</strong>.
			</p>
			<div className="flex flex-col gap-2">
				<label htmlFor="fp-email" className={`${bungee} wv-auth-label flex gap-1 text-[11px] uppercase`}>
					Email <span className="wv-auth-req">*</span>
				</label>
				<div className="wv-auth-input relative">
					<Mail
						aria-hidden
						className="wv-auth-icon pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2"
						strokeWidth={2.25}
					/>
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
			</div>
			{error && (
				<p
					role="alert"
					className={`${orbitron} wv-auth-error flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs`}
				>
					<TriangleAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
					{error}
				</p>
			)}
			<button
				type="submit"
				disabled={busy}
				className={`${heyComic} wv-pc-cta mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--ac-cyan-bright)] px-8 text-sm tracking-[1px] text-[var(--ac-input)] disabled:opacity-60 md:w-fit`}
			>
				<span className="wv-pc-cta-label">{busy ? "SENDING…" : "CONTINUE"}</span>
				<ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
			</button>
			<div aria-hidden className="wv-acct-rule mt-1 h-px" />
			{backLink}
		</form>
	);
}
