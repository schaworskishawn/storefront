import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { InstallmentConfig } from "@/lib/installments/plan";
import type { AuthorizeNetConfig, TransactionOutcome } from "./authorizenet";
import {
	handleGatewayInitialize,
	handleTransactionCancel,
	handleTransactionInitialize,
	handleTransactionRefund,
	type TransactionInitializePayload,
} from "./handlers";

const config: AuthorizeNetConfig = {
	apiLoginId: "login",
	transactionKey: "secret-key",
	clientKey: "client-key",
	environment: "sandbox",
	// Deliberately authorise-only: installments must still capture at once.
	transactionType: "authOnlyTransaction",
};

const installments: InstallmentConfig = { enabled: true, channels: ["cad"], minTotal: 50, maxTotal: 1000 };

const approved: TransactionOutcome = {
	ok: true,
	transactionId: "T1",
	authCode: "A1",
	accountLast4: "1111",
	accountType: "Visa",
	message: "Approved",
};

function makeDeps(opts: { installments?: InstallmentConfig; config?: AuthorizeNetConfig | null } = {}) {
	const authorizenet = {
		chargeCard: vi.fn().mockResolvedValue(approved),
		getTransactionDetails: vi.fn(),
		voidTransaction: vi.fn().mockResolvedValue({ ...approved, transactionId: "V1" }),
		refundTransaction: vi.fn().mockResolvedValue({ ...approved, transactionId: "R1" }),
	};
	const deps = {
		config: opts.config === undefined ? config : opts.config,
		authorizenet,
		installments: { config: opts.installments ?? installments },
	} as never;
	return { deps, authorizenet };
}

// A CA$120 checkout: the deposit is CA$30.
function request(
	patch: Partial<TransactionInitializePayload> = {},
	sourcePatch: Record<string, unknown> = {},
) {
	return {
		action: { amount: 30, currency: "CAD", actionType: "CHARGE" },
		data: {
			method: "installments",
			consent: true,
			opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "tok" },
		},
		merchantReference: "checkout-ref",
		customerIpAddress: "203.0.113.5",
		sourceObject: {
			__typename: "Checkout",
			id: "co-1",
			email: "buyer@example.com",
			totalPrice: { gross: { amount: 120, currency: "CAD" } },
			channel: { slug: "cad" },
			chargeStatus: "NONE",
			billingAddress: { firstName: "Ada", lastName: "L", city: "Winnipeg", country: { code: "CA" } },
			...sourcePatch,
		},
		...patch,
	} as TransactionInitializePayload;
}

describe("Pay in 4: the deposit", () => {
	it("charges a quarter of Saleor's total, captured at once, flagged as the first payment of a series", async () => {
		const { deps, authorizenet } = makeDeps();
		const response = await handleTransactionInitialize(request(), deps);

		expect(response).toMatchObject({ result: "CHARGE_SUCCESS", amount: 30, pspReference: "inst:T1" });
		const [usedConfig, input] = authorizenet.chargeCard.mock.calls[0];
		expect(usedConfig.transactionType).toBe("authCaptureTransaction");
		expect(input).toMatchObject({
			amount: 30,
			currency: "CAD",
			customerEmail: "buyer@example.com",
			firstRecurringPayment: true,
			opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "tok" },
		});
	});

	it("tells the shopper the schedule in the response and never leaks the card token or key", async () => {
		const { deps } = makeDeps();
		const response = await handleTransactionInitialize(request(), deps);
		expect(response).toMatchObject({ data: { installments: { deposit: 30, installment: 30, payments: 3 } } });
		expect(JSON.stringify(response)).not.toMatch(/tok|secret-key/);
	});

	it("puts odd cents on the deposit, so the four payments add up to the order total", async () => {
		const { deps, authorizenet } = makeDeps();
		// 100.03 -> three payments of 25.00 and a deposit of 25.03.
		const response = await handleTransactionInitialize(
			request(
				{ action: { amount: 25.03, currency: "CAD", actionType: "CHARGE" } },
				{ totalPrice: { gross: { amount: 100.03, currency: "CAD" } } },
			),
			deps,
		);
		expect(response).toMatchObject({ result: "CHARGE_SUCCESS", amount: 25.03 });
		expect(authorizenet.chargeCard.mock.calls.at(-1)![1].amount).toBe(25.03);
	});
});

describe("Pay in 4: what it refuses", () => {
	const refuses = async (
		payload: TransactionInitializePayload,
		reason: string,
		opts: Parameters<typeof makeDeps>[0] = {},
	) => {
		const { deps, authorizenet } = makeDeps(opts);
		const response = await handleTransactionInitialize(payload, deps);
		expect(response).toMatchObject({ result: "CHARGE_FAILURE", data: { reason } });
		expect(authorizenet.chargeCard).not.toHaveBeenCalled();
		return response as { message: string };
	};

	it("won't take a deposit that isn't exactly a quarter of Saleor's total, whatever the browser says", async () => {
		await refuses(
			request({ action: { amount: 10, currency: "CAD", actionType: "CHARGE" } }),
			"deposit_mismatch",
		);
		await refuses(
			request({ action: { amount: 120, currency: "CAD", actionType: "CHARGE" } }),
			"deposit_mismatch",
		);
		await refuses(
			request({ action: { amount: 30.02, currency: "CAD", actionType: "CHARGE" } }),
			"deposit_mismatch",
		);
	});

	it("is off unless enabled, and only in the listed channels", async () => {
		await refuses(request(), "installments_disabled", { installments: { ...installments, enabled: false } });
		await refuses(request({}, { channel: { slug: "default-channel" } }), "installments_channel");
		await refuses(request({}, { channel: null }), "installments_channel");
		await refuses(request(), "installments_channel", { installments: { ...installments, channels: [] } });
	});

	it("keeps to the order-size limits and a supported currency", async () => {
		const small = request(
			{ action: { amount: 10, currency: "CAD", actionType: "CHARGE" } },
			{ totalPrice: { gross: { amount: 40, currency: "CAD" } } },
		);
		const response = await refuses(small, "installments_amount");
		expect(response.message).toContain("50");
		await refuses(
			request(
				{ action: { amount: 30, currency: "EUR", actionType: "CHARGE" } },
				{ totalPrice: { gross: { amount: 120, currency: "EUR" } } },
			),
			"installments_currency",
		);
	});

	it("needs the currency to match the checkout's", async () => {
		await refuses(
			request({ action: { amount: 30, currency: "USD", actionType: "CHARGE" } }),
			"currency_mismatch",
		);
	});

	it("is for checkouts only", async () => {
		await refuses(request({}, { __typename: "Order" }), "installments_not_checkout");
		await refuses(request({ sourceObject: undefined }), "installments_not_checkout");
	});

	it("won't take a second deposit when part of the checkout is already paid", async () => {
		const response = await refuses(request({}, { chargeStatus: "PARTIAL" }), "already_paid");
		expect(response.message).toMatch(/already been paid/);
		await refuses(request({}, { chargeStatus: "FULL" }), "already_paid");
	});

	it("needs the shopper's agreement to the schedule, as a real true", async () => {
		await refuses(
			request({ data: { method: "installments", opaqueData: { dataDescriptor: "d", dataValue: "v" } } }),
			"consent_required",
		);
		await refuses(
			request({
				data: {
					method: "installments",
					consent: "true",
					opaqueData: { dataDescriptor: "d", dataValue: "v" },
				},
			}),
			"consent_required",
		);
	});

	it("needs an email address for the reminders and a card token", async () => {
		await refuses(request({}, { email: "  " }), "email_required");
		await refuses(request({}, { email: null }), "email_required");
		await refuses(request({ data: { method: "installments", consent: true } }), "missing_card_token");
	});

	it("is not offered when Authorize.net isn't set up", async () => {
		await refuses(request(), "not_configured", { config: null });
	});
});

describe("Pay in 4: a failed deposit", () => {
	it("reports a decline with the bank's own words, and no pspReference", async () => {
		const { deps, authorizenet } = makeDeps();
		authorizenet.chargeCard.mockResolvedValueOnce({
			ok: false,
			reason: "declined",
			code: "2",
			message: "This transaction has been declined.",
		});
		const response = await handleTransactionInitialize(request(), deps);
		expect(response).toMatchObject({
			result: "CHARGE_FAILURE",
			message: "This transaction has been declined.",
			data: { reason: "declined" },
		});
		expect(response).not.toHaveProperty("pspReference");
	});

	it("turns a fraud hold into a clear message", async () => {
		const { deps, authorizenet } = makeDeps();
		authorizenet.chargeCard.mockResolvedValueOnce({
			ok: false,
			reason: "held",
			code: "252",
			message: "Held",
		});
		const response = (await handleTransactionInitialize(request(), deps)) as { message: string };
		expect(response.message).toMatch(/being reviewed/);
	});
});

describe("gateway initialize", () => {
	it("lists installments next to cards only when Pay in 4 is enabled", () => {
		expect(handleGatewayInitialize(makeDeps().deps).data).toMatchObject({
			methods: ["authorizenet", "installments"],
		});
		expect(
			handleGatewayInitialize(makeDeps({ installments: { ...installments, enabled: false } }).deps).data,
		).toMatchObject({ methods: ["authorizenet"] });
	});

	it("offers nothing without Authorize.net, even with Pay in 4 enabled", () => {
		expect(handleGatewayInitialize(makeDeps({ config: null }).deps).data).toEqual({ methods: [] });
	});
});

describe("refunds and cancels of an installment deposit", () => {
	const payload = (amount = 30) => ({
		action: { amount, currency: "CAD" },
		transaction: { id: "tx-1", pspReference: "inst:60123" },
	});

	it("look the deposit up by its Authorize.net id, not by the prefixed reference", async () => {
		const { deps, authorizenet } = makeDeps();
		authorizenet.getTransactionDetails.mockResolvedValue({
			status: "capturedPendingSettlement",
			accountLast4: "1111",
			settleAmount: 30,
		});
		const response = await handleTransactionRefund(payload(), deps);
		expect(authorizenet.getTransactionDetails).toHaveBeenCalledWith(config, "60123");
		expect(authorizenet.voidTransaction).toHaveBeenCalledWith(config, "60123");
		expect(response).toMatchObject({ result: "REFUND_SUCCESS" });
	});

	it("refund a settled deposit against the real transaction id", async () => {
		const { deps, authorizenet } = makeDeps();
		authorizenet.getTransactionDetails.mockResolvedValue({
			status: "settledSuccessfully",
			accountLast4: "1111",
			settleAmount: 30,
		});
		await handleTransactionRefund(payload(10), deps);
		expect(authorizenet.refundTransaction).toHaveBeenCalledWith(config, {
			transactionId: "60123",
			amount: 10,
			accountLast4: "1111",
		});
	});

	it("cancel by the real transaction id too", async () => {
		const { deps, authorizenet } = makeDeps();
		await handleTransactionCancel(payload(), deps);
		expect(authorizenet.voidTransaction).toHaveBeenCalledWith(config, "60123");
	});
});
