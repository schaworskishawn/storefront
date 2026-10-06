import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchOrder } = vi.hoisted(() => ({ fetchOrder: vi.fn() }));
vi.mock("./saleor-orders", async (importOriginal) => ({
	...(await importOriginal<typeof import("./saleor-orders")>()),
	fetchOrder,
}));

import { handleOrderCreated, runInstallmentsJob, setUpPlanForOrder } from "./run";

afterEach(() => {
	vi.unstubAllEnvs();
	fetchOrder.mockReset();
});

const configure = () => {
	vi.stubEnv("AUTHORIZENET_API_LOGIN_ID", "login");
	vi.stubEnv("AUTHORIZENET_TRANSACTION_KEY", "key");
	vi.stubEnv("AUTHORIZENET_CLIENT_KEY", "client");
};

describe("runInstallmentsJob", () => {
	it("takes no payments, and says why, when Authorize.net isn't configured", async () => {
		const summary = await runInstallmentsJob();
		expect(summary.errors[0]).toMatch(/isn't configured/);
		expect(summary.charged).toBe(0);
	});
});

describe("handleOrderCreated", () => {
	it("ignores an event without an order id", async () => {
		expect(await handleOrderCreated({})).toEqual({ ok: false, reason: "no_order" });
		expect(await handleOrderCreated({ order: { id: null } })).toEqual({ ok: false, reason: "no_order" });
		expect(fetchOrder).not.toHaveBeenCalled();
	});

	it("does nothing, and reads nothing, when Authorize.net isn't configured", async () => {
		expect(await handleOrderCreated({ order: { id: "o-1" } })).toEqual({ ok: true, outcome: "unavailable" });
		expect(fetchOrder).not.toHaveBeenCalled();
	});

	it("still answers ok when the order can't be read, so Saleor doesn't keep re-sending the event", async () => {
		configure();
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		fetchOrder.mockResolvedValue({ ok: false, message: "Saleor answered 401." });
		expect(await handleOrderCreated({ order: { id: "o-1" } })).toEqual({ ok: true, outcome: "unavailable" });
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("leaves an order that isn't an installment order alone", async () => {
		configure();
		fetchOrder.mockResolvedValue({
			ok: true,
			value: {
				id: "o-1",
				number: "1",
				createdAt: "2026-10-06T15:00:00Z",
				status: "UNFULFILLED",
				email: "a@b.co",
				channel: "cad",
				currency: "CAD",
				totalCents: 10000,
				transactions: [{ id: "t", pspReference: "60001", chargedCents: 10000 }],
				record: null,
				unreadablePlan: false,
			},
		});
		expect(await setUpPlanForOrder("o-1")).toBe("not-installment");
	});

	it("treats a vanished order as unavailable", async () => {
		configure();
		fetchOrder.mockResolvedValue({ ok: true, value: null });
		expect(await setUpPlanForOrder("gone")).toBe("unavailable");
	});
});
