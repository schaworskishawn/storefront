"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Copies a piece of text (a referral link, a code), saying so for a moment; if the clipboard is blocked, says how instead. */
export function CopyButton({ text, label = "COPY" }: { text: string; label?: string }) {
	const [state, setState] = useState<"idle" | "copied" | "blocked">("idle");

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setState("copied");
		} catch {
			setState("blocked");
		}
		window.setTimeout(() => setState("idle"), 2500);
	};

	return (
		<button
			type="button"
			onClick={copy}
			aria-live="polite"
			className="wv-review-btn flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-[family-name:var(--font-orbitron)] text-[11px]"
		>
			{state === "copied" ? (
				<Check aria-hidden className="size-3" strokeWidth={2.5} />
			) : (
				<Copy aria-hidden className="size-3" strokeWidth={2.5} />
			)}
			{state === "copied" ? "COPIED" : state === "blocked" ? "SELECT AND COPY IT" : label}
		</button>
	);
}
