import { COMMISSION_HOLD_DAYS, PAYOUT_MINIMUM_CENTS, REFERRAL_COOKIE_DAYS } from "@/lib/affiliates/tiers";
import { INSTALLMENT_INTERVAL_DAYS, LATER_PAYMENT_COUNT } from "@/lib/installments/plan";
import { formatDollars } from "@/lib/rewards/program-copy";
import { centsForTokens } from "@/lib/rewards/tokens";
import type { LegalSection } from "@/ui/sections/wv-home/wv-legal-client";

/**
 * Terms & Conditions copy. DRAFT: written from what the rest of the site says and does, so the terms match it:
 * - the payments, shipping, returns and age-verification pages;
 * - checkout: e-Transfer, crypto, Pay in 4;
 * - the programs: Vapor Tokens, affiliates, distributors.
 * Where a number comes from code (the Pay in 4 schedule, what tokens are worth, the affiliate hold and minimum), it's
 * read from there, so the terms can't drift from what the store does. Have it reviewed by a lawyer before relying on it.
 */
export const TERMS_UPDATED = "NOVEMBER 24, 2026";

const SUPPORT_EMAIL = "support@worldwidevapor.com";

export const TERMS_SECTIONS: LegalSection[] = [
	{
		id: "introduction",
		title: "Introduction",
		body: [
			"These Terms govern your use of the Worldwide Vapor website and everything you buy from us. By using our site, creating an account, or placing an order, you agree to these Terms. If you don't agree, please don't use the site.",
			"We sell vaping products to adults only, and we follow the age and sales rules that apply to vape products wherever we ship.",
		],
	},
	{
		id: "use-of-our-site",
		title: "Use of Our Site",
		body: [
			"You may use this site only for lawful purposes and in line with these Terms. You must be of legal smoking age in your jurisdiction, and never younger than 18, to access the site or buy from us.",
			"You agree not to misuse the site: no attempts to disrupt it, gain unauthorized access, scrape it at scale, or use it to send unsolicited messages. We may restrict or suspend access at any time if these Terms are broken.",
		],
	},
	{
		id: "products-and-orders",
		title: "Products & Orders",
		body: [
			"We do our best to describe and photograph products accurately, but colors, packaging and flavor names can vary slightly from what you see on screen.",
			"Placing an order is an offer to buy. We may accept, decline or cancel an order, for example because of stock, a pricing error, suspected fraud, or because we can't verify your age. If we cancel an order you have paid for, you will be refunded in full.",
			`To change or cancel an order, email ${SUPPORT_EMAIL} with your order number as soon as you can. Orders are usually handed to the carrier the same business day, so changes are only possible before your order ships; after that, eligible items can be returned.`,
		],
		link: { href: "/faqs", label: "Order FAQs" },
	},
	{
		id: "pricing-and-payment",
		title: "Pricing & Payment",
		body: [
			"Prices are shown in the currency displayed at checkout. Taxes, duties and shipping are shown or calculated at checkout and may vary by destination. We don't add a fee for any way to pay, though your bank or wallet may charge its usual costs.",
			"We accept Visa, Mastercard, Discover and American Express, Interac e-Transfer from a Canadian bank, crypto (Bitcoin, Ethereum and major stablecoins) and gift cards. Card numbers go straight to our PCI DSS Level 1 payment processor; we never store your full card details. By paying, you confirm you are authorized to use the payment method.",
			"An Interac e-Transfer order is placed first and shipped once your payment arrives; if it hasn't arrived by the time in your payment email, the order may be cancelled. Crypto payments are made on our crypto processor's secure page and count as paid only once the processor confirms them, which can take some time.",
			`Where Pay in 4 is offered at checkout, you pay a quarter of the order up front and the rest in ${LATER_PAYMENT_COUNT} equal payments every ${INSTALLMENT_INTERVAL_DAYS} days, with no interest or fees, and your order ships once the last payment is in. If a later payment is declined we'll try again and email you; if it still can't be taken, we'll contact you to finish or cancel the order.`,
		],
		link: { href: "/payments", label: "Payment methods and security" },
	},
	{
		id: "shipping-and-delivery",
		title: "Shipping & Delivery",
		body: [
			"Orders received before 2PM EST Monday to Friday are processed the same business day. Standard shipping then takes 3-5 business days (free on orders over $115, otherwise $4.99), Express 1-2 business days ($9.99), and Overnight arrives the next business day ($24.99). Delivery times are estimates, not guarantees.",
			"We email you a tracking link when your order ships. If a package is delayed, contact us with its tracking number and we'll open a trace with the carrier.",
			"For international orders, the recipient is responsible for any customs, import duties and taxes charged in their country. Packages ship in plain packaging with neutral labeling.",
		],
		link: { href: "/shipping", label: "Full shipping information" },
	},
	{
		id: "returns-and-refunds",
		title: "Returns & Refunds",
		body: [
			"Unopened hardware, sealed coils and unused accessories in original condition can be returned within 15 days of delivery. Opened e-liquids, unboxed disposables, and clearance, final-sale or promotional mystery items cannot be returned.",
			"We provide a prepaid return label, and a flat $4.99 return postage fee is deducted from standard returns. Refunds go to the original payment method within 3-5 business days of the return being scanned at our facility, or you can choose an exchange for store credit instead.",
			"Damaged or defective items are fully covered: contact us and we'll put it right.",
		],
		link: { href: "/returns", label: "Returns & refunds policy" },
	},
	{
		id: "age-verification",
		title: "Age Verification",
		body: [
			"Our products are for adults only. You must confirm that you are at least 18 years old, and of legal smoking age where you live, to enter the site.",
			"Your age is verified again at checkout by our age-verification provider, AgeChecker.Net. We may also ask for government-issued ID, including at delivery. If we cannot verify your age, we may cancel your order and refund you.",
		],
		link: { href: "/age-verification", label: "Age verification" },
	},
	{
		id: "vapor-tokens-and-gift-cards",
		title: "Vapor Tokens & Gift Cards",
		body: [
			`Vapor Tokens are our rewards. Signed-in customers earn them on what they pay for products (not shipping, taxes, gift cards or tokens), once an order is paid in full, at the rate and with the expiry shown on our rewards page. Spend them at checkout: 100 tokens take ${formatDollars(centsForTokens(100))} off your order.`,
			"If an order is cancelled or refunded in full, the tokens it earned are taken back and any tokens spent on it are returned. Tokens can't be exchanged for cash. If we change the earn rate or expiry, tokens you've already earned keep theirs.",
			"Gift cards are redeemed at checkout and can be used across several orders until the balance runs out. Gift cards and tokens come off your total first; you pay what's left with one other method.",
		],
		link: { href: "/rewards", label: "How Vapor Tokens work" },
	},
	{
		id: "affiliate-and-distributor-programs",
		title: "Affiliate & Distributor Programs",
		body: [
			`Affiliates earn commission on orders placed through their link within ${REFERRAL_COOKIE_DAYS} days of the click, never on their own orders. Commission becomes payable ${COMMISSION_HOLD_DAYS} days after an order is paid, is reversed if the order is cancelled or refunded in full, and is paid out from a ${formatDollars(PAYOUT_MINIMUM_CENTS)} minimum. We may hold a payout for review, and pause an affiliate who breaks the program's rules.`,
			"Distributors are businesses we approve after checking their details. We set each distributor's tier, and may change or pause it. Wholesale prices apply only once the cart reaches the tier's minimum order at list price; below that, the order is charged retail. Sale prices and discount codes still apply on top.",
		],
		link: { href: "/distributor", label: "Distributor program" },
	},
	{
		id: "intellectual-property",
		title: "Intellectual Property",
		body: [
			"All content on this site, including the Worldwide Vapor name, logos, text, images, artwork and design, belongs to us or our licensors and is protected by intellectual property laws.",
			"You may view and print pages for your own personal use. You may not copy, reproduce, republish or use our content commercially without our written permission.",
		],
	},
	{
		id: "user-accounts",
		title: "User Accounts",
		body: [
			"If you create an account, you are responsible for keeping your login details secure and for activity under your account. Please give us accurate information and keep it up to date.",
			"Your account holds your orders, saved addresses, wishlist and Vapor Tokens, and your affiliate or distributor details if you join a program. We may suspend or close accounts that breach these Terms, are used fraudulently, or where age cannot be verified.",
		],
	},
	{
		id: "limitation-of-liability",
		title: "Limitation of Liability",
		body: [
			"Nicotine is highly addictive. Our products are used at your own risk and must be used as directed. To the fullest extent permitted by law, we are not liable for indirect or consequential losses arising from your use of the site or products.",
			"Nothing in these Terms limits any liability that cannot be limited by law, including your statutory consumer rights.",
		],
	},
	{
		id: "changes-and-contact",
		title: "Changes & Contact",
		body: [
			"We may update these Terms from time to time. The date at the top of this page shows when they last changed, and the version on this page is the one that applies.",
			`Questions about these Terms? Email ${SUPPORT_EMAIL}. Our support team is available Monday to Sunday, 9:00 AM to 10:00 PM EST.`,
		],
		link: { href: "/contact-us", label: "Contact us" },
	},
];
