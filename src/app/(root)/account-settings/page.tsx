import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvAccountSettings } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "Account Settings — Worldwide Vapor",
	description: "Update profile, security, and communication preferences.",
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

async function SettingsData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvAccountSettings user={null} base={base()} profile={null} />;
	const u = state.user;
	const def = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: def?.city ?? null,
	};
	return (
		<WvAccountSettings
			user={user}
			base={base()}
			profile={{ firstName: u.firstName, lastName: u.lastName, email: u.email }}
		/>
	);
}

export default function AccountSettingsPage() {
	return (
		<Suspense fallback={<WvAccountSettings user={null} base={base()} profile={null} />}>
			<SettingsData />
		</Suspense>
	);
}
