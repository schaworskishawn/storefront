"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { changePasswordAction, updateProfileAction } from "@/lib/wv-settings-actions";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const card =
	"flex flex-col gap-3 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-5";
const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none disabled:opacity-60`;
const label = `${bungee} text-[11px] uppercase text-[var(--ct-text)]`;

type Result = { ok: true } | { ok: false; error: string };
type Status = { kind: "idle" } | { kind: "done" } | { kind: "error"; text: string };

function Form({
	title,
	blurb,
	submitLabel,
	action,
	resetOnDone,
	children,
}: {
	title: string;
	blurb: string;
	submitLabel: string;
	action: (fd: FormData) => Promise<Result>;
	resetOnDone?: boolean;
	children: ReactNode;
}) {
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const [pending, start] = useTransition();

	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const fd = new FormData(form);
		start(async () => {
			setStatus({ kind: "idle" });
			const r = await action(fd);
			if (r.ok) {
				if (resetOnDone) form.reset();
				setStatus({ kind: "done" });
			} else setStatus({ kind: "error", text: r.error });
		});
	};

	return (
		<form onSubmit={submit} className={card}>
			<h2 className={`${bungee} text-[22px] text-white`}>{title}</h2>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>{blurb}</p>
			<div className="grid gap-3 md:grid-cols-2 md:gap-3">{children}</div>
			<button
				type="submit"
				disabled={pending}
				className={`${orbitron} mt-3 flex h-[45px] items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-6 text-sm font-bold tracking-[1px] text-[var(--ac-input)] disabled:opacity-60 md:w-fit`}
			>
				{pending ? "SAVING…" : submitLabel}
			</button>
			{status.kind === "done" && (
				<p role="status" className={`${orbitron} text-xs text-[var(--ac-cyan)]`}>
					Saved ✓
				</p>
			)}
			{status.kind === "error" && (
				<p role="alert" className="text-xs text-[var(--q-red)]">
					{status.text}
				</p>
			)}
		</form>
	);
}

function Field({ id, title, children }: { id: string; title: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<label htmlFor={id} className={label}>
				{title}
			</label>
			{children}
		</div>
	);
}

export function ProfileForm({
	firstName,
	lastName,
	email,
}: {
	firstName: string;
	lastName: string;
	email: string;
}) {
	return (
		<Form
			title="PROFILE"
			blurb="Update your personal details."
			submitLabel="SAVE CHANGES"
			action={updateProfileAction}
		>
			<Field id="st-first" title="First name">
				<input
					id="st-first"
					name="firstName"
					required
					defaultValue={firstName}
					autoComplete="given-name"
					placeholder="e.g. Neo"
					className={field}
				/>
			</Field>
			<Field id="st-last" title="Last name">
				<input
					id="st-last"
					name="lastName"
					required
					defaultValue={lastName}
					autoComplete="family-name"
					placeholder="e.g. Anderson"
					className={field}
				/>
			</Field>
			<Field id="st-email" title="Email (used to sign in)">
				<input id="st-email" value={email} readOnly disabled className={field} />
			</Field>
		</Form>
	);
}

export function PasswordForm() {
	return (
		<Form
			title="PASSWORD"
			blurb="Choose a strong password of at least 8 characters."
			submitLabel="CHANGE PASSWORD"
			action={changePasswordAction}
			resetOnDone
		>
			<Field id="st-old" title="Current password">
				<input
					id="st-old"
					name="oldPassword"
					type="password"
					required
					autoComplete="current-password"
					className={field}
				/>
			</Field>
			<span className="hidden md:block" />
			<Field id="st-new" title="New password">
				<input
					id="st-new"
					name="newPassword"
					type="password"
					required
					minLength={8}
					autoComplete="new-password"
					className={field}
				/>
			</Field>
			<Field id="st-confirm" title="Confirm new password">
				<input
					id="st-confirm"
					name="confirmPassword"
					type="password"
					required
					minLength={8}
					autoComplete="new-password"
					className={field}
				/>
			</Field>
		</Form>
	);
}
