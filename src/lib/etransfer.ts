/**
 * Interac e-Transfer — a manual, pay-after-order method (Canada only).
 *
 * Unlike card/wallet methods there is no payment app: the shopper places the order unpaid, we email and show the
 * transfer details, and staff mark the order paid in the Saleor Dashboard once the money arrives (which fires
 * ORDER_FULLY_PAID, so ShipStation/Xero sync only then).
 *
 * The transfer details are written to the checkout's public metadata just before the order is created. Saleor copies
 * checkout metadata onto the order, so the confirmation page and the email both read the same record and the page
 * never needs the recipient address from env.
 *
 * Configure with (see .env.example):
 *   NEXT_PUBLIC_ENABLE_ETRANSFER  "true" shows the option in checkout
 *   ETRANSFER_EMAIL               the address customers send the transfer to (server-only)
 *   ETRANSFER_DEADLINE_HOURS      optional, default 48
 *   ETRANSFER_SECURITY_QUESTION / ETRANSFER_SECURITY_ANSWER  optional — leave empty if the account uses auto-deposit
 *
 * Saleor side: the channel must have "Allow unpaid orders" switched on (Dashboard → Configuration → Channels).
 */

export const ETRANSFER_METHOD = "etransfer";
/** Interac e-Transfer only moves Canadian dollars between Canadian accounts. */
export const ETRANSFER_CURRENCY = "CAD";
export const ETRANSFER_DEFAULT_DEADLINE_HOURS = 48;

export const ETRANSFER_METADATA_KEYS = {
	method: "payment_method",
	recipient: "etransfer_recipient",
	dueAt: "etransfer_due_at",
	question: "etransfer_question",
	answer: "etransfer_answer",
} as const;

export type MetadataEntry = { key: string; value: string };

export type ETransferConfig = {
	recipient: string;
	deadlineHours: number;
	/** Both set, or both null: with auto-deposit there is no question to answer. */
	question: string | null;
	answer: string | null;
};

export type ETransferDetails = {
	recipient: string;
	dueAt: Date | null;
	question: string | null;
	answer: string | null;
};

/** Client-safe: whether the option is switched on (the real check, including the recipient, runs on the server). */
export function isETransferEnabled(): boolean {
	return process.env.NEXT_PUBLIC_ENABLE_ETRANSFER === "true";
}

/**
 * Currencies the option is offered in. CAD only unless `NEXT_PUBLIC_ETRANSFER_CURRENCIES` says otherwise (e.g. a
 * USD-priced channel where you accept the CAD equivalent). Client-safe: reads the literal NEXT_PUBLIC_ variable so
 * Next inlines it into the browser bundle.
 */
export function allowedETransferCurrencies(): string[] {
	const raw = process.env.NEXT_PUBLIC_ETRANSFER_CURRENCIES;
	const list = (raw ?? "")
		.split(",")
		.map((code) => code.trim().toUpperCase())
		.filter((code) => /^[A-Z]{3}$/.test(code));
	return list.length > 0 ? list : [ETRANSFER_CURRENCY];
}

export function isETransferCurrency(currency: string | null | undefined): boolean {
	return currency ? allowedETransferCurrencies().includes(currency.toUpperCase()) : false;
}

/**
 * Countries the option is offered to — an Interac e-Transfer needs a Canadian bank account, so Canada only unless
 * `NEXT_PUBLIC_ETRANSFER_COUNTRIES` (comma-separated ISO codes) says otherwise. Client-safe, like the currency list.
 */
export function allowedETransferCountries(): string[] {
	const raw = process.env.NEXT_PUBLIC_ETRANSFER_COUNTRIES;
	const list = (raw ?? "")
		.split(",")
		.map((code) => code.trim().toUpperCase())
		.filter((code) => /^[A-Z]{2}$/.test(code));
	return list.length > 0 ? list : ["CA"];
}

/** Unknown country (no address yet) passes: the server re-checks the real address when the order is placed. */
export function isETransferCountry(countryCode: string | null | undefined): boolean {
	return countryCode ? allowedETransferCountries().includes(countryCode.toUpperCase()) : true;
}

/** An Interac e-Transfer is always sent in Canadian dollars, so a non-CAD order needs a "send the CAD equivalent" note. */
export function needsCurrencyConversionNote(currency: string | null | undefined): boolean {
	return Boolean(currency) && currency!.toUpperCase() !== ETRANSFER_CURRENCY;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server-side config. Null when the option is off or the recipient address is missing or invalid. */
export function readETransferConfig(
	env: Record<string, string | undefined> = process.env,
): ETransferConfig | null {
	const enabled = env.NEXT_PUBLIC_ENABLE_ETRANSFER === "true" || env.ENABLE_ETRANSFER === "true";
	if (!enabled) return null;

	const recipient = env.ETRANSFER_EMAIL?.trim();
	if (!recipient || !EMAIL_PATTERN.test(recipient)) return null;

	const parsedHours = Number(env.ETRANSFER_DEADLINE_HOURS);
	const deadlineHours =
		Number.isFinite(parsedHours) && parsedHours > 0 && parsedHours <= 24 * 30
			? Math.round(parsedHours)
			: ETRANSFER_DEFAULT_DEADLINE_HOURS;

	const question = env.ETRANSFER_SECURITY_QUESTION?.trim() || null;
	const answer = env.ETRANSFER_SECURITY_ANSWER?.trim() || null;
	// A question without an answer (or the reverse) cannot work for the sender, so treat it as auto-deposit.
	const hasPair = Boolean(question && answer);

	return {
		recipient,
		deadlineHours,
		question: hasPair ? question : null,
		answer: hasPair ? answer : null,
	};
}

/** The checkout public metadata that marks an order as an e-Transfer order and records how to pay it. */
export function buildETransferMetadata(config: ETransferConfig, now: Date): MetadataEntry[] {
	const dueAt = new Date(now.getTime() + config.deadlineHours * 60 * 60 * 1000);
	return [
		{ key: ETRANSFER_METADATA_KEYS.method, value: ETRANSFER_METHOD },
		{ key: ETRANSFER_METADATA_KEYS.recipient, value: config.recipient },
		{ key: ETRANSFER_METADATA_KEYS.dueAt, value: dueAt.toISOString() },
		...(config.question && config.answer
			? [
					{ key: ETRANSFER_METADATA_KEYS.question, value: config.question },
					{ key: ETRANSFER_METADATA_KEYS.answer, value: config.answer },
				]
			: []),
	];
}

/** Reads the transfer details back off an order's (or checkout's) metadata; null if it is not an e-Transfer order. */
export function parseETransferDetails(
	metadata: ReadonlyArray<MetadataEntry> | null | undefined,
): ETransferDetails | null {
	const get = (key: string) => metadata?.find((entry) => entry.key === key)?.value?.trim() || null;

	if (get(ETRANSFER_METADATA_KEYS.method) !== ETRANSFER_METHOD) return null;

	const recipient = get(ETRANSFER_METADATA_KEYS.recipient);
	if (!recipient) return null;

	const due = get(ETRANSFER_METADATA_KEYS.dueAt);
	const dueDate = due ? new Date(due) : null;
	const question = get(ETRANSFER_METADATA_KEYS.question);
	const answer = get(ETRANSFER_METADATA_KEYS.answer);
	const hasPair = Boolean(question && answer);

	return {
		recipient,
		dueAt: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
		question: hasPair ? question : null,
		answer: hasPair ? answer : null,
	};
}

/** The message the sender must put on the transfer so we can match it to the order. */
export function eTransferReference(orderNumber: string | number): string {
	return `Order #${orderNumber}`;
}

const escapeHtml = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function formatETransferAmount(amount: number, currency: string, locale = "en-CA"): string {
	return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

function formatDeadline(date: Date, locale = "en-CA"): string {
	return date.toLocaleString(locale, {
		weekday: "long",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: "America/Winnipeg",
		timeZoneName: "short",
	});
}

type EmailInput = {
	orderNumber: string | number;
	amount: number;
	currency: string;
	details: ETransferDetails;
	/** Absolute link back to the order page, if known. */
	orderUrl?: string | null;
	storeName?: string;
};

/** Plain-text + HTML email telling the customer exactly how to pay. */
export function buildETransferEmail({
	orderNumber,
	amount,
	currency,
	details,
	orderUrl,
	storeName = "Worldwide Vapor",
}: EmailInput): { subject: string; text: string; html: string } {
	const reference = eTransferReference(orderNumber);
	const total = formatETransferAmount(amount, currency);
	const deadline = details.dueAt ? formatDeadline(details.dueAt) : null;

	const rows: Array<[string, string]> = [
		["Amount", total],
		["Send to", details.recipient],
		["Message", reference],
	];
	if (details.question && details.answer) {
		rows.push(["Security question", details.question], ["Security answer", details.answer]);
	}
	if (deadline) rows.push(["Pay by", deadline]);

	const autoDeposit =
		details.question && details.answer
			? null
			: "No security question is needed — our account uses Interac auto-deposit, so the money goes straight in.";

	const subject = `${reference} — send your Interac e-Transfer`;

	const text = [
		`Thanks for your order with ${storeName}!`,
		"",
		`Your order ${reference} is reserved. We ship it as soon as your Interac e-Transfer arrives.`,
		"",
		"To pay, send an Interac e-Transfer from your bank with these details:",
		"",
		...rows.map(([label, value]) => `  ${label}: ${value}`),
		"",
		"Please put the message exactly as shown so we can match your payment to your order.",
		...(needsCurrencyConversionNote(currency)
			? [
					`Your order total is in ${currency.toUpperCase()}, but Interac e-Transfers are sent in Canadian dollars — please send the CAD equivalent at the current exchange rate.`,
				]
			: []),
		...(autoDeposit ? [autoDeposit] : []),
		...(deadline ? [`If we haven't received it by the time above, your order may be cancelled.`] : []),
		...(orderUrl ? ["", `You can see these instructions again any time: ${orderUrl}`] : []),
		"",
		`Questions? Just reply to this email.`,
		`— ${storeName}`,
	].join("\n");

	const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
<h2 style="margin:0 0 12px">Send your Interac e-Transfer</h2>
<p>Thanks for your order with ${escapeHtml(storeName)}! Your order <strong>${escapeHtml(reference)}</strong> is reserved. We ship it as soon as your payment arrives.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0">
${rows
	.map(
		([label, value]) =>
			`<tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f6f6f6;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #ddd"><strong>${escapeHtml(value)}</strong></td></tr>`,
	)
	.join("\n")}
</table>
<p>Please put the message exactly as shown so we can match your payment to your order.</p>
${needsCurrencyConversionNote(currency) ? `<p><strong>Your order total is in ${escapeHtml(currency.toUpperCase())}, but Interac e-Transfers are sent in Canadian dollars — please send the CAD equivalent at the current exchange rate.</strong></p>` : ""}
${autoDeposit ? `<p>${escapeHtml(autoDeposit)}</p>` : ""}
${deadline ? `<p>If we haven't received it by the time above, your order may be cancelled.</p>` : ""}
${orderUrl ? `<p><a href="${escapeHtml(orderUrl)}">See these instructions again</a></p>` : ""}
<p>Questions? Just reply to this email.<br>— ${escapeHtml(storeName)}</p>
</div>`;

	return { subject, text, html };
}
