import { type Metadata } from "next";
import { WvAgeVerification } from "@/ui/sections/wv-home/wv-age";

export const metadata: Metadata = {
	title: "Age Verification — Worldwide Vapor",
	description: "Confirm you are of legal smoking age to access Worldwide Vapor.",
};

export default function AgeVerificationPage() {
	return <WvAgeVerification />;
}
