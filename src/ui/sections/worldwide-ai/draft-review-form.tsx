"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { IDLE } from "@/lib/worldwide-ai/web/action-state";
import { reviewDraftAction } from "@/lib/worldwide-ai/web/actions";

/**
 * The review of one reply draft: edit the wording, then save it to the case or reject it. Warnings sit above the buttons so
 * they are read before a decision. When a source is missing or out of date, saving needs an explicit confirmation.
 */
export function DraftReviewForm({
	draftId,
	body,
	warnings,
	sourceStatus,
	maxLength,
}: {
	draftId: string;
	body: string;
	warnings: readonly string[];
	sourceStatus: "ok" | "stale" | "missing";
	maxLength: number;
}) {
	const [state, formAction, pending] = useActionState(reviewDraftAction, IDLE);
	const router = useRouter();
	useEffect(() => {
		if (state.message) router.refresh();
	}, [state, router]);

	return (
		<form action={formAction} className="wai-form">
			<input type="hidden" name="draftId" value={draftId} />
			<div className="wai-field">
				<label htmlFor="draft-body">Reply to the customer</label>
				<textarea
					id="draft-body"
					name="body"
					className="wai-textarea"
					rows={12}
					defaultValue={state.values?.body ?? body}
					maxLength={maxLength}
					required
					aria-describedby="draft-body-help"
				/>
				<span className="wai-help" id="draft-body-help">
					You can edit this. Up to {maxLength.toLocaleString("en-CA")} characters. Saving stores it against
					the case; it does not send it.
				</span>
			</div>

			{warnings.length > 0 && (
				<div className="wai-notice wai-notice--warn" role="status">
					<strong>Read before deciding:</strong>
					<ul>
						{warnings.map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				</div>
			)}

			{sourceStatus !== "ok" && (
				<label className="wai-check">
					<input type="checkbox" name="acknowledge" value="1" />
					<span>
						{sourceStatus === "missing"
							? "No approved source matched this case. I have checked this reply myself."
							: "A source is out of date. I have checked that what this reply says is still right."}
					</span>
				</label>
			)}

			<div className="wai-field">
				<label htmlFor="draft-note">Note (optional)</label>
				<input id="draft-note" name="note" className="wai-input" autoComplete="off" />
			</div>

			<div className="wai-form-actions">
				<button
					type="submit"
					name="intent"
					value="save"
					className="wai-btn wai-btn--primary"
					disabled={pending}
					aria-busy={pending}
				>
					{pending ? "Working…" : "Save to the case"}
				</button>
				<button type="submit" name="intent" value="edit" className="wai-btn" disabled={pending}>
					Keep my edit, decide later
				</button>
				<button
					type="submit"
					name="intent"
					value="reject"
					className="wai-btn wai-btn--danger"
					disabled={pending}
				>
					Reject this draft
				</button>
			</div>

			{state.message && (
				<div
					className={`wai-notice wai-notice--${state.ok ? "good" : "bad"}`}
					role={state.ok ? "status" : "alert"}
				>
					<strong>{state.message}</strong>
					{state.problems && state.problems.length > 0 && (
						<ul>
							{state.problems.map((problem) => (
								<li key={problem}>{problem}</li>
							))}
						</ul>
					)}
				</div>
			)}
		</form>
	);
}
