import { type Metadata } from "next";
import { WvQuit } from "@/ui/sections/wv-home/wv-quit";

export const metadata: Metadata = {
	title: "Quit Nicotine — Worldwide Vapor",
	description: "A personalized, step-by-step plan to reduce nicotine and take back control.",
};

export default function QuitPage() {
	return <WvQuit />;
}
