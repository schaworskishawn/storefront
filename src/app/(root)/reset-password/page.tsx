import { type Metadata } from "next";
import { Suspense } from "react";
import { WvFooter, WvHeader } from "@/ui/sections/wv-home/wv-chrome";
import { ResetForm } from "@/ui/sections/wv-home/wv-reset-form";
import "@/ui/sections/wv-home/wv-home.css";

export const metadata: Metadata = {
	title: "Reset Password — Worldwide Vapor",
	description: "Choose a new secure password.",
};

type Search = Promise<{ email?: string; token?: string }>;

async function ResetContent({ searchParams }: { searchParams: Search }) {
	const { email, token } = await searchParams;
	return <ResetForm email={email} token={token} />;
}

export default function ResetPasswordPage({ searchParams }: { searchParams: Search }) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="mx-auto flex max-w-[1440px] justify-center px-4 pb-24 pt-16 md:px-16 md:pt-20">
				<Suspense fallback={null}>
					<ResetContent searchParams={searchParams} />
				</Suspense>
			</main>
			<WvFooter />
		</div>
	);
}
