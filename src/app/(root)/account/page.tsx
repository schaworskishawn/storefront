import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvAccount } from "@/ui/sections/wv-home/wv-account";

export const metadata: Metadata = {
	title: "My Account — Worldwide Vapor",
	description: "Manage your orders, saved details, and account settings.",
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

async function AccountData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvAccount user={null} base={base()} />;
	const u = state.user;
	const addr = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
	return (
		<WvAccount
			user={{
				name,
				email: u.email,
				city: addr?.city ? `${addr.city}${addr.countryArea ? `, ${addr.countryArea}` : ""}` : null,
			}}
			base={base()}
		/>
	);
}

export default function AccountPage() {
	return (
		<Suspense fallback={<WvAccount user={null} base={base()} />}>
			<AccountData />
		</Suspense>
	);
}
