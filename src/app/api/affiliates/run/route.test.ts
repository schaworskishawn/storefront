import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runAffiliatePayouts = vi.fn(async () => ({
	paidTokens: 0,
	sentCrypto: 0,
	digest: [],
	weekly: "skipped",
}));
vi.mock("@/lib/affiliates/payout-run", () => ({
	runAffiliatePayouts: (...args: unknown[]) => runAffiliatePayouts(...(args as [])),
}));
vi.mock("@/lib/affiliates/payout-deps", () => ({ productionPayoutDeps: () => ({}) }));

import { GET } from "./route";

const SECRET = "a-long-enough-cron-secret";
const call = (authorization?: string) =>
	GET(
		new NextRequest("https://shop.example/api/affiliates/run", {
			headers: authorization ? { authorization } : {},
		}),
	);

afterEach(() => {
	vi.unstubAllEnvs();
	runAffiliatePayouts.mockClear();
});

describe("the daily affiliate job", () => {
	it("refuses a request without the cron secret, and pays nothing", async () => {
		vi.stubEnv("CRON_SECRET", SECRET);
		expect((await call()).status).toBe(401);
		expect((await call("Bearer wrong-secret-of-some-length")).status).toBe(401);
		expect(runAffiliatePayouts).not.toHaveBeenCalled();
	});

	it("refuses everyone while the secret is unset or weak", async () => {
		vi.stubEnv("CRON_SECRET", "short");
		expect((await call("Bearer short")).status).toBe(401);
		expect(runAffiliatePayouts).not.toHaveBeenCalled();
	});

	it("runs for the scheduler", async () => {
		vi.stubEnv("CRON_SECRET", SECRET);
		const res = await call(`Bearer ${SECRET}`);
		expect(res.status).toBe(200);
		expect(runAffiliatePayouts).toHaveBeenCalledTimes(1);
	});
});
