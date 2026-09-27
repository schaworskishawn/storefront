import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { safeNextPath } from "@/lib/age-gate";
import { WvFooter, WvHeader } from "@/ui/sections/wv-home/wv-chrome";
import { LoginForm } from "@/ui/sections/wv-home/wv-login-form";
import "@/ui/sections/wv-home/wv-home.css";

export const metadata: Metadata = {
	title: "Login — Worldwide Vapor",
	description: "Sign in to your Worldwide Vapor account.",
};

const channel = () => DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "";

async function LoginContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
	const { next } = await searchParams;
	const state = await getAccountAuthState();
	if (state.status === "authenticated") redirect(safeNextPath(next, "/account"));
	return <LoginForm channel={channel()} next={next} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="mx-auto flex max-w-[1440px] justify-center px-4 pb-24 pt-16 md:px-16 md:pt-20">
				<Suspense fallback={null}>
					<LoginContent searchParams={searchParams} />
				</Suspense>
			</main>
			<WvFooter />
		</div>
	);
}
