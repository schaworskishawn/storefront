import { NextRequest } from "next/server";
import { DISTRIBUTOR_APP_PERMISSIONS } from "@/lib/distributors/manifest";
import { registerApp } from "@/lib/saleor-app/register";

/**
 * Saleor calls this once while the distributors app is being installed. See `@/lib/saleor-app/register` for what is
 * checked. The app doesn't keep the token Saleor hands over: you create one in the Dashboard and set it as
 * DISTRIBUTOR_APP_TOKEN, as with the other apps.
 */
export async function POST(request: NextRequest) {
	// Without both, the app couldn't keep distributors' records or set their wholesale prices.
	return registerApp(request, { required: DISTRIBUTOR_APP_PERMISSIONS });
}
