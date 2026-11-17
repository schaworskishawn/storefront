"use client";

import { ArrowRight, KeyRound, LockKeyhole, LogIn, Mail, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginWithBff, syncAuthSurfacesAfterSignIn } from "@/lib/auth";
import { safeNextPath } from "@/lib/age-gate";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A field set into the glass behind a glowing icon, lit cyan while focused (`.wv-acct-field`, `.wv-auth-input`). */
const field = `${heyComic} wv-acct-field h-12 w-full min-w-0 rounded-lg pl-11 pr-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const label = `${bungee} wv-auth-label flex gap-1 text-[11px] uppercase`;
const fieldIcon = "wv-auth-icon pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2";

/**
 * Login card (Figma 6.29). Signs in through the storefront's BFF auth, then sends the customer to `next` (default
 * /account).
 *
 * In the site's neon style (`.wv-auth-*` in wv-home.css): lit glass inside a glowing cyan-to-pink edge, a sign-in icon in
 * a neon tile beside a chrome title over a glowing bar, the fields set into the glass behind glowing icons, the error in
 * a pink glass strip, the glossy button, and the links glowing under a neon divider.
 */
export function LoginForm({ channel, next }: { channel: string; next?: string }) {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setError("");
		if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
		if (!password) return setError("Enter your password.");
		setBusy(true);
		try {
			const result = await loginWithBff(email, password);
			if (result.errors?.length) {
				const err = result.errors[0];
				if (err.code === "ACCOUNT_NOT_CONFIRMED")
					setError(
						"Your email address isn't verified yet. Open the verification link we emailed you, then sign in.",
					);
				else if (err.code === "INACTIVE") setError("This account is inactive. Please contact support.");
				else if (err.code === "RATE_LIMITED")
					setError("Too many attempts. Please wait a moment and try again.");
				else if (
					err.code === "INVALID_CREDENTIALS" ||
					err.code === "INVALID_PASSWORD" ||
					/invalid|credentials/i.test(err.message ?? "")
				)
					setError("That email and password don't match.");
				else setError("We couldn't sign you in. Please try again.");
				return;
			}
			if (result.ok) {
				await syncAuthSurfacesAfterSignIn(channel, router, { redirectTo: safeNextPath(next, "/account") });
				return;
			}
			setError("We couldn't sign you in. Please try again.");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<form
			onSubmit={submit}
			noValidate
			className="wv-auth-card flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl p-5 md:p-7"
		>
			<div className="flex items-center gap-4">
				<span
					aria-hidden
					className="wv-acct-icon flex size-12 shrink-0 items-center justify-center rounded-xl"
				>
					<LogIn className="size-5" strokeWidth={2.25} />
				</span>
				<div className="flex flex-col gap-2">
					<h1 className={`${bungee} wv-heading-title text-[30px] leading-none`}>LOGIN</h1>
					<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
				</div>
			</div>
			<p className={`${orbitron} wv-hero-copy text-xs`}>
				Welcome back to <strong className="wv-hero-key">Worldwide Vapor</strong>.
			</p>
			<div className="flex flex-col gap-2">
				<label htmlFor="lg-email" className={label}>
					Email <span className="wv-auth-req">*</span>
				</label>
				<div className="wv-auth-input relative">
					<Mail aria-hidden className={fieldIcon} strokeWidth={2.25} />
					<input
						id="lg-email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						autoComplete="email"
						placeholder="you@example.com"
						className={field}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="lg-password" className={label}>
					Password <span className="wv-auth-req">*</span>
				</label>
				<div className="wv-auth-input relative">
					<LockKeyhole aria-hidden className={fieldIcon} strokeWidth={2.25} />
					<input
						id="lg-password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete="current-password"
						placeholder="Your password"
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
				<span className="wv-pc-cta-label">{busy ? "SIGNING IN…" : "CONTINUE"}</span>
				<ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
			</button>
			<div aria-hidden className="wv-acct-rule mt-1 h-px" />
			<div className={`${orbitron} flex flex-wrap gap-x-5 gap-y-2 text-[11px]`}>
				<Link href="/register" className="wv-auth-link flex items-center gap-1.5">
					<UserPlus aria-hidden className="size-3.5" strokeWidth={2.25} />
					CREATE AN ACCOUNT
				</Link>
				<Link href="/forgot-password" className="wv-auth-link flex items-center gap-1.5">
					<KeyRound aria-hidden className="size-3.5" strokeWidth={2.25} />
					FORGOT PASSWORD?
				</Link>
			</div>
		</form>
	);
}
