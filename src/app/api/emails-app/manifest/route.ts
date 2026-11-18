import { NextRequest } from "next/server";
import { buildEmailsAppManifest } from "@/lib/account-emails/manifest";

/**
 * Saleor app manifest for the emails app — paste this URL into Dashboard → Apps → Install external app:
 *   https://<your-domain>/api/emails-app/manifest
 * It must be reachable from Saleor's servers, so install it from the deployed site, not localhost.
 *
 * Like the other apps, it advertises NEXT_PUBLIC_STOREFRONT_URL as the address Saleor calls back on, except on a Vercel
 * preview, which advertises its own address so a test deployment doesn't send its webhooks to the live site.
 */
export function GET(request: NextRequest) {
	const origin =
		process.env.VERCEL_ENV === "preview"
			? request.nextUrl.origin
			: process.env.NEXT_PUBLIC_STOREFRONT_URL || request.nextUrl.origin;
	return Response.json(buildEmailsAppManifest(origin));
}
