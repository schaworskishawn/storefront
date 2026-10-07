import "../globals.css";
import { type ReactNode, Suspense } from "react";
import { rootMetadata } from "@/lib/seo";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getRootHtmlFontProps } from "@/lib/fonts";
import { NativeTabBar } from "@/ui/components/native-tab-bar";
import { HoloPanels } from "@/ui/components/holo-panels";
import { PageMotion } from "@/ui/components/page-motion";

export const metadata = rootMetadata;

/**
 * Root layout for locale-less top-level routes (`/` redirect and global fallbacks).
 *
 * One of the app's multiple root layouts: storefront (`[locale]`) and checkout each render
 * their own `<html>`. This one uses the default locale's `htmlLang` since it has no segment.
 */
export default function RootGroupLayout({ children }: { children: ReactNode }) {
	const htmlLang = resolveLocaleFromSlug(getDefaultLocaleSlug()).htmlLang;
	const htmlProps = getRootHtmlFontProps(htmlLang);

	return (
		<html {...htmlProps}>
			<body className="wv-motion min-h-dvh font-sans">
				{children}
				{/* Scroll reveals, page entrances and the top progress bar. Renders only that bar. */}
				<Suspense fallback={null}>
					<PageMotion />
				</Suspense>
				{/* Holographic hover panels (a mouse over a card). Renders nothing. */}
				<HoloPanels />
				{/* Android app only: renders nothing on the server or in a browser. */}
				<Suspense fallback={null}>
					<NativeTabBar />
				</Suspense>
			</body>
		</html>
	);
}
