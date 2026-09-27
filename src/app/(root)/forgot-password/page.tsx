import { type Metadata } from "next";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { WvFooter, WvHeader } from "@/ui/sections/wv-home/wv-chrome";
import { ForgotForm } from "@/ui/sections/wv-home/wv-forgot-form";
import "@/ui/sections/wv-home/wv-home.css";

export const metadata: Metadata = {
	title: "Forgot Password — Worldwide Vapor",
	description: "Enter your email to receive a password reset link.",
};

export default function ForgotPasswordPage() {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="mx-auto flex max-w-[1440px] justify-center px-4 pb-24 pt-16 md:px-16 md:pt-20">
				<ForgotForm channel={DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? ""} />
			</main>
			<WvFooter />
		</div>
	);
}
