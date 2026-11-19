import { formatCents } from "./ledger";
import { referralLink } from "./referral";
import type { Payout } from "./records";

/** The emails the affiliate program sends. Plain text: `sendEmail` wraps it for HTML. */

type Email = { subject: string; text: string };

const greeting = (name: string) => `Hi ${name.split(" ")[0] || "there"},`;

export function approvalEmail({ name, code, origin }: { name: string; code: string; origin: string }): Email {
	const base = origin.replace(/\/+$/, "");
	return {
		subject: "You're in: welcome to the Worldwide Vapor affiliate program",
		text: [
			greeting(name),
			"",
			"Your affiliate application has been approved.",
			"",
			`Your referral code: ${code}`,
			`Your referral link: ${referralLink(base, code)}`,
			"",
			"Share the link (you can add ?aff=" +
				code +
				" to any page of the shop). Anyone who follows it is remembered for 30 days, and every order they pay for counts towards your monthly sales.",
			"",
			`Your dashboard shows your sales, tier, commission and payouts: ${base}/account/affiliate`,
			"",
			"Commission becomes payable 15 days after an order is paid, once the return window has passed.",
			"",
			"Welcome aboard,",
			"Worldwide Vapor",
		].join("\n"),
	};
}

export function payoutEmail({
	name,
	payout,
	origin,
}: {
	name: string;
	payout: Payout;
	origin: string;
}): Email {
	const lines = Object.entries(payout.amounts).map(
		([currency, cents]) => `  ${formatCents(cents, currency)}`,
	);
	return {
		subject: "Your Worldwide Vapor affiliate payout has been sent",
		text: [
			greeting(name),
			"",
			"We've sent your affiliate payout:",
			...lines,
			payout.method ? `Method: ${payout.method}` : "",
			payout.note ? `Note: ${payout.note}` : "",
			"",
			`See it in your dashboard: ${origin.replace(/\/+$/, "")}/account/affiliate`,
			"",
			"Thanks for sharing Worldwide Vapor,",
			"Worldwide Vapor",
		]
			.filter((line, i, all) => line !== "" || all[i - 1] !== "")
			.join("\n"),
	};
}

const dashboard = (origin: string) => `${origin.replace(/\/+$/, "")}/account/affiliate`;

export function tokenPayoutEmail({
	name,
	tokens,
	currency,
	coveredCents,
	bonusPercent,
	origin,
}: {
	name: string;
	tokens: number;
	currency: string;
	coveredCents: number;
	bonusPercent: number;
	origin: string;
}): Email {
	return {
		subject: `Your affiliate payout: ${tokens.toLocaleString("en-US")} Vapor Tokens`,
		text: [
			greeting(name),
			"",
			`Your affiliate commission of ${formatCents(coveredCents, currency)} has been paid as ${tokens.toLocaleString("en-US")} Vapor Tokens, with your +${bonusPercent}% bonus.`,
			"",
			'They\'re in your account now and never expire. Use them at checkout with the "Use my tokens" button.',
			"",
			`Your dashboard: ${dashboard(origin)}`,
			"",
			"Thanks for sharing Worldwide Vapor,",
			"Worldwide Vapor",
		].join("\n"),
	};
}

export function cryptoPayoutEmail({
	name,
	coin,
	amount,
	address,
	origin,
}: {
	name: string;
	coin: string;
	amount: number;
	address: string;
	origin: string;
}): Email {
	return {
		subject: `Your affiliate payout is on its way: ${amount} ${coin}`,
		text: [
			greeting(name),
			"",
			`We've sent your affiliate payout of ${amount} ${coin} to the wallet ending ${address.slice(-6)}. Network confirmations can take a few minutes.`,
			"",
			`Your dashboard: ${dashboard(origin)}`,
			"",
			"Thanks for sharing Worldwide Vapor,",
			"Worldwide Vapor",
		].join("\n"),
	};
}

export function payoutDetailsChangedEmail({
	name,
	description,
	walletHoldHours,
	origin,
}: {
	name: string;
	description: string;
	walletHoldHours: number | null;
	origin: string;
}): Email {
	return {
		subject: "Your Worldwide Vapor payout details were changed",
		text: [
			greeting(name),
			"",
			`Your affiliate payouts will now go to: ${description}.`,
			walletHoldHours
				? `For your security, nothing is sent to a new wallet for ${walletHoldHours} hours.`
				: "",
			"",
			`If you didn't make this change, sign in, change your password and set your payout details back right away: ${dashboard(origin)}`,
			"",
			"Worldwide Vapor",
		]
			.filter((line, i, all) => line !== "" || all[i - 1] !== "")
			.join("\n"),
	};
}

export type DigestLine = {
	section: "cash" | "held" | "wallets" | "failed" | "flags" | "problems";
	text: string;
};

const DIGEST_TITLES: Record<DigestLine["section"], string> = {
	cash: "Cash payouts to send (crypto and e-Transfer)",
	held: "Token payouts waiting for your OK",
	wallets: "New crypto wallets to whitelist in NOWPayments",
	failed: "Crypto payouts that failed (owed again)",
	flags: "AI reviewer flags",
	problems: "Problems",
};

/** The owner's daily email: only what needs them, grouped, with a link to the admin page. */
export function ownerDigestEmail(lines: readonly DigestLine[], origin: string): Email {
	const sections = (Object.keys(DIGEST_TITLES) as DigestLine["section"][])
		.map((section) => ({ section, items: lines.filter((l) => l.section === section) }))
		.filter((s) => s.items.length > 0);
	return {
		subject: `Affiliates: ${lines.length} thing${lines.length === 1 ? "" : "s"} need${lines.length === 1 ? "s" : ""} you`,
		text: [
			...sections.flatMap((s) => [DIGEST_TITLES[s.section], ...s.items.map((i) => `- ${i.text}`), ""]),
			`Open the affiliate admin: ${origin.replace(/\/+$/, "")}/affiliate-admin`,
		].join("\n"),
	};
}

export function weeklyReportEmail(
	review: {
		summary: string;
		flags: Array<{ code: string; severity: string; reason: string; suggestedAction: string }>;
	},
	held: readonly string[],
	origin: string,
): Email {
	return {
		subject: review.flags.length
			? `Affiliate weekly review: ${review.flags.length} flag${review.flags.length === 1 ? "" : "s"}`
			: "Affiliate weekly review: nothing flagged",
		text: [
			"This week's AI review of the affiliate program (advice only; it can't pay, pause or remove anyone).",
			"",
			review.summary,
			"",
			...review.flags.flatMap((f) => [
				`[${f.severity.toUpperCase()}] ${f.code}: ${f.reason}`,
				f.suggestedAction ? `  Suggested: ${f.suggestedAction}` : "",
			]),
			held.length
				? `\nAutomatic payouts are now held for: ${held.join(", ")}. Clear the hold on the admin page once you've checked.`
				: "",
			"",
			`Open the affiliate admin: ${origin.replace(/\/+$/, "")}/affiliate-admin`,
		]
			.filter((line) => line !== "")
			.join("\n"),
	};
}
