import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { OrderByNumberDocument, OrderStatus } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { graphqlLanguageCodeVariables } from "@/lib/graphql-locale";
import { pickTranslatedName } from "@/lib/saleor-translations";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvOrderDetail, type OrderDetailData } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "Order Details — Worldwide Vapor",
	description: "Track shipment progress and review purchased items.",
};

const locale = () => getDefaultLocaleSlug();
const base = () =>
	buildStorefrontPath(locale(), DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "");

/** Placed → Processing → Shipped, derived from the Saleor order status. */
function buildSteps(status: OrderStatus): OrderDetailData["steps"] {
	const labels = ["ORDER PLACED", "PROCESSING", "SHIPPED"];
	const shipped =
		status === OrderStatus.Fulfilled ||
		status === OrderStatus.Returned ||
		status === OrderStatus.PartiallyReturned;
	const current = shipped ? 3 : 1;
	const stopped = status === OrderStatus.Canceled || status === OrderStatus.Expired;
	return labels.map((label, i) => ({
		label,
		state: i < current ? "complete" : i === current && !stopped ? "current" : "upcoming",
	}));
}

async function OrderData({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvOrderDetail user={null} base={base()} order={null} />;

	const u = state.user;
	const addr = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: addr?.city ?? null,
	};

	const result = await executeAuthenticatedGraphQL(OrderByNumberDocument, {
		variables: { first: 100, ...graphqlLanguageCodeVariables(locale()) },
		cache: "no-cache",
	});
	if (!result.ok) return <WvOrderDetail user={user} base={base()} order={null} failed />;

	const o = result.data.me?.orders?.edges.find(({ node }) => node.number === id)?.node;
	if (!o) return <WvOrderDetail user={user} base={base()} order={null} />;

	const bcp47 = resolveLocaleFromSlug(locale()).bcp47;
	const money = (amount: number, currency: string) =>
		new Intl.NumberFormat(bcp47, { style: "currency", currency }).format(amount);
	const order: OrderDetailData = {
		number: o.number,
		date: new Intl.DateTimeFormat(bcp47, { dateStyle: "medium", timeZone: "UTC" }).format(
			new Date(o.created),
		),
		total: money(o.total.gross.amount, o.total.gross.currency),
		statusLabel: o.statusDisplay,
		steps: buildSteps(o.status),
		lines: o.lines.map((l) => {
			const p = l.variant?.product;
			const price = l.variant?.pricing?.price?.gross;
			return {
				id: l.id,
				name: p ? (pickTranslatedName(p) ?? p.name) : "Item no longer available",
				option: l.variant ? (pickTranslatedName(l.variant) ?? l.variant.name) || null : null,
				quantity: l.quantity,
				price: price ? money(price.amount, price.currency) : "",
				image: p?.thumbnail ? { url: p.thumbnail.url, alt: p.thumbnail.alt ?? p.name } : null,
			};
		}),
	};
	return <WvOrderDetail user={user} base={base()} order={order} />;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
	return (
		<Suspense fallback={<WvOrderDetail user={null} base={base()} order={null} />}>
			<OrderData params={params} />
		</Suspense>
	);
}
