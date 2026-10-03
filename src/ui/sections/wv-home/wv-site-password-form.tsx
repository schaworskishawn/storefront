"use client";

import { useActionState, useEffect, useSyncExternalStore } from "react";
import { type UnlockState } from "@/lib/site-password";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-center text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;

// The destination (`?next=`) is only known in the browser; the server renders without it.
const subscribe = () => () => {};
const readNext = () => new URLSearchParams(window.location.search).get("next") ?? "";

/** Password form: the server action checks the password, sets the access cookie and redirects. */
export function SitePasswordForm({
	unlock,
}: {
	unlock: (previous: UnlockState, formData: FormData) => Promise<UnlockState>;
}) {
	const [state, formAction, pending] = useActionState(unlock, { error: null });
	const next = useSyncExternalStore(subscribe, readNext, () => "");

	// Full page load (not a client-side navigation) so the age gate's redirect, if it kicks in, updates the address bar.
	useEffect(() => {
		if (state.redirectTo) window.location.assign(state.redirectTo);
	}, [state.redirectTo]);

	return (
		<div className="flex w-full flex-col items-center gap-5 rounded-xl border border-[var(--ct-border)] bg-[var(--ct-card)] px-5 py-8 md:gap-6 md:px-8 md:py-10">
			<p className={`${bungee} text-[11px] tracking-[2px] text-[var(--ct-cyan)]`}>PASSWORD PROTECTED</p>
			<div className="flex flex-col items-center gap-[6px]">
				<h1 className={`${bungee} text-base`}>ENTER PASSWORD</h1>
				<span aria-hidden className="h-[2px] w-16 bg-[var(--ct-cyan)]" />
			</div>
			<p className={`${orbitron} max-w-[400px] text-center text-[13px] leading-[1.5] text-[var(--ct-text)]`}>
				This site isn&apos;t open to the public yet. Enter the password to continue.
			</p>

			<form action={formAction} className="flex w-full flex-col items-center gap-4">
				<input type="hidden" name="next" value={next} />
				<label className="w-full">
					<span className="sr-only">Password</span>
					<input
						name="password"
						type="password"
						autoComplete="current-password"
						autoFocus
						required
						placeholder="PASSWORD"
						className={field}
						aria-invalid={state.error ? true : undefined}
					/>
				</label>
				{state.error && (
					<p role="alert" className="text-center text-sm text-[var(--q-red)]">
						{state.error}
					</p>
				)}
				<button
					type="submit"
					disabled={pending || Boolean(state.redirectTo)}
					className={`${heyComic} flex w-full items-center justify-center rounded bg-[var(--ct-cyan)] px-7 py-[14px] text-xs uppercase text-[var(--ct-ink)] disabled:opacity-60`}
				>
					{pending || state.redirectTo ? "Checking…" : "Enter Site"}
				</button>
			</form>
		</div>
	);
}
