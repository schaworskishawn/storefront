import { OwnerBulletinDocument } from "@/gql/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { executePublicGraphQL } from "@/lib/graphql";
import { BULLETIN_SLUG, toBulletin, type Bulletin } from "./bulletin";

/**
 * The owner's bulletin, from the Saleor page `owner-bulletin`. Null when there isn't one (nothing created yet, or unpublished)
 * or Saleor can't be reached: the panel is then left off the page rather than showing something stale or invented.
 * Tagged like every Saleor page, so editing it in the Dashboard refreshes it.
 */
export async function getOwnerBulletin(): Promise<Bulletin | null> {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.pages, BULLETIN_SLUG);

	const result = await executePublicGraphQL(OwnerBulletinDocument, { variables: { slug: BULLETIN_SLUG } });
	if (!result.ok) {
		console.warn("[getOwnerBulletin] Failed to fetch the bulletin:", result.error.message);
		return null;
	}
	return toBulletin(result.data.page);
}
