import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvAddresses } from "@/ui/sections/wv-home/wv-orders";
import type { AddressData } from "@/ui/sections/wv-home/wv-addresses-client";

export const metadata: Metadata = {
	title: "Addresses — Worldwide Vapor",
	description: "Manage shipping and billing addresses.",
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

async function AddressesData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvAddresses user={null} base={base()} addresses={[]} />;
	const u = state.user;
	const def = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: def?.city ?? null,
	};

	const addresses: AddressData[] = u.addresses.map((a) => ({
		id: a.id,
		firstName: a.firstName,
		lastName: a.lastName,
		companyName: a.companyName,
		streetAddress1: a.streetAddress1,
		streetAddress2: a.streetAddress2,
		city: a.city,
		postalCode: a.postalCode,
		countryArea: a.countryArea,
		countryCode: a.country.code,
		countryName: a.country.country,
		phone: a.phone ?? "",
		isDefaultShipping: a.id === u.defaultShippingAddress?.id,
		isDefaultBilling: a.id === u.defaultBillingAddress?.id,
	}));
	addresses.sort(
		(x, y) =>
			Number(y.isDefaultShipping) - Number(x.isDefaultShipping) ||
			Number(y.isDefaultBilling) - Number(x.isDefaultBilling),
	);
	return <WvAddresses user={user} base={base()} addresses={addresses} />;
}

export default function AddressesPage() {
	return (
		<Suspense fallback={<WvAddresses user={null} base={base()} addresses={[]} />}>
			<AddressesData />
		</Suspense>
	);
}
