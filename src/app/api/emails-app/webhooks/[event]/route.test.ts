import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmail = vi.fn(async (_input: unknown) => ({ ok: true }));
vi.mock("@/lib/email", () => ({
	isEmailConfigured: () => true,
	sendEmail: (input: unknown) => sendEmail(input),
}));

import { POST } from "./route";

const call = (event: string, headers: Record<string, string> = {}) =>
	POST(
		new NextRequest(`https://shop.example/api/emails-app/webhooks/${event}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify({
				redirectUrl: "https://evil.example/phish",
				token: "t",
				user: { email: "victim@example.com" },
			}),
		}),
		{ params: Promise.resolve({ event }) },
	);

afterEach(() => {
	vi.unstubAllEnvs();
	sendEmail.mockClear();
});

describe("emails app webhooks", () => {
	it("sends nothing for a request without Saleor's signature", async () => {
		vi.stubEnv("NEXT_PUBLIC_SALEOR_API_URL", "https://saleor.example/graphql/");
		const res = await call("reset-password", { "saleor-api-url": "https://saleor.example/graphql/" });
		expect(res.status).toBe(401);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("sends nothing for a request claiming to come from another Saleor", async () => {
		vi.stubEnv("NEXT_PUBLIC_SALEOR_API_URL", "https://saleor.example/graphql/");
		const res = await call("confirm-account", {
			"saleor-api-url": "https://evil.example/graphql/",
			"saleor-signature": "a..b",
		});
		expect(res.status).toBe(401);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("answers 404 for an event it doesn't handle", async () => {
		expect((await call("account-delete")).status).toBe(404);
	});
});
