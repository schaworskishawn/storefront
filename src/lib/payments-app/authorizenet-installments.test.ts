import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	buildChargeRequest,
	buildCreateProfileFromTransactionRequest,
	buildProfileChargeRequest,
	chargeStoredCard,
	createStoredCardFromTransaction,
	deleteStoredCard,
	lookUpStoredCard,
	type AuthorizeNetConfig,
} from "./authorizenet";

const config: AuthorizeNetConfig = {
	apiLoginId: "login",
	transactionKey: "secret-key",
	clientKey: "client",
	environment: "sandbox",
	transactionType: "authCaptureTransaction",
};

const card = { customerProfileId: "9001", paymentProfileId: "8001" };

// Authorize.net prefixes its JSON with a byte-order mark.
const reply = (body: unknown) => Promise.resolve(new Response("﻿" + JSON.stringify(body)));
const fetcher = (body: unknown) => vi.fn(() => reply(body)) as unknown as typeof fetch;
const failing = () => vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
const sentBody = (impl: typeof fetch) =>
	JSON.parse((vi.mocked(impl).mock.calls[0][1] as { body: string }).body) as Record<string, any>;

const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
	const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		return await run();
	} finally {
		spy.mockRestore();
	}
};

describe("the deposit charge", () => {
	const input = {
		amount: 25,
		currency: "CAD",
		opaqueData: { dataDescriptor: "d", dataValue: "v" },
		invoiceNumber: "WV-1",
	};
	const transactionRequest = (extra = {}) =>
		buildChargeRequest(config, { ...input, ...extra }).createTransactionRequest.transactionRequest;

	it("is flagged as the first payment of a series, after the settings, as the schema orders it", () => {
		const request = transactionRequest({ firstRecurringPayment: true });
		expect(request.processingOptions).toEqual({ isFirstRecurringPayment: true });
		const keys = Object.keys(request);
		expect(keys.indexOf("processingOptions")).toBeGreaterThan(keys.indexOf("transactionSettings"));
	});

	it("is an ordinary charge, with no flag at all, otherwise", () => {
		expect(JSON.parse(JSON.stringify(transactionRequest()))).not.toHaveProperty("processingOptions");
	});
});

describe("buildProfileChargeRequest", () => {
	const request = buildProfileChargeRequest(config, {
		card,
		amount: 24.999,
		currency: "cad",
		invoiceNumber: "WV-1234-INSTALLMENT-2-OF-4",
		description: "Worldwide Vapor installment 2 of 4",
	}).createTransactionRequest;
	const tx = request.transactionRequest;

	it("charges the stored card by profile, never by card data", () => {
		expect(tx.profile).toEqual({ customerProfileId: "9001", paymentProfile: { paymentProfileId: "8001" } });
		expect(tx).not.toHaveProperty("payment");
		expect(JSON.stringify(request)).not.toMatch(/cardNumber|cardCode|opaqueData/);
	});

	it("captures at once, rounds to cents and uppercases the currency", () => {
		expect(tx.transactionType).toBe("authCaptureTransaction");
		expect(tx.amount).toBe(25);
		expect(tx.currencyCode).toBe("CAD");
	});

	it("tells the card networks it is a merchant-initiated recurring payment", () => {
		expect(tx.processingOptions).toEqual({ isSubsequentAuth: true });
		expect(tx.transactionSettings.setting).toContainEqual({
			settingName: "recurringBilling",
			settingValue: "true",
		});
	});

	it("blocks an identical repeat for 8 hours, the longest window Authorize.net allows", () => {
		expect(tx.transactionSettings.setting).toContainEqual({
			settingName: "duplicateWindow",
			settingValue: "28800",
		});
	});

	it("clips the reference to Authorize.net's limit", () => {
		expect(request.refId).toHaveLength(20);
		expect(tx.order.invoiceNumber).toHaveLength(20);
	});

	it("keeps the schema's key order", () => {
		expect(Object.keys(tx)).toEqual([
			"transactionType",
			"amount",
			"currencyCode",
			"profile",
			"order",
			"transactionSettings",
			"processingOptions",
		]);
	});
});

describe("buildCreateProfileFromTransactionRequest", () => {
	it("names the transaction whose card to save", () => {
		const request = buildCreateProfileFromTransactionRequest(config, {
			transactionId: "60123",
			merchantCustomerId: "WV-1",
			email: "buyer@example.com",
		}).createCustomerProfileFromTransactionRequest;
		expect(request.transId).toBe("60123");
		expect(request.customer).toMatchObject({ merchantCustomerId: "WV-1", email: "buyer@example.com" });
		expect(Object.keys(request).slice(0, 3)).toEqual(["merchantAuthentication", "transId", "customer"]);
	});

	it("leaves the customer block out when there is nothing to put in it", () => {
		const request = JSON.parse(
			JSON.stringify(buildCreateProfileFromTransactionRequest(config, { transactionId: "60123" })),
		) as { createCustomerProfileFromTransactionRequest: Record<string, unknown> };
		expect(request.createCustomerProfileFromTransactionRequest).not.toHaveProperty("customer");
	});
});

describe("createStoredCardFromTransaction", () => {
	it("returns the new profile and its card", async () => {
		const impl = fetcher({
			customerProfileId: "9001",
			customerPaymentProfileIdList: ["8001"],
			messages: { resultCode: "Ok", message: [{ code: "I00001", text: "Successful." }] },
		});
		expect(await createStoredCardFromTransaction(config, { transactionId: "60123" }, impl)).toEqual({
			ok: true,
			card,
		});
		expect(sentBody(impl)).toHaveProperty("createCustomerProfileFromTransactionRequest");
	});

	it("is safe to repeat: a duplicate reply leads to the existing profile's card", async () => {
		const duplicate = {
			customerProfileId: "9001",
			messages: {
				resultCode: "Error",
				message: [{ code: "E00039", text: "A duplicate record with ID 9001 already exists." }],
			},
		};
		const found = {
			profile: { customerProfileId: "9001", paymentProfiles: [{ customerPaymentProfileId: "8001" }] },
			messages: { resultCode: "Ok", message: [{ code: "I00001", text: "Successful." }] },
		};
		const impl = vi
			.fn()
			.mockImplementationOnce(() => reply(duplicate))
			.mockImplementationOnce(() => reply(found)) as unknown as typeof fetch;

		expect(await createStoredCardFromTransaction(config, { transactionId: "60123" }, impl)).toEqual({
			ok: true,
			card,
		});
		expect(vi.mocked(impl)).toHaveBeenCalledTimes(2);
		expect(JSON.parse((vi.mocked(impl).mock.calls[1][1] as { body: string }).body)).toHaveProperty(
			"getCustomerProfileRequest",
		);
	});

	it("reads the profile id out of the message when the reply doesn't carry it", async () => {
		const impl = vi
			.fn()
			.mockImplementationOnce(() =>
				reply({
					messages: {
						resultCode: "Error",
						message: [{ code: "E00039", text: "A duplicate record with ID 777123 already exists." }],
					},
				}),
			)
			.mockImplementationOnce(() =>
				reply({
					profile: { paymentProfiles: [{ customerPaymentProfileId: "55" }] },
					messages: { resultCode: "Ok" },
				}),
			) as unknown as typeof fetch;
		expect(await createStoredCardFromTransaction(config, { transactionId: "1" }, impl)).toEqual({
			ok: true,
			card: { customerProfileId: "777123", paymentProfileId: "55" },
		});
	});

	it("reports Authorize.net's own reason when the card can't be saved", async () => {
		const impl = fetcher({
			messages: { resultCode: "Error", message: [{ code: "E00040", text: "The record cannot be found." }] },
		});
		expect(await createStoredCardFromTransaction(config, { transactionId: "1" }, impl)).toEqual({
			ok: false,
			code: "E00040",
			message: "The record cannot be found.",
		});
	});

	it("turns a network failure into a failure result instead of throwing", async () => {
		const result = await quietly(() =>
			createStoredCardFromTransaction(config, { transactionId: "1" }, failing()),
		);
		expect(result).toMatchObject({ ok: false });
	});
});

describe("lookUpStoredCard", () => {
	it("finds the card in a profile", async () => {
		const impl = fetcher({
			profile: { paymentProfiles: [{ customerPaymentProfileId: "8001" }] },
			messages: { resultCode: "Ok" },
		});
		expect(await lookUpStoredCard(config, "9001", impl)).toEqual({ ok: true, card });
	});

	it("fails when the profile holds no card", async () => {
		const impl = fetcher({ profile: { paymentProfiles: [] }, messages: { resultCode: "Ok" } });
		expect(await lookUpStoredCard(config, "9001", impl)).toMatchObject({ ok: false });
	});
});

describe("chargeStoredCard", () => {
	const input = { card, amount: 25, currency: "CAD", invoiceNumber: "WV-1-2" };

	it("returns the transaction on approval", async () => {
		const impl = fetcher({
			transactionResponse: {
				responseCode: "1",
				transId: "60999",
				accountNumber: "XXXX4242",
				authCode: "ABC",
			},
		});
		expect(await chargeStoredCard(config, input, impl)).toMatchObject({
			ok: true,
			transactionId: "60999",
			accountLast4: "4242",
		});
		expect(sentBody(impl).createTransactionRequest.transactionRequest.profile.customerProfileId).toBe("9001");
	});

	it("tells a decline from an error", async () => {
		const declined = fetcher({
			transactionResponse: {
				responseCode: "2",
				errors: [{ errorCode: "2", errorText: "This transaction has been declined." }],
			},
		});
		expect(await chargeStoredCard(config, input, declined)).toMatchObject({ ok: false, reason: "declined" });
		const result = await quietly(() => chargeStoredCard(config, input, failing()));
		expect(result).toMatchObject({ ok: false, reason: "error" });
	});

	it("never puts the transaction key in a log line", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await chargeStoredCard(config, input, failing());
		expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-key");
		spy.mockRestore();
	});
});

describe("deleteStoredCard", () => {
	it("deletes the profile", async () => {
		const impl = fetcher({
			messages: { resultCode: "Ok", message: [{ code: "I00001", text: "Successful." }] },
		});
		expect(await deleteStoredCard(config, "9001", impl)).toEqual({ ok: true, message: "Deleted." });
		expect(sentBody(impl).deleteCustomerProfileRequest.customerProfileId).toBe("9001");
	});

	it("counts a profile that is already gone as deleted", async () => {
		const impl = fetcher({
			messages: { resultCode: "Error", message: [{ code: "E00040", text: "The record cannot be found." }] },
		});
		expect(await deleteStoredCard(config, "9001", impl)).toMatchObject({ ok: true });
	});

	it("reports other failures, and a network failure, without throwing", async () => {
		const refused = fetcher({
			messages: { resultCode: "Error", message: [{ code: "E00013", text: "Nope." }] },
		});
		expect(await deleteStoredCard(config, "9001", refused)).toEqual({ ok: false, message: "Nope." });
		expect(await quietly(() => deleteStoredCard(config, "9001", failing()))).toMatchObject({ ok: false });
	});
});
