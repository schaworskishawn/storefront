import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { CurrentUserPaymentMethodsDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvPaymentMethods, type SavedCardData } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "Payment Methods — Worldwide Vapor",
	description: "Manage saved cards and billing details.",
};

const channel = () => DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";
const base = () => buildStorefrontPath(getDefaultLocaleSlug(), channel());

async function PaymentMethodsData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvPaymentMethods user={null} base={base()} cards={[]} />;

	const u = state.user;
	const addr = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: addr?.city ?? null,
	};

	const result = await executeAuthenticatedGraphQL(CurrentUserPaymentMethodsDocument, {
		variables: { channel: channel() },
		cache: "no-cache",
	});
	if (!result.ok) return <WvPaymentMethods user={user} base={base()} cards={[]} failed />;

	const cards: SavedCardData[] = (result.data.me?.storedPaymentMethods ?? []).map((m) => {
		const cc = m.creditCardInfo;
		return {
			id: m.id,
			title: cc ? `${cc.brand.toUpperCase()} •••• ${cc.lastDigits}` : (m.name ?? m.type).toUpperCase(),
			expiry:
				cc?.expMonth && cc.expYear
					? `${String(cc.expMonth).padStart(2, "0")}/${String(cc.expYear).slice(-2)}`
					: null,
		};
	});
	return <WvPaymentMethods user={user} base={base()} cards={cards} />;
}

export default function PaymentMethodsPage() {
	return (
		<Suspense fallback={<WvPaymentMethods user={null} base={base()} cards={[]} />}>
			<PaymentMethodsData />
		</Suspense>
	);
}
