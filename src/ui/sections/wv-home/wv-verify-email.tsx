"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { confirmAccountWithBff } from "@/lib/auth/bff-client";
import { confirmAccountWithBffDeduped } from "@/lib/auth/confirm-account-client";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const card =
	"flex min-h-[240px] w-full max-w-[520px] flex-col gap-[14px] rounded-2xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5 md:p-7";
const action = `${orbitron} text-[11px] text-[var(--ac-pink)]`;

type State = "check" | "confirming" | "password" | "success" | "error";

const detail = (r: { errors?: { message?: string | null; code?: string | null }[] }) =>
	r.errors?.[0]?.message ?? r.errors?.[0]?.code ?? "";

function Step({
	title,
	children,
	tone = "cyan",
}: {
	title: string;
	children: React.ReactNode;
	tone?: "cyan" | "green" | "red";
}) {
	const dot =
		tone === "green" ? "bg-[var(--ac-green)]" : tone === "red" ? "bg-[var(--q-red)]" : "bg-[var(--ac-cyan)]";
	return (
		<div role="status" className={card}>
			<span aria-hidden className={`size-10 shrink-0 rounded-full ${dot}`} />
			<h1 className={`${bungee} text-lg text-white md:text-[22px]`}>{title}</h1>
			{children}
		</div>
	);
}

/**
 * Email verification (Figma 6.31). Without a token it tells the customer to check their inbox;
 * with `email` + `token` (from the confirmation link Saleor emails) it confirms the account.
 */
export function VerifyEmail({ email, token }: { email?: string; token?: string }) {
	const [state, setState] = useState<State>(email && token ? "confirming" : "check");
	const [reason, setReason] = useState("");

	useEffect(() => {
		if (!email || !token) return;
		let cancelled = false;
		void confirmAccountWithBffDeduped(email, token)
			.then((r) => {
				if (cancelled) return;
				const needsPassword = r.errors?.some(
					(e) => e.code === "REQUIRED" && /password/i.test(e.message ?? ""),
				);
				setReason(needsPassword ? "" : detail(r));
				setState(r.success && !r.errors?.length ? "success" : needsPassword ? "password" : "error");
			})
			.catch(() => {
				if (!cancelled) setState("error");
			});
		return () => {
			cancelled = true;
		};
	}, [email, token]);

	const [pw, setPw] = useState("");
	const [pw2, setPw2] = useState("");
	const [busy, setBusy] = useState(false);

	const submitPassword = async (e: FormEvent) => {
		e.preventDefault();
		if (pw.length < 8) return setReason("Your password must be at least 8 characters.");
		if (pw !== pw2) return setReason("The passwords do not match.");
		if (!email || !token) return;
		setBusy(true);
		setReason("");
		try {
			const r = await confirmAccountWithBff(email, token, pw);
			if (r.success && !r.errors?.length) setState("success");
			else {
				setReason(detail(r));
				if (!r.errors?.some((x) => /password/i.test(x.message ?? ""))) setState("error");
			}
		} catch {
			setReason("Something went wrong. Please try again.");
		} finally {
			setBusy(false);
		}
	};

	if (state === "password")
		return (
			<Step title="CHOOSE A PASSWORD">
				<form onSubmit={submitPassword} className="flex flex-col gap-3">
					<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
						Finish verifying {email} by choosing a password for your account.
					</p>
					<input
						type="password"
						value={pw}
						onChange={(e) => setPw(e.target.value)}
						autoComplete="new-password"
						placeholder="New password (8+ characters)"
						aria-label="New password"
						className={`${orbitron} h-12 w-full rounded border border-[var(--ct-border)] bg-[var(--ct-field)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`}
					/>
					<input
						type="password"
						value={pw2}
						onChange={(e) => setPw2(e.target.value)}
						autoComplete="new-password"
						placeholder="Repeat password"
						aria-label="Repeat password"
						className={`${orbitron} h-12 w-full rounded border border-[var(--ct-border)] bg-[var(--ct-field)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`}
					/>
					{reason && (
						<p role="alert" className="text-xs text-[var(--q-red)]">
							{reason}
						</p>
					)}
					<button
						type="submit"
						disabled={busy}
						className={`${orbitron} flex h-[45px] items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-6 text-sm font-bold tracking-[1px] text-[var(--ac-input)] disabled:opacity-60 md:w-fit`}
					>
						{busy ? "VERIFYING…" : "VERIFY & CONTINUE"}
					</button>
				</form>
			</Step>
		);

	if (state === "confirming")
		return (
			<Step title="VERIFYING YOUR EMAIL">
				<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>One moment while we confirm {email}…</p>
			</Step>
		);

	if (state === "success")
		return (
			<Step title="EMAIL VERIFIED" tone="green">
				<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
					Your account is active. You can sign in now.
				</p>
				<Link
					href="/login"
					className={`${orbitron} mt-1 flex h-[45px] items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-6 text-sm font-bold tracking-[1px] text-[var(--ac-input)] md:w-fit`}
				>
					SIGN IN
				</Link>
			</Step>
		);

	if (state === "error")
		return (
			<Step title="LINK NOT VALID" tone="red">
				<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
					This verification link is invalid or has expired. If you already verified, you can sign in.
				</p>
				{reason && <p className={`${orbitron} text-[11px] text-[var(--ac-muted)]`}>Details: {reason}</p>}
				<div className="mt-auto flex flex-wrap gap-x-4 gap-y-1">
					<Link href="/login" className={action}>
						BACK TO LOGIN
					</Link>
					<Link href="/register" className={action}>
						REGISTER AGAIN
					</Link>
				</div>
			</Step>
		);

	return (
		<Step title="CHECK YOUR EMAIL">
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
				We sent a verification link to{" "}
				{email ? <span className="text-[var(--ac-cyan)]">{email}</span> : "your email address"}. Open it to
				activate your account.
			</p>
			<div className="mt-auto flex flex-wrap gap-x-4 gap-y-1">
				<Link href="/login" className={action}>
					BACK TO LOGIN
				</Link>
				<Link href="/register" className={action}>
					USE A DIFFERENT EMAIL
				</Link>
			</div>
		</Step>
	);
}
