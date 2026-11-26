import { Accessibility, LifeBuoy, MessageSquare } from "lucide-react";
import { type Metadata } from "next";
import { ACCESSIBILITY_SECTIONS, ACCESSIBILITY_UPDATED } from "@/lib/legal/accessibility";
import { WvLegal } from "@/ui/sections/wv-home/wv-legal";

export const metadata: Metadata = {
	title: "Accessibility — Worldwide Vapor",
	description:
		"Our commitment to an accessible website, what we do, what we are still working on, and how to get help.",
};

export default function AccessibilityPage() {
	return (
		<WvLegal
			crumb="Accessibility"
			titleLead="ACCESSIBILITY"
			titleAccent="STATEMENT"
			updated={ACCESSIBILITY_UPDATED}
			intro="We want everyone to be able to browse and shop with Worldwide Vapor. This page explains what we do to make our website accessible, where we still fall short, and how to reach us if something gets in your way."
			introKeys={["everyone", "accessible", "where we still fall short", "how to reach us"]}
			highlights={[
				{ Icon: Accessibility, label: "Aiming for WCAG 2.1 AA", section: "our-commitment" },
				{ Icon: LifeBuoy, label: "Help placing an order", section: "need-help-ordering" },
				{ Icon: MessageSquare, label: "Tell us what's wrong", section: "feedback" },
			]}
			sectionsHeading="Accessibility Sections"
			supportText="Having trouble using our site? Our team is here to help you shop."
			sections={ACCESSIBILITY_SECTIONS}
			image="/home/legal/accessibility.svg"
			imageAlt="A glowing tablet showing the shop, its Add to cart button in a keyboard-focus ring beside a large text-size control, a screen-reader speech bubble, the accessibility symbol, lit keycaps for Tab, the arrows and Enter, and neon seals for text size, contrast, voice control and every screen size"
		/>
	);
}
