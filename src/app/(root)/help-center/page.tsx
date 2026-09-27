import { type Metadata } from "next";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvHelpCenter } from "@/ui/sections/wv-home/wv-orders";

export const metadata: Metadata = {
	title: "Help Center — Worldwide Vapor",
	description: "Find answers or contact Worldwide Vapor support.",
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

async function HelpData() {
	const state = await getAccountAuthState();
	if (state.status !== "authenticated") return <WvHelpCenter user={null} base={base()} />;
	const u = state.user;
	const def = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	return (
		<WvHelpCenter
			user={{
				name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
				email: u.email,
				city: def?.city ?? null,
			}}
			base={base()}
		/>
	);
}

export default function HelpCenterPage() {
	return (
		<Suspense fallback={<WvHelpCenter user={null} base={base()} />}>
			<HelpData />
		</Suspense>
	);
}
