import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { CurrentUserOrdersPaginatedDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { graphqlLanguageCodeVariables } from "@/lib/graphql-locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvOrders, type OrderCardData } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "My Orders — Worldwide Vapor",
	description: "View and track your orders.",
};

const locale = () => getDefaultLocaleSlug();
const base = () =>
	buildStorefrontPath(locale(), DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "");

async function OrdersData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvOrders user={null} base={base()} orders={[]} />;

	const u = state.user;
	const addr = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: addr?.city ?? null,
	};

	const result = await executeAuthenticatedGraphQL(CurrentUserOrdersPaginatedDocument, {
		variables: { first: 20, after: null, ...graphqlLanguageCodeVariables(locale()) },
		cache: "no-cache",
	});
	if (!result.ok) return <WvOrders user={user} base={base()} orders={[]} failed />;

	const bcp47 = resolveLocaleFromSlug(locale()).bcp47;
	const orders: OrderCardData[] = (result.data.me?.orders?.edges ?? []).map(({ node }) => ({
		id: node.id,
		number: node.number,
		date: new Intl.DateTimeFormat(bcp47, { dateStyle: "medium", timeZone: "UTC" }).format(
			new Date(node.created),
		),
		status: node.statusDisplay,
		itemCount: node.lines.reduce((n, l) => n + l.quantity, 0),
		total: new Intl.NumberFormat(bcp47, { style: "currency", currency: node.total.gross.currency }).format(
			node.total.gross.amount,
		),
		thumbs: node.lines
			.flatMap((l) =>
				l.variant?.product.thumbnail
					? [
							{
								url: l.variant.product.thumbnail.url,
								alt: l.variant.product.thumbnail.alt ?? l.variant.product.name,
							},
						]
					: [],
			)
			.slice(0, 3),
	}));
	return <WvOrders user={user} base={base()} orders={orders} />;
}

export default function OrdersPage() {
	return (
		<Suspense fallback={<WvOrders user={null} base={base()} orders={[]} />}>
			<OrdersData />
		</Suspense>
	);
}
