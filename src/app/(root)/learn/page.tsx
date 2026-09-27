import { type Metadata } from "next";
import { getAllArticles, toSummary } from "@/lib/learn/articles";
import { WvLearn } from "@/ui/sections/wv-home/wv-learn";

export const metadata: Metadata = {
	title: "Learn — Worldwide Vapor",
	description: "Tips, guides, reviews and the latest news from the vaping world.",
};

export default function LearnPage() {
	return <WvLearn articles={getAllArticles().map(toSummary)} />;
}
