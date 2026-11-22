import { NextRequest } from "next/server";
import { buildDistributorAppManifest } from "@/lib/distributors/manifest";

/**
 * Saleor app manifest for the distributors app — paste this URL into Dashboard → Apps → Install external app:
 *   https://<your-domain>/api/distributor-app/manifest
 * It must be reachable from Saleor's servers, so install it from the deployed site, not localhost. Like the other apps it
 * advertises NEXT_PUBLIC_STOREFRONT_URL, except on a Vercel preview, which advertises its own address.
 */
export function GET(request: NextRequest) {
	const origin =
		process.env.VERCEL_ENV === "preview"
			? request.nextUrl.origin
			: process.env.NEXT_PUBLIC_STOREFRONT_URL || request.nextUrl.origin;
	return Response.json(buildDistributorAppManifest(origin));
}
