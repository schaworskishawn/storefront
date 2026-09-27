import type { LegalSection } from "@/ui/sections/wv-home/wv-legal-client";

/**
 * Privacy Policy copy. DRAFT: written from how this storefront actually works (checkout via Saleor, the age gate cookie,
 * newsletter and contact forms, WhatsApp/email support). Have it reviewed by a lawyer before relying on it.
 */
export const PRIVACY_UPDATED = "SEPTEMBER 1, 2026";

export const PRIVACY_SECTIONS: LegalSection[] = [
	{
		id: "information-we-collect",
		title: "Information We Collect",
		body: [
			"We collect personal information that you voluntarily provide when creating an account, placing an order, subscribing to our newsletter, or contacting support. This includes your name, email address, shipping address, phone number and payment details. We also automatically collect device information, IP address, browser type, and browsing behavior through cookies and similar technologies.",
			"When you pass our age check we only remember that you confirmed you are of legal age. The date of birth you type in is checked in your browser and is not saved or sent to us.",
		],
	},
	{
		id: "how-we-use-your-data",
		title: "How We Use Your Data",
		body: [
			"We use your information to process and deliver your orders, take payments, confirm your age where required, answer your questions, and send order updates.",
			"If you subscribe, we send marketing emails about new products and offers, and you can unsubscribe at any time. We also use data to prevent fraud, keep the site secure, and understand how it performs so we can improve it.",
		],
	},
	{
		id: "data-sharing",
		title: "Data Sharing & Third Parties",
		body: [
			"We do not sell your personal information. We share it only with service providers who help us run the store, such as payment processors, shipping carriers, our e-commerce platform, email delivery and hosting providers, and only as needed for them to do that work.",
			"We may also disclose information when the law requires it, or to protect our rights, customers and the security of the site.",
		],
	},
	{
		id: "cookies-and-tracking",
		title: "Cookies & Tracking",
		body: [
			"We use essential cookies to keep your cart and checkout working, remember your language, and remember that you passed the age check. Without them the store cannot function.",
			"We also use performance measurement to see how quickly pages load. You can block or delete cookies in your browser settings, but some parts of the site may stop working.",
		],
	},
	{
		id: "data-security",
		title: "Data Security",
		body: [
			"We protect your data with encrypted (SSL) connections and access controls. Card payments are handled by our payment providers, and we do not store your full card number.",
			"No method of transmission or storage is completely secure, so we cannot guarantee absolute security, but we work to protect your information and act quickly if something goes wrong.",
		],
		link: { href: "/payments", label: "How payments are secured" },
	},
	{
		id: "your-rights-and-choices",
		title: "Your Rights & Choices",
		body: [
			"Depending on where you live, you may have the right to access the personal data we hold about you, correct it, delete it, or object to certain uses. You can also opt out of marketing emails at any time using the unsubscribe link.",
			"To make a request, contact us using the details below. We may need to confirm your identity first.",
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
			"We ship worldwide, and our service providers may process your information in countries other than your own. Where we do this, we take steps to make sure your information stays protected in line with this policy.",
		],
	},
	{
		id: "policy-updates",
		title: "Policy Updates",
		body: [
			'We may update this policy from time to time. When we do, we will post the new version here and change the "Last updated" date. Continued use of the site after an update means you accept the changes.',
		],
	},
	{
		id: "contact-us",
		title: "Contact Us",
		body: [
			"Questions about this policy or your data? Email support@worldwidevapor.com or use the contact form and our team will get back to you.",
		],
		link: { href: "/contact-us", label: "Go to Contact Us" },
	},
];
