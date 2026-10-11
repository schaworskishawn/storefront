"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { IDLE, type ActionState } from "@/lib/worldwide-ai/web/action-state";

/** The forms of the workspace. Each posts to a server action and shows exactly what it answered: a result, or the reasons. */

export type FormAction = (previous: ActionState, form: FormData) => Promise<ActionState>;

export type FormField =
	| {
			name: string;
			label: string;
			kind: "text" | "date" | "number" | "decimal";
			required?: boolean;
			help?: string;
			placeholder?: string;
			maxLength?: number;
	  }
	| {
			name: string;
			label: string;
			kind: "textarea" | "table" | "list";
			required?: boolean;
			help?: string;
			placeholder?: string;
			rows?: number;
	  }
	| {
			name: string;
			label: string;
			kind: "select";
			required?: boolean;
			help?: string;
			options: ReadonlyArray<{ value: string; label: string }>;
	  }
	| { name: string; label: string; kind: "files"; required?: boolean; help?: string; max?: number };

function Outcome({ state }: { state: ActionState }) {
	if (!state.message) return null;
	return (
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
	);
}

function Field({ field, value, id }: { field: FormField; value: string | undefined; id: string }) {
	const helpId = field.help ? `${id}-help` : undefined;
	const common = { id, name: field.name, required: field.required, "aria-describedby": helpId };
	return (
		<div className="wai-field">
			<label htmlFor={id}>
				{field.label}
				{field.required && (
					<span className="wai-required" aria-hidden>
						*
					</span>
				)}
			</label>
			{field.kind === "select" ? (
				<select {...common} className="wai-select" defaultValue={value ?? ""}>
					<option value="" disabled={field.required}>
						Choose…
					</option>
					{field.options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			) : field.kind === "textarea" || field.kind === "table" || field.kind === "list" ? (
				<textarea
					{...common}
					className={`wai-textarea${field.kind === "table" ? " wai-textarea--table" : ""}`}
					rows={field.rows ?? (field.kind === "table" ? 7 : field.kind === "list" ? 4 : 5)}
					defaultValue={value ?? ""}
					placeholder={field.placeholder}
					spellCheck={field.kind !== "table"}
				/>
			) : field.kind === "files" ? (
				<input
					{...common}
					className="wai-input"
					type="file"
					accept="image/png,image/jpeg,image/webp"
					multiple={(field.max ?? 1) > 1}
				/>
			) : (
				<input
					{...common}
					className="wai-input"
					type={field.kind === "date" ? "date" : "text"}
					inputMode={field.kind === "number" ? "numeric" : field.kind === "decimal" ? "decimal" : undefined}
					defaultValue={value ?? ""}
					placeholder={field.placeholder}
					maxLength={field.kind === "text" ? field.maxLength : undefined}
					autoComplete="off"
				/>
			)}
			{field.help && (
				<span className="wai-help" id={helpId}>
					{field.help}
				</span>
			)}
		</div>
	);
}

/** A form of labelled fields. What was typed comes back from the server on a refusal, so nothing has to be entered twice. */
export function FieldsForm({
	action,
	fields,
	hidden = {},
	submit,
	children,
	idPrefix,
	initial,
}: {
	action: FormAction;
	fields: readonly FormField[];
	hidden?: Record<string, string>;
	/** Values to start the fields with (a task id carried over from another page, say). */
	initial?: Record<string, string>;
	submit: string;
	/** Extra buttons or notes beside the submit button. */
	children?: ReactNode;
	idPrefix: string;
}) {
	const [state, formAction, pending] = useActionState(action, IDLE);
	return (
		<form action={formAction} className="wai-form" noValidate>
			{Object.entries(hidden).map(([name, value]) => (
				<input key={name} type="hidden" name={name} value={value} />
			))}
			<Outcome state={state} />
			{fields.map((field) => (
				<Field
					key={field.name}
					field={field}
					value={state.values?.[field.name] ?? initial?.[field.name]}
					id={`${idPrefix}-${field.name}`}
				/>
			))}
			<div className="wai-form-actions">
				<button type="submit" className="wai-btn wai-btn--primary" disabled={pending} aria-busy={pending}>
					{pending ? "Working…" : submit}
				</button>
				{children}
			</div>
		</form>
	);
}

/** One button (optionally with a note) that posts to a server action and says what happened. */
export function ButtonForm({
	action,
	hidden,
	label,
	tone = "default",
	note,
	small,
	idPrefix,
}: {
	action: FormAction;
	hidden: Record<string, string>;
	label: string;
	tone?: "default" | "primary" | "danger" | "quiet";
	/** Ask for a note with the decision. */
	note?: { label: string; required?: boolean; placeholder?: string };
	small?: boolean;
	idPrefix: string;
}) {
	const [state, formAction, pending] = useActionState(action, IDLE);
	const router = useRouter();
	// The page's own data is re-read once the action has answered, so what is on screen is what is stored.
	useEffect(() => {
		if (state.message) router.refresh();
	}, [state, router]);
	const noteId = `${idPrefix}-note`;
	return (
		<form action={formAction} className="wai-form" style={{ gap: 8 }}>
			{Object.entries(hidden).map(([name, value]) => (
				<input key={name} type="hidden" name={name} value={value} />
			))}
			{note && (
				<div className="wai-field">
					<label htmlFor={noteId}>
						{note.label}
						{note.required && (
							<span className="wai-required" aria-hidden>
								*
							</span>
						)}
					</label>
					<input
						id={noteId}
						name="note"
						className="wai-input"
						placeholder={note.placeholder}
						required={note.required}
						autoComplete="off"
					/>
				</div>
			)}
			<div className="wai-form-actions">
				<button
					type="submit"
					className={`wai-btn${tone === "default" ? "" : ` wai-btn--${tone}`}${small ? " wai-btn--small" : ""}`}
					disabled={pending}
					aria-busy={pending}
				>
					{pending ? "Working…" : label}
				</button>
			</div>
			<Outcome state={state} />
		</form>
	);
}

/** Re-reads the page every few seconds while something on it is still running. Stops by itself when the page says so. */
export function AutoRefresh({ active, seconds = 4 }: { active: boolean; seconds?: number }) {
	const router = useRouter();
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => router.refresh(), seconds * 1000);
		return () => clearInterval(timer);
	}, [active, seconds, router]);
	return active ? (
		<p className="wai-muted wai-small" role="status">
			This page updates by itself while the work is in progress.
		</p>
	) : null;
}
