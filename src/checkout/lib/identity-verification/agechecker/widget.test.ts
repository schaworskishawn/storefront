import { describe, expect, it, vi } from "vitest";
import { resolveAgeCheckerApi } from "./widget";

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
