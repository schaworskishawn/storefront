import type { LegalSection } from "@/ui/sections/wv-home/wv-legal-client";

/**
 * Accessibility statement copy. DRAFT: states the goal (WCAG 2.1 AA), what the storefront does, and its known gaps,
 * without claiming full conformance, which has not been audited. Update the limitations as they are fixed, and have an
 * accessibility audit and a lawyer review it before relying on it.
 */
export const ACCESSIBILITY_UPDATED = "OCTOBER 4, 2026";

export const ACCESSIBILITY_SECTIONS: LegalSection[] = [
	{
		id: "our-commitment",
		title: "Our Commitment",
		body: [
			"Worldwide Vapor wants everyone to be able to browse and shop with us, including people who use assistive technology or have a disability. We are working to make our website meet the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.",
		],
	},
	{
		id: "what-we-do",
		title: "What We Do",
		body: [
			"We build our pages with clear headings, labelled buttons and form fields, and a visible keyboard focus, so they can be used with a keyboard, a screen reader or voice control.",
			"Our site adapts to phones, tablets and desktop screens, and it works with browser zoom and the text-size settings on your device.",
			'Product photos have text descriptions, and status messages such as "Added to cart" are announced to screen readers.',
		],
	},
	{
		id: "known-limitations",
		title: "Known Limitations",
		body: [
			"Accessibility is ongoing work, and some parts of the site still fall short. Decorative artwork and some promotional images may not have descriptions, and some of our lighter grey text is lower in contrast than we would like. We are reviewing both.",
			"Parts of checkout are provided by other companies, including payments and age verification. We choose our providers carefully, but we cannot fully control their accessibility.",
		],
	},
	{
		id: "browsers-and-technology",
		title: "Browsers & Assistive Technology",
		body: [
			"The site is designed to work in current versions of the major browsers (Chrome, Safari, Firefox and Edge) and with common screen readers. If you find a combination that does not work, please tell us.",
		],
	},
	{
		id: "need-help-ordering",
		title: "Need Help Ordering?",
		body: [
			"If any part of the site is hard for you to use, contact us and we will help you find and order what you need another way, by email or through our contact page.",
		],
		link: { href: "/contact-us", label: "Contact us" },
	},
	{
		id: "feedback",
		title: "Feedback",
		body: [
			"We welcome feedback on the accessibility of our website. Tell us which page and what went wrong, and which device, browser or assistive technology you were using, so we can fix it. Email support@worldwidevapor.com or use our contact page.",
		],
		link: { href: "/contact-us", label: "Send feedback" },
	},
];
