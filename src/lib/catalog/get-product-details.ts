import { ProductDetailsDocument } from "@/gql/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { graphqlLanguageCodeVariables } from "@/lib/graphql-locale";
import { executePublicGraphQL } from "@/lib/graphql";

export type ProductSpec = { label: string; value: string };
export type ProductVariantOption = {
	id: string;
	name: string;
	price: number;
	undiscountedPrice: number | null;
	currency: string;
	inStock: boolean;
};
export type ProductDetails = {
	images: { url: string; alt: string }[];
	paragraphs: string[];
	features: string[];
	specs: ProductSpec[];
	optionLabel: string;
	variants: ProductVariantOption[];
};

const stripTags = (s: string) =>
	s
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();

/** EditorJS JSON (Saleor description) → plain paragraphs and bullet items. Anything else is treated as text. */
function parseDescription(raw: string | null | undefined): { paragraphs: string[]; features: string[] } {
	const out = { paragraphs: [] as string[], features: [] as string[] };
	if (!raw) return out;
	try {
		const parsed = JSON.parse(raw) as {
			blocks?: { type: string; data: { text?: string; items?: unknown[] } }[];
		};
		if (!Array.isArray(parsed.blocks)) throw new Error("not editorjs");
		for (const b of parsed.blocks) {
			if (b.type === "paragraph" && b.data.text) {
				const t = stripTags(b.data.text);
				if (t) out.paragraphs.push(t);
			} else if (b.type === "list" && Array.isArray(b.data.items)) {
				for (const it of b.data.items) {
					const t = stripTags(typeof it === "string" ? it : ((it as { content?: string }).content ?? ""));
					if (t) out.features.push(t);
				}
			}
		}
	} catch {
		const t = stripTags(raw);
		if (t) out.paragraphs.push(t);
	}
	return out;
}

/** Per-product content (gallery, description, attributes, variants) for the Worldwide Vapor product page. */
export async function getProductDetails(
	slug: string,
	channel: string,
	localeSlug: string,
): Promise<ProductDetails | null> {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.products, slug);

	const result = await executePublicGraphQL(ProductDetailsDocument, {
		variables: { slug, channel, ...graphqlLanguageCodeVariables(localeSlug) },
	});
	if (!result.ok || !result.data.product) return null;
	const p = result.data.product;
	const name = p.translation?.name || p.name;

	const images: { url: string; alt: string }[] = [];
	for (const m of [...(p.media ?? []), ...(p.variants ?? []).flatMap((v) => v.media ?? [])]) {
		if (m.type !== "IMAGE" || images.some((i) => i.url === m.url)) continue;
		images.push({ url: m.url, alt: m.alt || name });
	}
	if (!images.length && p.thumbnail?.url) images.push({ url: p.thumbnail.url, alt: p.thumbnail.alt || name });

	const { paragraphs, features } = parseDescription(p.translation?.description || p.description);

	const specs: ProductSpec[] = [];
	for (const a of p.attributes ?? []) {
		const label = a.attribute.translation?.name || a.attribute.name;
		const value = a.values
			.map((v) => v.translation?.name || v.name)
			.filter(Boolean)
			.join(", ");
		if (label && value && !/bestseller|related/i.test(a.attribute.slug)) specs.push({ label, value });
	}

	const variants: ProductVariantOption[] = (p.variants ?? []).flatMap((v) => {
		const price = v.pricing?.price?.gross;
		if (!price) return [];
		const und = v.pricing?.priceUndiscounted?.gross.amount ?? null;
		return [
			{
				id: v.id,
				name: v.translation?.name || v.name || v.sku || "Default",
				price: price.amount,
				undiscountedPrice: und !== null && und > price.amount ? und : null,
				currency: price.currency,
				inStock: (v.quantityAvailable ?? 0) > 0,
			},
		];
	});
	const optionAttr = p.variants?.[0]?.selectionAttributes?.[0]?.attribute;

	return {
		images,
		paragraphs,
		features,
		specs,
		optionLabel: (optionAttr?.translation?.name || optionAttr?.name || "Option").toUpperCase(),
		variants,
	};
}
