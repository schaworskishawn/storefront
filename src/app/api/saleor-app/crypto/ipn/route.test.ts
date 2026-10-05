import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const reportTransactionEvent = vi.fn();
vi.mock("@/lib/payments-app/saleor-api", () => ({
	reportTransactionEvent: (...args: unknown[]) => reportTransactionEvent(...args),
}));

import { computeIpnSignature } from "@/lib/payments-app/nowpayments";
import { POST } from "./route";

const SECRET = "ipn-secret";

const payment = {
	payment_id: 5077125051,
	payment_status: "finished",
	order_id: "VHJhbnNhY3Rpb25JdGVtOjE=",
	price_amount: 25.5,
	price_currency: "usd",
	pay_currency: "btc",
};

function ipnRequest(body: unknown, signature?: string | null) {
	const headers = new Headers({ "Content-Type": "application/json" });
	const sig = signature === undefined ? computeIpnSignature(body, SECRET) : signature;
	if (sig) headers.set("x-nowpayments-sig", sig);
	return new Request("https://shop.example/api/saleor-app/crypto/ipn", {
		method: "POST",
		headers,
		body: typeof body === "string" ? body : JSON.stringify(body),
	}) as never;
}

describe("crypto IPN route", () => {
	beforeEach(() => {
		reportTransactionEvent.mockReset();
		reportTransactionEvent.mockResolvedValue({ ok: true, alreadyProcessed: false });
		vi.stubEnv("NOWPAYMENTS_API_KEY", "np-key");
		vi.stubEnv("NOWPAYMENTS_IPN_SECRET", SECRET);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("is invisible until crypto is configured", async () => {
		vi.stubEnv("NOWPAYMENTS_API_KEY", "");
		const response = await POST(ipnRequest(payment));
		expect(response.status).toBe(404);
		expect(reportTransactionEvent).not.toHaveBeenCalled();
	});

	it("rejects unsigned and wrongly signed callbacks without touching Saleor", async () => {
		expect((await POST(ipnRequest(payment, null))).status).toBe(401);
		expect((await POST(ipnRequest(payment, "deadbeef"))).status).toBe(401);
		expect((await POST(ipnRequest(payment, computeIpnSignature(payment, "other-secret")))).status).toBe(401);
		expect(reportTransactionEvent).not.toHaveBeenCalled();
	});

	it("rejects a body that isn't JSON", async () => {
		expect((await POST(ipnRequest("not json", "x"))).status).toBe(400);
	});

	it("marks the transaction charged when the payment is finished", async () => {
		const response = await POST(ipnRequest(payment));

		expect(response.status).toBe(200);
		expect(reportTransactionEvent).toHaveBeenCalledWith({
			transactionId: "VHJhbnNhY3Rpb25JdGVtOjE=",
			type: "CHARGE_SUCCESS",
			amount: 25.5,
			pspReference: "crypto:5077125051",
			message: "Crypto payment confirmed.",
		});
	});

	it("reports an expired or failed payment as a failure", async () => {
		const failed = { ...payment, payment_status: "expired" };
		expect((await POST(ipnRequest(failed))).status).toBe(200);
		expect(reportTransactionEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "CHARGE_FAILURE", pspReference: "crypto:5077125051" }),
		);
	});

	it("does nothing for in-between statuses, and never treats an underpayment as paid", async () => {
		for (const status of ["waiting", "confirming", "confirmed", "sending", "partially_paid"]) {
			const response = await POST(ipnRequest({ ...payment, payment_status: status }));
			expect(response.status).toBe(200);
		}
		expect(reportTransactionEvent).not.toHaveBeenCalled();
	});

	it("answers 5xx when Saleor can't record the payment, so the provider retries", async () => {
		reportTransactionEvent.mockResolvedValue({
			ok: false,
			message: "Couldn't reach Saleor.",
			retryable: true,
		});
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await POST(ipnRequest(payment));
		expect(response.status).toBe(500);
		spy.mockRestore();
	});

	it("rejects a signed callback that isn't a payment update", async () => {
		const odd = { hello: "world" };
		expect((await POST(ipnRequest(odd))).status).toBe(400);
	});
});
