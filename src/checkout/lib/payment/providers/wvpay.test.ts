import { afterEach, describe, expect, it, vi } from "vitest";
import {
	WVPAY_GATEWAY_ID,
	WVPAY_NOT_ENABLED_MESSAGE,
	findWvPayGateway,
	getWvPayGuardError,
	isWvPayEnabled,
	isWvPayGateway,
	parseWvPayGatewayConfig,
} from "./wvpay";

afterEach(() => vi.unstubAllEnvs());

describe("wvpay gateway identity", () => {
	it("matches the Saleor app's gateway id", () => {
		expect(WVPAY_GATEWAY_ID).toBe("app.worldwide-vapor.payments");
		expect(isWvPayGateway("app.worldwide-vapor.payments")).toBe(true);
		expect(isWvPayGateway("saleor.app.payment.stripe")).toBe(false);
	});

	it("finds the gateway among others", () => {
		const gateways = [
			{ id: "saleor.app.payment.stripe", name: "Stripe" },
			{ id: WVPAY_GATEWAY_ID, name: "Worldwide Vapor Payments" },
		];
		expect(findWvPayGateway(gateways)?.name).toBe("Worldwide Vapor Payments");
		expect(findWvPayGateway([])).toBeUndefined();
		expect(findWvPayGateway(null)).toBeUndefined();
	});
});

describe("isWvPayEnabled / getWvPayGuardError", () => {
	it("is off by default, even in development", () => {
		vi.stubEnv("NODE_ENV", "development");
		expect(isWvPayEnabled()).toBe(false);
	});

	it("turns on with either flag", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS", "true");
		expect(isWvPayEnabled()).toBe(true);
		vi.unstubAllEnvs();
		vi.stubEnv("ENABLE_AUTHORIZENET_PAYMENTS", "true");
		expect(isWvPayEnabled()).toBe(true);
	});

	it("only guards the payments app's gateway", () => {
		expect(getWvPayGuardError(WVPAY_GATEWAY_ID)).toBe(WVPAY_NOT_ENABLED_MESSAGE);
		expect(getWvPayGuardError("saleor.app.payment.stripe")).toBeNull();
		expect(getWvPayGuardError(null)).toBeNull();

		vi.stubEnv("NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS", "true");
		expect(getWvPayGuardError(WVPAY_GATEWAY_ID)).toBeNull();
	});
});

describe("parseWvPayGatewayConfig", () => {
	const valid = {
		methods: ["authorizenet"],
		authorizenet: { environment: "production", apiLoginId: "login", clientKey: "client" },
	};

	it("reads the public Authorize.net settings", () => {
		expect(parseWvPayGatewayConfig(valid)).toEqual({
			methods: ["authorizenet"],
			authorizenet: { environment: "production", apiLoginId: "login", clientKey: "client" },
		});
	});

	it("falls back to the sandbox for anything but an explicit production", () => {
		expect(
			parseWvPayGatewayConfig({ ...valid, authorizenet: { ...valid.authorizenet, environment: "live" } })
				?.authorizenet?.environment,
		).toBe("sandbox");
	});

	it("never takes a script URL from the response", () => {
		const parsed = parseWvPayGatewayConfig({
			...valid,
			authorizenet: { ...valid.authorizenet, scriptUrl: "https://evil.example/x.js" },
		});
		expect(JSON.stringify(parsed)).not.toContain("evil.example");
	});

	it("returns no Authorize.net config when credentials are missing", () => {
		expect(
			parseWvPayGatewayConfig({ methods: ["authorizenet"], authorizenet: { apiLoginId: "login" } })
				?.authorizenet,
		).toBeNull();
		expect(parseWvPayGatewayConfig({ methods: [] })).toEqual({ methods: [], authorizenet: null });
	});

	it("rejects non-objects", () => {
		expect(parseWvPayGatewayConfig(null)).toBeNull();
		expect(parseWvPayGatewayConfig("text")).toBeNull();
	});
});
