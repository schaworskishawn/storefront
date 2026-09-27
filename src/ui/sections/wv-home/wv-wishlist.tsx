import { Suspense } from "react";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { WvFooter, WvHeader } from "./wv-chrome";
import { WishlistExperience } from "./wv-wishlist-client";
import "./wv-home.css";

/** Worldwide Vapor wishlist — Figma "6.10 - High Fidelity - Wishlist" (desktop 1440, tablet 768, mobile 360). */
export function WvWishlist({
	products,
	localeBcp47,
	channel,
	locale,
}: {
	products: HomeProduct[];
	localeBcp47: string;
	channel: string;
	locale: string;
}) {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<Suspense fallback={<div className="min-h-[60dvh]" />}>
				<WishlistExperience products={products} localeBcp47={localeBcp47} channel={channel} locale={locale} />
			</Suspense>
			<WvFooter />
		</div>
	);
}
