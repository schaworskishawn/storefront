import { type Metadata } from "next";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getHomeCollections } from "@/lib/catalog/get-home-collections";
import { buildCategoryTiles, getHomeProducts } from "@/lib/catalog/get-home-products";
import { WvHome } from "@/ui/sections/wv-home/wv-home";
import { toCardProduct } from "@/ui/sections/wv-home/wv-product-section";

export const metadata: Metadata = {
	title: "Worldwide Vapor — Retail | Wholesale | Distribution",
	description: "Premium disposables, hardware and e-liquids at retail, wholesale and distribution prices.",
};

export default async function HomePage() {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const [catalog, membership] = channel
		? await Promise.all([getHomeProducts(channel, locale), getHomeCollections(channel)])
		: [[], { staffPicks: [], originals: [], starterKits: [] }];
	const localeBcp47 = resolveLocaleFromSlug(locale).bcp47;

	return (
		<WvHome
			locale={locale}
			channel={channel}
			localeBcp47={localeBcp47}
			categories={buildCategoryTiles(catalog)}
			products={catalog.map(toCardProduct)}
			membership={membership}
		/>
	);
}
