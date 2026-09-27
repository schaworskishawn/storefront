"use client";

import { useState, type FormEvent } from "react";

export interface NewsletterFormProps {
	placeholder: string;
	submitLabel: string;
}

type FormState =
	| { status: "idle" }
	| { status: "pending" }
	| { status: "success"; message: string }
	| { status: "error"; message: string };

/**
 * DIAGNOSTIC VERSION: uses plain <input>/<button> instead of the shared
 * Button/Input primitives, to isolate whether those imports were causing
 * the "Element type is invalid" error. If this renders fine, the primitives
 * (or their import path) were the problem — tell Claude and we'll fix the
 * real cause rather than staying on plain HTML permanently.
 */
export function NewsletterForm({ placeholder, submitLabel }: NewsletterFormProps) {
	const [state, setState] = useState<FormState>({ status: "idle" });

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const email = new FormData(event.currentTarget).get("email");
		setState({ status: "pending" });

		try {
			const response = await fetch("/api/newsletter", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await response.json()) as { message?: string };

			if (!response.ok) {
				setState({ status: "error", message: data.message ?? "Something went wrong." });
				return;
			}

			setState({ status: "success", message: data.message ?? "Subscribed." });
		} catch {
			setState({ status: "error", message: "Something went wrong. Try again." });
		}
	}

	if (state.status === "success") {
		return (
			<p role="status" className="text-center text-sm text-muted-foreground">
				{state.message}
			</p>
		);
	}

	const isPending = state.status === "pending";

	return (
		<form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col items-center gap-3 sm:flex-row">
			<input
				type="email"
				name="email"
				placeholder={placeholder}
				required
				aria-label={placeholder}
				className="focus-visible:outline-hidden h-12 w-full rounded-button border border-input bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<button
				type="submit"
				disabled={isPending}
				className="h-14 w-full shrink-0 rounded-button bg-primary px-8 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
			>
				{isPending ? "…" : submitLabel}
			</button>
			{state.status === "error" ? (
				<p role="alert" className="w-full text-center text-sm text-destructive sm:absolute sm:mt-14">
					{state.message}
				</p>
			) : null}
		</form>
	);
}
