import { type Metadata } from "next";
import { WvDistributor } from "@/ui/sections/wv-home/wv-distributor";

export const metadata: Metadata = {
	title: "Become a Distributor — Worldwide Vapor",
	description:
		"Join the Worldwide Vapor wholesale and distribution network: partnership tiers, requirements and FAQs.",
};

export default function DistributorPage() {
	return <WvDistributor />;
}
