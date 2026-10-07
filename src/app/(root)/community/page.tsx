import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { isCommunityEnabled } from "@/lib/community/config";
import { WvCommunity } from "@/ui/sections/wv-community/wv-community";

export const metadata: Metadata = {
	title: "Community — Worldwide Vapor",
	description:
		"Chat with other Worldwide Vapor customers: talk flavours and devices, share quit-journey wins, and hear about restocks first.",
};

/** Like the rewards page, it only exists once it has somewhere to keep its messages (see docs/community.md). */
export default function CommunityPage() {
	if (!isCommunityEnabled()) notFound();
	return <WvCommunity />;
}
