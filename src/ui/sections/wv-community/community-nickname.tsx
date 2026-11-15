"use client";

import { useState } from "react";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/community/model";
import type { Outcome } from "./use-community";

const heyComic = "font-[family-name:var(--font-hey-comic)]";

type Props = {
	/** What the visitor is called now, when changing it. */
	current?: string;
	onSubmit: (name: string) => Promise<Outcome>;
	onDone?: () => void;
	/** "welcome" is the first time, with the rules in view; "edit" is a quick change from the sidebar. */
	variant: "welcome" | "edit";
	onShowRules?: () => void;
};

/** Choosing a nickname: what everyone sees next to the messages, instead of the name on the store account. */
export function NicknameForm({ current = "", onSubmit, onDone, variant, onShowRules }: Props) {
	const [name, setName] = useState(current);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setError(null);
		const result = await onSubmit(name);
		setBusy(false);
		if (result.ok) onDone?.();
		else setError(result.message);
	};

	const welcome = variant === "welcome";
	return (
		<form
			onSubmit={submit}
			className={welcome ? "flex flex-col gap-3 px-3 pb-4 pt-3 md:px-4" : "flex flex-col gap-2 p-2"}
		>
			<label
				htmlFor={`nickname-${variant}`}
				className={`${heyComic} text-xs tracking-[1.5px] text-[var(--wv-cyan)]`}
			>
				{welcome ? "CHOOSE A NICKNAME TO JOIN THE CHAT" : "YOUR NICKNAME"}
			</label>
			<div className={`flex gap-2 ${welcome ? "flex-col sm:flex-row" : ""}`}>
				<input
					id={`nickname-${variant}`}
					value={name}
					onChange={(event) => setName(event.target.value)}
					minLength={NICKNAME_MIN}
					maxLength={NICKNAME_MAX}
					required
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					aria-describedby={error ? `nickname-error-${variant}` : undefined}
					aria-invalid={error ? true : undefined}
					placeholder="e.g. CloudChaser"
					className="min-w-0 flex-1 rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-control)] px-3 py-2.5 font-sans text-[15px] text-white placeholder:text-[var(--wv-muted)] focus:border-[var(--wv-cyan)] focus:outline-none"
				/>
				<button
					type="submit"
					disabled={busy}
					className={`${heyComic} rounded-lg bg-[var(--wv-cyan-soft)] px-5 py-2.5 text-sm text-[var(--wv-ink)] disabled:opacity-60`}
				>
					{busy ? "SAVING…" : welcome ? "JOIN THE CHAT" : "SAVE"}
				</button>
			</div>
			{error && (
				<p id={`nickname-error-${variant}`} role="alert" className="font-sans text-sm text-[var(--wv-pink)]">
					{error}
				</p>
			)}
			<p className="font-sans text-xs leading-[1.45] text-[var(--wv-muted)]">
				{NICKNAME_MIN} to {NICKNAME_MAX} characters. It is shown instead of your account name, and you can
				change it once an hour.
				{welcome && (
					<>
						{" "}
						By joining you agree to the{" "}
						<button
							type="button"
							onClick={onShowRules}
							className="text-[var(--wv-cyan-soft)] underline underline-offset-2"
						>
							house rules
						</button>
						.
					</>
				)}
			</p>
		</form>
	);
}
