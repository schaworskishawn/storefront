import { type Metadata } from "next";
import { WvFaqs } from "@/ui/sections/wv-home/wv-faqs";

export const metadata: Metadata = {
	title: "FAQs — Worldwide Vapor",
	description: "Quick answers about payments, shipping, returns, authenticity and wholesale pricing.",
};

export default function FaqsPage() {
	return <WvFaqs />;
}
