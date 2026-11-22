"use client";

import {
	BadgeCheck,
	Building2,
	ChevronDown,
	FileBadge,
	FileCheck,
	Globe,
	Info,
	Layers,
	Mail,
	MapPin,
	MapPinned,
	PenLine,
	Phone,
	Send,
	Store,
	TrendingUp,
	TriangleAlert,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
	BUSINESS_TYPES,
	MONTHLY_VOLUMES,
	TIER_OPTIONS,
	applicationText,
	normalizeDistributorApplication,
	toApplicationRecord,
	validateDistributorApplication,
	type DistributorFieldErrors,
} from "@/lib/distributors/application";

/**
 * The distributor application, for a signed-in customer (their name and email are filled in), lit like the sign-in cards
 * and the affiliate application (`.wv-auth-*`, `.wv-af-*`). Posts to /api/distributor, which saves it on their account
 * for the owner to verify and approve at a tier; if online applications aren't set up it hands the applicant a pre-filled
 * email instead.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";
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
	| { kind: "error"; text: string; account?: boolean };

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
	select?: boolean;
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

function Choice({
	id,
	name,
	title,
	Icon,
	options,
	placeholder,
	error,
	defaultValue = "",
}: {
	id: string;
	name: string;
	title: string;
	Icon: LucideIcon;
	options: readonly { value: string; label: string }[];
	placeholder?: string;
	error?: string;
	defaultValue?: string;
}) {
	return (
		<Field id={id} title={title} Icon={Icon} required select error={error}>
			<select
				id={id}
				name={name}
				defaultValue={defaultValue}
				className={`${field} appearance-none pr-10`}
				aria-invalid={error ? true : undefined}
			>
				{placeholder && (
					<option value="" disabled>
						{placeholder}
					</option>
				)}
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</Field>
	);
}

const asOptions = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

export function DistributorApplyForm({ defaults }: { defaults?: { name: string; email: string } }) {
	const [errors, setErrors] = useState<DistributorFieldErrors>({});
	const [status, setStatus] = useState<Status>({ kind: "idle" });

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		const app = normalizeDistributorApplication({
			...Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")),
			confirmAge: f.get("confirmAge") === "on",
			agree: f.get("agree") === "on",
		});
		const errs = validateDistributorApplication(app);
		setErrors(errs);
		if (Object.keys(errs).length) return;

		setStatus({ kind: "sending" });
		try {
			const res = await fetch("/api/distributor", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(app),
			});
			const data = (await res.json().catch(() => ({}))) as {
				message?: string;
				errors?: DistributorFieldErrors;
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
				const record = toApplicationRecord(app);
				const href = `mailto:${SUPPORT}?subject=${encodeURIComponent(`Distributor application — ${record.businessName}`)}&body=${encodeURIComponent(applicationText(record))}`;
				return setStatus({ kind: "fallback", href });
			}
			setStatus({
				kind: "error",
				text: data.message ?? "Something went wrong. Please try again.",
				account: data.already,
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
					Thanks for applying. We verify every business by hand and will email you{" "}
					<strong className="wv-hero-key">once your tier is set</strong>, usually within 48 business hours.
				</p>
				<Link href="/account/distributor" className={`${heyComic} wv-auth-link text-xs uppercase underline`}>
					See your distributor account
				</Link>
			</div>
		);
	}

	const invalid = (k: keyof DistributorFieldErrors) => (errors[k] ? true : undefined);

	return (
		<form
			onSubmit={submit}
			noValidate
			className="wv-auth-card wv-af-form flex flex-col gap-7 rounded-[20px] p-5 md:p-8"
		>
			<Group Icon={Building2} title="YOUR BUSINESS">
				<div className="grid gap-5 md:grid-cols-2">
					<Field id="ds-business" title="Business name" Icon={Building2} required error={errors.businessName}>
						<input
							id="ds-business"
							name="businessName"
							autoComplete="organization"
							placeholder="e.g. Cloud Nine Vapes Inc."
							className={field}
							aria-invalid={invalid("businessName")}
						/>
					</Field>
					<Choice
						id="ds-type"
						name="businessType"
						title="Type of business"
						Icon={Store}
						options={asOptions(BUSINESS_TYPES)}
						placeholder="Select a type"
						error={errors.businessType}
					/>
					<Field
						id="ds-licence"
						title="Business licence / registration no."
						Icon={FileBadge}
						required
						error={errors.licenseNumber}
					>
						<input
							id="ds-licence"
							name="licenseNumber"
							autoComplete="off"
							placeholder="As on your licence"
							className={field}
							aria-invalid={invalid("licenseNumber")}
						/>
					</Field>
					<Field id="ds-permit" title="Tobacco / vapour permit no." Icon={FileCheck}>
						<input
							id="ds-permit"
							name="taxPermit"
							autoComplete="off"
							placeholder="If your region issues one"
							className={field}
						/>
					</Field>
					<Field id="ds-website" title="Website" Icon={Globe} error={errors.website}>
						<input
							id="ds-website"
							name="website"
							type="url"
							inputMode="url"
							autoComplete="url"
							placeholder="Optional"
							className={field}
							aria-invalid={invalid("website")}
						/>
					</Field>
					<Choice
						id="ds-volume"
						name="monthlyVolume"
						title="Expected monthly volume"
						Icon={TrendingUp}
						options={asOptions(MONTHLY_VOLUMES)}
						placeholder="Select a range"
						error={errors.monthlyVolume}
					/>
					<Choice
						id="ds-tier"
						name="requestedTier"
						title="Tier you're applying for"
						Icon={Layers}
						options={TIER_OPTIONS}
						defaultValue="small"
					/>
				</div>
			</Group>

			<div aria-hidden className="wv-af-rule h-px w-full" />

			<Group Icon={UserRound} title="CONTACT">
				<div className="grid gap-5 md:grid-cols-2">
					<Field id="ds-contact" title="Contact name" Icon={UserRound} required error={errors.contactName}>
						<input
							id="ds-contact"
							name="contactName"
							defaultValue={defaults?.name}
							autoComplete="name"
							className={field}
							aria-invalid={invalid("contactName")}
						/>
					</Field>
					<Field id="ds-email" title="Email address" Icon={Mail} required error={errors.email}>
						<input
							id="ds-email"
							name="email"
							type="email"
							defaultValue={defaults?.email}
							autoComplete="email"
							className={field}
							aria-invalid={invalid("email")}
						/>
					</Field>
					<Field id="ds-phone" title="Phone" Icon={Phone}>
						<input
							id="ds-phone"
							name="phone"
							type="tel"
							autoComplete="tel"
							placeholder="Optional"
							className={field}
						/>
					</Field>
					<Field id="ds-country" title="Country" Icon={MapPin} required error={errors.country}>
						<input
							id="ds-country"
							name="country"
							autoComplete="country-name"
							placeholder="e.g. Canada"
							className={field}
							aria-invalid={invalid("country")}
						/>
					</Field>
					<Field id="ds-region" title="Province / state" Icon={MapPinned} required error={errors.region}>
						<input
							id="ds-region"
							name="region"
							autoComplete="address-level1"
							placeholder="e.g. Ontario"
							className={field}
							aria-invalid={invalid("region")}
						/>
					</Field>
				</div>
				<Field id="ds-message" title="Anything else we should know?" Icon={PenLine} tall>
					<textarea
						id="ds-message"
						name="message"
						rows={4}
						maxLength={2000}
						placeholder="Locations, the brands you carry, your territory…"
						className={`${field} h-28 resize-y py-[14px]`}
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
					<span>
						Our business is licensed to sell vapour products where we operate, and we sell only to customers
						of legal age.
					</span>
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
						{status.account && (
							<>
								{" "}
								<Link href="/account/distributor" className="wv-auth-link underline">
									Open my distributor account
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
						<Link href="/login?next=%2Fdistributor%23apply" className="wv-auth-link underline">
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
						Online applications aren&apos;t switched on yet. Yours is ready to send by email:{" "}
						<a href={status.href} className="wv-auth-link underline">
							Open my email app
						</a>
						. Nothing is sent until you press send there.
					</span>
				</p>
			)}
			<p className={`${orbitron} text-center text-[11px] text-[var(--wv-muted)]`}>
				We use your details only to verify your business and run your account.
			</p>
		</form>
	);
}
