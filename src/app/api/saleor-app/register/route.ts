import { NextRequest } from "next/server";
import { registerApp } from "@/lib/saleor-app/register";

/**
 * Saleor calls this once while the payments app is being installed, handing over the app's API token. See
 * `@/lib/saleor-app/register` for what is checked. The payments app answers Saleor's webhooks and does not keep the token:
 * the one thing it calls Saleor with later (crypto and Pay in 4 reporting results) uses PAYMENTS_APP_TOKEN, which you create
 * in the Dashboard after installing.
 */
export async function POST(request: NextRequest) {
	// HANDLE_PAYMENTS: without it Saleor would never call our payment webhooks.
	return registerApp(request, { required: ["HANDLE_PAYMENTS"] });
}
