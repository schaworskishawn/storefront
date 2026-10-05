import { type Metadata } from "next";
import { Suspense } from "react";
import type { QuitAccountState } from "@/ui/sections/wv-home/wv-quit-account";
import { WvHeader } from "@/ui/sections/wv-home/wv-chrome";
import { WvQuit } from "@/ui/sections/wv-home/wv-quit";
import { fetchQuitAccount } from "./account";

export const metadata: Metadata = {
	title: "Quit Nicotine — Worldwide Vapor",
	description: "A personalized, step-by-step plan to reduce nicotine and take back control.",
};

async function QuitWithAccount() {
	const account = await fetchQuitAccount();
	const state: QuitAccountState =
		account.status === "signedIn" ? { status: "signedIn", plan: account.plan } : { status: account.status };
	return <WvQuit account={state} />;
}

export default function QuitPage() {
	// The account is read per visitor (cookies), so it streams in behind the shell instead of making the page dynamic.
	return (
		<div className="bg-[var(--qp-bg)]">
			{/* The same site menu as every other page: inline links on tablet and desktop, a hamburger on mobile. */}
			<WvHeader />
			<Suspense fallback={<WvQuit account={{ status: "loading" }} />}>
				<QuitWithAccount />
			</Suspense>
		</div>
	);
}
