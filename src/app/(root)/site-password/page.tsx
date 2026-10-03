import { type Metadata } from "next";
import { WvSitePassword } from "@/ui/sections/wv-home/wv-site-password";
import { unlockSite } from "./actions";

export const metadata: Metadata = {
	title: "Password Required — Worldwide Vapor",
	description: "This site is password protected.",
	robots: { index: false, follow: false },
};

export default function SitePasswordPage() {
	return <WvSitePassword unlock={unlockSite} />;
}
