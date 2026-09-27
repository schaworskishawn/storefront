import { type Metadata } from "next";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getHomeProducts } from "@/lib/catalog/get-home-products";
import { WvSearch } from "@/ui/sections/wv-home/wv-search";

export const metadata: Metadata = {
	title: "Search — Worldwide Vapor",
	description: "Search disposables, e-liquids, devices and accessories from Worldwide Vapor.",
};

export default async function SearchPage() {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const products = channel ? await getHomeProducts(channel, locale) : [];
	return <WvSearch products={products} localeBcp47={resolveLocaleFromSlug(locale).bcp47} />;
}
