import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductPageData, getProductSlugs } from "@/lib/catalog/get-product-page";
import { buildPageMetadata } from "@/lib/seo";
import { WvProduct } from "@/ui/sections/wv-home/wv-product";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
	const slugs = await getProductSlugs();
	// Cache Components needs at least one param to validate the route at build time.
	return (slugs.length ? slugs : ["_"]).map((slug) => ({ slug }));
}

/**
 * The product's title and description come from its SEO fields in Saleor when they're set (Products → the product →
 * SEO), falling back to its name and the first paragraph of its description; with a canonical URL and social cards.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const data = await getProductPageData(slug);
	if (!data) return { title: "Product not found — Worldwide Vapor" };
	const { product, details } = data;
	return buildPageMetadata({
		title: details?.seoTitle || `${product.name} — Worldwide Vapor`,
		description:
			details?.seoDescription || details?.paragraphs[0] || `Buy ${product.name} from Worldwide Vapor.`,
		image: details?.images[0]?.url ?? product.image?.url,
		url: `/product/${product.slug}`,
	});
}

export default async function ProductSlugPage({ params }: Props) {
	const { slug } = await params;
	const data = await getProductPageData(slug);
	if (!data) notFound();
	return <WvProduct {...data} />;
}
