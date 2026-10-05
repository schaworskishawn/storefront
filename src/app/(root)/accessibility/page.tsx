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
			sectionsHeading="Accessibility Sections"
			supportText="Having trouble using our site? Our team is here to help you shop."
			sections={ACCESSIBILITY_SECTIONS}
			image="/home/legal/terms.png"
		/>
	);
}
