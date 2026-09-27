/** Product reviews, stored as JSON on the customer's Saleor metadata (key `wv_reviews`). */

export const REVIEWS_KEY = "wv_reviews";
export const MAX_REVIEWS = 100;

export type Review = {
	id: string;
	productId: string;
	productName: string;
	productSlug: string;
	rating: number;
	headline: string;
	body: string;
	created: string;
};

export type ReviewableProduct = {
	id: string;
	name: string;
	slug: string;
	image: { url: string; alt: string } | null;
};

export function parseReviews(raw: string | null | undefined): Review[] {
	if (!raw) return [];
	try {
		const data: Partial<Review>[] = JSON.parse(raw) as Partial<Review>[];
		if (!Array.isArray(data)) return [];
		return data.filter(
			(r): r is Review =>
				!!r &&
				typeof r.id === "string" &&
				typeof r.productId === "string" &&
				typeof r.rating === "number" &&
				typeof r.headline === "string" &&
				typeof r.body === "string",
		);
	} catch {
		return [];
	}
}

export type ReviewInput = { productId: string; rating: number; headline: string; body: string };

export function validateReview(i: ReviewInput): string | null {
	if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5) return "Choose a rating from 1 to 5.";
	if (i.headline.trim().length < 3) return "Add a short headline (at least 3 characters).";
	if (i.body.trim().length < 10) return "Tell us a bit more (at least 10 characters).";
	return null;
}

export const summarize = (reviews: Review[]) => {
	const counts = [5, 4, 3, 2, 1].map((s) => ({
		stars: s,
		count: reviews.filter((r) => r.rating === s).length,
	}));
	const avg = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0;
	return { avg, counts };
};

export const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
