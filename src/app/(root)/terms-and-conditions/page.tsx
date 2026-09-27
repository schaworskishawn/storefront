import { type Metadata } from "next";
import { TERMS_SECTIONS, TERMS_UPDATED } from "@/lib/legal/terms";
import { WvLegal } from "@/ui/sections/wv-home/wv-legal";

export const metadata: Metadata = {
	title: "Terms & Conditions — Worldwide Vapor",
	description: "The terms that govern your use of the Worldwide Vapor website and purchases.",
};

export default function TermsPage() {
	return (
		<WvLegal
			crumb="Terms & Conditions"
			titleLead="TERMS AND"
			titleAccent="CONDITIONS"
			updated={TERMS_UPDATED}
			intro="Please read these terms and conditions carefully before using our services or purchasing our premium vapor products. By accessing this website, you agree to be bound by these regulations."
			sectionsHeading="Terms & Conditions Sections"
			supportText="If you have any questions about these Terms, our team is always here to assist."
			sections={TERMS_SECTIONS}
			image="/home/legal/terms.png"
		/>
	);
}
