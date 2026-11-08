import "../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getRootHtmlFontProps } from "@/lib/fonts";

/**
 * Root layout for the private Worldwide AI workspace: its own `<html>` (one of the app's several root layouts), with none
 * of the storefront's chrome, effects or analytics, and marked so no search engine indexes or follows it.
 */
export const metadata: Metadata = {
	title: { default: "Worldwide AI", template: "%s · Worldwide AI" },
	description: "Private operations workspace.",
	robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
	referrer: "no-referrer",
	// Installable on its own (Chrome's "Install app", Safari's "Add to Home Screen"), opening the Worldwide AI OS desktop,
	// with the W icon rather than the store's. The icons come from scripts/make-worldwide-ai-icons.mjs.
	applicationName: "Worldwide AI",
	manifest: "/worldwide-ai/manifest.webmanifest",
	icons: {
		icon: [{ url: "/worldwide-ai/icon-192.png", sizes: "192x192", type: "image/png" }],
		apple: "/worldwide-ai/apple-touch-icon.png",
	},
	appleWebApp: { capable: true, title: "Worldwide AI", statusBarStyle: "black" },
};

/** The browser's own bars take the desktop's dark (--wv-bg in brand.css; a meta tag can't read a CSS variable). */
export const viewport: Viewport = { themeColor: "#05030a" };

export default function WorkspaceRootLayout({ children }: { children: ReactNode }) {
	const htmlProps = getRootHtmlFontProps(resolveLocaleFromSlug(getDefaultLocaleSlug()).htmlLang);
	return (
		<html {...htmlProps}>
			<body className="min-h-dvh font-sans">{children}</body>
		</html>
	);
}
