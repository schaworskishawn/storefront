import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { MyReviewsDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { parseReviews, type ReviewableProduct } from "@/lib/reviews";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvMyReviews } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "My Reviews — Worldwide Vapor",
	description: "View, write, and manage your product reviews.",
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

async function ReviewsData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated")
		return <WvMyReviews user={null} base={base()} reviews={[]} pending={[]} />;
	const u = state.user;
	const addr = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: addr?.city ?? null,
	};

	const r = await executeAuthenticatedGraphQL(MyReviewsDocument, { cache: "no-cache" });
	if (!r.ok || !r.data.me) return <WvMyReviews user={user} base={base()} reviews={[]} pending={[]} failed />;

	const reviews = parseReviews(r.data.me.metafield);
	const reviewed = new Set(reviews.map((x) => x.productId));
	const bought = new Map<string, ReviewableProduct>();
	for (const { node } of r.data.me.orders?.edges ?? []) {
		for (const l of node.lines) {
			const p = l.variant?.product;
			if (p && !reviewed.has(p.id) && !bought.has(p.id))
				bought.set(p.id, {
					id: p.id,
					name: p.name,
					slug: p.slug,
					image: p.thumbnail ? { url: p.thumbnail.url, alt: p.thumbnail.alt ?? p.name } : null,
				});
		}
	}
	return <WvMyReviews user={user} base={base()} reviews={reviews} pending={[...bought.values()]} />;
}

export default function MyReviewsPage() {
	return (
		<Suspense fallback={<WvMyReviews user={null} base={base()} reviews={[]} pending={[]} />}>
			<ReviewsData />
		</Suspense>
	);
}
