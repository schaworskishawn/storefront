import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { WvFooter, WvHeader } from "@/ui/sections/wv-home/wv-chrome";
import { RegisterForm } from "@/ui/sections/wv-home/wv-register-form";
import "@/ui/sections/wv-home/wv-home.css";

export const metadata: Metadata = {
	title: "Register — Worldwide Vapor",
	description: "Create your Worldwide Vapor account.",
};

async function RegisterContent() {
	const state = await getAccountAuthState();
	if (state.status === "authenticated") redirect("/account");
	return <RegisterForm channel={DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? ""} />;
}

export default function RegisterPage() {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="mx-auto flex max-w-[1440px] justify-center px-4 pb-24 pt-16 md:px-16 md:pt-20">
				<Suspense fallback={null}>
					<RegisterContent />
				</Suspense>
			</main>
			<WvFooter />
		</div>
	);
}
