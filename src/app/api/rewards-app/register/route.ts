import { NextRequest } from "next/server";
import { REWARDS_APP_PERMISSIONS } from "@/lib/rewards/manifest";

/**
 * Saleor calls this once while the rewards app is being installed, handing over the app's API token.
 *
 * The app doesn't keep the token (you create one in the Dashboard and set it as REWARDS_APP_TOKEN, as with the payments
 * app). We just confirm the install really comes from our Saleor and that the app was granted what it needs, then acknowledge.
 */
export async function POST(request: NextRequest) {
	const expectedApiUrl = process.env.NEXT_PUBLIC_SALEOR_API_URL?.replace(/\/+$/, "");
	const requestApiUrl = request.headers.get("saleor-api-url")?.replace(/\/+$/, "");
	if (!expectedApiUrl || requestApiUrl !== expectedApiUrl) {
		return Response.json({ error: "Unknown Saleor instance" }, { status: 403 });
	}

	const body = (await request.json().catch(() => null)) as { auth_token?: unknown } | null;
	const token = typeof body?.auth_token === "string" ? body.auth_token : null;
	if (!token) {
		return Response.json({ error: "Missing auth_token" }, { status: 400 });
	}

	// Without both permissions Saleor would never deliver the order events, or the app couldn't create the gift cards.
	const res = await fetch(expectedApiUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify({ query: "{ app { permissions { code } } }" }),
		cache: "no-store",
	}).catch(() => null);
	const data = (await res?.json().catch(() => null)) as {
		data?: { app?: { permissions?: Array<{ code: string }> } };
	} | null;
	const granted = data?.data?.app?.permissions?.map((permission) => permission.code) ?? [];
	const missing = REWARDS_APP_PERMISSIONS.filter((permission) => !granted.includes(permission));
	if (missing.length > 0) {
		return Response.json({ error: `The app was not granted ${missing.join(", ")}` }, { status: 400 });
	}

	return Response.json({ success: true });
}
