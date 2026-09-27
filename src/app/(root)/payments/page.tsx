import { type Metadata } from "next";
import { WvPayments } from "@/ui/sections/wv-home/wv-payments";

export const metadata: Metadata = {
	title: "Secure & Easy Payments — Worldwide Vapor",
	description:
		"Cards, wallets, crypto and bulk payment plans — fast, encrypted checkout for wholesale and retail orders.",
};

export default function PaymentsPage() {
	return <WvPayments />;
}
