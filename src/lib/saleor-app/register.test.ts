import { describe, expect, it, vi } from "vitest";
import { registerApp } from "./register";

const API = "https://store.example/graphql/";

const request = (body: unknown, headers: Record<string, string> = { "saleor-api-url": API }) =>
	new Request("https://shop.example/api/x/register", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});

const answering = (payload: unknown) =>
	vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;

const permissionsReply = (...codes: string[]) => ({
	data: { app: { permissions: codes.map((code) => ({ code })) } },
});

const run = (req: Request, fetchImpl: typeof fetch, required = ["HANDLE_PAYMENTS"]) => {
	const warn = vi.fn();
	return registerApp(req, { required, apiUrl: API, fetchImpl, warn }).then(async (response) => ({
		status: response.status,
		body: (await response.json()) as Record<string, unknown>,
		warn,
	}));
};

describe("registerApp", () => {
	it("accepts the install when Saleor confirms the permissions", async () => {
		const { status, body, warn } = await run(
			request({ auth_token: "t" }),
			answering(permissionsReply("HANDLE_PAYMENTS", "MANAGE_ORDERS")),
		);
		expect(status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(warn).not.toHaveBeenCalled();
	});

	it("refuses a call that isn't from our Saleor, with the error shape Saleor reads", async () => {
		const fetchImpl = answering({});
		const { status, body } = await run(
			request({ auth_token: "t" }, { "saleor-api-url": "https://evil.example/graphql/" }),
			fetchImpl,
		);
		expect(status).toBe(403);
		expect(body).toEqual({ error: { message: "Unknown Saleor instance" } });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("refuses a call with no Saleor address at all", async () => {
		const { status } = await run(request({ auth_token: "t" }, {}), answering({}));
		expect(status).toBe(403);
	});

	it("treats a trailing slash on the address as the same address", async () => {
		const { status } = await run(
			request({ auth_token: "t" }, { "saleor-api-url": "https://store.example/graphql" }),
			answering(permissionsReply("HANDLE_PAYMENTS")),
		);
		expect(status).toBe(200);
	});

	it("refuses a call with no token", async () => {
		expect((await run(request({}), answering({}))).body).toEqual({
			error: { message: "Missing auth_token" },
		});
		expect((await run(request({ auth_token: 5 }), answering({}))).status).toBe(400);
		expect((await run(request("not json"), answering({}))).status).toBe(400);
	});

	it("refuses the install when Saleor says a required permission is missing", async () => {
		const { status, body } = await run(
			request({ auth_token: "t" }),
			answering(permissionsReply("MANAGE_ORDERS")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: { message: "The app was not granted HANDLE_PAYMENTS" } });
	});

	it("names every missing permission", async () => {
		const { body } = await run(request({ auth_token: "t" }), answering(permissionsReply()), [
			"MANAGE_ORDERS",
			"MANAGE_GIFT_CARD",
		]);
		expect(body).toEqual({ error: { message: "The app was not granted MANAGE_ORDERS, MANAGE_GIFT_CARD" } });
	});

	it("accepts the install, with a warning, when Saleor gives no answer yet", async () => {
		for (const reply of [
			{ data: { app: null }, errors: [{ message: "Unauthorized" }] },
			{ data: null },
			{ data: { app: { permissions: null } } },
			{},
		]) {
			const { status, body, warn } = await run(request({ auth_token: "t" }), answering(reply));
			expect(status).toBe(200);
			expect(body).toEqual({ success: true });
			expect(warn).toHaveBeenCalledTimes(1);
		}
	});

	it("accepts the install, with a warning, when Saleor can't be reached or answers with junk", async () => {
		const unreachable = vi.fn(async () => {
			throw new Error("network");
		}) as unknown as typeof fetch;
		const junk = vi.fn(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
		for (const fetchImpl of [unreachable, junk]) {
			const { status, warn } = await run(request({ auth_token: "t" }), fetchImpl);
			expect(status).toBe(200);
			expect(warn).toHaveBeenCalledTimes(1);
		}
	});

	it("asks Saleor with the new token and never logs it", async () => {
		const fetchImpl = answering(permissionsReply("HANDLE_PAYMENTS"));
		const { warn } = await run(request({ auth_token: "super-secret-token" }), fetchImpl);
		const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		// Saleor answers /graphql/ and gives a 404 to /graphql, so the trailing slash must stay.
		expect(url).toBe("https://store.example/graphql/");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer super-secret-token");
		expect(JSON.stringify(warn.mock.calls)).not.toContain("super-secret-token");
	});
});
