import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	acceptJsUrl,
	buildChargeRequest,
	chargeCard,
	getTransactionDetails,
	parseTransactionResponse,
	readAuthorizeNetConfig,
	refundTransaction,
	voidTransaction,
	type AuthorizeNetConfig,
} from "./authorizenet";

const config: AuthorizeNetConfig = {
	apiLoginId: "login",
	transactionKey: "secret-key",
	clientKey: "client",
	environment: "sandbox",
	transactionType: "authCaptureTransaction",
};

const jsonResponse = (body: unknown, status = 200) =>
	// Authorize.net prefixes its JSON with a byte-order mark.
	Promise.resolve(new Response("﻿" + JSON.stringify(body), { status }));

describe("readAuthorizeNetConfig", () => {
	const full = {
		AUTHORIZENET_API_LOGIN_ID: "a",
		AUTHORIZENET_TRANSACTION_KEY: "b",
		AUTHORIZENET_CLIENT_KEY: "c",
	};

	it("needs all three credentials", () => {
		expect(readAuthorizeNetConfig({})).toBeNull();
		expect(readAuthorizeNetConfig({ ...full, AUTHORIZENET_CLIENT_KEY: " " })).toBeNull();
		expect(readAuthorizeNetConfig(full)).not.toBeNull();
	});

	it("defaults to the sandbox and an immediate capture", () => {
		expect(readAuthorizeNetConfig(full)).toMatchObject({
			environment: "sandbox",
			transactionType: "authCaptureTransaction",
		});
	});

	it("only goes live when asked to, and supports authorise-only", () => {
		expect(readAuthorizeNetConfig({ ...full, AUTHORIZENET_ENVIRONMENT: "Production" })?.environment).toBe(
			"production",
		);
		expect(readAuthorizeNetConfig({ ...full, AUTHORIZENET_ENVIRONMENT: "live?" })?.environment).toBe(
			"sandbox",
		);
		expect(
			readAuthorizeNetConfig({ ...full, AUTHORIZENET_TRANSACTION_TYPE: "authOnly" })?.transactionType,
		).toBe("authOnlyTransaction");
	});

	it("serves Accept.js from the matching host", () => {
		expect(acceptJsUrl("sandbox")).toBe("https://jstest.authorize.net/v1/Accept.js");
		expect(acceptJsUrl("production")).toBe("https://js.authorize.net/v1/Accept.js");
	});
});

describe("buildChargeRequest", () => {
	const request = buildChargeRequest(config, {
		amount: 12.345,
		currency: "usd",
		opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "token" },
		invoiceNumber: "A-VERY-LONG-ORDER-REFERENCE-123456",
		customerEmail: "buyer@example.com",
		billTo: { firstName: "Ada", address: "1 Main St", zip: "R3C 0A1", country: "CA" },
	}).createTransactionRequest;

	it("charges the Accept.js token, never raw card data", () => {
		expect(request.transactionRequest.payment).toEqual({
			opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "token" },
		});
		expect(JSON.stringify(request)).not.toMatch(/cardNumber|cardCode/);
	});

	it("rounds the amount to cents and uppercases the currency", () => {
		expect(request.transactionRequest.amount).toBe(12.35);
		expect(request.transactionRequest.currencyCode).toBe("USD");
	});

	it("clips fields to Authorize.net's length limits", () => {
		expect(request.refId).toHaveLength(20);
		expect(request.transactionRequest.order.invoiceNumber).toHaveLength(20);
	});

	it("keeps the schema's key order (it matters to the JSON API)", () => {
		expect(Object.keys(request.transactionRequest).slice(0, 4)).toEqual([
			"transactionType",
			"amount",
			"currencyCode",
			"payment",
		]);
		expect(Object.keys(request)).toEqual(["merchantAuthentication", "refId", "transactionRequest"]);
	});

	it("blocks a double submit with a duplicate window and omits empty blocks", () => {
		expect(JSON.stringify(request.transactionRequest.transactionSettings)).toContain("duplicateWindow");
		const bare = JSON.parse(
			JSON.stringify(
				buildChargeRequest(config, {
					amount: 1,
					currency: "USD",
					opaqueData: { dataDescriptor: "d", dataValue: "v" },
					invoiceNumber: "X",
				}),
			),
		) as { createTransactionRequest: { transactionRequest: Record<string, unknown> } };
		expect(bare.createTransactionRequest.transactionRequest).not.toHaveProperty("billTo");
		expect(bare.createTransactionRequest.transactionRequest).not.toHaveProperty("customer");
	});
});

describe("parseTransactionResponse", () => {
	it("recognises an approval and masks the card to its last four digits", () => {
		const outcome = parseTransactionResponse({
			transactionResponse: {
				responseCode: "1",
				authCode: "ABC123",
				transId: "60123456789",
				accountNumber: "XXXX1111",
				accountType: "Visa",
				messages: [{ code: "1", description: "This transaction has been approved." }],
			},
			messages: { resultCode: "Ok" },
		});
		expect(outcome).toEqual({
			ok: true,
			transactionId: "60123456789",
			authCode: "ABC123",
			accountLast4: "1111",
			accountType: "Visa",
			message: "This transaction has been approved.",
		});
	});

	it("recognises a decline", () => {
		const outcome = parseTransactionResponse({
			transactionResponse: {
				responseCode: "2",
				transId: "0",
				errors: [{ errorCode: "2", errorText: "This transaction has been declined." }],
			},
			messages: { resultCode: "Error" },
		});
		expect(outcome).toEqual({
			ok: false,
			reason: "declined",
			code: "2",
			message: "This transaction has been declined.",
		});
	});

	it("recognises a fraud-review hold", () => {
		expect(
			parseTransactionResponse({ transactionResponse: { responseCode: "4", transId: "9" } }),
		).toMatchObject({
			ok: false,
			reason: "held",
		});
	});

	it("treats a zero transaction id as a failure even if the code says approved", () => {
		expect(
			parseTransactionResponse({ transactionResponse: { responseCode: "1", transId: "0" } }),
		).toMatchObject({ ok: false });
	});

	it("reports API-level errors and survives garbage", () => {
		expect(
			parseTransactionResponse({
				messages: { resultCode: "Error", message: [{ code: "E00007", text: "User authentication failed." }] },
			}),
		).toEqual({ ok: false, reason: "error", code: "E00007", message: "User authentication failed." });
		expect(parseTransactionResponse(null)).toMatchObject({ ok: false, reason: "error" });
		expect(parseTransactionResponse("nonsense")).toMatchObject({ ok: false, reason: "error" });
	});
});

describe("API calls", () => {
	const input = {
		amount: 10,
		currency: "USD",
		opaqueData: { dataDescriptor: "d", dataValue: "v" },
		invoiceNumber: "WV-1",
	};

	it("posts to the sandbox endpoint and strips the response's byte-order mark", async () => {
		const fetchImpl = vi.fn(() =>
			jsonResponse({ transactionResponse: { responseCode: "1", transId: "55", accountNumber: "XXXX4242" } }),
		);
		const outcome = await chargeCard(config, input, fetchImpl as unknown as typeof fetch);

		expect(outcome).toMatchObject({ ok: true, transactionId: "55", accountLast4: "4242" });
		expect(fetchImpl).toHaveBeenCalledWith(
			"https://apitest.authorize.net/xml/v1/request.api",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("uses the production endpoint when configured", async () => {
		const fetchImpl = vi.fn(() => jsonResponse({ transactionResponse: { responseCode: "1", transId: "1" } }));
		await chargeCard({ ...config, environment: "production" }, input, fetchImpl as unknown as typeof fetch);
		expect(fetchImpl).toHaveBeenCalledWith("https://api.authorize.net/xml/v1/request.api", expect.anything());
	});

	it("turns a network failure into an error outcome instead of throwing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fetchImpl = vi.fn(() => Promise.reject(new Error("offline")));
		expect(await chargeCard(config, input, fetchImpl as unknown as typeof fetch)).toMatchObject({
			ok: false,
			reason: "error",
		});
		spy.mockRestore();
	});

	it("never logs the transaction key on failure", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await chargeCard(
			config,
			input,
			vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
		);
		expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-key");
		spy.mockRestore();
	});

	it("reads settlement status and the card's last four from transaction details", async () => {
		const fetchImpl = vi.fn(() =>
			jsonResponse({
				messages: { resultCode: "Ok" },
				transaction: {
					transactionStatus: "settledSuccessfully",
					settleAmount: 10,
					payment: { creditCard: { cardNumber: "XXXX1111" } },
				},
			}),
		);
		expect(await getTransactionDetails(config, "55", fetchImpl as unknown as typeof fetch)).toEqual({
			status: "settledSuccessfully",
			accountLast4: "1111",
			settleAmount: 10,
		});
	});

	it("returns null for details it cannot read", async () => {
		const fetchImpl = vi.fn(() => jsonResponse({ messages: { resultCode: "Error" } }));
		expect(await getTransactionDetails(config, "55", fetchImpl as unknown as typeof fetch)).toBeNull();
	});

	it("sends a void and a refund with the right transaction types", async () => {
		const fetchImpl = vi.fn(() =>
			jsonResponse({ transactionResponse: { responseCode: "1", transId: "77" } }),
		);

		await voidTransaction(config, "55", fetchImpl as unknown as typeof fetch);
		await refundTransaction(
			config,
			{ transactionId: "55", amount: 4.5, accountLast4: "1111" },
			fetchImpl as unknown as typeof fetch,
		);

		const bodies = fetchImpl.mock.calls.map(
			(call) =>
				JSON.parse((call as unknown as [string, { body: string }])[1].body) as {
					createTransactionRequest: { transactionRequest: Record<string, unknown> };
				},
		);
		expect(bodies[0].createTransactionRequest.transactionRequest).toMatchObject({
			transactionType: "voidTransaction",
			refTransId: "55",
		});
		expect(bodies[1].createTransactionRequest.transactionRequest).toMatchObject({
			transactionType: "refundTransaction",
			amount: 4.5,
			refTransId: "55",
			payment: { creditCard: { cardNumber: "1111", expirationDate: "XXXX" } },
		});
	});
});
