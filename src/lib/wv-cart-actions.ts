"use server";

import { revalidatePath } from "next/cache";
import { buildCheckoutPath } from "@paper/session-bridge";
import {
	CheckoutAddLineDocument,
	CheckoutDeleteLinesDocument,
	CheckoutLinesUpdateDocument,
} from "@/gql/graphql";
import { revalidateStorefrontChrome } from "@/lib/auth/revalidate-storefront-chrome";
import * as Checkout from "@/lib/checkout";
import { getProductDetails } from "@/lib/catalog/get-product-details";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";

export type CartActionResult =
	| { ok: true; checkoutId: string; checkoutUrl: string }
	| { ok: false; error: string };

function refresh(channel: string) {
	revalidatePath("/cart");
	revalidateStorefrontChrome(channel);
}

/** Adds `quantity` of a variant to this channel's cart, creating the checkout if there isn't one yet. */
export async function addVariantToCart(
	channel: string,
	locale: string,
	variantId: string,
	quantity: number,
): Promise<CartActionResult> {
	const qty = Math.max(1, Math.min(99, Math.floor(quantity) || 1));
	try {
		const checkout = await Checkout.findOrCreate({
			checkoutId: await Checkout.getIdFromCookies(channel),
			channel,
			localeSlug: locale,
		});
		if (!checkout) return { ok: false, error: "Could not start a cart. Please try again." };
		await Checkout.saveIdToCookie(channel, checkout.id);

		const result = await executeAuthenticatedGraphQL(CheckoutAddLineDocument, {
			variables: { id: checkout.id, productVariantId: decodeURIComponent(variantId), quantity: qty },
			cache: "no-cache",
		});
		if (!result.ok) return { ok: false, error: result.error.message };
		const err = result.data.checkoutLinesAdd?.errors?.[0];
		if (err) return { ok: false, error: err.message || "Could not add this item." };

		refresh(channel);
		return {
			ok: true,
			checkoutId: checkout.id,
			checkoutUrl: buildCheckoutPath({ checkoutId: checkout.id, step: "contact" }),
		};
	} catch (e) {
		console.error("addVariantToCart failed:", e);
		return { ok: false, error: "Something went wrong adding this item." };
	}
}

async function currentCheckoutId(channel: string) {
	return Checkout.getIdFromCookies(channel);
}

export async function setCartLineQuantity(
	channel: string,
	lineId: string,
	quantity: number,
): Promise<{ ok: boolean; error?: string }> {
	const checkoutId = await currentCheckoutId(channel);
	if (!checkoutId) return { ok: false, error: "No cart found." };
	if (quantity < 1) return removeCartLines(channel, [lineId]);
	const result = await executeAuthenticatedGraphQL(CheckoutLinesUpdateDocument, {
		variables: { checkoutId, lines: [{ lineId, quantity: Math.min(99, quantity) }] },
		cache: "no-cache",
	});
	refresh(channel);
	if (!result.ok) return { ok: false, error: result.error.message };
	const err = result.data.checkoutLinesUpdate?.errors?.[0];
	return err ? { ok: false, error: err.message || "Could not update quantity." } : { ok: true };
}

export async function removeCartLines(
	channel: string,
	lineIds: string[],
): Promise<{ ok: boolean; error?: string }> {
	const checkoutId = await currentCheckoutId(channel);
	if (!checkoutId || !lineIds.length) return { ok: false, error: "No cart found." };
	const result = await executeAuthenticatedGraphQL(CheckoutDeleteLinesDocument, {
		variables: { checkoutId, lineIds },
		cache: "no-cache",
	});
	refresh(channel);
	if (!result.ok) return { ok: false, error: result.error.message };
	return { ok: true };
}

export type QuickAddResult = { ok: true } | { ok: false; needsOptions?: boolean; error: string };

/** One-tap add from cards: only for products with a single purchasable variant; others need an option chosen first. */
export async function addProductToCartBySlug(
	channel: string,
	locale: string,
	slug: string,
): Promise<QuickAddResult> {
	const details = await getProductDetails(slug, channel, locale);
	if (!details || !details.variants.length) return { ok: false, error: "This product is unavailable." };
	const inStock = details.variants.filter((v) => v.inStock);
	if (!inStock.length) return { ok: false, error: "Out of stock." };
	if (details.variants.length > 1) return { ok: false, needsOptions: true, error: "Choose an option first." };
	const r = await addVariantToCart(channel, locale, inStock[0].id, 1);
	return r.ok ? { ok: true } : { ok: false, error: r.error };
}
