import "../globals.css";
import type { Metadata } from "next";
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
};

export default function WorkspaceRootLayout({ children }: { children: ReactNode }) {
	const htmlProps = getRootHtmlFontProps(resolveLocaleFromSlug(getDefaultLocaleSlug()).htmlLang);
	return (
		<html {...htmlProps}>
			<body className="min-h-dvh font-sans">{children}</body>
		</html>
	);
}
