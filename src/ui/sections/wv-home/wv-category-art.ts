/** The drawings a category badge (`CategoryBadge`) can show. */
export type CategoryBadgeIcon =
	| "disposables"
	| "eliquid"
	| "hardware"
	| "coils"
	| "accessories"
	| "new-arrivals";

/** Which badge each Saleor category gets, matched by slug. A category not listed here shows its own Saleor image. */
export const CATEGORY_BADGE: Record<string, CategoryBadgeIcon> = {
	disposables: "disposables",
	ejuice: "eliquid",
	"e-liquid": "eliquid",
	"e-liquids": "eliquid",
	hardware: "hardware",
	coils: "coils",
	accessories: "accessories",
	"new-arrivals": "new-arrivals",
};
