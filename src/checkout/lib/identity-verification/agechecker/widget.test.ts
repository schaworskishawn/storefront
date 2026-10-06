import { describe, expect, it, vi } from "vitest";
import { checkAgeCheckerKey, resolveAgeCheckerApi } from "./widget";

const instance = () => ({ show: vi.fn() });

describe("resolveAgeCheckerApi", () => {
	it("unwraps the { api } object AgeChecker passes to onready for an autoloaded instance", () => {
		const api = instance();
		expect(resolveAgeCheckerApi({ api }, undefined)).toBe(api);
	});

	it("accepts an API passed directly", () => {
		const api = instance();
		expect(resolveAgeCheckerApi(api, undefined)).toBe(api);
	});

	it("falls back to window.AgeCheckerAPI when onready gets nothing usable", () => {
		const globalApi = instance();
		expect(resolveAgeCheckerApi(undefined, globalApi)).toBe(globalApi);
		expect(resolveAgeCheckerApi({ api: {} }, globalApi)).toBe(globalApi);
	});

	it("prefers the wrapped API over the global one", () => {
		const api = instance();
		expect(resolveAgeCheckerApi({ api }, instance())).toBe(api);
	});

	it("is null when nothing can open the popup, rather than a stub that silently does nothing", () => {
		expect(resolveAgeCheckerApi(undefined, undefined)).toBeNull();
		expect(resolveAgeCheckerApi({ api: {} }, {})).toBeNull();
		expect(resolveAgeCheckerApi("nope", { show: "not a function" })).toBeNull();
	});
});

describe("checkAgeCheckerKey", () => {
	const answer = (status: number, body: unknown) =>
		vi.fn(async () => new Response(JSON.stringify(body), { status }));

	it("allows a key AgeChecker accepts for this domain, asking about that key", async () => {
		const fetchImpl = answer(200, { key: "k" });
		await expect(checkAgeCheckerKey("a key/1", fetchImpl)).resolves.toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledWith("https://api.agechecker.net/v1/info/a%20key%2F1");
	});

	it("refuses a domain the key is not authorized for, with AgeChecker's own code and message", async () => {
		const fetchImpl = answer(400, {
			error: { code: "invalid_origin", message: "API key not authorized for this domain." },
		});
		await expect(checkAgeCheckerKey("k", fetchImpl)).resolves.toEqual({
			ok: false,
			code: "invalid_origin",
			message: "API key not authorized for this domain.",
		});
	});

	it("refuses any other definite 4xx refusal that carries an error code", async () => {
		const result = await checkAgeCheckerKey("k", answer(404, { error: { code: "invalid_key" } }));
		expect(result).toEqual({ ok: false, code: "invalid_key", message: "" });
	});

	it("leaves anything it cannot be sure of to the widget", async () => {
		// A server error, a 4xx without an error code, an unreadable body, and a network failure.
		await expect(checkAgeCheckerKey("k", answer(503, { error: { code: "down" } }))).resolves.toEqual({
			ok: true,
		});
		await expect(checkAgeCheckerKey("k", answer(400, { nope: true }))).resolves.toEqual({ ok: true });
		await expect(
			checkAgeCheckerKey(
				"k",
				vi.fn(async () => new Response("<html>", { status: 400 })),
			),
		).resolves.toEqual({ ok: true });
		await expect(
			checkAgeCheckerKey(
				"k",
				vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
			),
		).resolves.toEqual({ ok: true });
	});
});
