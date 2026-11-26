import { BadgeCheck, CircleDollarSign, Undo2 } from "lucide-react";
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
			intro="Please read these terms carefully. They cover using our site, ordering and paying, shipping and returns, age verification, Vapor Tokens, and our affiliate and distributor programs. By using the site or placing an order, you agree to them."
			introKeys={["ordering and paying", "shipping and returns", "age verification", "Vapor Tokens"]}
			highlights={[
				{ Icon: BadgeCheck, label: "Adults 18+ only", section: "age-verification" },
				{ Icon: Undo2, label: "15-day returns", section: "returns-and-refunds" },
				{ Icon: CircleDollarSign, label: "No payment fees", section: "pricing-and-payment" },
			]}
			sectionsHeading="Terms & Conditions Sections"
			supportText="If you have any questions about these Terms, our team is always here to assist."
			sections={TERMS_SECTIONS}
			image="/home/legal/terms.svg"
			imageAlt="A glowing contract with ticked clauses, a seal and a signature, between the scales of justice and a shield with a tick, wired to neon seals for age verification, secure payments, shipping, returns and intellectual property"
		/>
	);
}
