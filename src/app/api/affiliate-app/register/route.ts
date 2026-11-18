import { NextRequest } from "next/server";
import { AFFILIATE_APP_PERMISSIONS } from "@/lib/affiliates/manifest";
import { registerApp } from "@/lib/saleor-app/register";

/**
 * Saleor calls this once while the affiliates app is being installed, handing over the app's API token. See
 * `@/lib/saleor-app/register` for what is checked. The app doesn't keep the token: you create one in the Dashboard and set
 * it as AFFILIATE_APP_TOKEN, as with the other apps.
 */
export async function POST(request: NextRequest) {
	// Without both permissions Saleor would never deliver the order events, or the app couldn't read the affiliates.
	return registerApp(request, { required: AFFILIATE_APP_PERMISSIONS });
}
