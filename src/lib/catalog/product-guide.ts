/**
 * A product's companion guide, kept in Saleor as the product's public metadata key `guide`: JSON
 * `{ "url": "/learn/…", "title": "…" }`. The product page links to it from its questions and answers, so the product
 * and the guide link to each other. Only paths on this site are accepted; anything else is ignored.
 */
export type ProductGuide = { url: string; title: string };

export function parseProductGuide(raw: string | null | undefined): ProductGuide | null {
	if (!raw?.trim()) return null;
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) return null;
	const { url, title } = data as Record<string, unknown>;
	if (typeof url !== "string" || typeof title !== "string") return null;
	const path = url.trim();
	const name = title.replace(/\s+/g, " ").trim();
	// Site paths only: "/learn/x", never "//host", "http…" or "javascript:".
	if (!name || !/^\/(?!\/)[\w\-./]*$/.test(path)) return null;
	return { url: path, title: name };
}
