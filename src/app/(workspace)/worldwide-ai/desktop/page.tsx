import type { Metadata } from "next";
import { Suspense } from "react";
import { Desktop } from "@/ui/sections/worldwide-ai/desktop/desktop";
import { ShellFallback } from "@/ui/sections/worldwide-ai/shell";

export const metadata: Metadata = { title: "Worldwide AI OS" };

/** The Worldwide AI OS desktop. It checks who is signed in before it shows anything, like every workspace page. */
export default function DesktopPage() {
	return (
		<Suspense fallback={<ShellFallback />}>
			<Desktop />
		</Suspense>
	);
}
