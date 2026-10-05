import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	classifyIpnStatus,
	computeIpnSignature,
	createInvoice,
	parseIpnPayment,
	readNowPaymentsConfig,
	verifyIpnSignature,
	type NowPaymentsConfig,
} from "./nowpayments";

const config: NowPaymentsConfig = { apiKey: "key", ipnSecret: "secret", sandbox: false };

const invoiceInput = {
	amount: 25.499,
	currency: "USD",
	orderId: "txn-1",
	description: "Worldwide Vapor order",
	ipnUrl: "https://shop.example/api/saleor-app/crypto/ipn",
	successUrl: "https://shop.example/checkout?crypto=return",
	cancelUrl: "https://shop.example/checkout",
};

describe("readNowPaymentsConfig", () => {
	it("needs both secrets", () => {
		expect(readNowPaymentsConfig({})).toBeNull();
		expect(readNowPaymentsConfig({ NOWPAYMENTS_API_KEY: "k" })).toBeNull();
		expect(readNowPaymentsConfig({ NOWPAYMENTS_IPN_SECRET: "s" })).toBeNull();
		expect(readNowPaymentsConfig({ NOWPAYMENTS_API_KEY: " k ", NOWPAYMENTS_IPN_SECRET: " s " })).toEqual({
			apiKey: "k",
			ipnSecret: "s",
			sandbox: false,
		});
	});

	it("opts into the sandbox explicitly", () => {
		const sandbox = readNowPaymentsConfig({
			NOWPAYMENTS_API_KEY: "k",
			NOWPAYMENTS_IPN_SECRET: "s",
			NOWPAYMENTS_SANDBOX: "TRUE",
		});
		expect(sandbox?.sandbox).toBe(true);
	});
});

describe("createInvoice", () => {
	it("posts the invoice with the API key and returns the hosted URL", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ id: 4522625843, invoice_url: "https://nowpayments.io/payment/?iid=4522625843" }),
				),
			);

		const outcome = await createInvoice(config, invoiceInput, fetchImpl as never);

		expect(outcome).toEqual({
			ok: true,
			invoiceId: "4522625843",
			invoiceUrl: "https://nowpayments.io/payment/?iid=4522625843",
		});
		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.nowpayments.io/v1/invoice");
		expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key");
		expect(JSON.parse(init.body as string)).toEqual({
			price_amount: 25.5,
			price_currency: "usd",
			order_id: "txn-1",
			order_description: "Worldwide Vapor order",
			ipn_callback_url: invoiceInput.ipnUrl,
			success_url: invoiceInput.successUrl,
			cancel_url: invoiceInput.cancelUrl,
		});
	});

	it("uses the sandbox host when configured", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "1", invoice_url: "https://x" })));
		await createInvoice({ ...config, sandbox: true }, invoiceInput, fetchImpl as never);
		expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api-sandbox.nowpayments.io/v1/invoice");
	});

	it("surfaces the provider's message on a rejected invoice", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ message: "Amount is too small" }), { status: 400 }));
		const outcome = await createInvoice(config, invoiceInput, fetchImpl as never);
		expect(outcome).toEqual({
			ok: false,
			status: 400,
			message: "Crypto payment provider: Amount is too small",
		});
	});

	it("does not throw when the provider is unreachable", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
		const outcome = await createInvoice(config, invoiceInput, fetchImpl as never);
		expect(outcome.ok).toBe(false);
	});
});

describe("IPN signatures", () => {
	const body = { payment_status: "finished", payment_id: 5, nested: { b: 2, a: 1 }, order_id: "txn-1" };

	it("signs the body with its keys sorted at every level", () => {
		const reordered = {
			order_id: "txn-1",
			nested: { a: 1, b: 2 },
			payment_id: 5,
			payment_status: "finished",
		};
		expect(computeIpnSignature(body, "secret")).toBe(computeIpnSignature(reordered, "secret"));
		expect(computeIpnSignature(body, "secret")).toMatch(/^[0-9a-f]{128}$/);
	});

	it("accepts a matching signature and rejects anything else", () => {
		const signature = computeIpnSignature(body, "secret");
		expect(verifyIpnSignature(body, signature, "secret")).toBe(true);
		expect(verifyIpnSignature(body, signature.toUpperCase(), "secret")).toBe(true);
		expect(verifyIpnSignature(body, signature, "other-secret")).toBe(false);
		expect(verifyIpnSignature({ ...body, payment_status: "failed" }, signature, "secret")).toBe(false);
		expect(verifyIpnSignature(body, null, "secret")).toBe(false);
		expect(verifyIpnSignature(body, "short", "secret")).toBe(false);
	});
});

describe("parseIpnPayment", () => {
	it("reads the fields we act on", () => {
		expect(
			parseIpnPayment({
				payment_id: 5077125051,
				payment_status: "finished",
				order_id: "txn-1",
				price_amount: "25.5",
				price_currency: "usd",
			}),
		).toEqual({
			paymentId: "5077125051",
			status: "finished",
			orderId: "txn-1",
			priceAmount: 25.5,
			priceCurrency: "USD",
		});
	});

	it("rejects callbacks that aren't payment updates", () => {
		expect(parseIpnPayment(null)).toBeNull();
		expect(parseIpnPayment({})).toBeNull();
		expect(
			parseIpnPayment({ payment_id: 1, payment_status: "finished", price_amount: 5, price_currency: "usd" }),
		).toBeNull();
		expect(
			parseIpnPayment({
				payment_id: 1,
				payment_status: "finished",
				order_id: "txn-1",
				price_amount: "abc",
				price_currency: "usd",
			}),
		).toBeNull();
	});
});

describe("classifyIpnStatus", () => {
	it("treats only finished as paid", () => {
		expect(classifyIpnStatus("finished")).toBe("paid");
		expect(classifyIpnStatus("partially_paid")).toBe("ignore");
		expect(classifyIpnStatus("confirming")).toBe("ignore");
		expect(classifyIpnStatus("waiting")).toBe("ignore");
	});

	it("treats failed and expired as failures", () => {
		expect(classifyIpnStatus("failed")).toBe("failed");
		expect(classifyIpnStatus("expired")).toBe("failed");
	});
});
