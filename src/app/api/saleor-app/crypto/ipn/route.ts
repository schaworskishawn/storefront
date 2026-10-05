import { NextRequest } from "next/server";
import { CRYPTO_PSP_PREFIX } from "@/lib/payments-app/constants";
import {
	classifyIpnStatus,
	parseIpnPayment,
	readNowPaymentsConfig,
	verifyIpnSignature,
} from "@/lib/payments-app/nowpayments";
import { reportTransactionEvent } from "@/lib/payments-app/saleor-api";

/**
 * NOWPayments → us: "this crypto payment changed state". This is the only thing that marks a crypto order paid — the shopper
 * coming back to the checkout page proves nothing — so every call is verified against the shared IPN secret before it is read.
 *
 * On a confirmed payment we tell Saleor (`transactionEventReport`), which makes the checkout payable. If Saleor can't be
 * reached we answer 5xx so NOWPayments retries; Saleor ignores a repeated report of the same payment.
 */
export async function POST(request: NextRequest) {
	const config = readNowPaymentsConfig();
	if (!config) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	const rawBody = await request.text();
	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	if (!verifyIpnSignature(body, request.headers.get("x-nowpayments-sig"), config.ipnSecret)) {
		console.warn("[payments-app] rejected crypto IPN: bad or missing signature");
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const payment = parseIpnPayment(body);
	if (!payment) {
		return Response.json({ error: "Unrecognised payment update" }, { status: 400 });
	}

	const outcome = classifyIpnStatus(payment.status);
	if (outcome === "ignore") {
		// Includes "partially_paid": the shopper underpaid, which needs a person to decide — see docs/payments-setup.md.
		if (payment.status === "partially_paid") {
			console.warn(
				`[payments-app] crypto payment ${payment.paymentId} for ${payment.orderId} was only partially paid; not marking it paid`,
			);
		}
		return Response.json({ ok: true, ignored: payment.status });
	}

	const reported = await reportTransactionEvent({
		transactionId: payment.orderId,
		type: outcome === "paid" ? "CHARGE_SUCCESS" : "CHARGE_FAILURE",
		amount: payment.priceAmount,
		pspReference: `${CRYPTO_PSP_PREFIX}${payment.paymentId}`,
		message: outcome === "paid" ? "Crypto payment confirmed." : `Crypto payment ${payment.status}.`,
	});

	if (!reported.ok) {
		console.error(
			`[payments-app] couldn't report crypto payment ${payment.paymentId} (${payment.status}) to Saleor: ${reported.message}`,
		);
		return Response.json({ error: "Could not record the payment" }, { status: 500 });
	}

	return Response.json({ ok: true, alreadyProcessed: reported.alreadyProcessed });
}
