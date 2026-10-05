import { NextRequest } from "next/server";
import {
	handleGatewayInitialize,
	handleTransactionCancel,
	handleTransactionInitialize,
	handleTransactionRefund,
} from "@/lib/payments-app/handlers";
import { WEBHOOK_DEFINITIONS } from "@/lib/payments-app/manifest";
import { verifySaleorSignature } from "@/lib/payments-app/saleor-signature";

type Handler = (payload: never) => unknown | Promise<unknown>;

const HANDLERS: Record<(typeof WEBHOOK_DEFINITIONS)[number]["slug"], Handler> = {
	"payment-gateway-initialize": () => handleGatewayInitialize(),
	"transaction-initialize": handleTransactionInitialize as Handler,
	"transaction-refund": handleTransactionRefund as Handler,
	"transaction-cancel": handleTransactionCancel as Handler,
};

/**
 * Saleor → payments app synchronous webhooks. Every request is verified against Saleor's published signing key before
 * anything is read from it; an unsigned or foreign request gets a 401 and never reaches Authorize.net.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ event: string }> }) {
	const { event } = await params;
	const handler = (HANDLERS as Record<string, Handler | undefined>)[event];
	if (!handler) {
		return Response.json({ error: "Unknown webhook" }, { status: 404 });
	}

	const rawBody = await request.text();
	const verified = await verifySaleorSignature({
		rawBody,
		signature: request.headers.get("saleor-signature"),
		requestApiUrl: request.headers.get("saleor-api-url"),
		expectedApiUrl: process.env.NEXT_PUBLIC_SALEOR_API_URL,
	});
	if (!verified) {
		console.warn(`[payments-app] rejected ${event} webhook: bad or missing signature`);
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let payload: unknown;
	try {
		payload = rawBody ? JSON.parse(rawBody) : {};
	} catch {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	return Response.json(await handler(payload as never));
}
