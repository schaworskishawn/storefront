import type { LegalSection } from "@/ui/sections/wv-home/wv-legal-client";

/**
 * Cookie Policy copy. DRAFT: written from the cookies and browser storage this storefront actually sets (age check,
 * language, sign-in, cart, announcement bar, site access, wishlist, quit plan) and the services it uses (Stripe,
 * AgeChecker.Net, Vercel Speed Insights). Keep it in step with the code when cookies change, and have it reviewed by a
 * lawyer before relying on it.
 */
export const COOKIES_UPDATED = "OCTOBER 4, 2026";

export const COOKIE_SECTIONS: LegalSection[] = [
	{
		id: "what-are-cookies",
		title: "What Are Cookies",
		body: [
			"Cookies are small text files that a website stores on your device. They let a site remember things between pages and visits, such as that you passed our age check or what is in your cart.",
			"We also use similar browser storage (local and session storage), which works like a cookie but stays inside your browser. This policy covers both.",
		],
	},
	{
		id: "cookies-we-set",
		title: "Cookies We Set",
		body: [
			"Age check (wv-age-verified): remembers that you confirmed you are of legal age, so we do not ask again on every page. Kept for 1 year.",
			"Language and region (browse-locale): remembers the language and region you browse in. Kept for 1 year.",
			"Sign-in (secure cookies from our store platform): while you are signed in, these keep you logged in. One lasts 15 minutes and renews as you browse, and the other lasts up to 7 days.",
			"Cart (checkoutId, followed by your region): keeps your cart and checkout together while you shop. It is a session cookie, removed when you close your browser.",
			"Announcement banner (paper_announcement_dismissed): remembers that you closed the banner at the top of the site. Kept for 1 year.",
			"Site access (wv-site-access): only used while the site is password-protected, for example before launch. Kept for 30 days.",
			"These cookies are what make the store work. We do not use them for advertising.",
		],
	},
	{
		id: "browser-storage",
		title: "Browser Storage",
		body: [
			"Wishlist (wv-wishlist-v1): saves the products you have hearted on this device. It stays in your browser until you clear it.",
			"Quit program (wv-quit-v3): keeps your quit plan and daily log on this device. If you are signed in, a copy is also saved to your account so it follows you to other devices.",
			"Checkout progress: while you pay, we note how your payment is going in your browser's session storage, so an interrupted payment can finish correctly. It is cleared when you close the tab.",
		],
	},
	{
		id: "third-party-services",
		title: "Third-Party Services",
		body: [
			"Payments: Stripe processes card payments at checkout and may set its own cookies to prevent fraud and keep your payment secure.",
			"Age verification: AgeChecker.Net may check your age or ID at checkout and may use its own cookies or storage while it does.",
			"Speed: we use Vercel Speed Insights to measure how quickly our pages load. It reports anonymous page-speed data and is not used for advertising.",
			"We do not use advertising or cross-site tracking cookies of our own, and we do not sell your data. If a page ever includes content embedded from another company, such as a social media widget, that company may set its own cookies under its own policy.",
		],
		link: { href: "/privacy-policy", label: "Read our Privacy Policy" },
	},
	{
		id: "managing-cookies",
		title: "Managing Cookies",
		body: [
			"You can block or delete cookies in your browser settings. Because the cookies above keep the store working, blocking them means you may be asked your age again, be signed out, or lose your cart.",
			"Clearing your browser's site data also removes your wishlist, and any quit plan that is only saved on this device.",
		],
	},
	{
		id: "changes-and-contact",
		title: "Changes & Contact",
		body: [
			"We may update this policy when we add features or change service providers. The date at the top shows when it last changed.",
			"Questions about how we use cookies? Our team is happy to help.",
		],
		link: { href: "/contact-us", label: "Contact us" },
	},
];
