import { centsForTokens } from "./tokens";

/**
 * The emails and notes the rewards program sends, as plain text built from the facts. Pure, so the wording (what was
 * earned, what it is worth, when it expires) is unit-tested.
 */

const SHOP = "Worldwide Vapor";

export type EmailContent = { subject: string; text: string };

export function formatCents(cents: number, currency: string): string {
	return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}

export const formatTokens = (tokens: number): string => new Intl.NumberFormat("en-CA").format(tokens);

/** `2027-10-06` as "October 6, 2027". Expiry dates are calendar dates, so no timezone shifting. */
export function formatDate(isoDate: string): string {
	return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${isoDate}T00:00:00Z`),
	);
}

const signOff = `Questions? Just reply to this email.\n\n${SHOP}`;

type Earned = { orderNumber: string; tokens: number; currency: string; expiryDate: string | null };

export function tokensEarnedEmail({ orderNumber, tokens, currency, expiryDate }: Earned): EmailContent {
	const worth = formatCents(centsForTokens(tokens), currency);
	return {
		subject: `You earned ${formatTokens(tokens)} Vapor Tokens on order #${orderNumber}`,
		text: [
			`Thanks for your order #${orderNumber}. It's paid in full, and you earned ${formatTokens(tokens)} Vapor Tokens (worth ${worth}).`,
			"",
			"Spend them at checkout while you're signed in: they come off your total. 100 tokens take $1.00 off.",
			expiryDate
				? `These tokens expire on ${formatDate(expiryDate)}, so use them before then.`
				: "These tokens don't expire.",
			"",
			signOff,
		].join("\n"),
	};
}

export function tokensReturnedEmail({
	orderNumber,
	tokens,
	currency,
}: {
	orderNumber: string;
	tokens: number;
	currency: string;
}): EmailContent {
	return {
		subject: `Your Vapor Tokens were returned (order #${orderNumber})`,
		text: [
			`Order #${orderNumber} was cancelled, so the ${formatTokens(tokens)} Vapor Tokens (worth ${formatCents(centsForTokens(tokens), currency)}) you used on it are back in your account.`,
			"",
			signOff,
		].join("\n"),
	};
}

export type AlertKind =
	| "create-failed"
	| "code-missing"
	| "duplicate-lots"
	| "restore-failed"
	| "clawback-failed";

const ALERT_TITLES: Record<AlertKind, string> = {
	"create-failed": "Vapor Tokens could not be awarded",
	"code-missing": "A Vapor Tokens lot has no stored code",
	"duplicate-lots": "Vapor Tokens were awarded twice for one order",
	"restore-failed": "Vapor Tokens could not be returned",
	"clawback-failed": "Vapor Tokens could not be taken back",
};

/** What to tell staff. Each alert says what happened and what to check, because nobody is watching the webhook. */
export function staffAlert(kind: AlertKind, orderNumber: string, detail: string): EmailContent {
	return {
		subject: `[Vapor Tokens] ${ALERT_TITLES[kind]} (order #${orderNumber})`,
		text: [
			`${ALERT_TITLES[kind]} on order #${orderNumber}.`,
			"",
			detail,
			"",
			'See docs/payments-setup.md, "Vapor Tokens", for what to do.',
		].join("\n"),
	};
}
