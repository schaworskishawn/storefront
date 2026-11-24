import type { LegalSection } from "@/ui/sections/wv-home/wv-legal-client";

/**
 * Privacy Policy copy. DRAFT: written from what this storefront actually collects and who it goes to:
 * - accounts, orders, addresses, reviews, Vapor Tokens and program records live in Saleor (our e-commerce platform);
 * - email goes through Resend (orders and accounts, the newsletter audience, contact and application notices);
 * - the age gate checks a date of birth in the browser only; AgeChecker.Net verifies age at checkout;
 * - crypto payments and crypto affiliate payouts go through NOWPayments;
 * - the affiliate AI reviewer (Anthropic's Claude) sees no names, emails or phone numbers (lib/affiliates/ai-review.ts);
 * - the wishlist stays in the browser; hosting and anonymous page-speed data are Vercel's.
 * Keep it in step with the code when any of these change, and have it reviewed by a lawyer before relying on it.
 */
export const PRIVACY_UPDATED = "NOVEMBER 24, 2026";

export const PRIVACY_SECTIONS: LegalSection[] = [
	{
		id: "information-we-collect",
		title: "Information We Collect",
		body: [
			"What you give us: your name, email address, phone number, shipping and billing addresses and order history when you create an account or place an order; your email if you join our newsletter; and what you write when you contact us or post a product review in your account.",
			"If you join a program, we also keep what you send us: for the affiliate program, your platform, audience, profile link and plans, and where you'd like to be paid (a crypto wallet address or an e-Transfer email); for the distributor program, your business name, contact, location, business type, and licence and permit numbers. Vapor Tokens you earn and spend are recorded on your account.",
			"What we collect automatically: the device, browser and pages involved when you use the site, through the cookies and storage described in our Cookie Policy, and anonymous page-speed data. Your wishlist is saved only in your browser.",
			"When you pass our age check on entry we only remember that you confirmed you are of legal age. The date of birth you type in is checked in your browser and is not saved or sent to us.",
		],
		link: { href: "/cookie-policy", label: "Cookie Policy" },
	},
	{
		id: "how-we-use-your-data",
		title: "How We Use Your Data",
		body: [
			"To run your orders: take payment, verify your age, ship and track your order, handle returns and refunds, and send order and account emails (confirmations, password resets, payment instructions).",
			"To run your account and our programs: keep your addresses, reviews and Vapor Tokens, review affiliate and distributor applications, track referrals, and pay commission.",
			"To answer you when you contact us, to send our newsletter if you subscribe (unsubscribe any time), and to prevent fraud, keep the site secure and see how quickly it loads.",
		],
	},
	{
		id: "data-sharing",
		title: "Data Sharing & Third Parties",
		body: [
			"We do not sell your personal information. We share it only with the services that run the store, and only what each needs:",
			"Saleor, our e-commerce platform, holds your account, orders and program records. Vercel hosts the site. Resend sends our emails and keeps the newsletter list. Our card processor takes card payments, and NOWPayments takes crypto payments and sends crypto affiliate payouts. AgeChecker.Net receives your name, address, date of birth and email at checkout to verify your age. Shipping carriers receive your name, address and contact details to deliver your order.",
			"Our affiliate program uses an AI reviewer (Claude, by Anthropic) to help check applications and spot fraud. It sees what an applicant wrote about their platform, audience and plans, and counts and shares of referred orders, never names, email addresses, phone numbers or street addresses. It never approves, rejects or pays anyone; a serious flag only pauses an affiliate's automatic payouts until a person reviews them.",
			"If you message us on WhatsApp, that chat is handled by WhatsApp under its own privacy policy. We may also disclose information when the law requires it, or to protect our customers, our rights and the security of the site.",
		],
	},
	{
		id: "cookies-and-tracking",
		title: "Cookies & Tracking",
		body: [
			"We use essential cookies and browser storage to keep you signed in, keep your cart and checkout working, remember your language and that you passed the age check, and save your wishlist on your device.",
			"We measure how quickly pages load with Vercel Speed Insights, which reports anonymous data. We do not use advertising or cross-site tracking cookies of our own. You can block or delete cookies in your browser, but parts of the site may stop working.",
		],
		link: { href: "/cookie-policy", label: "Every cookie we use" },
	},
	{
		id: "data-security",
		title: "Data Security",
		body: [
			"Every page is served over an encrypted (SSL) connection. Card numbers go straight to our PCI DSS Level 1 card processor and never reach our servers; we never store your full card details. Account and program records are kept in our e-commerce platform behind access controls.",
			"No method of transmission or storage is completely secure, so we cannot guarantee absolute security, but we work to protect your information and act quickly if something goes wrong.",
		],
		link: { href: "/payments", label: "How payments are secured" },
	},
	{
		id: "your-rights-and-choices",
		title: "Your Rights & Choices",
		body: [
			"You can see and update your details, saved addresses and reviews yourself in your account, and unsubscribe from our newsletter with the link in any of its emails.",
			"Depending on where you live, you may also have the right to a copy of the personal data we hold about you, to have it corrected or deleted, or to object to certain uses. To ask, or to close your account, contact us. We may need to confirm your identity first, and we may need to keep order records the law requires.",
		],
		link: { href: "/contact-us", label: "Contact us about your data" },
	},
	{
		id: "childrens-privacy",
		title: "Children's Privacy",
		body: [
			"Our site and products are for adults only. We do not knowingly collect personal information from anyone under 18. If you believe a child has given us information, contact us and we will delete it.",
		],
		link: { href: "/age-verification", label: "Age verification" },
	},
	{
		id: "international-transfers",
		title: "International Transfers",
		body: [
			"We ship worldwide, and the services we use (for hosting, email, payments and age verification) may store and process your information in other countries, including the United States. We choose established providers and share only what each needs to do its job.",
		],
	},
	{
		id: "policy-updates",
		title: "Policy Updates",
		body: [
			'We may update this policy when the way we handle your data changes. When we do, we will post the new version here and change the "Last updated" date. Continued use of the site after an update means you accept the changes.',
		],
	},
	{
		id: "contact-us",
		title: "Contact Us",
		body: [
			"Questions about this policy or your data? Email support@worldwidevapor.com or use the contact form. Our support team is available Monday to Sunday, 9:00 AM to 10:00 PM EST.",
		],
		link: { href: "/contact-us", label: "Go to Contact Us" },
	},
];
