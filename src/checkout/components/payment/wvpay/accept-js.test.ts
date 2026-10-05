import { describe, expect, it, vi } from "vitest";
import { tokenizeCard, type AcceptJs } from "./accept-js";

const card = {
	number: "4111 1111 1111 1111",
	month: "12",
	year: "2028",
	cvv: "123",
	fullName: "Ada Lovelace",
	zip: "R3C 0A1",
};

describe("tokenizeCard", () => {
	it("sends the card to Accept.js with our keys and returns only the token", async () => {
		const dispatchData = vi.fn((_data: unknown, callback: Parameters<AcceptJs["dispatchData"]>[1]) =>
			callback({
				opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "tok_123" },
				messages: { resultCode: "Ok", message: [] },
			}),
		);

		const result = await tokenizeCard({
			card,
			apiLoginId: "login",
			clientKey: "client",
			accept: { dispatchData },
		});

		expect(result).toEqual({
			ok: true,
			opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "tok_123" },
		});
		expect(dispatchData.mock.calls[0][0]).toEqual({
			authData: { clientKey: "client", apiLoginID: "login" },
			cardData: {
				cardNumber: "4111111111111111",
				month: "12",
				year: "2028",
				cardCode: "123",
				zip: "R3C 0A1",
				fullName: "Ada Lovelace",
			},
		});
		expect(JSON.stringify(result)).not.toContain("4111");
	});

	it("reports Accept.js errors with their code", async () => {
		const accept: AcceptJs = {
			dispatchData: (_data, callback) =>
				callback({
					messages: {
						resultCode: "Error",
						message: [{ code: "E_WC_05", text: "Please provide a valid credit card number." }],
					},
				}),
		};
		expect(await tokenizeCard({ card, apiLoginId: "l", clientKey: "c", accept })).toEqual({
			ok: false,
			code: "E_WC_05",
			message: "Please provide a valid credit card number.",
		});
	});

	it("fails cleanly when Accept.js isn't available or throws", async () => {
		expect(await tokenizeCard({ card, apiLoginId: "l", clientKey: "c", accept: undefined })).toMatchObject({
			ok: false,
		});
		const throwing: AcceptJs = {
			dispatchData: () => {
				throw new Error("boom");
			},
		};
		expect(await tokenizeCard({ card, apiLoginId: "l", clientKey: "c", accept: throwing })).toMatchObject({
			ok: false,
		});
	});

	it("retries when Accept.js says it isn't ready yet, then succeeds", async () => {
		let calls = 0;
		const accept: AcceptJs = {
			dispatchData: (_data, callback) => {
				calls += 1;
				callback(
					calls < 3
						? {
								messages: {
									resultCode: "Error",
									message: [{ code: "E_WC_03", text: "Accept.js is not loaded correctly" }],
								},
							}
						: {
								opaqueData: { dataDescriptor: "d", dataValue: "v" },
								messages: { resultCode: "Ok", message: [] },
							},
				);
			},
		};
		expect(await tokenizeCard({ card, apiLoginId: "l", clientKey: "c", accept, retryDelayMs: 1 })).toEqual({
			ok: true,
			opaqueData: { dataDescriptor: "d", dataValue: "v" },
		});
		expect(calls).toBe(3);
	});

	it("reports the not-ready error once the retries run out, and never retries other errors", async () => {
		const notReady = vi.fn((_data: unknown, callback: Parameters<AcceptJs["dispatchData"]>[1]) =>
			callback({ messages: { resultCode: "Error", message: [{ code: "E_WC_03", text: "not loaded" }] } }),
		);
		expect(
			await tokenizeCard({
				card,
				apiLoginId: "l",
				clientKey: "c",
				accept: { dispatchData: notReady },
				retryDelayMs: 1,
			}),
		).toEqual({ ok: false, code: "E_WC_03", message: "not loaded" });
		expect(notReady).toHaveBeenCalledTimes(4);

		const badNumber = vi.fn((_data: unknown, callback: Parameters<AcceptJs["dispatchData"]>[1]) =>
			callback({ messages: { resultCode: "Error", message: [{ code: "E_WC_05", text: "bad number" }] } }),
		);
		await tokenizeCard({
			card,
			apiLoginId: "l",
			clientKey: "c",
			accept: { dispatchData: badNumber },
			retryDelayMs: 1,
		});
		expect(badNumber).toHaveBeenCalledTimes(1);
	});

	it("omits optional fields that are empty", async () => {
		const dispatchData = vi.fn((_data: unknown, callback: Parameters<AcceptJs["dispatchData"]>[1]) =>
			callback({
				opaqueData: { dataDescriptor: "d", dataValue: "v" },
				messages: { resultCode: "Ok", message: [] },
			}),
		);
		await tokenizeCard({
			card: { ...card, fullName: "", zip: "" },
			apiLoginId: "l",
			clientKey: "c",
			accept: { dispatchData },
		});
		expect(dispatchData.mock.calls[0][0]).toMatchObject({ cardData: { cardNumber: "4111111111111111" } });
		expect(JSON.stringify(dispatchData.mock.calls[0][0])).not.toMatch(/fullName|zip/);
	});
});
