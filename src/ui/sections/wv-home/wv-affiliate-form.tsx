"use client";

import {
	BadgeCheck,
	ChevronDown,
	Globe,
	Info,
	Link2,
	Mail,
	Megaphone,
	PenLine,
	Phone,
	Send,
	TriangleAlert,
	UserRound,
	Users,
	type LucideIcon,
} from "lucide-react";
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
/** A field set into the glass behind a glowing icon, lit cyan while focused, pink when it needs fixing. */
const field = `${heyComic} wv-acct-field h-12 w-full min-w-0 rounded-lg pl-11 pr-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const label = `${bungee} wv-auth-label flex items-center gap-1 text-[11px] uppercase`;
const fieldIcon = "wv-auth-icon pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2";
const note = `${orbitron} flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-[1.6]`;

type Status =
	| { kind: "idle" }
	| { kind: "sending" }
	| { kind: "done" }
	| { kind: "fallback"; href: string }
	| { kind: "signin" }
	| { kind: "error"; text: string; dashboard?: boolean };

function Field({
	id,
	title,
	Icon,
	required,
	error,
	select,
	tall,
	children,
}: {
	id: string;
	title: string;
	Icon: LucideIcon;
	required?: boolean;
	error?: string;
	/** A dropdown: gets its arrow. */
	select?: boolean;
	/** A text area: its icon sits at the top. */
	tall?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className={label}>
				{title} {required && <span className="wv-auth-req">*</span>}
			</label>
			<div className="wv-auth-input relative">
				<Icon
					aria-hidden
					className={tall ? "wv-auth-icon pointer-events-none absolute left-4 top-[15px] size-4" : fieldIcon}
					strokeWidth={2.25}
				/>
				{children}
				{select && (
					<ChevronDown
						aria-hidden
						className="wv-auth-icon pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2"
						strokeWidth={2.5}
					/>
				)}
			</div>
			{error && (
				<p role="alert" className={`${orbitron} wv-af-field-error flex items-center gap-1.5 text-xs`}>
					<TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
					{error}
				</p>
			)}
		</div>
	);
}

/** A group of the form's fields under a lit icon tile and a title. */
function Group({ Icon, title, children }: { Icon: LucideIcon; title: string; children: ReactNode }) {
	return (
		<fieldset className="flex flex-col gap-5">
			<legend className="contents">
				<span className="flex items-center gap-3">
					<span
						aria-hidden
						className="wv-acct-icon flex size-10 shrink-0 items-center justify-center rounded-xl"
					>
						<Icon className="size-[18px]" strokeWidth={2.25} />
					</span>
					<span className={`${bungee} wv-heading-title text-base text-white md:text-lg`}>{title}</span>
				</span>
			</legend>
			{children}
		</fieldset>
	);
}

/**
 * Affiliate application, for a signed-in customer (their name and email are filled in). Posts to /api/affiliate, which
 * saves it on their account; if online delivery isn't configured it hands the applicant a pre-filled email instead.
 */
export function AffiliateApplyForm({ defaults }: { defaults?: { name: string; email: string } }) {
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
				signIn?: boolean;
				already?: boolean;
			};
			if (res.ok) return setStatus({ kind: "done" });
			if (data.signIn) return setStatus({ kind: "signin" });
			if (data.errors) {
				setErrors(data.errors);
				return setStatus({ kind: "idle" });
			}
			if (res.status === 501 || data.fallback) {
				const href = `mailto:${SUPPORT}?subject=${encodeURIComponent(`Affiliate application — ${app.name}`)}&body=${encodeURIComponent(toPlainText(app))}`;
				return setStatus({ kind: "fallback", href });
			}
			setStatus({
				kind: "error",
				text: data.message ?? "Something went wrong. Please try again.",
				dashboard: data.already,
			});
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
				className="wv-auth-card flex flex-col items-center gap-4 rounded-[20px] p-8 text-center"
			>
				<span aria-hidden className="wv-acct-icon flex size-12 items-center justify-center rounded-xl">
					<BadgeCheck className="size-6" strokeWidth={2.25} />
				</span>
				<p className={`${bungee} wv-heading-title text-xl text-white md:text-2xl`}>APPLICATION RECEIVED</p>
				<p className={`${orbitron} wv-hero-copy max-w-md text-sm leading-[1.6]`}>
					Thanks for applying. Our partnerships team reviews every application and will reply{" "}
					<strong className="wv-hero-key">by email</strong>, usually within a few business days.
				</p>
				<Link href="/home" className={`${heyComic} wv-auth-link text-xs uppercase underline`}>
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
			className="wv-auth-card wv-af-form flex flex-col gap-7 rounded-[20px] p-5 md:p-8"
		>
			<Group Icon={UserRound} title="ABOUT YOU">
				<div className="grid gap-5 md:grid-cols-2">
					<Field id="af-name" title="Full name" Icon={UserRound} required error={errors.name}>
						<input
							id="af-name"
							name="name"
							defaultValue={defaults?.name}
							autoComplete="name"
							placeholder="e.g. Neo Anderson"
							className={field}
							aria-invalid={invalid("name")}
						/>
					</Field>
					<Field id="af-email" title="Email address" Icon={Mail} required error={errors.email}>
						<input
							id="af-email"
							name="email"
							type="email"
							defaultValue={defaults?.email}
							autoComplete="email"
							placeholder="you@example.com"
							className={field}
							aria-invalid={invalid("email")}
						/>
					</Field>
					<Field id="af-phone" title="Phone" Icon={Phone}>
						<input
							id="af-phone"
							name="phone"
							type="tel"
							autoComplete="tel"
							placeholder="Optional"
							className={field}
						/>
					</Field>
					<Field id="af-country" title="Country" Icon={Globe} required error={errors.country}>
						<input
							id="af-country"
							name="country"
							autoComplete="country-name"
							placeholder="e.g. Canada"
							className={field}
							aria-invalid={invalid("country")}
						/>
					</Field>
				</div>
			</Group>

			<div aria-hidden className="wv-af-rule h-px w-full" />

			<Group Icon={Megaphone} title="YOUR AUDIENCE">
				<div className="grid gap-5 md:grid-cols-2">
					<Field
						id="af-platform"
						title="Main platform"
						Icon={Megaphone}
						required
						select
						error={errors.platform}
					>
						<select
							id="af-platform"
							name="platform"
							defaultValue=""
							className={`${field} appearance-none pr-10`}
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
					<Field id="af-audience" title="Audience size" Icon={Users} required select error={errors.audience}>
						<select
							id="af-audience"
							name="audience"
							defaultValue=""
							className={`${field} appearance-none pr-10`}
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

				<Field
					id="af-url"
					title="Profile, channel or website link"
					Icon={Link2}
					required
					error={errors.profileUrl}
				>
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

				<Field
					id="af-plan"
					title="How will you promote Worldwide Vapor?"
					Icon={PenLine}
					required
					tall
					error={errors.plan}
				>
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
			</Group>

			<div className="wv-af-consents flex flex-col gap-3">
				<label
					className={`${orbitron} wv-af-choice wv-neon-card-text flex cursor-pointer items-start gap-3 rounded-xl p-3 text-xs leading-[1.5]`}
				>
					<input
						type="checkbox"
						name="confirmAge"
						className="mt-[2px] size-4 shrink-0"
						aria-invalid={invalid("confirmAge")}
					/>
					<span>I am at least 18 years old and of legal smoking age where I live.</span>
				</label>
				{errors.confirmAge && (
					<p role="alert" className={`${orbitron} wv-af-field-error flex items-center gap-1.5 text-xs`}>
						<TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
						{errors.confirmAge}
					</p>
				)}
				<label
					className={`${orbitron} wv-af-choice wv-neon-card-text flex cursor-pointer items-start gap-3 rounded-xl p-3 text-xs leading-[1.5]`}
				>
					<input
						type="checkbox"
						name="agree"
						className="mt-[2px] size-4 shrink-0"
						aria-invalid={invalid("agree")}
					/>
					<span>
						I agree to the{" "}
						<Link href="/terms-and-conditions" className="wv-auth-link underline">
							Terms & Conditions
						</Link>{" "}
						and{" "}
						<Link href="/privacy-policy" className="wv-auth-link underline">
							Privacy Policy
						</Link>
						.
					</span>
				</label>
				{errors.agree && (
					<p role="alert" className={`${orbitron} wv-af-field-error flex items-center gap-1.5 text-xs`}>
						<TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
						{errors.agree}
					</p>
				)}
			</div>

			<button
				type="submit"
				disabled={status.kind === "sending"}
				className={`${heyComic} wv-pc-cta flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)] disabled:opacity-60`}
			>
				<Send aria-hidden className="size-4" strokeWidth={2.5} />
				<span className="wv-pc-cta-label">
					{status.kind === "sending" ? "SENDING…" : "SUBMIT APPLICATION"}
				</span>
			</button>

			{status.kind === "error" && (
				<p role="alert" className={`${note} wv-auth-error`}>
					<TriangleAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
					<span>
						{status.text}
						{status.dashboard && (
							<>
								{" "}
								<Link href="/account/affiliate" className="wv-auth-link underline">
									Open my dashboard
								</Link>
							</>
						)}
					</span>
				</p>
			)}
			{status.kind === "signin" && (
				<p role="alert" className={`${note} wv-af-note`}>
					<Info aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
					<span>
						Your session has ended. Please{" "}
						<Link href="/login?next=%2Faffiliate-program%23apply" className="wv-auth-link underline">
							sign in again
						</Link>{" "}
						to send your application.
					</span>
				</p>
			)}
			{status.kind === "fallback" && (
				<p role="status" className={`${note} wv-af-note`}>
					<Info aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
					<span>
						Online submission isn&apos;t switched on yet. Your application is ready to send by email:{" "}
						<a href={status.href} className="wv-auth-link underline">
							Open my email app
						</a>
						. Nothing is sent until you press send there.
					</span>
				</p>
			)}
			<p className={`${orbitron} text-center text-[11px] text-[var(--wv-muted)]`}>
				We use your details only to review your application.
			</p>
		</form>
	);
}
