"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;
const label = `${bungee} flex gap-1 text-[11px] uppercase text-[var(--ct-text)]`;
const card =
	"flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5 md:p-7";

/** Register card (Figma 6.30). Creates the Saleor account; Saleor emails a confirmation link. */
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

	const req = <span className="text-[var(--ct-cyan)]">*</span>;
	return (
		<form onSubmit={submit} noValidate className={card}>
			<h1 className={`${bungee} text-[30px] text-white`}>REGISTER</h1>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>Create your Worldwide Vapor account.</p>
			<div className="grid gap-[14px] md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-first" className={label}>
						First name {req}
					</label>
					<input
						id="rg-first"
						name="firstName"
						autoComplete="given-name"
						placeholder="e.g. Neo"
						className={field}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-last" className={label}>
						Last name {req}
					</label>
					<input
						id="rg-last"
						name="lastName"
						autoComplete="family-name"
						placeholder="e.g. Anderson"
						className={field}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="rg-email" className={label}>
					Email {req}
				</label>
				<input
					id="rg-email"
					name="email"
					type="email"
					autoComplete="email"
					placeholder="you@example.com"
					className={field}
				/>
			</div>
			<div className="grid gap-[14px] md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-password" className={label}>
						Password {req}
					</label>
					<input
						id="rg-password"
						name="password"
						type="password"
						autoComplete="new-password"
						placeholder="At least 8 characters"
						className={field}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="rg-confirm" className={label}>
						Confirm password {req}
					</label>
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
				{busy ? "CREATING…" : "CONTINUE"}
			</button>
			<Link href="/login" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
				ALREADY HAVE AN ACCOUNT?
			</Link>
		</form>
	);
}
