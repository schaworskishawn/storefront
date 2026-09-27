import type { LegalSection } from "@/ui/sections/wv-home/wv-legal-client";

/**
 * Terms & Conditions copy. DRAFT: written from the policies already on this site (shipping, returns, age gate).
 * Have it reviewed by a lawyer before relying on it.
 */
export const TERMS_UPDATED = "MAY 25, 2025";

export const TERMS_SECTIONS: LegalSection[] = [
	{
		id: "introduction",
		title: "Introduction",
		body: [
			"These Terms govern your use of the Worldwide Vapor website and any services offered through it. By using our site, creating an account, or placing an order, you confirm your absolute agreement to these Terms. All operations are strictly bound under legal vape industry compliance guidelines.",
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
		],
	},
	{
		id: "pricing-and-payment",
		title: "Pricing & Payment",
		body: [
			"Prices are shown in the currency displayed at checkout. Taxes, duties and shipping are shown or calculated at checkout and may vary by destination.",
			"Payments are processed securely by our payment providers over encrypted connections. We do not store your full card details. By paying, you confirm you are authorized to use the payment method.",
		],
		link: { href: "/payments", label: "Payment methods and security" },
	},
	{
		id: "shipping-and-delivery",
		title: "Shipping & Delivery",
		body: [
			"Orders received before 2PM EST Monday to Friday are processed the same business day. Standard shipping takes 3-5 business days once processed. Delivery times are estimates, not guarantees.",
			"For international orders, the recipient is responsible for any customs, import duties and taxes charged in their country. Packages ship in plain packaging with neutral labeling.",
		],
		link: { href: "/shipping", label: "Full shipping information" },
	},
	{
		id: "returns-and-refunds",
		title: "Returns & Refunds",
		body: [
			"Unopened hardware, sealed coils and unused accessories in original condition can be returned within 15 days of delivery. Opened e-liquids, unboxed disposables, and clearance or final-sale items cannot be returned.",
			"Refunds are issued to the original payment method within 3-5 business days of the return being scanned at our facility. A flat return postage fee may apply to standard returns.",
		],
		link: { href: "/returns", label: "Returns & refunds policy" },
	},
	{
		id: "age-verification",
		title: "Age Verification",
		body: [
			"Our products are for adults only. You must confirm that you are at least 18 years old, and of legal smoking age where you live, to enter the site.",
			"We may ask for government-issued ID to confirm your age, including at delivery. If we cannot verify your age, we may cancel your order and refund you.",
		],
		link: { href: "/age-verification", label: "Age verification" },
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
			"We may suspend or close accounts that breach these Terms, are used fraudulently, or where age cannot be verified.",
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
];
