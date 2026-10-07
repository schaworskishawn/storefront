/**
 * The shelves of the knowledge library. A role can only search the collections its registry entry lists, so Relay can read
 * the support policy but never the tax rules.
 */

export const KNOWLEDGE_COLLECTIONS = [
	{ id: "support-policy", label: "Support policy" },
	{ id: "shipping", label: "Shipping" },
	{ id: "returns", label: "Returns and refunds" },
	{ id: "faq", label: "FAQ" },
	{ id: "accounting-policy", label: "Accounting policy" },
	{ id: "chart-of-accounts", label: "Chart of accounts" },
	{ id: "tax-rules", label: "Tax rules" },
	{ id: "site-runbook", label: "Website runbook" },
	{ id: "general", label: "General" },
] as const;

export type CollectionId = (typeof KNOWLEDGE_COLLECTIONS)[number]["id"];

export const COLLECTION_IDS = KNOWLEDGE_COLLECTIONS.map((c) => c.id) as readonly CollectionId[];

export const isCollectionId = (value: unknown): value is CollectionId =>
	typeof value === "string" && (COLLECTION_IDS as readonly string[]).includes(value);

export const collectionLabel = (id: string): string =>
	KNOWLEDGE_COLLECTIONS.find((c) => c.id === id)?.label ?? id;
