import { NextRequest } from "next/server";
import { REWARDS_APP_PERMISSIONS } from "@/lib/rewards/manifest";
import { registerApp } from "@/lib/saleor-app/register";

/**
 * Saleor calls this once while the rewards app is being installed, handing over the app's API token. See
 * `@/lib/saleor-app/register` for what is checked. The app doesn't keep the token: you create one in the Dashboard and set it
 * as REWARDS_APP_TOKEN, as with the payments app.
 */
export async function POST(request: NextRequest) {
	// Without both permissions Saleor would never deliver the order events, or the app couldn't create the gift cards.
	return registerApp(request, { required: REWARDS_APP_PERMISSIONS });
}
