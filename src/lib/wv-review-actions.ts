"use server";

import { revalidatePath } from "next/cache";
import { MyReviewsDocument, SaveMyReviewsDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { MAX_REVIEWS, parseReviews, validateReview, type Review, type ReviewInput } from "@/lib/reviews";

export type ReviewResult = { ok: true } | { ok: false; error: string };

const clip = (s: string, n: number) =>
	s
		.replace(/\u0000/g, "")
		.trim()
		.slice(0, n);

async function load() {
	const r = await executeAuthenticatedGraphQL(MyReviewsDocument, { cache: "no-cache" });
	if (!r.ok || !r.data.me) return null;
	const products = new Map<string, { name: string; slug: string }>();
	for (const { node } of r.data.me.orders?.edges ?? [])
		for (const l of node.lines)
			if (l.variant)
				products.set(l.variant.product.id, { name: l.variant.product.name, slug: l.variant.product.slug });
	return { userId: r.data.me.id, reviews: parseReviews(r.data.me.metafield), products };
}

async function persist(userId: string, reviews: Review[]): Promise<ReviewResult> {
	const r = await executeAuthenticatedGraphQL(SaveMyReviewsDocument, {
		variables: { id: userId, value: JSON.stringify(reviews) },
		cache: "no-cache",
	});
	if (!r.ok) return { ok: false, error: "We couldn't save your review. Please try again." };
	const err = r.data.updateMetadata?.errors?.[0];
	if (err) return { ok: false, error: err.message ?? "We couldn't save your review." };
	revalidatePath("/my-reviews");
	return { ok: true };
}

/** Creates or replaces the customer's review of a product they've bought (one review per product). */
export async function saveReview(input: ReviewInput): Promise<ReviewResult> {
	const clean: ReviewInput = {
		productId: String(input.productId),
		rating: Number(input.rating),
		headline: clip(String(input.headline ?? ""), 100),
		body: clip(String(input.body ?? ""), 1500),
	};
	const invalid = validateReview(clean);
	if (invalid) return { ok: false, error: invalid };

	const state = await load();
	if (!state) return { ok: false, error: "Please sign in to write a review." };
	const product = state.products.get(clean.productId);
	if (!product) return { ok: false, error: "You can only review products you've bought." };

	const existing = state.reviews.find((r) => r.productId === clean.productId);
	if (!existing && state.reviews.length >= MAX_REVIEWS)
		return { ok: false, error: "You've reached the review limit." };
	const review: Review = {
		id: existing?.id ?? crypto.randomUUID(),
		productId: clean.productId,
		productName: product.name,
		productSlug: product.slug,
		rating: clean.rating,
		headline: clean.headline,
		body: clean.body,
		created: existing?.created ?? new Date().toISOString(),
	};
	return persist(state.userId, [review, ...state.reviews.filter((r) => r.productId !== clean.productId)]);
}

export async function deleteReview(id: string): Promise<ReviewResult> {
	const state = await load();
	if (!state) return { ok: false, error: "Please sign in." };
	return persist(
		state.userId,
		state.reviews.filter((r) => r.id !== id),
	);
}
