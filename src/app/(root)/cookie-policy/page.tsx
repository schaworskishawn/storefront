import { type Metadata } from "next";
import { COOKIE_SECTIONS, COOKIES_UPDATED } from "@/lib/legal/cookies";
import { WvLegal } from "@/ui/sections/wv-home/wv-legal";

export const metadata: Metadata = {
	title: "Cookie Policy — Worldwide Vapor",
	description: "The cookies and browser storage Worldwide Vapor uses, why, and how to manage them.",
};

export default function CookiePolicyPage() {
	return (
		<WvLegal
			crumb="Cookie Policy"
			titleLead="COOKIE"
			titleAccent="POLICY"
			accent="cyan"
			updated={COOKIES_UPDATED}
			intro="This policy explains which cookies and similar browser storage Worldwide Vapor uses, what each one is for, how long it lasts, and how you can control them."
			sectionsHeading="Cookie Policy Sections"
			supportText="If you have questions about cookies or your data, our team is here to help."
			sections={COOKIE_SECTIONS}
			image="/home/legal/privacy.png"
		/>
	);
}
