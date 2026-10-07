/** The footer's link columns and where each label goes. Plain data, so it can be tested (see wv-footer-links.test.ts). */

export const FOOTER_COLUMNS: { title: string; links: string[] }[] = [
	{ title: "SHOP", links: ["All Products", "Disposables", "E-Liquids", "Devices", "Coils", "Accessories"] },
	{
		title: "COMPANY",
		links: [
			"About Us",
			"Shipping Info",
			"Payments",
			"Blog",
			"Quit Nicotine",
			"Affiliate Program",
			"Become a Distributor",
		],
	},
	{
		title: "HELP",
		links: [
			"Learn",
			"FAQs",
			"Terms & Conditions",
			"Privacy Policy",
			"Cookie Policy",
			"Accessibility",
			"Returns",
			"Contact Us",
		],
	},
	{ title: "ACCOUNT", links: ["My Account", "My Orders", "Wishlist", "My Desk", "Vapor Tokens", "Cart"] },
	{ title: "CONTACT", links: ["support@worldwidevapor.com"] },
];

/** The footer link to the rewards page, which exists only while the program is switched on (the footer hides it otherwise). */
export const REWARDS_FOOTER_LABEL = "Vapor Tokens";

/** Label -> link. A label with no entry here has no page yet and renders as a placeholder `#` link. */
export const FOOTER_HREFS: Record<string, string> = {
	"All Products": "/shop",
	// The shop reads ?category=<slug> (the live Saleor category slugs).
	Disposables: "/shop?category=disposables",
	"E-Liquids": "/shop?category=ejuice",
	Devices: "/shop?category=hardware",
	Coils: "/shop?category=coils",
	Accessories: "/shop?category=accessories",
	"Shipping Info": "/shipping",
	Payments: "/payments",
	Blog: "/learn",
	"Quit Nicotine": "/quit",
	"Affiliate Program": "/affiliate-program",
	"Become a Distributor": "/distributor",
	Learn: "/learn",
	FAQs: "/faqs",
	"Terms & Conditions": "/terms-and-conditions",
	"Privacy Policy": "/privacy-policy",
	"Cookie Policy": "/cookie-policy",
	Accessibility: "/accessibility",
	Returns: "/returns",
	"Contact Us": "/contact-us",
	"My Account": "/account",
	"My Orders": "/orders",
	Wishlist: "/wishlist",
	"My Desk": "/desk",
	"Vapor Tokens": "/rewards",
	Cart: "/cart",
	"support@worldwidevapor.com": "mailto:support@worldwidevapor.com",
};

/** The short legal line at the very bottom of the footer. */
export const LEGAL_LINKS = [
	{ label: "Privacy", href: "/privacy-policy" },
	{ label: "Terms", href: "/terms-and-conditions" },
	{ label: "Cookies", href: "/cookie-policy" },
	{ label: "Accessibility", href: "/accessibility" },
];
