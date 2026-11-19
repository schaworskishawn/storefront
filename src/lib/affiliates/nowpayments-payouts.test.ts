import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	createPayoutBatch,
	estimateCoinAmount,
	explainNowPaymentsError,
	getPayoutState,
	readPayoutApiConfig,
	totp,
	verifyPayoutBatch,
	type PayoutApiConfig,
} from "./nowpayments-payouts";

const config: PayoutApiConfig = {
	apiKey: "key",
	email: "owner@example.com",
	password: "pw",
	totpSecret: null,
	baseUrl: "https://api.nowpayments.io/v1",
};

const reply = (status: number, body: unknown) =>
	vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

describe("readPayoutApiConfig", () => {
	it("needs the API key and the payout login", () => {
		expect(readPayoutApiConfig({ NOWPAYMENTS_API_KEY: "k", NOWPAYMENTS_PAYOUT_EMAIL: "a@b.c" })).toBeNull();
		expect(
			readPayoutApiConfig({
				NOWPAYMENTS_API_KEY: "k",
				NOWPAYMENTS_PAYOUT_EMAIL: "a@b.c",
				NOWPAYMENTS_PAYOUT_PASSWORD: "p",
				NOWPAYMENTS_2FA_SECRET: "GEZD GNBV",
				NOWPAYMENTS_SANDBOX: "true",
			}),
		).toEqual({
			apiKey: "k",
			email: "a@b.c",
			password: "p",
			totpSecret: "GEZDGNBV",
			baseUrl: expect.stringContaining("sandbox"),
		});
	});
});

describe("totp", () => {
	// RFC 6238, appendix B (SHA-1, 8 digits, the ASCII key "12345678901234567890").
	const key = Buffer.from("12345678901234567890");
	it.each([
		[59, "94287082"],
		[1_111_111_109, "07081804"],
		[1_111_111_111, "14050471"],
		[1_234_567_890, "89005924"],
		[2_000_000_000, "69279037"],
		[20_000_000_000, "65353130"],
	])("matches the RFC test vector at %i s", (seconds, code) => {
		expect(totp(key, new Date(seconds * 1000), 8)).toBe(code);
	});

	it("reads the base32 secret an authenticator app shows, and makes 6-digit codes by default", () => {
		expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", new Date(59_000))).toBe("287082");
		expect(totp("gezdgnbvgy3tqojqgezdgnbvgy3tqojq", new Date(59_000))).toBe("287082");
	});

	it("gives no code for a secret it can't read", () => {
		expect(totp("not base32!", new Date())).toBeNull();
		expect(totp("", new Date())).toBeNull();
	});
});

describe("the payouts API", () => {
	it("creates one batch with the token and API key, and returns its ids", async () => {
		const fetchImpl = reply(200, { id: 5000000713, withdrawals: [{ id: 5000000000 }, { id: 5000000001 }] });
		const result = await createPayoutBatch(
			config,
			"jwt",
			[
				{
					address: "T1",
					coin: "usdttrc20",
					amount: 99.91,
					description: "Worldwide Vapor affiliate payout (neo)",
				},
				{ address: "0x1", coin: "usdcmatic", amount: 50, description: "x".repeat(150) },
			],
			{ fetchImpl: fetchImpl as unknown as typeof fetch },
		);
		expect(result).toEqual({
			ok: true,
			value: { batchId: "5000000713", payoutIds: ["5000000000", "5000000001"] },
		});
		const [url, init] = fetchImpl.mock.calls[0]!;
		expect(url).toBe("https://api.nowpayments.io/v1/payout");
		expect(init?.method).toBe("POST");
		expect(init?.headers).toEqual({
			"x-api-key": "key",
			"Content-Type": "application/json",
			Authorization: "Bearer jwt",
		});
		const body = JSON.parse(String(init?.body)) as {
			withdrawals: Array<Record<string, unknown> & { payout_description: string }>;
		};
		expect(body.withdrawals[0]).toEqual({
			address: "T1",
			currency: "usdttrc20",
			amount: 99.91,
			payout_description: "Worldwide Vapor affiliate payout (neo)",
		});
		expect(body.withdrawals[1].payout_description).toHaveLength(100);
	});

	it("verifies a batch with the 2FA code", async () => {
		const fetchImpl = reply(200, "OK");
		const result = await verifyPayoutBatch(config, "jwt", "5000000713", "123456", {
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toEqual({ ok: true, value: true });
		const [url, init] = fetchImpl.mock.calls[0]!;
		expect(url).toBe("https://api.nowpayments.io/v1/payout/5000000713/verify");
		expect(JSON.parse(String(init?.body))).toEqual({ verification_code: "123456" });
	});

	it("prices a payout in the coin, rounding down to the cent", async () => {
		const fetchImpl = reply(200, { estimated_amount: "99.876" });
		const result = await estimateCoinAmount(config, 10_000, "USD", "usdttrc20", {
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toEqual({ ok: true, value: 99.87 });
		expect(fetchImpl.mock.calls[0]![0]).toBe(
			"https://api.nowpayments.io/v1/estimate?amount=100.00&currency_from=usd&currency_to=usdttrc20",
		);
	});

	it.each([
		["finished", "finished"],
		["REJECTED", "failed"],
		["failed", "failed"],
		["sending", "pending"],
		["waiting", "pending"],
	])("folds the status %s to %s", async (status, state) => {
		const fetchImpl = reply(200, { status });
		const result = await getPayoutState(config, "w1", { fetchImpl: fetchImpl as unknown as typeof fetch });
		expect(result).toEqual({ ok: true, value: state });
	});

	it("explains a refusal in plain words", async () => {
		const fetchImpl = reply(403, { message: "Access denied | IP not in whitelist" });
		const result = await verifyPayoutBatch(config, "jwt", "1", "123456", {
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toEqual({ ok: false, message: expect.stringContaining("isn't whitelisted") });
	});

	it("never throws when NOWPayments can't be reached", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error("network");
		});
		const result = await getPayoutState(config, "w1", { fetchImpl: fetchImpl as unknown as typeof fetch });
		expect(result).toEqual({ ok: false, message: "Couldn't reach NOWPayments." });
	});
});

describe("explainNowPaymentsError", () => {
	it("names the setup step a refusal points to", () => {
		expect(explainNowPaymentsError(400, "Withdrawal address is not whitelisted")).toMatch(
			/wallet isn't whitelisted/,
		);
		expect(explainNowPaymentsError(400, "Insufficient balance")).toMatch(/balance is too low/);
		expect(explainNowPaymentsError(401, "")).toMatch(/refused the request \(401\)/);
		expect(explainNowPaymentsError(500, "oops")).toBe("NOWPayments answered 500: oops.");
	});
});
