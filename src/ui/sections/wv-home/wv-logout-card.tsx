"use client";

import Link from "next/link";
import { useState } from "react";
import { logout } from "@/app/actions";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

/** Log out confirmation (Figma 6.28). Ends the Saleor session, then returns to /login. */
export function LogoutCard() {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const confirm = async () => {
		setBusy(true);
		setError("");
		try {
			await logout();
			window.location.assign("/login");
		} catch {
			setError("We couldn't log you out. Please try again.");
			setBusy(false);
		}
	};

	return (
		<div className="flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5 md:p-7">
			<h2 className={`${bungee} text-[30px] text-white`}>LOG OUT?</h2>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
				Are you sure you want to end this session?
			</p>
			{error && (
				<p role="alert" className="text-xs text-[var(--q-red)]">
					{error}
				</p>
			)}
			<button
				type="button"
				onClick={() => void confirm()}
				disabled={busy}
				className={`${orbitron} mt-4 flex h-[45px] items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-6 text-sm font-bold tracking-[1px] text-[var(--ac-input)] disabled:opacity-60 md:w-fit`}
			>
				{busy ? "LOGGING OUT…" : "CONTINUE"}
			</button>
			<Link href="/account" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
				STAY SIGNED IN
			</Link>
		</div>
	);
}
