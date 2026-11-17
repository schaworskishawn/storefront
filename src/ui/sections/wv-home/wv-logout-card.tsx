"use client";

import { ArrowLeft, LogOut, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { logout } from "@/app/actions";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

/**
 * Log out confirmation (Figma 6.28). Ends the Saleor session, then returns to /login.
 *
 * In the site's neon style, as the login card (`.wv-auth-*` in wv-home.css): lit glass inside a glowing cyan-to-pink
 * edge, a log-out icon in a neon tile beside a chrome title over a glowing bar, the error in a pink glass strip, the
 * glossy button, and the way back glowing under a neon divider.
 */
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
		<div className="wv-auth-card flex w-full max-w-[520px] flex-col gap-[14px] rounded-2xl p-5 md:p-7">
			<div className="flex items-center gap-4">
				<span
					aria-hidden
					className="wv-acct-icon flex size-12 shrink-0 items-center justify-center rounded-xl"
				>
					<LogOut className="size-5" strokeWidth={2.25} />
				</span>
				<div className="flex flex-col gap-2">
					<h2 className={`${bungee} wv-heading-title text-[30px] leading-none`}>LOG OUT?</h2>
					<span aria-hidden className="wv-hero-bar h-1 w-14 rounded-full" />
				</div>
			</div>
			<p className={`${orbitron} wv-hero-copy text-xs`}>
				Are you sure you want to <strong className="wv-hero-key">end this session</strong>?
			</p>
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
				type="button"
				onClick={() => void confirm()}
				disabled={busy}
				className={`${heyComic} wv-pc-cta mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--ac-cyan-bright)] px-8 text-sm tracking-[1px] text-[var(--ac-input)] disabled:opacity-60 md:w-fit`}
			>
				<span className="wv-pc-cta-label">{busy ? "LOGGING OUT…" : "CONTINUE"}</span>
				<LogOut aria-hidden className="size-4" strokeWidth={2.5} />
			</button>
			<div aria-hidden className="wv-acct-rule mt-1 h-px" />
			<Link
				href="/account"
				className={`${orbitron} wv-auth-link flex w-fit items-center gap-1.5 text-[11px]`}
			>
				<ArrowLeft aria-hidden className="size-3.5" strokeWidth={2.25} />
				STAY SIGNED IN
			</Link>
		</div>
	);
}
