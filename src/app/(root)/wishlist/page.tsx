import { type Metadata } from "next";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getHomeProducts } from "@/lib/catalog/get-home-products";
import { WvWishlist } from "@/ui/sections/wv-home/wv-wishlist";

export const metadata: Metadata = {
	title: "My Wishlist — Worldwide Vapor",
	description: "Your saved favourite products, ready to shop anytime.",
};

export default async function WishlistPage() {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const products = channel ? await getHomeProducts(channel, locale) : [];
	return (
		<WvWishlist
			products={products}
			localeBcp47={resolveLocaleFromSlug(locale).bcp47}
			channel={channel}
			locale={locale}
		/>
	);
}
