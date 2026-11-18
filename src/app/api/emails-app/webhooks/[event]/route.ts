import { NextRequest } from "next/server";
import { handleAccountEmail, type AccountEventPayload } from "@/lib/account-emails/handle";
import { EMAILS_WEBHOOK_DEFINITIONS, type AccountEmailKind } from "@/lib/account-emails/manifest";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { verifySaleorSignature } from "@/lib/payments-app/saleor-signature";

const KINDS = new Set<string>(EMAILS_WEBHOOK_DEFINITIONS.map((d) => d.slug));

/**
 * Saleor → emails app webhooks. Every request is verified against Saleor's published signing key before anything is read
 * from it, so only Saleor can make the store send an email; an unsigned or foreign request gets a 401.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ event: string }> }) {
	const { event } = await params;
	if (!KINDS.has(event)) return Response.json({ error: "Unknown webhook" }, { status: 404 });

	const rawBody = await request.text();
	const verified = await verifySaleorSignature({
		rawBody,
		signature: request.headers.get("saleor-signature"),
		requestApiUrl: request.headers.get("saleor-api-url"),
		expectedApiUrl: process.env.NEXT_PUBLIC_SALEOR_API_URL,
	});
	if (!verified) {
		console.warn(`[emails-app] rejected ${event} webhook: bad or missing signature`);
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let payload: AccountEventPayload;
	try {
		payload = (rawBody ? JSON.parse(rawBody) : {}) as AccountEventPayload;
	} catch {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { status, outcome } = await handleAccountEmail(event as AccountEmailKind, payload, {
		configured: isEmailConfigured,
		send: (to, email) => sendEmail({ to, ...email }),
	});
	return Response.json({ outcome }, { status });
}
