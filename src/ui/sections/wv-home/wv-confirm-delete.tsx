"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Asks before deleting, inside the page rather than in a browser dialog: `window.confirm` is blocked by some browsers
 * and in-app web views (which then answer "no" for the page, so nothing gets deleted). The question glows pink beside a
 * pink "Yes, delete" pill and a cyan "Keep it" pill (`.wv-review-btn`, `.wv-confirm-ask` in wv-home.css). "Keep it" takes
 * the focus, and Escape keeps the item too.
 */
export function ConfirmDelete({
	question,
	pending,
	onConfirm,
	onCancel,
}: {
	question: string;
	pending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const keep = useRef<HTMLButtonElement>(null);
	useEffect(() => keep.current?.focus(), []);

	return (
		<div
			role="group"
			aria-label={question}
			onKeyDown={(e) => {
				if (e.key === "Escape" && !pending) onCancel();
			}}
			className="flex flex-wrap items-center gap-2"
		>
			<span className="wv-confirm-ask">{question}</span>
			<button
				type="button"
				disabled={pending}
				onClick={onConfirm}
				className="wv-review-btn wv-review-btn--pink flex items-center gap-1.5 rounded-full px-3 py-1 disabled:opacity-60"
			>
				<Trash2 aria-hidden className="size-3" strokeWidth={2.5} />
				{pending ? "DELETING…" : "YES, DELETE"}
			</button>
			<button
				ref={keep}
				type="button"
				disabled={pending}
				onClick={onCancel}
				className="wv-review-btn flex items-center gap-1.5 rounded-full px-3 py-1 disabled:opacity-60"
			>
				<X aria-hidden className="size-3" strokeWidth={2.5} />
				KEEP IT
			</button>
		</div>
	);
}
