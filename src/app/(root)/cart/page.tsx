import { type Metadata } from "next";
import { Suspense } from "react";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { getHomeProducts } from "@/lib/catalog/get-home-products";
import * as Checkout from "@/lib/checkout";
import { getStorefrontContent } from "@/lib/content/server";
import { WvCart } from "@/ui/sections/wv-home/wv-cart";

export const metadata: Metadata = {
	title: "Your Cart — Worldwide Vapor",
	description: "Review your items and check out securely.",
};

async function CartData() {
	const locale = getDefaultLocaleSlug();
	const channel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
	const [checkoutId, content, catalog] = await Promise.all([
		Checkout.getIdFromCookies(channel),
		getStorefrontContent(channel, locale),
		getHomeProducts(channel, locale),
	]);
	const checkout = checkoutId ? await Checkout.find(checkoutId, locale) : null;
	const inCart = new Set((checkout?.lines ?? []).map((l) => l.variant.product.id));
	const recommended = catalog.filter((p) => !inCart.has(p.id)).slice(0, 4);

	return (
		<WvCart
			channel={channel}
			localeBcp47={resolveLocaleFromSlug(locale).bcp47}
			checkout={checkout}
			freeShippingThreshold={content.policies.shipping.freeShippingThreshold ?? null}
			recommended={recommended}
		/>
	);
}

export default function CartPage() {
	return (
		<Suspense fallback={<div className="min-h-dvh bg-[var(--wv-bg)]" />}>
			<CartData />
		</Suspense>
	);
}
