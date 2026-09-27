import { type Metadata } from "next";
import { WvAffiliate } from "@/ui/sections/wv-home/wv-affiliate";

export const metadata: Metadata = {
	title: "Affiliate Program — Worldwide Vapor",
	description:
		"Earn 10–20% commission promoting Worldwide Vapor. Commission tiers, dashboard and referral tools.",
};

export default function AffiliateProgramPage() {
	return <WvAffiliate />;
}
