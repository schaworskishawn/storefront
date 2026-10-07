import { type Metadata } from "next";
import { WvDesk } from "@/ui/sections/wv-home/wv-desk";

export const metadata: Metadata = {
	title: "My Desk — Worldwide Vapor",
	description:
		"Your own corner of the site: a cover, shortcuts, private notes, a clock and appearance controls.",
	// A personal page that is empty until a visitor fills it in: nothing for a search engine to index.
	robots: { index: false, follow: true },
};

export default function DeskPage() {
	return <WvDesk />;
}
