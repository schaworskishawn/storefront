"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { setPasswordWithBff } from "@/lib/auth/bff-client";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;
const label = `${bungee} flex gap-1 text-[11px] uppercase text-[var(--ct-text)]`;
const card =
	"flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5 md:p-7";

/** Reset password card (Figma 6.33). Opened from the emailed link (`?email=…&token=…`). */
export function ResetForm({ email, token }: { email?: string; token?: string }) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);

	if (!email || !token) {
		return (
			<div role="status" className={card}>
				<h1 className={`${bungee} text-[30px] text-white`}>RESET PASSWORD</h1>
				<p className={`${orbitron} text-xs leading-5 text-[var(--ac-muted)]`}>
					This page opens from the reset link we email you. Request a new link to choose a new password.
				</p>
				<Link href="/forgot-password" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
					REQUEST A RESET LINK
				</Link>
			</div>
		);
	}

	if (done) {
		return (
			<div role="status" className={card}>
				<h1 className={`${bungee} text-[30px] text-white`}>PASSWORD UPDATED</h1>
				<p className={`${orbitron} text-xs leading-5 text-[var(--ac-muted)]`}>
					Your password has been changed. You can sign in with it now.
				</p>
				<Link
					href="/login"
					className={`${orbitron} mt-2 flex h-[45px] items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-6 text-sm font-bold tracking-[1px] text-[var(--ac-input)] md:w-fit`}
				>
					SIGN IN
				</Link>
			</div>
		);
	}

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		const password = String(f.get("password") ?? "");
		setError("");
		if (password.length < 8) return setError("Your password must be at least 8 characters.");
		if (password !== String(f.get("confirm") ?? "")) return setError("The passwords do not match.");
		setBusy(true);
		try {
			const r = await setPasswordWithBff(email, token, password);
			if (r.errors?.length) {
				const err = r.errors[0];
				setError(
					err.code === "INVALID_TOKEN" || /token/i.test(err.message ?? "")
						? "This reset link is invalid or has expired. Request a new one."
						: err.code === "PASSWORD_TOO_COMMON" || err.code === "PASSWORD_TOO_SIMILAR"
							? (err.message ?? "Choose a stronger password.")
							: "We couldn't update your password. Please try again.",
				);
				return;
			}
			if (r.success) setDone(true);
			else setError("We couldn't update your password. Please try again.");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setBusy(false);
		}
	};

	const req = <span className="text-[var(--ct-cyan)]">*</span>;
	return (
		<form onSubmit={submit} noValidate className={card}>
			<h1 className={`${bungee} text-[30px] text-white`}>RESET PASSWORD</h1>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>Choose a new secure password.</p>
			<div className="flex flex-col gap-2">
				<label htmlFor="rp-password" className={label}>
					New password {req}
				</label>
				<input
					id="rp-password"
					name="password"
					type="password"
					autoComplete="new-password"
					placeholder="At least 8 characters"
					className={field}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="rp-confirm" className={label}>
					Confirm password {req}
				</label>
				<input
					id="rp-confirm"
					name="confirm"
					type="password"
					autoComplete="new-password"
					placeholder="Repeat password"
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
				{busy ? "SAVING…" : "CONTINUE"}
			</button>
			<Link href="/login" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
				BACK TO SIGN IN
			</Link>
		</form>
	);
}
