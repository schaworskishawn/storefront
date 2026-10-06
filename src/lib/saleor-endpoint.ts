/**
 * The address to POST GraphQL to, from the configured Saleor URL (NEXT_PUBLIC_SALEOR_API_URL, e.g.
 * `https://store.saleor.cloud/graphql/`).
 *
 * The trailing slash matters: Saleor answers `/graphql/` and gives a 404 to `/graphql`. Server code that tidied the URL by
 * trimming the slash off therefore got "Saleor answered 404" for every call (rewards, crypto payment reports, Pay in 4, the
 * install check). This always returns exactly one trailing slash, whether or not the setting has one. Null when unset.
 */
export function saleorGraphqlUrl(raw: string | null | undefined): string | null {
	const trimmed = raw?.trim().replace(/\/+$/, "");
	return trimmed ? `${trimmed}/` : null;
}
