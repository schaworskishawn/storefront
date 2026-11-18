"use client";

import {
	ArrowRight,
	KeyRound,
	LockKeyhole,
	LogIn,
	Mail,
	TriangleAlert,
	UserPlus,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A field set into the glass behind a glowing icon, lit cyan while focused (`.wv-acct-field`, `.wv-auth-input`). */
const field = `${heyComic} wv-acct-field h-12 w-full min-w-0 rounded-lg pl-11 pr-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const label = `${bungee} wv-auth-label flex gap-1 text-[11px] uppercase`;
const fieldIcon = "wv-auth-icon pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2";

/**
 * Register card (Figma 6.30). Creates the Saleor account; Saleor emails a confirmation link.
 *
 * In the site's neon style, as the login card (`.wv-auth-*` in wv-home.css): lit glass inside a glowing cyan-to-pink
 * edge, a new-account icon in a neon tile beside a chrome title over a glowing bar, the fields set into the glass behind
 * glowing icons, the error in a pink glass strip, the glossy button, and the sign-in link glowing under a neon divider.
 */
export function RegisterForm({ channel }: { channel: string }) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		const v = (k: string) => String(f.get(k) ?? "").trim();
		const email = v("email");
		const password = String(f.get("password") ?? "");
		setError("");
		if (!v("firstName") || !v("lastName")) return setError("Enter your first and last name.");
		if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
		if (password.length < 8) return setError("Your password must be at least 8 characters.");
		if (password !== String(f.get("confirmPassword") ?? "")) return setError("The passwords do not match.");

		setBusy(true);
		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					password,
					firstName: v("firstName"),
					lastName: v("lastName"),
					channel,
					redirectUrl: `${window.location.origin}/verify-email`,
				}),
			});
			const data = (await res.json()) as { errors?: { message: string; code?: string; field?: string }[] };
			if (data.errors?.length) {
				const first = data.errors[0];
				if (first.code === "RATE_LIMITED")
					setError("Too many sign-up attempts from this connection. Please wait a while and try again.");
				else if (first.code === "UNIQUE")
					setError("An account with that email already exists. Try signing in.");
				else if (first.field === "redirectUrl")
					setError(
						`Sign-up isn't enabled for this web address yet (${window.location.origin}). The site owner needs to add it to "Trusted client origins" in Saleor.`,
					);
				else if (first.field === "password") setError(first.message);
				else setError("We couldn't create your account. Please check your details and try again.");
				return;
			}
			window.location.assign(`/verify-email?email=${encodeURIComponent(email)}`);
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setBusy(false);
		}
	};

	const req = <span className="wv-auth-req">*</span>;
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
					<UserPlus className="size-5" strokeWidth={2.25} />
				</span>
				<div className="flex flex-col gap-2">
					<h1 className={`${bungee} wv-heading-title text-[30px] leading-none`}>REGISTER</h1>
					<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
				</div>
			</div>
			<p className={`${orbitron} wv-hero-copy text-xs`}>
				Create your <strong className="wv-hero-key">Worldwide Vapor</strong> account.
			</p>
			<div className="grid gap-[14px] md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-first" className={label}>
						First name {req}
					</label>
					<div className="wv-auth-input relative">
						<UserRound aria-hidden className={fieldIcon} strokeWidth={2.25} />
						<input
							id="rg-first"
							name="firstName"
							autoComplete="given-name"
							placeholder="e.g. Neo"
							className={field}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-last" className={label}>
						Last name {req}
					</label>
					<div className="wv-auth-input relative">
						<UserRound aria-hidden className={fieldIcon} strokeWidth={2.25} />
						<input
							id="rg-last"
							name="lastName"
							autoComplete="family-name"
							placeholder="e.g. Anderson"
							className={field}
						/>
					</div>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="rg-email" className={label}>
					Email {req}
				</label>
				<div className="wv-auth-input relative">
					<Mail aria-hidden className={fieldIcon} strokeWidth={2.25} />
					<input
						id="rg-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						className={field}
					/>
				</div>
			</div>
			<div className="grid gap-[14px] md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-password" className={label}>
						Password {req}
					</label>
					<div className="wv-auth-input relative">
						<LockKeyhole aria-hidden className={fieldIcon} strokeWidth={2.25} />
						<input
							id="rg-password"
							name="password"
							type="password"
							autoComplete="new-password"
							placeholder="At least 8 characters"
							className={field}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-confirm" className={label}>
						Confirm password {req}
					</label>
					<div className="wv-auth-input relative">
						<KeyRound aria-hidden className={fieldIcon} strokeWidth={2.25} />
						<input
							id="rg-confirm"
							name="confirmPassword"
							type="password"
							autoComplete="new-password"
							placeholder="Repeat password"
							className={field}
						/>
					</div>
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
				<span className="wv-pc-cta-label">{busy ? "CREATING…" : "CONTINUE"}</span>
				<ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
			</button>
			<div aria-hidden className="wv-acct-rule mt-1 h-px" />
			<Link href="/login" className={`${orbitron} wv-auth-link flex w-fit items-center gap-1.5 text-[11px]`}>
				<LogIn aria-hidden className="size-3.5" strokeWidth={2.25} />
				ALREADY HAVE AN ACCOUNT?
			</Link>
		</form>
	);
}
