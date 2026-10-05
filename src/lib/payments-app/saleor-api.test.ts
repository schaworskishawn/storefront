import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readPaymentsAppToken, reportTransactionEvent } from "./saleor-api";

const input = {
	transactionId: "VHJhbnNhY3Rpb25JdGVtOjE=",
	type: "CHARGE_SUCCESS" as const,
	amount: 25.5,
	pspReference: "crypto:5077125051",
	message: "Crypto payment confirmed",
};

const options = (fetchImpl: unknown) => ({
	apiUrl: "https://saleor.example/graphql/",
	token: "app-token",
	fetchImpl: fetchImpl as typeof fetch,
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("readPaymentsAppToken", () => {
	it("reads and trims the token", () => {
		expect(readPaymentsAppToken({ PAYMENTS_APP_TOKEN: " abc " })).toBe("abc");
		expect(readPaymentsAppToken({})).toBeNull();
		expect(readPaymentsAppToken({ PAYMENTS_APP_TOKEN: "  " })).toBeNull();
	});
});

describe("reportTransactionEvent", () => {
	it("sends the event to Saleor with the app token", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ data: { transactionEventReport: { alreadyProcessed: false, errors: [] } } }),
			);

		const outcome = await reportTransactionEvent(input, options(fetchImpl));

		expect(outcome).toEqual({ ok: true, alreadyProcessed: false });
		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://saleor.example/graphql");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer app-token");
		const body = JSON.parse(init.body as string) as { query: string; variables: unknown };
		expect(body.variables).toEqual({
			id: input.transactionId,
			type: "CHARGE_SUCCESS",
			amount: 25.5,
			pspReference: "crypto:5077125051",
			message: "Crypto payment confirmed",
		});
		expect(body.query).toContain("transactionEventReport");
	});

	it("reports a repeated callback as already processed", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ data: { transactionEventReport: { alreadyProcessed: true, errors: [] } } }),
			);
		expect(await reportTransactionEvent(input, options(fetchImpl))).toEqual({
			ok: true,
			alreadyProcessed: true,
		});
	});

	it("does not call Saleor without a token or API URL", async () => {
		const fetchImpl = vi.fn();
		const noToken = await reportTransactionEvent(input, { ...options(fetchImpl), token: null });
		expect(noToken).toMatchObject({ ok: false, retryable: false });
		const noUrl = await reportTransactionEvent(input, {
			token: "t",
			apiUrl: "",
			fetchImpl: fetchImpl as never,
		});
		expect(noUrl).toMatchObject({ ok: false, retryable: false });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("flags server errors and rate limits as retryable, and client errors as final", async () => {
		const retryable = await reportTransactionEvent(
			input,
			options(vi.fn().mockResolvedValue(jsonResponse({}, 503))),
		);
		expect(retryable).toMatchObject({ ok: false, retryable: true });

		const limited = await reportTransactionEvent(
			input,
			options(vi.fn().mockResolvedValue(jsonResponse({}, 429))),
		);
		expect(limited).toMatchObject({ ok: false, retryable: true });

		const final = await reportTransactionEvent(
			input,
			options(vi.fn().mockResolvedValue(jsonResponse({}, 401))),
		);
		expect(final).toMatchObject({ ok: false, retryable: false });
	});

	it("retries when Saleor is unreachable", async () => {
		const outcome = await reportTransactionEvent(
			input,
			options(vi.fn().mockRejectedValue(new Error("offline"))),
		);
		expect(outcome).toMatchObject({ ok: false, retryable: true });
	});

	it("returns Saleor's own error message when it rejects the report", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({
				data: {
					transactionEventReport: {
						alreadyProcessed: null,
						errors: [{ message: "Transaction not found.", code: "NOT_FOUND" }],
					},
				},
			}),
		);
		expect(await reportTransactionEvent(input, options(fetchImpl))).toEqual({
			ok: false,
			message: "Transaction not found.",
			retryable: false,
		});
	});

	it("surfaces top-level GraphQL errors such as a bad token", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({
				data: { transactionEventReport: null },
				errors: [{ message: "You need one of the following permissions: HANDLE_PAYMENTS" }],
			}),
		);
		const outcome = await reportTransactionEvent(input, options(fetchImpl));
		expect(outcome).toMatchObject({ ok: false, retryable: false });
		expect((outcome as { message: string }).message).toContain("HANDLE_PAYMENTS");
	});
});
