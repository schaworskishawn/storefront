import { EyeOff, Lock, UserCheck } from "lucide-react";
import { type Metadata } from "next";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "@/lib/legal/privacy";
import { WvLegal } from "@/ui/sections/wv-home/wv-legal";

export const metadata: Metadata = {
	title: "Privacy Policy — Worldwide Vapor",
	description: "How Worldwide Vapor collects, uses, protects and shares your personal information.",
};

export default function PrivacyPolicyPage() {
	return (
		<WvLegal
			crumb="Privacy Policy"
			titleLead="PRIVACY"
			titleAccent="POLICY"
			accent="cyan"
			updated={PRIVACY_UPDATED}
			intro="Your privacy is important to us. This policy explains how Worldwide Vapor collects, uses, protects, and shares your personal information when you visit our website or purchase our premium vapor products."
			introKeys={["collects, uses, protects, and shares", "personal information"]}
			highlights={[
				{ Icon: EyeOff, label: "We don't sell your data", section: "data-sharing" },
				{ Icon: Lock, label: "SSL-encrypted", section: "data-security" },
				{ Icon: UserCheck, label: "Your rights & choices", section: "your-rights-and-choices" },
			]}
			sectionsHeading="Privacy Policy Sections"
			supportText="If you have questions about your privacy or data, our team is here to help."
			sections={PRIVACY_SECTIONS}
			image="/home/legal/privacy.svg"
			imageAlt="A profile card sealed in a glowing shield dome with a padlock, the data a store collects (email, address, phone and payment) wired in over locked links, and a crossed-out price tag and eye for not selling your data and no ad tracking"
		/>
	);
}
