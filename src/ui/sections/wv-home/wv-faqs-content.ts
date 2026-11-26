import {
	AFFILIATE_TIERS,
	COMMISSION_HOLD_DAYS,
	PAYOUT_MINIMUM_CENTS,
	REFERRAL_COOKIE_DAYS,
	TOKEN_BONUS_BPS,
	rateLabel,
} from "@/lib/affiliates/tiers";
import { DISTRIBUTOR_TIERS, discountLabel, minimumLabel } from "@/lib/distributors/tiers";
import { describeProgram, formatDollars } from "@/lib/rewards/program-copy";
import type { Faq } from "./wv-faqs-client";

/**
 * The FAQ page's questions and answers, written from what the rest of the site says, so the answers match those pages:
 * - payments: the payments page (wv-payments.tsx);
 * - shipping: the shipping page (wv-shipping.tsx);
 * - returns: the returns page (wv-returns.tsx);
 * - orders and age: the terms (lib/legal/terms.ts);
 * - the programs: their own settings. The distributor tiers, the affiliate rates and payouts, Vapor Tokens and Pay in 4
 *   are worded from their numbers, so an answer can't promise a rate the store isn't using.
 *
 * Pay in 4 and Vapor Tokens are only mentioned while they are switched on, as on the payments page. Answers are plain
 * text, because the page's search matches against them.
 */

export type FaqSettings = {
	/** The Pay in 4 description (describePayIn4), or null while it can't be used. */
	payIn4: string | null;
	/** The Vapor Tokens program's numbers, or null while it's switched off. */
	rewards: { tokensPerDollar: number; expiryMonths: number } | null;
};

export const SUPPORT_EMAIL = "support@worldwidevapor.com";

export function buildFaqs({ payIn4, rewards }: FaqSettings): Faq[] {
	const firstDist = DISTRIBUTOR_TIERS[0]!;
	const lastDist = DISTRIBUTOR_TIERS[DISTRIBUTOR_TIERS.length - 1]!;
	const firstAff = AFFILIATE_TIERS[0]!;
	const lastAff = AFFILIATE_TIERS[AFFILIATE_TIERS.length - 1]!;

	const extras = [rewards ? "Vapor Tokens" : null, payIn4 ? "Pay in 4" : null].filter(Boolean).join(" and ");

	const faqs: (Faq | null)[] = [
		{
			q: "What payment methods do you accept?",
			a:
				"We accept Visa, Mastercard, Discover and American Express, Interac e-Transfer from a Canadian bank, crypto " +
				"(Bitcoin, Ethereum and major stablecoins) and gift cards" +
				(extras ? `, and you can use ${extras} at checkout` : "") +
				". Card numbers go straight to a PCI DSS Level 1 processor, and we never add a fee for any way to pay.",
			link: { href: "/payments", label: "Payment methods" },
		},
		{
			q: "How long does shipping take?",
			a:
				"Orders placed before 2PM EST, Monday to Friday, are processed and handed to the carrier the same business " +
				"day. Standard shipping then takes 3-5 business days (free on orders over $115, otherwise $4.99), Express " +
				"takes 1-2 business days ($9.99), and Overnight arrives the next business day ($24.99).",
			link: { href: "/shipping", label: "Shipping details" },
		},
		{
			q: "Where can I find my tracking number?",
			a:
				"We email you a tracking link as soon as your order ships. If your package is running late, contact support " +
				"with your tracking number and we'll open a trace with the carrier.",
			link: { href: "/contact-us", label: "Contact support" },
		},
		{
			q: "Can I change or cancel my order?",
			a:
				`Email ${SUPPORT_EMAIL} with your order number as soon as you can. Orders placed before 2PM EST on a ` +
				"weekday are usually handed to the carrier the same business day, so changes and cancellations are only " +
				"possible before your order ships. Once it's on its way, eligible items can be returned within 15 days of " +
				"delivery.",
			link: { href: "/contact-us", label: "Contact support" },
		},
		{
			q: "Do you ship internationally?",
			a:
				"Yes, we ship to most major destinations worldwide, subject to local import rules. The recipient pays any " +
				"customs, import duties and taxes charged in their country. Every package ships in plain packaging with " +
				"neutral labelling.",
			link: { href: "/shipping", label: "Shipping details" },
		},
		{
			q: "How do I return a product?",
			a:
				"Unopened hardware, sealed coils and unused accessories in their original condition can be returned within " +
				"15 days of delivery. Opened e-liquids, unboxed disposables, and clearance, final-sale or mystery items " +
				"can't be returned. Start a return with your order details, pack the items in their original packaging and " +
				"send them with the prepaid label we provide (a flat $4.99 return postage fee is deducted). Your refund goes " +
				"to your original payment method within 3-5 business days of the parcel being scanned, or choose an " +
				"exchange for store credit instead. Damaged or defective items are fully covered.",
			link: { href: "/returns", label: "Returns & refunds" },
		},
		{
			q: "Are your products authentic?",
			a:
				"Yes. Everything we sell is genuine and fully certified, from brands like GeekVape, SMOK, Lost Vape, Aspire " +
				"and Freemax, plus our own Worldwide Vapor e-liquids, and every order ships sealed. Anything that arrives " +
				"damaged or defective is fully covered by our quality guarantee.",
			link: { href: "/returns", label: "Our quality guarantee" },
		},
		{
			q: "Do I need to verify my age?",
			a:
				"Yes. Our products are for adults only: you must be at least 18, and of legal smoking age where you live. " +
				"Your age is verified at checkout, and we may ask for government-issued ID, including at delivery. If we " +
				"can't verify your age, we may cancel your order and refund you in full.",
			link: { href: "/age-verification", label: "Age verification" },
		},
		payIn4
			? {
					q: "Can I pay in installments?",
					a: `Yes, with ${payIn4}`,
					link: { href: "/payments", label: "Payment methods" },
				}
			: null,
		rewards
			? {
					q: "What are Vapor Tokens?",
					a: `Vapor Tokens are our rewards. ${describeProgram(rewards)}`,
					link: { href: "/rewards", label: "How Vapor Tokens work" },
				}
			: null,
		{
			q: "Do you offer wholesale or distributor pricing?",
			a:
				`Yes. Approved businesses buy at ${discountLabel(firstDist)} to ${discountLabel(lastDist)} off list ` +
				`price, by tier: from ${discountLabel(firstDist)} off on orders of ${minimumLabel(firstDist)}+ ` +
				`(${firstDist.name}) up to ${discountLabel(lastDist)} off on orders of ${minimumLabel(lastDist)}+ ` +
				`(${lastDist.name}). Apply on our distributor page while signed in to your account. We verify every ` +
				"business by hand and set your tier, usually within 48 business hours. Your wholesale prices then show " +
				"on every product, and checkout charges them once your cart reaches your tier's minimum.",
			link: { href: "/distributor", label: "Distributor program" },
		},
		{
			q: "Do you have an affiliate program?",
			a:
				`Yes. Share your link and earn ${rateLabel(firstAff)} to ${rateLabel(lastAff)} commission on the orders ` +
				`it brings in, rising with your sales, with a ${REFERRAL_COOKIE_DAYS}-day cookie. Commission becomes ` +
				`payable ${COMMISSION_HOLD_DAYS} days after an order is paid, from a ${formatDollars(PAYOUT_MINIMUM_CENTS)} ` +
				"minimum, and is paid " +
				(rewards
					? `in Vapor Tokens with a ${TOKEN_BONUS_BPS / 100}% bonus, or in crypto or by Interac e-Transfer.`
					: "in crypto or by Interac e-Transfer."),
			link: { href: "/affiliate-program", label: "Affiliate program" },
		},
	];
	return faqs.filter((faq): faq is Faq => faq !== null);
}
