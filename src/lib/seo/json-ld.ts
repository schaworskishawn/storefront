import { type BreadcrumbList, type FAQPage, type WithContext, type Product } from "schema-dts";
import { serializeForInlineScript } from "@/lib/html/inline-script";
import { seoConfig, getBaseUrl } from "./config";

/**
 * Product JSON-LD structured data builder
 *
 * Creates Schema.org Product markup for rich Google search results.
 * This helps your products appear with prices, availability, and images in search.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 *
 * @example
 * const jsonLd = buildProductJsonLd({
 *   name: product.name,
 *   description: product.seoDescription,
 *   images: product.media?.map(m => m.url),
 *   sku: variant?.sku,
 *   brand: product.brand,
 *   url: `/products/${product.slug}`,
 *   price: { amount: 29.99, currency: "USD" },
 *   inStock: true,
 * });
 *
 * // In your page (jsonLdScriptProps escapes the payload for an inline <script>):
 * <script {...jsonLdScriptProps(jsonLd)} />
 */
export function buildProductJsonLd(options: {
	name: string;
	description?: string;
	images?: string[];
	sku?: string | null;
	brand?: string | null;
	url?: string;
	/** Single variant pricing */
	price?: {
		amount: number;
		currency: string;
	} | null;
	/** Price range for products with variants */
	priceRange?: {
		lowPrice: number;
		highPrice: number;
		currency: string;
	} | null;
	inStock?: boolean;
	variantCount?: number;
	/** The product's category name (schema.org `category`). */
	category?: string | null;
	/** Spec rows, published as `additionalProperty` so search and AI engines can read them as facts. */
	properties?: { name: string; value: string }[];
}): WithContext<Product> | null {
	if (!seoConfig.enableJsonLd) {
		return null;
	}

	const {
		name,
		description,
		images,
		sku,
		brand,
		url,
		price,
		priceRange,
		inStock = true,
		variantCount,
		category,
		properties,
	} = options;

	const baseUrl = getBaseUrl();
	const fullUrl = url ? `${baseUrl}${url}` : undefined;

	return {
		"@context": "https://schema.org",
		"@type": "Product",
		name,
		description: description || name,
		image: images && images.length > 0 ? images : undefined,
		...(fullUrl && { url: fullUrl }),
		...(sku && { sku }),
		...(category && { category }),
		...(properties?.length && {
			additionalProperty: properties.map((p) => ({
				"@type": "PropertyValue" as const,
				name: p.name,
				value: p.value,
			})),
		}),
		brand: {
			"@type": "Brand",
			name: brand || seoConfig.defaultBrand,
		},
		offers: price
			? {
					"@type": "Offer",
					url: fullUrl,
					availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
					priceCurrency: price.currency,
					price: price.amount,
					seller: {
						"@type": "Organization",
						name: seoConfig.organizationName,
					},
				}
			: priceRange
				? {
						"@type": "AggregateOffer",
						url: fullUrl,
						availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
						priceCurrency: priceRange.currency,
						lowPrice: priceRange.lowPrice,
						highPrice: priceRange.highPrice,
						offerCount: variantCount,
						seller: {
							"@type": "Organization",
							name: seoConfig.organizationName,
						},
					}
				: undefined,
	};
}

/**
 * FAQPage structured data for questions and answers shown on the page (they must be visible there too).
 * Returns null when there are none.
 */
export function buildFaqJsonLd(faqs: { q: string; a: string }[]): WithContext<FAQPage> | null {
	if (!seoConfig.enableJsonLd || faqs.length === 0) return null;
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((f) => ({
			"@type": "Question",
			name: f.q,
			acceptedAnswer: { "@type": "Answer", text: f.a },
		})),
	};
}

/** BreadcrumbList structured data; `url`s are site paths (made absolute here). The last item may omit its url. */
export function buildBreadcrumbJsonLd(
	items: { name: string; url?: string }[],
): WithContext<BreadcrumbList> | null {
	if (!seoConfig.enableJsonLd || items.length === 0) return null;
	const baseUrl = getBaseUrl();
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: item.name,
			...(item.url && { item: `${baseUrl}${item.url}` }),
		})),
	};
}

/**
 * JSON-LD Script component helper
 *
 * @example
 * <script {...jsonLdScriptProps(productJsonLd)} />
 */
export function jsonLdScriptProps(data: object | null) {
	if (!data) return null;
	return {
		type: "application/ld+json",
		dangerouslySetInnerHTML: { __html: serializeForInlineScript(data) },
	};
}
