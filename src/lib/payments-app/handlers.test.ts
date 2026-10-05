import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AuthorizeNetConfig, TransactionOutcome } from "./authorizenet";
import {
	handleGatewayInitialize,
	handleTransactionCancel,
	handleTransactionInitialize,
	handleTransactionRefund,
} from "./handlers";

const config: AuthorizeNetConfig = {
	apiLoginId: "login",
	transactionKey: "secret-key",
	clientKey: "client-key",
	environment: "sandbox",
	transactionType: "authCaptureTransaction",
};

const approved: TransactionOutcome = {
	ok: true,
	transactionId: "T1",
	authCode: "A1",
	accountLast4: "1111",
	accountType: "Visa",
	message: "Approved",
};

function makeDeps(
	overrides: Partial<Record<string, unknown>> = {},
	withConfig: AuthorizeNetConfig | null = config,
) {
	const authorizenet = {
		chargeCard: vi.fn().mockResolvedValue(approved),
		getTransactionDetails: vi.fn(),
		voidTransaction: vi.fn().mockResolvedValue({ ...approved, transactionId: "V1" }),
		refundTransaction: vi.fn().mockResolvedValue({ ...approved, transactionId: "R1" }),
		...overrides,
	};
	return { deps: { config: withConfig, authorizenet } as never, authorizenet };
}

const init = {
	action: { amount: 25.5, currency: "USD", actionType: "CHARGE" },
	data: {
		method: "authorizenet",
		opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "tok" },
	},
	customerIpAddress: "203.0.113.5",
	sourceObject: {
		__typename: "Checkout",
		id: "co-1",
		email: "buyer@example.com",
		billingAddress: {
			firstName: "Ada",
			lastName: "L",
			streetAddress1: "1 Main",
			city: "Winnipeg",
			postalCode: "R3C 0A1",
			country: { code: "CA" },
		},
	},
};

describe("handleGatewayInitialize", () => {
	it("hands the browser only the public settings", () => {
		const { deps } = makeDeps();
		const response = handleGatewayInitialize(deps);
		expect(response.data).toMatchObject({
			methods: ["authorizenet"],
			authorizenet: {
				environment: "sandbox",
				apiLoginId: "login",
				clientKey: "client-key",
				scriptUrl: "https://jstest.authorize.net/v1/Accept.js",
			},
		});
		expect(JSON.stringify(response)).not.toContain("secret-key");
	});

	it("offers no methods when Authorize.net is not configured", () => {
		expect(handleGatewayInitialize(makeDeps({}, null).deps).data).toEqual({ methods: [] });
	});
});

describe("handleTransactionInitialize", () => {
	it("charges the Accept.js token for Saleor's amount and reports success", async () => {
		const { deps, authorizenet } = makeDeps();
		const response = await handleTransactionInitialize(init, deps);

		expect(response).toMatchObject({
			result: "CHARGE_SUCCESS",
			pspReference: "T1",
			amount: 25.5,
			data: { brand: "Visa", last4: "1111" },
		});
		expect(authorizenet.chargeCard).toHaveBeenCalledWith(
			config,
			expect.objectContaining({
				amount: 25.5,
				currency: "USD",
				customerEmail: "buyer@example.com",
				customerIp: "203.0.113.5",
				billTo: expect.objectContaining({ city: "Winnipeg", zip: "R3C 0A1", country: "CA" }),
			}),
		);
	});

	it("ignores any amount the browser sends", async () => {
		const { deps, authorizenet } = makeDeps();
		await handleTransactionInitialize({ ...init, data: { ...(init.data as object), amount: 0.01 } }, deps);
		expect(authorizenet.chargeCard).toHaveBeenCalledWith(config, expect.objectContaining({ amount: 25.5 }));
	});

	it("reports an authorization when the account is set to authorise only", async () => {
		const { deps } = makeDeps({}, { ...config, transactionType: "authOnlyTransaction" });
		expect(await handleTransactionInitialize(init, deps)).toMatchObject({ result: "AUTHORIZATION_SUCCESS" });
	});

	it("fails cleanly on a decline, with the bank's message", async () => {
		const { deps } = makeDeps({
			chargeCard: vi.fn().mockResolvedValue({
				ok: false,
				reason: "declined",
				code: "2",
				message: "This transaction has been declined.",
			}),
		});
		expect(await handleTransactionInitialize(init, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			message: "This transaction has been declined.",
			data: { reason: "declined", code: "2" },
		});
	});

	it("does not call Authorize.net for bad input", async () => {
		const { deps, authorizenet } = makeDeps();
		for (const bad of [
			{ ...init, data: { method: "authorizenet" } },
			{ ...init, data: { opaqueData: { dataDescriptor: "", dataValue: "" } } },
			{ ...init, data: { method: "crypto", opaqueData: (init.data as { opaqueData: unknown }).opaqueData } },
			{ ...init, action: { amount: 0, currency: "USD" } },
			{ ...init, action: { amount: -5, currency: "USD" } },
			{ ...init, action: { amount: 10, currency: "EUR" } },
			{ ...init, action: undefined },
		]) {
			expect(await handleTransactionInitialize(bad, deps)).toMatchObject({ result: "CHARGE_FAILURE" });
		}
		expect(authorizenet.chargeCard).not.toHaveBeenCalled();
	});

	it("fails when Authorize.net is not configured", async () => {
		expect(await handleTransactionInitialize(init, makeDeps({}, null).deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			data: { reason: "not_configured" },
		});
	});

	it("turns a fraud hold into a clear message", async () => {
		const { deps } = makeDeps({
			chargeCard: vi
				.fn()
				.mockResolvedValue({ ok: false, reason: "held", code: "253", message: "held for review" }),
		});
		expect(await handleTransactionInitialize(init, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			message: expect.stringContaining("reviewed"),
		});
	});
});

describe("handleTransactionRefund", () => {
	const refund = { action: { amount: 10, currency: "USD" }, transaction: { id: "tx", pspReference: "T1" } };

	it("voids a payment that has not settled yet", async () => {
		const { deps, authorizenet } = makeDeps({
			getTransactionDetails: vi
				.fn()
				.mockResolvedValue({ status: "capturedPendingSettlement", accountLast4: "1111", settleAmount: 10 }),
		});
		expect(await handleTransactionRefund(refund, deps)).toMatchObject({
			result: "REFUND_SUCCESS",
			pspReference: "V1",
		});
		expect(authorizenet.voidTransaction).toHaveBeenCalledWith(config, "T1");
		expect(authorizenet.refundTransaction).not.toHaveBeenCalled();
	});

	it("refuses a partial refund before settlement rather than voiding the whole payment", async () => {
		const { deps, authorizenet } = makeDeps({
			getTransactionDetails: vi
				.fn()
				.mockResolvedValue({ status: "capturedPendingSettlement", accountLast4: "1111", settleAmount: 20 }),
		});
		expect(await handleTransactionRefund(refund, deps)).toMatchObject({ result: "REFUND_FAILURE" });
		expect(authorizenet.voidTransaction).not.toHaveBeenCalled();
	});

	it("refunds a settled payment with the card's last four digits", async () => {
		const { deps, authorizenet } = makeDeps({
			getTransactionDetails: vi
				.fn()
				.mockResolvedValue({ status: "settledSuccessfully", accountLast4: "1111", settleAmount: 20 }),
		});
		expect(await handleTransactionRefund(refund, deps)).toMatchObject({
			result: "REFUND_SUCCESS",
			pspReference: "R1",
		});
		expect(authorizenet.refundTransaction).toHaveBeenCalledWith(config, {
			transactionId: "T1",
			amount: 10,
			accountLast4: "1111",
		});
	});

	it("fails safely on unknown status, missing reference, or a failed lookup", async () => {
		const unknown = makeDeps({
			getTransactionDetails: vi
				.fn()
				.mockResolvedValue({ status: "voided", accountLast4: null, settleAmount: 1 }),
		});
		expect(await handleTransactionRefund(refund, unknown.deps)).toMatchObject({ result: "REFUND_FAILURE" });

		expect(
			await handleTransactionRefund({ ...refund, transaction: { id: "tx" } }, makeDeps().deps),
		).toMatchObject({
			result: "REFUND_FAILURE",
		});

		const lookupFails = makeDeps({ getTransactionDetails: vi.fn().mockResolvedValue(null) });
		expect(await handleTransactionRefund(refund, lookupFails.deps)).toMatchObject({
			result: "REFUND_FAILURE",
		});
	});
});

describe("handleTransactionCancel", () => {
	it("voids the authorisation", async () => {
		const { deps, authorizenet } = makeDeps();
		expect(
			await handleTransactionCancel({ action: { amount: 5 }, transaction: { pspReference: "T1" } }, deps),
		).toMatchObject({
			result: "CANCEL_SUCCESS",
			pspReference: "V1",
		});
		expect(authorizenet.voidTransaction).toHaveBeenCalledWith(config, "T1");
	});

	it("fails without a reference", async () => {
		expect(
			await handleTransactionCancel({ action: { amount: 5 }, transaction: {} }, makeDeps().deps),
		).toMatchObject({
			result: "CANCEL_FAILURE",
		});
	});
});

describe("crypto", () => {
	const cryptoConfig = { apiKey: "np-key", ipnSecret: "np-secret", sandbox: false };
	const storefrontOrigin = "https://shop.example";

	function makeCryptoDeps(overrides: { createInvoice?: unknown; config?: unknown } = {}) {
		const createInvoice = overrides.createInvoice ?? {
			ok: true,
			invoiceId: "4522625843",
			invoiceUrl: "https://nowpayments.io/payment/?iid=4522625843",
		};
		const createInvoiceFn = vi.fn().mockResolvedValue(createInvoice);
		const base = makeDeps({}, null);
		return {
			createInvoiceFn,
			crypto: {
				config: overrides.config === undefined ? cryptoConfig : overrides.config,
				createInvoice: createInvoiceFn,
				storefrontOrigin,
			},
			deps: {
				...(base.deps as object),
				crypto: {
					config: overrides.config === undefined ? cryptoConfig : overrides.config,
					createInvoice: createInvoiceFn,
					storefrontOrigin,
				},
			} as never,
		};
	}

	const cryptoInit = {
		action: { amount: 25.5, currency: "USD", actionType: "CHARGE" },
		data: {
			method: "crypto",
			returnUrl: "https://shop.example/checkout?checkout=abc&processingPayment=true",
		},
		transaction: { id: "VHJhbnNhY3Rpb25JdGVtOjE=" },
	};

	it("lists crypto next to cards once the provider is configured", () => {
		const { crypto } = makeCryptoDeps();
		const base = makeDeps({}, config).deps as object;
		const response = handleGatewayInitialize({ ...base, crypto } as never);
		expect(response.data).toMatchObject({
			methods: ["authorizenet", "crypto"],
			crypto: { provider: "nowpayments" },
		});
		expect(JSON.stringify(response)).not.toContain("np-key");
		expect(JSON.stringify(response)).not.toContain("np-secret");
	});

	it("can offer crypto without cards", () => {
		expect(handleGatewayInitialize(makeCryptoDeps().deps).data).toMatchObject({ methods: ["crypto"] });
	});

	it("creates an invoice for Saleor's amount and waits for the payment", async () => {
		const { deps, createInvoiceFn } = makeCryptoDeps();
		const response = await handleTransactionInitialize(cryptoInit, deps);

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

	it("refuses a return address on another site", async () => {
		const { deps, createInvoiceFn } = makeCryptoDeps();
		const response = await handleTransactionInitialize(
			{
				...cryptoInit,
				data: { method: "crypto", returnUrl: "https://evil.example/checkout?processingPayment=true" },
			},
			deps,
		);
		expect(response).toMatchObject({ result: "CHARGE_FAILURE", data: { reason: "invalid_return_url" } });
		expect(createInvoiceFn).not.toHaveBeenCalled();
	});

	it("fails cleanly for bad input or missing setup without calling the provider", async () => {
		const { deps, createInvoiceFn } = makeCryptoDeps();
		expect(
			await handleTransactionInitialize({ ...cryptoInit, action: { amount: 0, currency: "USD" } }, deps),
		).toMatchObject({ result: "CHARGE_FAILURE", data: { reason: "invalid_amount" } });
		expect(await handleTransactionInitialize({ ...cryptoInit, transaction: {} }, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			data: { reason: "missing_transaction" },
		});
		expect(
			await handleTransactionInitialize(cryptoInit, makeCryptoDeps({ config: null }).deps),
		).toMatchObject({
			result: "CHARGE_FAILURE",
			data: { reason: "not_configured" },
		});
		expect(createInvoiceFn).not.toHaveBeenCalled();
	});

	it("reports a rejected invoice as a failure with the provider's message", async () => {
		const { deps } = makeCryptoDeps({
			createInvoice: { ok: false, message: "Crypto payment provider: Amount is too small" },
		});
		expect(await handleTransactionInitialize(cryptoInit, deps)).toMatchObject({
			result: "CHARGE_FAILURE",
			message: "Crypto payment provider: Amount is too small",
			data: { reason: "invoice_failed" },
		});
	});

	it("never sends a crypto transaction to Authorize.net for a refund or cancel", async () => {
		const { deps, authorizenet } = makeDeps();
		const refund = await handleTransactionRefund(
			{ action: { amount: 5 }, transaction: { pspReference: "crypto:4522625843" } },
			deps,
		);
		expect(refund).toMatchObject({ result: "REFUND_FAILURE" });
		const cancel = await handleTransactionCancel(
			{ action: { amount: 5 }, transaction: { pspReference: "crypto:4522625843" } },
			deps,
		);
		expect(cancel).toMatchObject({ result: "CANCEL_FAILURE" });
		expect(authorizenet.getTransactionDetails).not.toHaveBeenCalled();
		expect(authorizenet.voidTransaction).not.toHaveBeenCalled();
	});
});
