"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
	AUDIENCES,
	PLATFORMS,
	normalize,
	toPlainText,
	validate,
	type FieldErrors,
} from "@/lib/affiliate-application";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";
const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none aria-[invalid=true]:border-[var(--q-red)]`;
const label = `${bungee} flex items-center gap-1 text-[11px] uppercase text-[var(--ct-text)]`;

type Status =
	| { kind: "idle" }
	| { kind: "sending" }
	| { kind: "done" }
	| { kind: "fallback"; href: string }
	| { kind: "error"; text: string };

function Field({
	id,
	title,
	required,
	error,
	children,
}: {
	id: string;
	title: string;
	required?: boolean;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className={label}>
				{title} {required && <span className="text-[var(--ct-cyan)]">*</span>}
			</label>
			{children}
			{error && (
				<p role="alert" className="text-xs text-[var(--q-red)]">
					{error}
				</p>
			)}
		</div>
	);
}

/** Affiliate application. Posts to /api/affiliate; if online delivery isn't configured it hands the applicant a pre-filled email instead. */
export function AffiliateApplyForm() {
	const [errors, setErrors] = useState<FieldErrors>({});
	const [status, setStatus] = useState<Status>({ kind: "idle" });

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		const app = normalize({
			name: f.get("name"),
			email: f.get("email"),
			phone: f.get("phone"),
			country: f.get("country"),
			platform: f.get("platform"),
			profileUrl: f.get("profileUrl"),
			audience: f.get("audience"),
			plan: f.get("plan"),
			confirmAge: f.get("confirmAge") === "on",
			agree: f.get("agree") === "on",
			company: f.get("company"),
		});
		const errs = validate(app);
		setErrors(errs);
		if (Object.keys(errs).length) return;

		setStatus({ kind: "sending" });
		try {
			const res = await fetch("/api/affiliate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(app),
			});
			const data = (await res.json().catch(() => ({}))) as {
				message?: string;
				errors?: FieldErrors;
				fallback?: boolean;
			};
			if (res.ok) return setStatus({ kind: "done" });
			if (data.errors) {
				setErrors(data.errors);
				return setStatus({ kind: "idle" });
			}
			if (res.status === 501 || data.fallback) {
				const href = `mailto:${SUPPORT}?subject=${encodeURIComponent(`Affiliate application — ${app.name}`)}&body=${encodeURIComponent(toPlainText(app))}`;
				return setStatus({ kind: "fallback", href });
			}
			setStatus({ kind: "error", text: data.message ?? "Something went wrong. Please try again." });
		} catch {
			setStatus({
				kind: "error",
				text: "We couldn't reach the server. Check your connection and try again.",
			});
		}
	};

	if (status.kind === "done") {
		return (
			<div
				role="status"
				className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--ct-cyan)] bg-[var(--ct-card)] p-8 text-center shadow-[0_0_20px_rgba(0,255,224,0.12)]"
			>
				<p className={`${heyComic} text-2xl text-[var(--ct-cyan)]`}>APPLICATION RECEIVED ✓</p>
				<p className={`${orbitron} max-w-md text-sm leading-[1.6] text-[var(--ct-text)]`}>
					Thanks for applying. Our partnerships team reviews every application and will reply by email,
					usually within a few business days.
				</p>
				<Link href="/home" className={`${heyComic} text-xs uppercase text-[var(--ct-cyan)] underline`}>
					Back to the store
				</Link>
			</div>
		);
	}

	const invalid = (k: keyof FieldErrors) => (errors[k] ? true : undefined);

	return (
		<form
			onSubmit={submit}
			noValidate
			className="flex flex-col gap-5 rounded-2xl border border-[var(--ct-border)] bg-[var(--ct-card)] p-5 md:p-8"
		>
			{/* Honeypot: hidden from people */}
			<div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
				<label htmlFor="af-company">Company</label>
				<input id="af-company" name="company" tabIndex={-1} autoComplete="off" />
			</div>

			<div className="grid gap-5 md:grid-cols-2">
				<Field id="af-name" title="Full name" required error={errors.name}>
					<input
						id="af-name"
						name="name"
						autoComplete="name"
						placeholder="e.g. Neo Anderson"
						className={field}
						aria-invalid={invalid("name")}
					/>
				</Field>
				<Field id="af-email" title="Email address" required error={errors.email}>
					<input
						id="af-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						className={field}
						aria-invalid={invalid("email")}
					/>
				</Field>
				<Field id="af-phone" title="Phone">
					<input
						id="af-phone"
						name="phone"
						type="tel"
						autoComplete="tel"
						placeholder="Optional"
						className={field}
					/>
				</Field>
				<Field id="af-country" title="Country" required error={errors.country}>
					<input
						id="af-country"
						name="country"
						autoComplete="country-name"
						placeholder="e.g. Canada"
						className={field}
						aria-invalid={invalid("country")}
					/>
				</Field>
				<Field id="af-platform" title="Main platform" required error={errors.platform}>
					<select
						id="af-platform"
						name="platform"
						defaultValue=""
						className={`${field} appearance-none`}
						aria-invalid={invalid("platform")}
					>
						<option value="" disabled>
							Select a platform
						</option>
						{PLATFORMS.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</Field>
				<Field id="af-audience" title="Audience size" required error={errors.audience}>
					<select
						id="af-audience"
						name="audience"
						defaultValue=""
						className={`${field} appearance-none`}
						aria-invalid={invalid("audience")}
					>
						<option value="" disabled>
							Select audience size
						</option>
						{AUDIENCES.map((a) => (
							<option key={a} value={a}>
								{a}
							</option>
						))}
					</select>
				</Field>
			</div>

			<Field id="af-url" title="Profile, channel or website link" required error={errors.profileUrl}>
				<input
					id="af-url"
					name="profileUrl"
					type="url"
					inputMode="url"
					autoComplete="url"
					placeholder="https://instagram.com/yourname"
					className={field}
					aria-invalid={invalid("profileUrl")}
				/>
			</Field>

			<Field id="af-plan" title="How will you promote Worldwide Vapor?" required error={errors.plan}>
				<textarea
					id="af-plan"
					name="plan"
					rows={5}
					maxLength={2000}
					placeholder="Tell us about your audience and the content you'd create…"
					className={`${field} h-32 resize-y py-[14px]`}
					aria-invalid={invalid("plan")}
				/>
			</Field>

			<div className="flex flex-col gap-3">
				<label className={`${orbitron} flex items-start gap-3 text-xs leading-[1.5] text-[var(--ct-text)]`}>
					<input
						type="checkbox"
						name="confirmAge"
						className="mt-[2px] size-4 accent-[var(--ct-cyan)]"
						aria-invalid={invalid("confirmAge")}
					/>
					<span>I am at least 18 years old and of legal smoking age where I live.</span>
				</label>
				{errors.confirmAge && (
					<p role="alert" className="text-xs text-[var(--q-red)]">
						{errors.confirmAge}
					</p>
				)}
				<label className={`${orbitron} flex items-start gap-3 text-xs leading-[1.5] text-[var(--ct-text)]`}>
					<input
						type="checkbox"
						name="agree"
						className="mt-[2px] size-4 accent-[var(--ct-cyan)]"
						aria-invalid={invalid("agree")}
					/>
					<span>
						I agree to the{" "}
						<Link href="/terms-and-conditions" className="text-[var(--ct-cyan)] underline">
							Terms & Conditions
						</Link>{" "}
						and{" "}
						<Link href="/privacy-policy" className="text-[var(--ct-cyan)] underline">
							Privacy Policy
						</Link>
						.
					</span>
				</label>
				{errors.agree && (
					<p role="alert" className="text-xs text-[var(--q-red)]">
						{errors.agree}
					</p>
				)}
			</div>

			<button
				type="submit"
				disabled={status.kind === "sending"}
				className={`${heyComic} flex items-center justify-center rounded bg-[var(--ct-cyan)] px-7 py-[14px] text-xs uppercase text-[var(--ct-ink)] shadow-[0_0_6px_rgba(0,255,224,0.4)] disabled:opacity-60`}
			>
				{status.kind === "sending" ? "Sending…" : "Submit Application"}
			</button>

			{status.kind === "error" && (
				<p
					role="alert"
					className="rounded border border-[var(--q-red)] px-4 py-3 text-center text-sm text-[var(--q-red)]"
				>
					{status.text}
				</p>
			)}
			{status.kind === "fallback" && (
				<p
					role="status"
					className="border-[var(--ct-cyan)]/40 rounded border bg-[var(--ct-field)] px-4 py-3 text-center text-[13px] text-[var(--ct-text)]"
				>
					Online submission isn&apos;t switched on yet. Your application is ready to send by email:{" "}
					<a href={status.href} className="text-[var(--ct-cyan)] underline">
						Open my email app
					</a>
					. Nothing is sent until you press send there.
				</p>
			)}
			<p className={`${orbitron} text-center text-[11px] text-[var(--ct-text)]`}>
				We use your details only to review your application.
			</p>
		</form>
	);
}
