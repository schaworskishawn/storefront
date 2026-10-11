"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { IDLE } from "@/lib/worldwide-ai/web/action-state";
import type { FormAction } from "./forms";

/**
 * The owner's release decision. Each thing the workspace can't check for itself has its own box to tick; the server refuses a
 * release with any of them missing, whatever this form sends. Release and Reject are two buttons on the one form, so the
 * note and the boxes go with whichever is pressed.
 */
export function ReleaseForm({
	action,
	batchId,
	confirmations,
	canRelease,
}: {
	action: FormAction;
	batchId: string;
	confirmations: ReadonlyArray<{ id: string; label: string }>;
	/** False when a check the application made has failed: the Release button is then not offered. */
	canRelease: boolean;
}) {
	const [state, formAction, pending] = useActionState(action, IDLE);
	const router = useRouter();
	useEffect(() => {
		if (state.message) router.refresh();
	}, [state, router]);
	return (
		<form action={formAction} className="wai-form">
			<input type="hidden" name="intent" value="decide" />
			<input type="hidden" name="batchId" value={batchId} />
			{state.message && (
				<div
					className={`wai-notice wai-notice--${state.ok ? "good" : "bad"}`}
					role={state.ok ? "status" : "alert"}
				>
					<strong>{state.message}</strong>
				</div>
			)}
			{canRelease ? (
				<fieldset style={{ border: 0, padding: 0, margin: 0 }}>
					<legend className="wai-label">To release, confirm each of these</legend>
					{confirmations.map((item) => (
						<label
							key={item.id}
							className="wai-check"
							htmlFor={`confirm-${item.id}`}
							style={{ marginTop: 8 }}
						>
							<input
								id={`confirm-${item.id}`}
								type="checkbox"
								name={`confirm.${item.id}`}
								value="yes"
								defaultChecked={state.values?.[`confirm.${item.id}`] === "yes"}
							/>
							<span>{item.label}</span>
						</label>
					))}
				</fieldset>
			) : (
				<p className="wai-muted wai-small" style={{ margin: 0 }}>
					A check above has failed, so this batch can’t be released as things stand. It can still be rejected.
				</p>
			)}
			<div className="wai-field">
				<label htmlFor="release-note">
					On what basis
					<span className="wai-required" aria-hidden>
						*
					</span>
				</label>
				<input
					id="release-note"
					name="note"
					className="wai-input"
					required
					autoComplete="off"
					defaultValue={state.values?.note ?? ""}
					placeholder="Batch record and lab report LR-2291 reviewed"
				/>
				<span className="wai-help">
					{canRelease
						? "Kept with the decision. For a rejection, say why."
						: "Kept with the decision. Say why."}
				</span>
			</div>
			<div className="wai-form-actions">
				{canRelease && (
					<button
						type="submit"
						name="decision"
						value="released"
						className="wai-btn wai-btn--primary"
						disabled={pending}
						aria-busy={pending}
					>
						{pending ? "Working…" : "Release this batch"}
					</button>
				)}
				<button
					type="submit"
					name="decision"
					value="rejected"
					className="wai-btn wai-btn--danger"
					disabled={pending}
					aria-busy={pending}
				>
					Reject this batch
				</button>
			</div>
		</form>
	);
}
