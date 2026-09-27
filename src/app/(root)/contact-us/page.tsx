import { type Metadata } from "next";
import { WvContact } from "@/ui/sections/wv-home/wv-contact";

export const metadata: Metadata = {
	title: "Contact Us — Worldwide Vapor",
	description: "Email, chat or message the Worldwide Vapor support team about products, orders and shipping.",
};

export default function ContactPage() {
	return <WvContact />;
}
