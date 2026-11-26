/**
 * A product's questions and answers, kept in Saleor as the product's public metadata key `faq`: a JSON array of
 * `{ "q": "...", "a": "..." }`. They show on the product page and feed its FAQPage structured data, so answer engines
 * and AI search can quote them. Anything malformed is skipped rather than breaking the page.
 */
export type ProductFaq = { q: string; a: string };

/** At most this many are shown, so a bad paste can't flood the page. */
export const MAX_PRODUCT_FAQS = 12;

export function parseProductFaq(raw: string | null | undefined): ProductFaq[] {
	if (!raw?.trim()) return [];
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	const out: ProductFaq[] = [];
	for (const item of data) {
		if (!item || typeof item !== "object") continue;
		const { q, a } = item as Record<string, unknown>;
		if (typeof q !== "string" || typeof a !== "string") continue;
		const question = q.replace(/\s+/g, " ").trim();
		const answer = a.replace(/\s+/g, " ").trim();
		if (!question || !answer || out.some((f) => f.q === question)) continue;
		out.push({ q: question, a: answer });
		if (out.length === MAX_PRODUCT_FAQS) break;
	}
	return out;
}
