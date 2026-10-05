import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	handleGatewayInitialize,
	handleTransactionCancel,
	handleTransactionInitialize,
	handleTransactionRefund,
} from "./handlers";

const cryptoConfig = { apiKey: "np-key", ipnSecret: "np-secret", sandbox: false };
const storefrontOrigin = "https://shop.example";

function makeDeps(overrides: { createInvoice?: unknown; config?: unknown } = {}) {
	const createInvoice = overrides.createInvoice ?? {
		ok: true,
		invoiceId: "4522625843",
		invoiceUrl: "https://nowpayments.io/payment/?iid=4522625843",
	};
	const createInvoiceFn = vi.fn().mockResolvedValue(createInvoice);
	return {
		createInvoiceFn,
		deps: {
			crypto: {
				config: overrides.config === undefined ? cryptoConfig : overrides.config,
				createInvoice: createInvoiceFn,
				storefrontOrigin,
			},
		} as never,
	};
}

const init = {
	action: { amount: 25.5, currency: "USD", actionType: "CHARGE" },
	data: {
		method: "crypto",
		returnUrl: "https://shop.example/checkout?checkout=abc&processingPayment=true",
	},
	transaction: { id: "VHJhbnNhY3Rpb25JdGVtOjE=" },
};

describe("handleGatewayInitialize", () => {
	it("offers crypto once the provider is configured, and leaks no keys", () => {
		const response = handleGatewayInitialize(makeDeps().deps);
		expect(response.data).toEqual({ methods: ["crypto"], crypto: { provider: "nowpayments" } });
		expect(JSON.stringify(response)).not.toContain("np-key");
		expect(JSON.stringify(response)).not.toContain("np-secret");
	});

	it("offers no methods when the provider is not configured", () => {
		expect(handleGatewayInitialize(makeDeps({ config: null }).deps).data).toEqual({ methods: [] });
	});
});

describe("handleTransactionInitialize", () => {
	it("creates an invoice for Saleor's amount and waits for the payment", async () => {
		const { deps, createInvoiceFn } = makeDeps();
		const response = await handleTransactionInitialize(init, deps);

		expect(response).toEqual({
			result: "CHARGE_ACTION_REQUIRED",
			pspReference: "crypto:4522625843",
			amount: 25.5,
			message: "Waiting for the crypto payment.",
			data: {
				method: "crypto",
				invoiceId: "4522625843",
				invoiceUrl: "https://nowpayments.io/payment/?iid=4522625843",
			},
		});
		expect(createInvoiceFn).toHaveBeenCalledWith(cryptoConfig, {
			amount: 25.5,
			currency: "USD",
			orderId: "VHJhbnNhY3Rpb25JdGVtOjE=",
			description: "Worldwide Vapor order",
			ipnUrl: "https://shop.example/api/saleor-app/crypto/ipn",
			successUrl: "https://shop.example/checkout?checkout=abc&processingPayment=true",
			cancelUrl: "https://shop.example/checkout?checkout=abc",
		});
	});

	it("ignores any amount the browser sends", async () => {
		const { deps, createInvoiceFn } = makeDeps();
		await handleTransactionInitialize({ ...init, data: { ...init.data, amount: 0.01 } }, deps);
		expect(createInvoiceFn).toHaveBeenCalledWith(cryptoConfig, expect.objectContaining({ amount: 25.5 }));
	});

	it("refuses a return address on another site", async () => {
		const { deps, createInvoiceFn } = makeDeps();
		const response = await handleTransactionInitialize(
			{
				...init,
				data: { method: "crypto", returnUrl: "https://evil.example/checkout?processingPayment=true" },
			},
			deps,
		);
		expect(response).toMatchObject({ result: "CHARGE_FAILURE", data: { reason: "invalid_return_url" } });
		expect(createInvoiceFn).not.toHaveBeenCalled();
	});

	it("fails cleanly for bad input or missing setup without calling the provider", async () => {
		const { deps, createInvoiceFn } = makeDeps();
		expect(
			await handleTransactionInitialize({ ...init, action: { amount: 0, currency: "USD" } }, deps),
		).toMatchObject({ result: "CHARGE_FAILURE", data: { reason: "invalid_amount" } });
		expect(
			await handleTransactionInitialize({ ...init, action: { amount: -5, currency: "USD" } }, deps),
		).toMatchObject({ result: "CHARGE_FAILURE", data: { reason: "invalid_amount" } });
		expect(await handleTransactionInitialize({ ...init, action: undefined }, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			data: { reason: "invalid_amount" },
		});
		expect(await handleTransactionInitialize({ ...init, transaction: {} }, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			data: { reason: "missing_transaction" },
		});
		expect(await handleTransactionInitialize(init, makeDeps({ config: null }).deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			data: { reason: "not_configured" },
		});
		expect(createInvoiceFn).not.toHaveBeenCalled();
	});

	it("reports a rejected invoice as a failure with the provider's message", async () => {
		const { deps } = makeDeps({
			createInvoice: { ok: false, message: "Crypto payment provider: Amount is too small" },
		});
		expect(await handleTransactionInitialize(init, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			message: "Crypto payment provider: Amount is too small",
			data: { reason: "invoice_failed" },
		});
	});

	it("rejects any method other than crypto, such as the removed card method", async () => {
		const { deps, createInvoiceFn } = makeDeps();
		for (const data of [
			{ method: "authorizenet", opaqueData: { dataDescriptor: "d", dataValue: "v" } },
			{ opaqueData: { dataDescriptor: "d", dataValue: "v" } },
			undefined,
			null,
		]) {
			expect(await handleTransactionInitialize({ ...init, data }, deps)).toMatchObject({
				result: "CHARGE_FAILURE",
				data: { reason: "unknown_method" },
			});
		}
		expect(createInvoiceFn).not.toHaveBeenCalled();
	});
});

describe("handleTransactionRefund / handleTransactionCancel", () => {
	it("explains that crypto is refunded from the provider's dashboard", async () => {
		const payload = { action: { amount: 5 }, transaction: { pspReference: "crypto:4522625843" } };
		expect(await handleTransactionRefund(payload)).toMatchObject({
			result: "REFUND_FAILURE",
			message: expect.stringContaining("crypto provider's dashboard"),
		});
		expect(await handleTransactionCancel(payload)).toMatchObject({
			result: "CANCEL_FAILURE",
			message: expect.stringContaining("expires"),
		});
	});

	it("refuses transactions that did not come from this app", async () => {
		const payload = { action: { amount: 5 }, transaction: { pspReference: "60123456789" } };
		expect(await handleTransactionRefund(payload)).toMatchObject({ result: "REFUND_FAILURE" });
		expect(await handleTransactionCancel(payload)).toMatchObject({ result: "CANCEL_FAILURE" });
		expect(await handleTransactionRefund({ action: { amount: 5 }, transaction: {} })).toMatchObject({
			result: "REFUND_FAILURE",
		});
	});
});
