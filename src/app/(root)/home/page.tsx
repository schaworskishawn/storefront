import { type Metadata } from "next";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { buildCategoryTiles, getHomeProducts } from "@/lib/catalog/get-home-products";
import { WvHome } from "@/ui/sections/wv-home/wv-home";

export const metadata: Metadata = {
	title: "Worldwide Vapor — Retail | Wholesale | Distribution",
	description: "Premium disposables, hardware and e-liquids at retail, wholesale and distribution prices.",
};

const SECTION_SIZE = 8;
export default async function HomePage() {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const catalog = channel ? await getHomeProducts(channel, locale) : [];
	const localeBcp47 = resolveLocaleFromSlug(locale).bcp47;

	const featured = catalog.slice(0, SECTION_SIZE);
	const bestSellers = catalog.filter((p) => p.isBestseller).slice(0, SECTION_SIZE);
	const newArrivals = [...catalog].sort((a, b) => b.created.localeCompare(a.created)).slice(0, SECTION_SIZE);

	return (
		<WvHome
			locale={locale}
			channel={channel}
			localeBcp47={localeBcp47}
			categories={buildCategoryTiles(catalog)}
			featured={featured}
			bestSellers={bestSellers}
			newArrivals={newArrivals}
		/>
	);
}
