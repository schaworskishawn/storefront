import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getHomeProducts, type HomeProduct } from "@/lib/catalog/get-home-products";
import { getProductDetails, type ProductDetails } from "@/lib/catalog/get-product-details";

export type ProductPageData = {
	locale: string;
	channel: string;
	localeBcp47: string;
	product: HomeProduct;
	details: ProductDetails | null;
	related: HomeProduct[];
};

/** Resolves a product (by slug, or the best seller when no slug) plus recommendations from the cached catalog. */
export async function getProductPageData(slug?: string): Promise<ProductPageData | null> {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const catalog = channel ? await getHomeProducts(channel, locale) : [];
	const product = slug
		? catalog.find((p) => p.slug === slug)
		: (catalog.find((p) => p.isBestseller) ?? catalog[0]);
	if (!product) return null;
	const others = catalog.filter((p) => p.id !== product.id);
	const related = [
		...others.filter((p) => p.categorySlug === product.categorySlug),
		...others.filter((p) => p.categorySlug !== product.categorySlug),
	].slice(0, 6);
	const details = await getProductDetails(product.slug, channel, locale);
	return { locale, channel, localeBcp47: resolveLocaleFromSlug(locale).bcp47, product, details, related };
}

export async function getProductSlugs(): Promise<string[]> {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	return channel ? (await getHomeProducts(channel, locale)).map((p) => p.slug) : [];
}
