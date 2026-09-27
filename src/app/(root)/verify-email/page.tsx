import { type Metadata } from "next";
import { Suspense } from "react";
import { WvFooter, WvHeader } from "@/ui/sections/wv-home/wv-chrome";
import { VerifyEmail } from "@/ui/sections/wv-home/wv-verify-email";
import "@/ui/sections/wv-home/wv-home.css";

export const metadata: Metadata = {
	title: "Verify Email — Worldwide Vapor",
	description: "Verify your email address to activate your Worldwide Vapor account.",
};

async function VerifyContent({
	searchParams,
}: {
	searchParams: Promise<{ email?: string; token?: string }>;
}) {
	const { email, token } = await searchParams;
	return <VerifyEmail email={email} token={token} />;
}

export default function VerifyEmailPage({
	searchParams,
}: {
	searchParams: Promise<{ email?: string; token?: string }>;
}) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="mx-auto flex max-w-[1440px] justify-center px-4 pb-24 pt-16 md:px-16 md:pt-20">
				<Suspense fallback={null}>
					<VerifyContent searchParams={searchParams} />
				</Suspense>
			</main>
			<WvFooter />
		</div>
	);
}
