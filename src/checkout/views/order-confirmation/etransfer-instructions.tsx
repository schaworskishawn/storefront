"use client";

import { useState, type FC } from "react";
import { Check, Copy, Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	eTransferReference,
	formatETransferAmount,
	needsCurrencyConversionNote,
	type ETransferDetails,
} from "@/lib/etransfer";

type ETransferInstructionsProps = {
	details: ETransferDetails;
	orderNumber: string;
	amount: number;
	currency: string;
	/** BCP-47 locale for the amount and the deadline. */
	locale: string;
};

const display = "font-[family-name:var(--font-hey-comic)]";

/** Lets a long address wrap after "@" and "." instead of in the middle of a word (display only; Copy uses the real value). */
const softWrap = (value: string) => value.replace(/([@._-])/g, "$1​");

function CopyButton({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);
	const t = useTranslations("checkout.confirmation.etransfer");

	return (
		<button
			type="button"
			aria-label={`${t("copy")}: ${label}`}
			onClick={() => {
				void navigator.clipboard
					?.writeText(value)
					.then(() => {
						setCopied(true);
						window.setTimeout(() => setCopied(false), 1500);
					})
					.catch(() => undefined);
			}}
			className={`${display} inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primary/40 px-2.5 text-[11px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
		>
			{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
			{copied ? t("copied") : t("copy")}
		</button>
	);
}

type Row = {
	label: string;
	value: string;
	copy?: boolean;
	/** primary = cyan highlight (what to send), accent = pink (when it's due). */
	tone?: "primary" | "accent";
};

const toneClass = {
	primary: "text-primary",
	accent: "text-[var(--wv-pink)]",
	default: "text-foreground",
} as const;

/** How to pay an Interac e-Transfer order — the same details as the email, shown until staff mark the order paid. */
export const ETransferInstructions: FC<ETransferInstructionsProps> = ({
	details,
	orderNumber,
	amount,
	currency,
	locale,
}) => {
	const t = useTranslations("checkout.confirmation.etransfer");
	const reference = eTransferReference(orderNumber);
	const total = formatETransferAmount(amount, currency, locale);
	const deadline = details.dueAt
		? details.dueAt.toLocaleString(locale, {
				weekday: "long",
				month: "long",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			})
		: null;

	const rows: Row[] = [
		{ label: t("amount"), value: total, tone: "primary" },
		{ label: t("sendTo"), value: details.recipient, copy: true },
		{ label: t("message"), value: reference, copy: true, tone: "primary" },
	];
	if (details.question && details.answer) {
		rows.push(
			{ label: t("securityQuestion"), value: details.question },
			{ label: t("securityAnswer"), value: details.answer, copy: true },
		);
	}
	if (deadline) {
		rows.push({ label: t("payBy"), value: deadline, tone: "accent" });
	}

	return (
		<section
			aria-labelledby="etransfer-title"
			className="wv-card overflow-hidden rounded-xl border border-primary/50 bg-card"
		>
			<div className="flex items-start gap-3 border-b border-border p-4 md:p-5">
				<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-[0_0_12px_var(--wv-cyan-soft)]">
					<Landmark className="h-4 w-4" aria-hidden />
				</span>
				<div className="min-w-0">
					<h2
						id="etransfer-title"
						className="font-[family-name:var(--font-bungee)] text-base font-normal uppercase leading-snug tracking-wide text-foreground"
					>
						{t("title")}
					</h2>
					<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
				</div>
			</div>

			<dl className="divide-y divide-border">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 md:px-5"
					>
						<dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{row.label}</dt>
						<dd className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
							<span className={`break-words ${toneClass[row.tone ?? "default"]}`}>{softWrap(row.value)}</span>
							{row.copy ? <CopyButton value={row.value} label={row.label} /> : null}
						</dd>
					</div>
				))}
			</dl>

			<div className="space-y-2 border-t border-border bg-secondary/40 p-4 text-xs leading-relaxed text-muted-foreground md:p-5">
				{needsCurrencyConversionNote(currency) ? (
					<p className="font-medium text-foreground">
						{t("currencyNote", { currency: currency.toUpperCase() })}
					</p>
				) : null}
				<p>{t("matchNote")}</p>
				{details.question && details.answer ? null : <p>{t("autoDeposit")}</p>}
				<p>{t("emailNote")}</p>
			</div>
		</section>
	);
};
