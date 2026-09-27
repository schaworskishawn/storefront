import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvLogout } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "Log Out — Worldwide Vapor",
	description: "End your current account session securely.",
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

async function LogoutData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvLogout user={null} base={base()} />;
	const u = state.user;
	const def = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	return (
		<WvLogout
			user={{
				name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
				email: u.email,
				city: def?.city ?? null,
			}}
			base={base()}
		/>
	);
}

export default function LogoutPage() {
	return (
		<Suspense fallback={<WvLogout user={null} base={base()} />}>
			<LogoutData />
		</Suspense>
	);
}
