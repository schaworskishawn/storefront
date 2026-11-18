"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { AGE_VERIFIED_COOKIE, safeNextPath } from "@/lib/age-gate";
import { useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const MIN_AGE = 18;
const EXIT_URL = "https://www.google.com";

/** A date-of-birth box set into the glass, glowing cyan while focused and pink when the date is wrong (`.wv-age-field`). */
const field = `${heyComic} wv-age-field h-12 w-full min-w-0 rounded-lg px-[14px] text-center text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;

/** The glossy cyan button that enters the site (`.wv-pc-cta`). */
const enterButton = `${heyComic} wv-pc-cta flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-7 py-[14px] text-sm uppercase tracking-[1px] text-[var(--wv-ink)]`;

function readVerified(): boolean {
	return document.cookie.split("; ").some((c) => c === `${AGE_VERIFIED_COOKIE}=1`);
}
const subscribe = () => () => {};

/** Returns an error message, or null when the date is real, in the past, and at least MIN_AGE years ago. */
function check(m: string, d: string, y: string): string | null {
	const month = Number(m);
	const day = Number(d);
	const year = Number(y);
	if (!m || !d || y.length !== 4) return "Enter your full date of birth (MM / DD / YYYY).";
	const dob = new Date(year, month - 1, day);
	if (year < 1900 || month < 1 || month > 12 || dob.getMonth() !== month - 1 || dob.getDate() !== day)
		return "That date doesn't look right. Please check it.";
	const now = new Date();
	if (dob > now) return "Your date of birth can't be in the future.";
	const cutoff = new Date(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate());
	if (dob > cutoff) return `You must be at least ${MIN_AGE} years old to enter this site.`;
	return null;
}

/**
 * Date-of-birth age gate. The birth date is checked in the browser and never stored or sent; only a "verified" flag is
 * kept in this browser so the visitor isn't asked again.
 *
 * In the site's neon style (`.wv-age-*` in wv-home.css): a lit glass card, "18+" in chrome lettering inside a big neon
 * ring (a ring pulses out of it when motion is allowed), a neon badge, a chrome 3D title over a glowing bar, brighter
 * copy, the date boxes set into the glass, and the glossy button.
 */
export function AgeGate() {
	const verified = useSyncExternalStore(subscribe, readVerified, () => false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const digits = (max: number, next?: string) => (e: ChangeEvent<HTMLInputElement>) => {
		e.target.value = e.target.value.replace(/\D/g, "").slice(0, max);
		if (next && e.target.value.length === max)
			(e.target.form?.elements.namedItem(next) as HTMLInputElement | null)?.focus();
	};

	const enter = () =>
		window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next")));

	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		const err = check(String(f.get("mm") ?? ""), String(f.get("dd") ?? ""), String(f.get("yyyy") ?? ""));
		setError(err);
		if (err) return;
		// Cookie (not localStorage) so the server-side gate can see it. The birth date itself is never stored.
		const secure = window.location.protocol === "https:" ? "; Secure" : "";
		document.cookie = `${AGE_VERIFIED_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
		setDone(true);
		enter();
	};

	const ok = done || verified;

	return (
		<div className="wv-age-card flex w-full flex-col items-center gap-5 rounded-[13px] px-5 py-8 md:gap-6 md:px-8 md:py-10">
			<div className="wv-age-badge relative flex size-[84px] items-center justify-center rounded-full">
				<span className={`${bungee} wv-heading-title text-[26px]`}>{MIN_AGE}+</span>
			</div>
			<p
				className={`${bungee} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[2px]`}
			>
				<ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.5} />
				AGE VERIFICATION REQUIRED
			</p>
			<div className="flex flex-col items-center gap-2">
				<h2 className={`${bungee} wv-heading-title text-xl md:text-2xl`}>AGE VERIFICATION</h2>
				<span aria-hidden className="wv-hero-bar h-1 w-16 rounded-full md:w-20" />
			</div>
			<p className={`${orbitron} wv-hero-copy max-w-[500px] text-center text-[13px] leading-[1.6]`}>
				Please verify your age to access Worldwide Vapor. You must be of{" "}
				<strong className="wv-hero-key">legal smoking age</strong> in your jurisdiction.
			</p>

			{ok ? (
				<div role="status" className="flex w-full flex-col items-center gap-4 text-center">
					<p className={`${heyComic} wv-hero-key text-lg`}>YOU&apos;RE VERIFIED ✓</p>
					<p className={`${orbitron} wv-hero-copy text-xs`}>
						Thanks. We&apos;ll remember this on this device.
					</p>
					<button type="button" onClick={enter} className={enterButton}>
						<span className="wv-pc-cta-label">Enter Site</span>
						<ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
					</button>
				</div>
			) : (
				<form onSubmit={submit} noValidate className="flex w-full flex-col items-center gap-4 md:gap-5">
					<fieldset className="flex w-full flex-col items-center gap-4">
						<legend className={`${bungee} wv-age-legend mx-auto text-[11px] tracking-[1.5px]`}>
							ENTER DATE OF BIRTH
						</legend>
						<div className="mt-4 flex w-full items-center gap-3 md:gap-4">
							<label className="flex-1">
								<span className="sr-only">Month</span>
								<input
									name="mm"
									inputMode="numeric"
									autoComplete="bday-month"
									placeholder="MM"
									maxLength={2}
									onChange={digits(2, "dd")}
									className={field}
									aria-invalid={error ? true : undefined}
								/>
							</label>
							<label className="flex-1">
								<span className="sr-only">Day</span>
								<input
									name="dd"
									inputMode="numeric"
									autoComplete="bday-day"
									placeholder="DD"
									maxLength={2}
									onChange={digits(2, "yyyy")}
									className={field}
									aria-invalid={error ? true : undefined}
								/>
							</label>
							<label className="flex-1">
								<span className="sr-only">Year</span>
								<input
									name="yyyy"
									inputMode="numeric"
									autoComplete="bday-year"
									placeholder="YYYY"
									maxLength={4}
									onChange={digits(4)}
									className={field}
									aria-invalid={error ? true : undefined}
								/>
							</label>
						</div>
					</fieldset>
					{error && (
						<p role="alert" className="text-center text-sm text-[var(--q-red)]">
							{error}
						</p>
					)}
					<div className="flex w-full flex-col items-center gap-3">
						<button type="submit" className={enterButton}>
							<span className="wv-pc-cta-label">Enter Site</span>
							<ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
						</button>
						<a href={EXIT_URL} className="wv-age-exit text-[11px] underline">
							I am under {MIN_AGE} — Exit Site
						</a>
					</div>
				</form>
			)}
		</div>
	);
}
