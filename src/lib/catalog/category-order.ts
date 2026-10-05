/**
 * The order categories are listed in (home/shop tiles and the shop sidebar), matching the Figma category cards.
 * Categories not listed here come after, in catalog order. Pure, so the client-side shop can use it.
 */
export const CATEGORY_ORDER = [
	"disposables",
	"ejuice",
	"e-liquid",
	"e-liquids",
	"hardware",
	"coils",
	"accessories",
	"new-arrivals",
] as const;

export function categoryRank(slug: string): number {
	const i = (CATEGORY_ORDER as readonly string[]).indexOf(slug);
	return i === -1 ? CATEGORY_ORDER.length : i;
}
