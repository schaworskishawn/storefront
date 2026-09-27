"use client";

import { AGE_VERIFIED_COOKIE, safeNextPath } from "@/lib/age-gate";
import { useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const MIN_AGE = 18;
const EXIT_URL = "https://www.google.com";

const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-center text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;

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
		<div className="flex w-full flex-col items-center gap-5 rounded-xl border border-[var(--ct-border)] bg-[var(--ct-card)] px-5 py-8 md:gap-6 md:px-8 md:py-10">
			<div className="flex size-[72px] items-center justify-center rounded-full border-2 border-[var(--ct-cyan)] bg-black/40">
				<span className={`${bungee} text-[22px] text-[var(--ct-cyan)]`}>{MIN_AGE}+</span>
			</div>
			<p className={`${bungee} text-[11px] tracking-[2px] text-[var(--ct-cyan)]`}>
				AGE VERIFICATION REQUIRED
			</p>
			<div className="flex flex-col items-center gap-[6px]">
				<h2 className={`${bungee} text-base`}>AGE VERIFICATION</h2>
				<span aria-hidden className="h-[2px] w-16 bg-[var(--ct-cyan)]" />
			</div>
			<p className={`${orbitron} max-w-[500px] text-center text-[13px] leading-[1.5] text-[var(--ct-text)]`}>
				Please verify your age to access Worldwide Vapor. You must be of legal smoking age in your
				jurisdiction.
			</p>

			{ok ? (
				<div role="status" className="flex w-full flex-col items-center gap-4 text-center">
					<p className={`${heyComic} text-lg text-[var(--ct-cyan)]`}>YOU&apos;RE VERIFIED ✓</p>
					<p className={`${orbitron} text-xs text-[var(--ct-text)]`}>
						Thanks. We&apos;ll remember this on this device.
					</p>
					<button
						type="button"
						onClick={enter}
						className={`${heyComic} flex w-full items-center justify-center rounded bg-[var(--ct-cyan)] px-7 py-[14px] text-xs uppercase text-[var(--ct-ink)] shadow-[0_0_6px_rgba(0,255,224,0.4)]`}
					>
						Enter Site
					</button>
				</div>
			) : (
				<form onSubmit={submit} noValidate className="flex w-full flex-col items-center gap-4 md:gap-5">
					<fieldset className="flex w-full flex-col items-center gap-4">
						<legend className={`${bungee} mx-auto text-[11px] tracking-[1.5px] text-[var(--ct-text)]`}>
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
						<button
							type="submit"
							className={`${heyComic} flex w-full items-center justify-center rounded bg-[var(--ct-cyan)] px-7 py-[14px] text-xs uppercase text-[var(--ct-ink)] shadow-[0_0_6px_rgba(0,255,224,0.4)]`}
						>
							Enter Site
						</button>
						<a href={EXIT_URL} className="text-[11px] text-[var(--ct-text)] underline">
							I am under {MIN_AGE} — Exit Site
						</a>
					</div>
				</form>
			)}
		</div>
	);
}
