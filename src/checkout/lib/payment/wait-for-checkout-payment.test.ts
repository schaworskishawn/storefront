import { describe, expect, it, vi } from "vitest";
import { type ServerCheckout } from "@/checkout/lib/checkout-types";
import { waitForCheckoutPayment } from "./wait-for-checkout-payment";

const checkout = (authorizeStatus: string) => ({ id: "co-1", authorizeStatus }) as unknown as ServerCheckout;
const sleep = vi.fn().mockResolvedValue(undefined);

describe("waitForCheckoutPayment", () => {
	it("returns at once when the checkout is already paid", async () => {
		const fetchCheckout = vi.fn().mockResolvedValue({ ok: true, checkout: checkout("FULL") });
		const result = await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep });
		expect(result).toMatchObject({ status: "ready" });
		expect(fetchCheckout).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("keeps looking until the payment lands", async () => {
		sleep.mockClear();
		const fetchCheckout = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, checkout: checkout("NONE") })
			.mockResolvedValueOnce({ ok: true, checkout: checkout("PARTIAL") })
			.mockResolvedValueOnce({ ok: true, checkout: checkout("FULL") });
		const result = await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep, intervalMs: 5 });
		expect(result).toMatchObject({ status: "ready" });
		expect(fetchCheckout).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(5);
	});

	it("gives up with a timeout when it never lands", async () => {
		const fetchCheckout = vi.fn().mockResolvedValue({ ok: true, checkout: checkout("NONE") });
		const result = await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep, attempts: 4 });
		expect(result).toEqual({ status: "timeout" });
		expect(fetchCheckout).toHaveBeenCalledTimes(4);
	});

	it("says unavailable, not timeout, when Saleor couldn't be read", async () => {
		const failing = vi.fn().mockResolvedValue({ ok: false });
		expect(
			await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout: failing, sleep, attempts: 3 }),
		).toEqual({
			status: "unavailable",
		});

		const throwing = vi.fn().mockRejectedValue(new Error("network"));
		expect(
			await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout: throwing, sleep, attempts: 3 }),
		).toEqual({
			status: "unavailable",
		});
	});

	it("recovers from a failed read", async () => {
		const fetchCheckout = vi
			.fn()
			.mockResolvedValueOnce({ ok: false })
			.mockResolvedValueOnce({ ok: true, checkout: checkout("FULL") });
		expect(await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep })).toMatchObject({
			status: "ready",
		});
	});

	it("reports a checkout that has disappeared as gone, but only after it stays missing", async () => {
		const fetchCheckout = vi.fn().mockResolvedValue({ ok: true, checkout: null });
		expect(await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep, attempts: 10 })).toEqual({
			status: "gone",
		});
		expect(fetchCheckout).toHaveBeenCalledTimes(2);
	});

	it("does not call a checkout gone after a single missing read", async () => {
		const fetchCheckout = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, checkout: null })
			.mockResolvedValueOnce({ ok: true, checkout: checkout("FULL") });
		expect(await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep })).toMatchObject({
			status: "ready",
		});
	});

	it("reports a timeout when the only missing read was a blip and the payment never lands", async () => {
		const fetchCheckout = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, checkout: null })
			.mockResolvedValue({ ok: true, checkout: checkout("NONE") });
		expect(await waitForCheckoutPayment({ checkoutId: "co-1", fetchCheckout, sleep, attempts: 4 })).toEqual({
			status: "timeout",
		});
	});

	it("stops when cancelled", async () => {
		const fetchCheckout = vi.fn().mockResolvedValue({ ok: true, checkout: checkout("NONE") });
		let calls = 0;
		const result = await waitForCheckoutPayment({
			checkoutId: "co-1",
			fetchCheckout,
			sleep,
			attempts: 10,
			isCancelled: () => ++calls > 2,
		});
		expect(result).toEqual({ status: "cancelled" });
		expect(fetchCheckout).toHaveBeenCalledTimes(2);
	});
});
