import { type Metadata } from "next";
import { WvReturns } from "@/ui/sections/wv-home/wv-returns";

export const metadata: Metadata = {
	title: "Returns & Refunds — Worldwide Vapor",
	description:
		"Our 15-day return window, how returns work, refund timelines and which items are not eligible.",
};

export default function ReturnsPage() {
	return <WvReturns />;
}
