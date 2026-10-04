import { HomeCollectionsDocument } from "@/gql/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { executePublicGraphQL } from "@/lib/graphql";
import type { HomeMembership } from "./home-collections";

/** Saleor collection slug behind each home collection. Staff change what's in them in Saleor Dashboard > Collections. */
export const HOME_COLLECTION_SLUGS = {
	staffPicks: "staff-picks",
	originals: "worldwide-vapor-originals",
	starterKits: "starter-kits",
} as const satisfies Record<keyof HomeMembership, string>;

const EMPTY: HomeMembership = { staffPicks: [], originals: [], starterKits: [] };

/**
 * Product ids in each home collection. A collection that doesn't exist, is unpublished, or can't be read comes back
 * empty, and its section is simply left off the page. Reads up to 100 products per collection.
 */
export async function getHomeCollections(channel: string): Promise<HomeMembership> {
	"use cache";
	// Tagged per collection, so a collection-updated webhook for any of them refreshes this.
	for (const slug of Object.values(HOME_COLLECTION_SLUGS))
		applyCacheProfile(CACHE_PROFILES.collections, slug);

	const result = await executePublicGraphQL(HomeCollectionsDocument, {
		variables: { channel, slugs: Object.values(HOME_COLLECTION_SLUGS) },
	});
	if (!result.ok) {
		console.warn(`[getHomeCollections] Failed to fetch for ${channel}:`, result.error.message);
		return EMPTY;
	}

	const idsBySlug = new Map<string, string[]>();
	for (const { node } of result.data.collections?.edges ?? []) {
		idsBySlug.set(
			node.slug,
			(node.products?.edges ?? []).map((e) => e.node.id),
		);
	}
	return {
		staffPicks: idsBySlug.get(HOME_COLLECTION_SLUGS.staffPicks) ?? [],
		originals: idsBySlug.get(HOME_COLLECTION_SLUGS.originals) ?? [],
		starterKits: idsBySlug.get(HOME_COLLECTION_SLUGS.starterKits) ?? [],
	};
}
