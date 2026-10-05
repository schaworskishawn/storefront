import { NextRequest } from "next/server";

/**
 * Saleor calls this once while the app is being installed, handing over the app's API token.
 *
 * The card flow only ever answers Saleor's webhooks, so it never calls Saleor's API and does not need to keep the token —
 * we just confirm the install really comes from our Saleor and that the app was granted what it needs, then acknowledge it.
 * (A future feature that reports payment results to Saleor asynchronously, such as crypto, will need to store it.)
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

	// Confirm the token works and carries HANDLE_PAYMENTS; Saleor would otherwise never call our payment webhooks.
	const res = await fetch(expectedApiUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify({ query: "{ app { permissions { code } } }" }),
		cache: "no-store",
	}).catch(() => null);
	const data = (await res?.json().catch(() => null)) as {
		data?: { app?: { permissions?: Array<{ code: string }> } };
	} | null;
	const permissions = data?.data?.app?.permissions?.map((permission) => permission.code) ?? [];
	if (!permissions.includes("HANDLE_PAYMENTS")) {
		return Response.json({ error: "The app was not granted HANDLE_PAYMENTS" }, { status: 400 });
	}

	return Response.json({ success: true });
}
