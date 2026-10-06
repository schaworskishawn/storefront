import { nextPayment, remainingCents, type InstallmentRecord, type ScheduledPayment } from "./record";

/**
 * The emails the plan sends, as plain text built from the record. Pure, so the wording (the amounts, dates and what the
 * shopper should do) is unit-tested. The shopper is told the schedule up front, reminded before each payment, and told
 * plainly when a payment fails, because stored-card payments have to be transparent to be legitimate.
 */

const SHOP = "Worldwide Vapor";

export type EmailContent = { subject: string; text: string };

export function formatCents(cents: number, currency: string): string {
	return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}

/** `2026-10-20` as "October 20, 2026". Due dates are calendar dates, so no timezone shifting. */
export function formatDueDate(isoDate: string): string {
	return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${isoDate}T00:00:00Z`),
	);
}

const scheduleLines = (record: InstallmentRecord): string[] => [
	`  Today: ${formatCents(record.depositCents, record.currency)} (paid)`,
	...record.payments.map(
		(payment) =>
			`  ${formatDueDate(payment.dueOn)}: ${formatCents(payment.amountCents, record.currency)}${
				payment.status === "paid" ? " (paid)" : ""
			}`,
	),
];

const signOff = `Questions? Just reply to this email.\n\n${SHOP}`;

type Ctx = { orderNumber: string; record: InstallmentRecord };

/** Sent when the plan is set up. */
export function planStartedEmail({ orderNumber, record }: Ctx): EmailContent {
	return {
		subject: `Your ${SHOP} order #${orderNumber}: your payment schedule`,
		text: [
			`Thanks for your order #${orderNumber}. You chose to pay in 4, with no interest or fees.`,
			"",
			"Your payments:",
			...scheduleLines(record),
			"",
			"We'll charge the card you used for the remaining payments on those dates, and email you a couple of days before each one.",
			"Your order will ship once the last payment has gone through.",
			"",
			signOff,
		].join("\n"),
	};
}

export function reminderEmail({ orderNumber, record }: Ctx, payment: ScheduledPayment): EmailContent {
	const amount = formatCents(payment.amountCents, record.currency);
	return {
		subject: `Reminder: ${amount} will be charged on ${formatDueDate(payment.dueOn)} (order #${orderNumber})`,
		text: [
			`Payment ${payment.number + 1} of 4 for your order #${orderNumber} (${amount}) will be charged to your card on ${formatDueDate(payment.dueOn)}.`,
			"",
			"Nothing to do if your card is good. If it has changed or expired, reply to this email before then and we'll sort it out.",
			"",
			signOff,
		].join("\n"),
	};
}

export function paymentReceivedEmail({ orderNumber, record }: Ctx, payment: ScheduledPayment): EmailContent {
	const amount = formatCents(payment.amountCents, record.currency);
	const upcoming = nextPayment(record);
	return {
		subject: `Payment received: ${amount} for order #${orderNumber}`,
		text: [
			`We received payment ${payment.number + 1} of 4 (${amount}) for your order #${orderNumber}. Thank you.`,
			"",
			...(upcoming
				? [
						`Remaining: ${formatCents(remainingCents(record), record.currency)}. Next payment: ${formatCents(upcoming.amountCents, record.currency)} on ${formatDueDate(upcoming.dueOn)}.`,
						"",
					]
				: []),
			signOff,
		].join("\n"),
	};
}

/** The last payment: the order is paid and will ship. */
export function planCompleteEmail({ orderNumber, record }: Ctx, payment: ScheduledPayment): EmailContent {
	return {
		subject: `Paid in full: order #${orderNumber}`,
		text: [
			`We received your final payment (${formatCents(payment.amountCents, record.currency)}). Order #${orderNumber} is paid in full and will ship shortly.`,
			"",
			"We've deleted the card details we saved for your payments.",
			"",
			signOff,
		].join("\n"),
	};
}

export function paymentFailedEmail(
	{ orderNumber, record }: Ctx,
	payment: ScheduledPayment,
	retryOn: string,
): EmailContent {
	const amount = formatCents(payment.amountCents, record.currency);
	return {
		subject: `We couldn't take your payment for order #${orderNumber}`,
		text: [
			`We tried to charge ${amount} (payment ${payment.number + 1} of 4) to your card for order #${orderNumber}, but it was declined.`,
			"",
			`We'll try again on ${formatDueDate(retryOn)}. If your card has changed, or you'd like to pay another way, reply to this email.`,
			"Your order won't ship until all payments are made.",
			"",
			signOff,
		].join("\n"),
	};
}

export function planDefaultedEmail({ orderNumber, record }: Ctx, payment: ScheduledPayment): EmailContent {
	return {
		subject: `Action needed: payment for order #${orderNumber}`,
		text: [
			`We weren't able to collect payment ${payment.number + 1} of 4 (${formatCents(payment.amountCents, record.currency)}) for your order #${orderNumber} after several tries, so we've stopped charging your card.`,
			"",
			"Please reply to this email so we can work out how to finish or cancel your order. Your order hasn't shipped.",
			"",
			signOff,
		].join("\n"),
	};
}

export type AlertKind =
	| "defaulted"
	| "needs-review"
	| "setup-failed"
	| "deposit-mismatch"
	| "unreadable-plan"
	| "report-failed"
	| "save-failed";

const ALERT_TITLES: Record<AlertKind, string> = {
	defaulted: "A pay-in-4 payment failed every attempt",
	"needs-review": "A pay-in-4 payment needs checking",
	"setup-failed": "A pay-in-4 plan could not be set up",
	"deposit-mismatch": "A pay-in-4 deposit doesn't match the order",
	"unreadable-plan": "A pay-in-4 plan record is damaged",
	"report-failed": "A pay-in-4 payment was taken but Saleor wasn't updated",
	"save-failed": "A pay-in-4 payment was taken but not recorded",
};

/** What to tell staff. Each alert says what happened and what to check, because nobody is watching the job. */
export function staffAlert(kind: AlertKind, orderNumber: string, detail: string): EmailContent {
	return {
		subject: `[Pay in 4] ${ALERT_TITLES[kind]} (order #${orderNumber})`,
		text: [
			`${ALERT_TITLES[kind]} on order #${orderNumber}.`,
			"",
			detail,
			"",
			'See docs/payments-setup.md, "Pay in 4", for what to do.',
		].join("\n"),
	};
}
