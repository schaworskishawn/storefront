import { NextRequest } from "next/server";
import { buildPaymentsAppManifest } from "@/lib/payments-app/manifest";

/**
 * Saleor app manifest — paste this URL into Dashboard → Apps → Install external app:
 *   https://<your-domain>/api/saleor-app/manifest
 * It must be reachable from Saleor's servers, so install it from the deployed site, not localhost.
 *
 * The address Saleor is told to call back on is NEXT_PUBLIC_STOREFRONT_URL when set. A Vercel preview deployment is the
 * exception: Vercel applies that variable (the live site's address) to previews too, which would send Saleor's webhooks to
 * the live site instead of the preview being tested, so a preview advertises its own address.
 */
export function GET(request: NextRequest) {
	const origin =
		process.env.VERCEL_ENV === "preview"
			? request.nextUrl.origin
			: process.env.NEXT_PUBLIC_STOREFRONT_URL || request.nextUrl.origin;
	return Response.json(buildPaymentsAppManifest(origin));
}
