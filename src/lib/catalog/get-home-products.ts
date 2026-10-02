import { ProductListDocument, type ProductListQuery } from "@/gql/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { remapCategoryName, remapCategorySlug } from "@/lib/catalog/category-map";
import { executePublicGraphQL } from "@/lib/graphql";
import { graphqlLanguageCodeVariables } from "@/lib/graphql-locale";
import { isBestseller } from "@/lib/catalog/product-flags";
import { getDiscountInfo } from "@/lib/pricing";

export type HomeProduct = {
	id: string;
	slug: string;
	name: string;
	brand: string;
	categorySlug: string | null;
	categoryImage: { url: string; alt: string } | null;
	image: { url: string; alt: string } | null;
	price: number;
	priceStop: number | null;
	undiscountedPrice: number | null;
	currency: string;
	isOnSale: boolean;
	discountPercent: number | null;
	isBestseller: boolean;
	created: string;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type CatalogEdge = NonNullable<ProductListQuery["products"]>["edges"][number];
type CatalogPage = { edges: CatalogEdge[]; next: string | null };

async function fetchCatalogPage(
	channel: string,
	localeSlug: string,
	after: string | null,
): Promise<CatalogPage | null> {
	const result = await executePublicGraphQL(ProductListDocument, {
		variables: { first: PAGE_SIZE, after, channel, ...graphqlLanguageCodeVariables(localeSlug) },
	});
	if (!result.ok) {
		console.warn(`[getHomeProducts] Failed to fetch for ${channel}:`, result.error.message);
		return null;
	}
	const connection = result.data.products;
	return {
		edges: connection?.edges ?? [],
		next: connection?.pageInfo.hasNextPage ? (connection.pageInfo.endCursor ?? null) : null,
	};
}

/**
 * Full channel catalog (all pages) for the Worldwide Vapor storefront. One cached fetch feeds the home
 * sections, shop, search, cart and every product page; callers slice or look up in it.
 * Returns [] on failure so the page still renders.
 */
export async function getHomeProducts(channel: string, localeSlug: string): Promise<HomeProduct[]> {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.collections, "home-products");

	const edges: CatalogEdge[] = [];
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page++) {
		const catalogPage = await fetchCatalogPage(channel, localeSlug, after);
		if (!catalogPage) return [];
		edges.push(...catalogPage.edges);
		if (!catalogPage.next) break;
		after = catalogPage.next;
	}

	return edges.flatMap(({ node }) => {
		const range = node.pricing?.priceRange;
		const price = range?.start?.gross.amount;
		const currency = range?.start?.gross.currency;
		if (typeof price !== "number" || !currency) return [];
		const undiscounted = node.pricing?.priceRangeUndiscounted?.start?.gross.amount ?? null;
		const { isOnSale, discountPercent } = getDiscountInfo(price, undiscounted);
		const stop = range?.stop?.gross.amount ?? null;
		const name = node.translation?.name || node.name;
		const rawCategorySlug = node.category?.slug ?? null;
		const rawCategoryName = node.category?.translation?.name || node.category?.name || "";
		return [
			{
				id: node.id,
				slug: node.slug,
				name,
				// See category-map.ts: the connected Saleor catalog's real category slugs/names are
				// leftover demo data, remapped here to Worldwide Vapor's actual taxonomy.
				brand: rawCategorySlug ? remapCategoryName(rawCategorySlug, rawCategoryName) : rawCategoryName,
				categorySlug: rawCategorySlug ? remapCategorySlug(rawCategorySlug) : null,
				categoryImage: node.category?.backgroundImage?.url
					? {
							url: node.category.backgroundImage.url,
							alt: node.category.backgroundImage.alt || node.category.name,
						}
					: null,
				image: node.thumbnail?.url ? { url: node.thumbnail.url, alt: node.thumbnail.alt || name } : null,
				price,
				priceStop: stop !== null && stop !== price ? stop : null,
				undiscountedPrice: isOnSale ? undiscounted : null,
				currency,
				isOnSale,
				discountPercent,
				isBestseller: isBestseller(node),
				created: node.created,
			},
		];
	});
}

export type WvCategoryTile = {
	slug: string;
	name: string;
	image: { url: string; alt: string } | null;
};

/** One tile per category present in the catalog; prefers the category image, else a product thumbnail. */
export function buildCategoryTiles(catalog: HomeProduct[], max = 6): WvCategoryTile[] {
	const tiles = new Map<string, WvCategoryTile>();
	for (const p of catalog) {
		if (!p.categorySlug || !p.brand || tiles.has(p.categorySlug)) continue;
		tiles.set(p.categorySlug, { slug: p.categorySlug, name: p.brand, image: p.categoryImage ?? p.image });
		if (tiles.size >= max) break;
	}
	return [...tiles.values()];
}
