import { type Metadata } from "next";
import { WvReturns } from "@/ui/sections/wv-home/wv-returns";

export const metadata: Metadata = {
	title: "Returns & Refunds — Worldwide Vapor",
	description:
		"Our 15-day return window, how to start a return by email, the prepaid label and its $4.99 postage fee, refund timelines, exchanges and which items cannot be returned.",
};

export default function ReturnsPage() {
	return <WvReturns />;
}
