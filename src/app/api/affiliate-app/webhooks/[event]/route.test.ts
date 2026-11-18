import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const handleOrderFullyPaid = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/affiliates/run", () => ({
	handleOrderFullyPaid: (...args: unknown[]) => handleOrderFullyPaid(...(args as [])),
	handleOrderReversed: vi.fn(),
}));

import { POST } from "./route";

const call = (event: string, headers: Record<string, string> = {}) =>
	POST(
		new NextRequest(`https://shop.example/api/affiliate-app/webhooks/${event}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify({ order: { id: "T3JkZXI6MQ==" } }),
		}),
		{ params: Promise.resolve({ event }) },
	);

afterEach(() => {
	vi.unstubAllEnvs();
	handleOrderFullyPaid.mockClear();
});

describe("affiliates app webhooks", () => {
	it("rejects a request without Saleor's signature before reading it", async () => {
		vi.stubEnv("NEXT_PUBLIC_SALEOR_API_URL", "https://saleor.example/graphql/");
		const res = await call("order-fully-paid", { "saleor-api-url": "https://saleor.example/graphql/" });
		expect(res.status).toBe(401);
		expect(handleOrderFullyPaid).not.toHaveBeenCalled();
	});

	it("rejects a request claiming to come from another Saleor", async () => {
		vi.stubEnv("NEXT_PUBLIC_SALEOR_API_URL", "https://saleor.example/graphql/");
		const res = await call("order-fully-paid", {
			"saleor-api-url": "https://evil.example/graphql/",
			"saleor-signature": "a..b",
		});
		expect(res.status).toBe(401);
		expect(handleOrderFullyPaid).not.toHaveBeenCalled();
	});

	it("answers 404 for an event it doesn't handle", async () => {
		expect((await call("order-created")).status).toBe(404);
	});
});
