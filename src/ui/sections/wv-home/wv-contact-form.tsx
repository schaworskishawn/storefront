"use client";

import {
	ChevronDown,
	CircleCheck,
	Hash,
	Info,
	Mail,
	PenLine,
	Send,
	ShieldCheck,
	Tag,
	TriangleAlert,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUBJECTS = [
	"Product Question",
	"Order Issue",
	"Shipping & Delivery",
	"Returns & Refunds",
	"Wholesale / Distributor",
	"Other",
];
const SUPPORT = "support@worldwidevapor.com";

/**
 * The form is lit like the affiliate application (`.wv-auth-*`, `.wv-acct-field`, `.wv-af-*` in wv-home.css): each
 * field is set into the glass behind a glowing icon, lit cyan while focused and pink when it needs fixing; labels are
 * brighter with glowing asterisks; and the notes after sending sit in glowing glass strips.
 */
const field = `${heyComic} wv-acct-field h-12 w-full min-w-0 rounded-lg pl-11 pr-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:outline-none`;
const label = `${bungee} wv-auth-label flex items-center gap-1 text-[11px] uppercase`;
const note = `${orbitron} flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-[1.6]`;

type Errors = Partial<Record<"firstName" | "lastName" | "email" | "message", string>>;

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
					className={`wv-auth-icon pointer-events-none absolute left-4 size-4 ${tall ? "top-[15px]" : "top-1/2 -translate-y-1/2"}`}
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

/**
 * Contact form. Sends to /api/contact (emailed to the site inbox). If online sending isn't available it falls back to
 * opening the visitor's email app pre-filled — nothing is claimed as "sent" unless it really was.
 */
export function ContactForm({ whatsapp }: { whatsapp: string | null }) {
	const [errors, setErrors] = useState<Errors>({});
	const [status, setStatus] = useState<
		| { kind: "idle" }
		| { kind: "sending" }
		| { kind: "sent" }
		| { kind: "fallback"; href: string }
		| { kind: "error"; text: string }
	>({ kind: "idle" });

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formEl = e.currentTarget;
		const f = new FormData(formEl);
		const v = (k: string) => String(f.get(k) ?? "").trim();
		const next: Errors = {};
		if (!v("firstName")) next.firstName = "Enter your first name.";
		if (!v("lastName")) next.lastName = "Enter your last name.";
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) next.email = "Enter a valid email address.";
		if (v("message").length < 10) next.message = "Tell us a little more (at least 10 characters).";
		setErrors(next);
		if (Object.keys(next).length) return;

		const payload = {
			firstName: v("firstName"),
			lastName: v("lastName"),
			email: v("email"),
			order: v("order"),
			subject: v("subject"),
			message: v("message"),
			company: v("company"),
		};
		setStatus({ kind: "sending" });
		try {
			const res = await fetch("/api/contact", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = (await res.json().catch(() => ({}))) as { message?: string; fallback?: boolean };
			if (res.ok) {
				formEl.reset();
				return setStatus({ kind: "sent" });
			}
			if (res.status === 501 || data.fallback) {
				const body = [
					`Name: ${payload.firstName} ${payload.lastName}`,
					`Email: ${payload.email}`,
					payload.order ? `Order number: ${payload.order}` : null,
					"",
					payload.message,
				]
					.filter((l) => l !== null)
					.join("\n");
				return setStatus({
					kind: "fallback",
					href: `mailto:${SUPPORT}?subject=${encodeURIComponent(`${payload.subject} — ${payload.firstName} ${payload.lastName}`)}&body=${encodeURIComponent(body)}`,
				});
			}
			setStatus({ kind: "error", text: data.message ?? "Something went wrong. Please try again." });
		} catch {
			setStatus({
				kind: "error",
				text: "We couldn't reach the server. Check your connection and try again.",
			});
		}
	};

	const aria = (k: keyof Errors) => ({ "aria-invalid": errors[k] ? true : undefined });

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-5 md:gap-5">
			<div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
				<label htmlFor="c-company">Company</label>
				<input id="c-company" name="company" tabIndex={-1} autoComplete="off" />
			</div>
			<div className="grid gap-4 md:grid-cols-2 md:gap-5">
				<Field id="c-first" title="First Name" Icon={UserRound} required error={errors.firstName}>
					<input
						id="c-first"
						name="firstName"
						autoComplete="given-name"
						placeholder="e.g. Neo"
						className={field}
						{...aria("firstName")}
					/>
				</Field>
				<Field id="c-last" title="Last Name" Icon={UserRound} required error={errors.lastName}>
					<input
						id="c-last"
						name="lastName"
						autoComplete="family-name"
						placeholder="e.g. Anderson"
						className={field}
						{...aria("lastName")}
					/>
				</Field>
				<Field id="c-email" title="Email Address" Icon={Mail} required error={errors.email}>
					<input
						id="c-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="me@example.com"
						className={field}
						{...aria("email")}
					/>
				</Field>
				<Field id="c-order" title="Order Number" Icon={Hash}>
					<input id="c-order" name="order" placeholder="Optional (e.g. #WWV-10492)" className={field} />
				</Field>
			</div>
			<Field id="c-subject" title="Subject" Icon={Tag} required select>
				<select id="c-subject" name="subject" className={`${field} appearance-none pr-10`}>
					{SUBJECTS.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
			</Field>
			<Field id="c-message" title="Message" Icon={PenLine} required tall error={errors.message}>
				<textarea
					id="c-message"
					name="message"
					rows={5}
					placeholder="Type your message here..."
					className={`${field} block h-[122px] resize-y py-[14px] md:h-[144px]`}
					{...aria("message")}
				/>
			</Field>
			<div className="flex flex-col gap-3">
				<button
					type="submit"
					disabled={status.kind === "sending"}
					className={`${heyComic} wv-pc-cta flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base uppercase text-[var(--wv-ink)] disabled:opacity-60`}
				>
					<Send aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">{status.kind === "sending" ? "Sending…" : "Send Message"}</span>
				</button>
				<p
					className={`${orbitron} flex items-center justify-center gap-1.5 text-[11px] text-[var(--ct-text)]`}
				>
					<ShieldCheck aria-hidden className="wv-af-inline-icon size-3.5 [--accent:var(--wv-cyan-soft)]" />
					Your information is safe with us
				</p>
				{status.kind === "sent" && (
					<p role="status" className={`${note} wv-af-note`}>
						<CircleCheck aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
						<span>Message sent. Thanks, we usually reply within 24 hours.</span>
					</p>
				)}
				{status.kind === "error" && (
					<p role="alert" className={`${note} wv-auth-error`}>
						<TriangleAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
						<span>{status.text}</span>
					</p>
				)}
				{status.kind === "fallback" && (
					<p role="status" className={`${note} wv-af-note`}>
						<Info aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.25} />
						<span>
							{"Online sending isn't switched on yet. "}
							<a href={status.href} className="wv-auth-link underline">
								Open my email app
							</a>{" "}
							with your message ready to send. Nothing is sent until you press send there.
							{whatsapp && (
								<>
									{" "}
									Prefer chat?{" "}
									<a
										href={whatsapp}
										target="_blank"
										rel="noopener noreferrer"
										className="wv-auth-link underline"
									>
										Message us on WhatsApp
									</a>
									.
								</>
							)}
						</span>
					</p>
				)}
			</div>
		</form>
	);
}
