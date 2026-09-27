import { type Metadata } from "next";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { buildCategoryTiles, getHomeProducts } from "@/lib/catalog/get-home-products";
import { WvShop } from "@/ui/sections/wv-home/wv-shop";

export const metadata: Metadata = {
	title: "Shop All Products — Worldwide Vapor",
	description:
		"Browse premium disposables, hardware kits, e-liquids and accessories at retail and wholesale prices.",
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const catalog = channel ? await getHomeProducts(channel, locale) : [];
	const { category } = await searchParams;

	return (
		<WvShop
			locale={locale}
			channel={channel}
			localeBcp47={resolveLocaleFromSlug(locale).bcp47}
			products={catalog}
			categories={buildCategoryTiles(catalog)}
			initialCategorySlug={category}
		/>
	);
}
