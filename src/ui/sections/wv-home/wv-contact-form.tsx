"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";

const SUBJECTS = [
	"Product Question",
	"Order Issue",
	"Shipping & Delivery",
	"Returns & Refunds",
	"Wholesale / Distributor",
	"Other",
];
const SUPPORT = "support@worldwidevapor.com";

const label = `${bungee} flex items-center gap-1 text-[11px] uppercase text-[var(--ct-text)]`;
const field = `${heyComic} h-12 w-full min-w-0 rounded bg-[var(--ct-field)] border border-[var(--ct-border)] px-[14px] text-sm text-white placeholder:text-[var(--ct-placeholder)] focus:border-[var(--ct-cyan)] focus:outline-none`;

type Errors = Partial<Record<"firstName" | "lastName" | "email" | "message", string>>;

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

	const err = (k: keyof Errors) =>
		errors[k] ? (
			<p role="alert" className="text-xs text-[var(--q-red)]">
				{errors[k]}
			</p>
		) : null;
	const aria = (k: keyof Errors) => ({ "aria-invalid": errors[k] ? true : undefined });

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-5 md:gap-5">
			<div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
				<label htmlFor="c-company">Company</label>
				<input id="c-company" name="company" tabIndex={-1} autoComplete="off" />
			</div>
			<div className="grid gap-4 md:grid-cols-2 md:gap-5">
				<div className="flex flex-col gap-2">
					<label htmlFor="c-first" className={label}>
						First Name <span className="text-[var(--ct-cyan)]">*</span>
					</label>
					<input
						id="c-first"
						name="firstName"
						autoComplete="given-name"
						placeholder="e.g. Neo"
						className={field}
						{...aria("firstName")}
					/>
					{err("firstName")}
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="c-last" className={label}>
						Last Name <span className="text-[var(--ct-cyan)]">*</span>
					</label>
					<input
						id="c-last"
						name="lastName"
						autoComplete="family-name"
						placeholder="e.g. Anderson"
						className={field}
						{...aria("lastName")}
					/>
					{err("lastName")}
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="c-email" className={label}>
						Email Address <span className="text-[var(--ct-cyan)]">*</span>
					</label>
					<input
						id="c-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="e.g. neo@matrix.com"
						className={field}
						{...aria("email")}
					/>
					{err("email")}
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="c-order" className={label}>
						Order Number
					</label>
					<input id="c-order" name="order" placeholder="Optional (e.g. #WWV-10492)" className={field} />
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="c-subject" className={label}>
					Subject <span className="text-[var(--ct-cyan)]">*</span>
				</label>
				<div className="relative">
					<select id="c-subject" name="subject" className={`${field} appearance-none pr-10`}>
						{SUBJECTS.map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
					<Image
						src="/home/contact/chevron.svg"
						alt=""
						width={14}
						height={14}
						className="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2"
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="c-message" className={label}>
					Message <span className="text-[var(--ct-cyan)]">*</span>
				</label>
				<textarea
					id="c-message"
					name="message"
					rows={5}
					placeholder="Type your message here..."
					className={`${field} h-[122px] resize-y py-[14px] md:h-[144px]`}
					{...aria("message")}
				/>
				{err("message")}
			</div>
			<div className="flex flex-col gap-3">
				<button
					type="submit"
					disabled={status.kind === "sending"}
					className={`${heyComic} flex items-center justify-center rounded bg-[var(--ct-cyan)] px-7 py-[14px] text-xs uppercase text-[var(--ct-ink)] shadow-[0_0_6px_rgba(0,255,224,0.4)] disabled:opacity-60`}
				>
					{status.kind === "sending" ? "Sending…" : "Send Message"}
				</button>
				<p className="flex items-center justify-center gap-[6px] text-[11px] text-[var(--ct-text)]">
					<Image src="/home/contact/shield.svg" alt="" width={12} height={12} />
					Your information is safe with us
				</p>
				{status.kind === "sent" && (
					<p
						role="status"
						className="rounded border border-[var(--ct-cyan)] bg-[var(--ct-field)] px-4 py-3 text-center text-[13px] text-[var(--ct-cyan)]"
					>
						Message sent ✓ Thanks. We usually reply within 24 hours.
					</p>
				)}
				{status.kind === "error" && (
					<p
						role="alert"
						className="rounded border border-[var(--q-red)] px-4 py-3 text-center text-[13px] text-[var(--q-red)]"
					>
						{status.text}
					</p>
				)}
				{status.kind === "fallback" && (
					<p
						role="status"
						className="border-[var(--ct-cyan)]/30 rounded border bg-[var(--ct-field)] px-4 py-3 text-center text-[13px] text-[var(--ct-text)]"
					>
						Online sending isn&apos;t switched on yet.{" "}
						<a href={status.href} className="text-[var(--ct-cyan)] underline">
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
									className="text-[var(--ct-cyan)] underline"
								>
									Message us on WhatsApp
								</a>
								.
							</>
						)}
					</p>
				)}
			</div>
		</form>
	);
}
