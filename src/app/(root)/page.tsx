import { redirect } from "next/navigation";
import { DefaultChannelSlug } from "@/app/config";

/**
 * Root page redirects to the storefront home.
 *
 * This fork uses flat routes (`/home`, `/shop`, …) for its actual customer-facing site, not the
 * stock Paper template's `/{locale}/{channel}` scheme — redirecting there instead landed every
 * visitor to `/` (and every `href="/"` link across the app) on the generic, unbranded template
 * homepage rather than the real site. `/home` itself still runs the age-gate before real content.
 *
 * Requires NEXT_PUBLIC_DEFAULT_CHANNEL to be set.
 * In development, shows setup instructions if not configured.
 */
export default function RootPage() {
	if (DefaultChannelSlug) {
		redirect("/home");
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-8">
			<div className="max-w-md text-center">
				<h1 className="mb-4 text-balance text-h1 text-foreground">Channel Not Configured</h1>
				<p className="mb-6 text-muted-foreground">
					Set the <code className="rounded bg-muted px-2 py-1">NEXT_PUBLIC_DEFAULT_CHANNEL</code> environment
					variable to your Saleor channel slug.
				</p>
				<div className="rounded-lg bg-muted p-4 text-left">
					<p className="mb-2 text-sm font-medium text-foreground">In your .env.local file:</p>
					<code className="text-sm text-muted-foreground">NEXT_PUBLIC_DEFAULT_CHANNEL=default-channel</code>
				</div>
			</div>
		</div>
	);
}
