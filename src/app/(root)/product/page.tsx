import { type Metadata } from "next";
import { getProductPageData } from "@/lib/catalog/get-product-page";
import { WvProduct } from "@/ui/sections/wv-home/wv-product";

export const metadata: Metadata = {
	title: "Product — Worldwide Vapor",
	description: "Product details, specs and recommendations from Worldwide Vapor.",
};

export default async function ProductPage() {
	const data = await getProductPageData();
	if (!data) return <p className="p-16 text-center text-white">No products available yet.</p>;
	return <WvProduct {...data} />;
}
