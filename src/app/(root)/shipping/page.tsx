import { type Metadata } from "next";
import { WvShipping } from "@/ui/sections/wv-home/wv-shipping";

export const metadata: Metadata = {
	title: "Fast & Reliable Shipping — Worldwide Vapor",
	description:
		"Discreet packaging, tracked delivery and flexible shipping speeds — dispatched within 24 hours.",
};

export default function ShippingPage() {
	return <WvShipping />;
}
