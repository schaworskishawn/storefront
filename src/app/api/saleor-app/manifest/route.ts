import { NextRequest } from "next/server";
import { buildPaymentsAppManifest } from "@/lib/payments-app/manifest";

/**
 * Saleor app manifest — paste this URL into Dashboard → Apps → Install external app:
 *   https://<your-domain>/api/saleor-app/manifest
 * It must be reachable from Saleor's servers, so install it from the deployed site, not localhost.
 */
export function GET(request: NextRequest) {
	const origin = process.env.NEXT_PUBLIC_STOREFRONT_URL || request.nextUrl.origin;
	return Response.json(buildPaymentsAppManifest(origin));
}
