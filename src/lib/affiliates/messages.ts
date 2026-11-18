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
