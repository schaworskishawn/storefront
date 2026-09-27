"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginWithBff, syncAuthSurfacesAfterSignIn } from "@/lib/auth";
import { safeNextPath } from "@/lib/age-gate";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;
const label = `${bungee} text-[11px] uppercase text-[var(--ct-text)]`;

/** Login card (Figma 6.29). Signs in through the storefront's BFF auth, then sends the customer to `next` (default /account). */
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
			className="flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5 md:p-7"
		>
			<h1 className={`${bungee} text-[30px] text-white`}>LOGIN</h1>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>Welcome back to Worldwide Vapor.</p>
			<div className="flex flex-col gap-2">
				<label htmlFor="lg-email" className={`${label} flex gap-1`}>
					Email <span className="text-[var(--ct-cyan)]">*</span>
				</label>
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
			<div className="flex flex-col gap-2">
				<label htmlFor="lg-password" className={`${label} flex gap-1`}>
					Password <span className="text-[var(--ct-cyan)]">*</span>
				</label>
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
				{busy ? "SIGNING IN…" : "CONTINUE"}
			</button>
			<div className={`${orbitron} flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--ac-pink)]`}>
				<Link href="/register">CREATE AN ACCOUNT</Link>
				<Link href="/forgot-password">FORGOT PASSWORD?</Link>
			</div>
		</form>
	);
}
