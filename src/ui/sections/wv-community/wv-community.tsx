import { WvFooter, WvHeader } from "../wv-home/wv-chrome";
import { CommunityApp } from "./community-app";
import "../wv-home/wv-home.css";
import "./wv-community.css";

/**
 * The community page: a Discord-style group (channels, a live feed, who's online) inside the usual header and footer. The
 * app itself is a client component; everything it needs comes from /api/community/*. Anyone can read; posting needs a store
 * account and a nickname.
 */
export function WvCommunity() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="px-2 pb-6 pt-3 md:px-6 xl:px-16">
				<h1 className="sr-only">Worldwide Vapor community</h1>
				<CommunityApp />
			</main>
			<WvFooter />
		</div>
	);
}
