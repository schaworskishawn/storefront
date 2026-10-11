"use client";

import { useActionState } from "react";
import { IDLE } from "@/lib/worldwide-ai/web/action-state";
import type { FormAction } from "./forms";

/**
 * Asking for coding work. The repository, the kind of work and the checks are each chosen from a list the server owns; the
 * only free text is the commit to start from, what is wanted, and what a finished result looks like. The server checks all
 * of it again, whatever this form sends.
 */
export function CodingRequestForm({
	action,
	idempotencyKey,
	repositories,
	jobTypes,
	checks,
}: {
	action: FormAction;
	idempotencyKey: string;
	repositories: ReadonlyArray<{ id: string; label: string }>;
	jobTypes: ReadonlyArray<{ id: string; label: string }>;
	checks: ReadonlyArray<{ id: string; label: string }>;
}) {
	const [state, formAction, pending] = useActionState(action, IDLE);
	const value = (name: string) => state.values?.[name] ?? "";
	return (
		<form action={formAction} className="wai-form" noValidate>
			<input type="hidden" name="intent" value="job.request" />
			<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
			{state.message && (
				<div
					className={`wai-notice wai-notice--${state.ok ? "good" : "bad"}`}
					role={state.ok ? "status" : "alert"}
				>
					<strong>{state.message}</strong>
				</div>
			)}
			<div className="wai-field">
				<label htmlFor="coding-repository">
					Repository
					<span className="wai-required" aria-hidden>
						*
					</span>
				</label>
				<select
					key={value("repositoryId")}
					id="coding-repository"
					name="repositoryId"
					className="wai-select"
					required
					defaultValue={value("repositoryId")}
				>
					<option value="" disabled>
						Choose…
					</option>
					{repositories.map((repository) => (
						<option key={repository.id} value={repository.id}>
							{repository.id}: {repository.label}
						</option>
					))}
				</select>
			</div>
			<div className="wai-field">
				<label htmlFor="coding-type">
					Kind of work
					<span className="wai-required" aria-hidden>
						*
					</span>
				</label>
				<select
					key={value("jobType")}
					id="coding-type"
					name="jobType"
					className="wai-select"
					required
					defaultValue={value("jobType")}
				>
					<option value="" disabled>
						Choose…
					</option>
					{jobTypes.map((type) => (
						<option key={type.id} value={type.id}>
							{type.label}
						</option>
					))}
				</select>
			</div>
			<div className="wai-field">
				<label htmlFor="coding-base">
					Commit to start from
					<span className="wai-required" aria-hidden>
						*
					</span>
				</label>
				<input
					id="coding-base"
					name="baseCommit"
					className="wai-input wai-mono"
					required
					autoComplete="off"
					spellCheck={false}
					maxLength={64}
					defaultValue={value("baseCommit")}
					aria-describedby="coding-base-help"
				/>
				<span id="coding-base-help" className="wai-help">
					The full 40-character commit id. A branch name can move; a commit can’t.
				</span>
			</div>
			<div className="wai-field">
				<label htmlFor="coding-goal">
					What is wanted
					<span className="wai-required" aria-hidden>
						*
					</span>
				</label>
				<textarea
					id="coding-goal"
					name="goal"
					className="wai-textarea"
					rows={3}
					required
					defaultValue={value("goal")}
					aria-describedby="coding-goal-help"
				/>
				<span id="coding-goal-help" className="wai-help">
					This is handed to the worker as a description. Nothing written here can widen what the job may touch
					or which checks it may run.
				</span>
			</div>
			<div className="wai-field">
				<label htmlFor="coding-expected">
					What a finished result looks like
					<span className="wai-required" aria-hidden>
						*
					</span>
				</label>
				<input
					id="coding-expected"
					name="expectedResult"
					className="wai-input"
					required
					autoComplete="off"
					maxLength={1000}
					defaultValue={value("expectedResult")}
				/>
			</div>
			<fieldset style={{ border: 0, padding: 0, margin: 0 }}>
				<legend className="wai-label">Checks Verify has to pass before it can be approved</legend>
				{checks.map((check) => (
					<label
						key={check.id}
						className="wai-check"
						htmlFor={`coding-check-${check.id}`}
						style={{ marginTop: 8 }}
					>
						<input
							id={`coding-check-${check.id}`}
							type="checkbox"
							name={`check.${check.id}`}
							value="yes"
							defaultChecked={value(`check.${check.id}`) === "yes"}
						/>
						<span>{check.label}</span>
					</label>
				))}
			</fieldset>
			<div className="wai-form-actions">
				<button type="submit" className="wai-btn wai-btn--primary" disabled={pending} aria-busy={pending}>
					{pending ? "Working…" : "Record the request"}
				</button>
			</div>
		</form>
	);
}
