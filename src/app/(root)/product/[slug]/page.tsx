import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductPageData, getProductSlugs } from "@/lib/catalog/get-product-page";
import { WvProduct } from "@/ui/sections/wv-home/wv-product";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
	const slugs = await getProductSlugs();
	// Cache Components needs at least one param to validate the route at build time.
	return (slugs.length ? slugs : ["_"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const data = await getProductPageData(slug);
	if (!data) return { title: "Product not found — Worldwide Vapor" };
	return {
		title: `${data.product.name} — Worldwide Vapor`,
		description: `Buy ${data.product.name} from Worldwide Vapor.`,
		...(data.product.image ? { openGraph: { images: [data.product.image.url] } } : {}),
	};
}

export default async function ProductSlugPage({ params }: Props) {
	const { slug } = await params;
	const data = await getProductPageData(slug);
	if (!data) notFound();
	return <WvProduct {...data} />;
}
