import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reasonFor } from "./pricing";
import type { DistributorRecord } from "./records";
import type { PricingCheckout } from "./saleor-distributors";
import { syncDistributorPricing, type SyncDeps } from "./sync";
import { tierById } from "./tiers";

const distributor: DistributorRecord = {
	status: "approved",
	tierId: "small",
	application: null,
	appliedAt: null,
	decidedAt: null,
};

const checkout = (record: DistributorRecord | null, reason: string | null = null): PricingCheckout => ({
	userId: record ? "user-1" : null,
	record,
	lines: [{ lineId: "line-1", quantity: 30, listCents: 1000, reason }],
});

function deps(read: PricingCheckout | null, saveOk = true) {
	const setPrices = vi.fn<SyncDeps["setPrices"]>(async () =>
		saveOk ? { ok: true, value: undefined } : { ok: false, message: "throttled" },
	);
	const d: SyncDeps = { configured: true, fetch: async () => ({ ok: true, value: read }), setPrices };
	return { d, setPrices };
}

describe("syncing a checkout's prices", () => {
	it("sets wholesale prices for an approved distributor over their minimum", async () => {
		const { d, setPrices } = deps(checkout(distributor));
		const plan = await syncDistributorPricing("co-1", d);
		expect(plan?.wholesale).toBe(true);
		expect(setPrices).toHaveBeenCalledWith("co-1", [
			{ lineId: "line-1", price: 9.5, priceOverrideReason: reasonFor(tierById("small"), 950) },
		]);
	});

	it("writes nothing when the prices are already right", async () => {
		const { d, setPrices } = deps(checkout(distributor, reasonFor(tierById("small"), 950)));
		expect((await syncDistributorPricing("co-1", d))?.wholesale).toBe(true);
		expect(setPrices).not.toHaveBeenCalled();
	});

	it("takes a paused distributor's checkout back to retail", async () => {
		const { d, setPrices } = deps(
			checkout({ ...distributor, status: "paused" }, reasonFor(tierById("small"), 950)),
		);
		const plan = await syncDistributorPricing("co-1", d);
		expect(plan?.tier).toBeNull();
		expect(setPrices).toHaveBeenCalledWith("co-1", [{ lineId: "line-1", price: null }]);
	});

	it("leaves a guest checkout alone", async () => {
		const { d, setPrices } = deps(checkout(null));
		expect((await syncDistributorPricing("co-1", d))?.wholesale).toBe(false);
		expect(setPrices).not.toHaveBeenCalled();
	});

	it("does nothing without a checkout or while the program isn't set up", async () => {
		const { d, setPrices } = deps(checkout(distributor));
		expect(await syncDistributorPricing(null, d)).toBeNull();
		expect(await syncDistributorPricing("co-1", { ...d, configured: false })).toBeNull();
		expect(await syncDistributorPricing("co-1", deps(null).d)).toBeNull();
		expect(setPrices).not.toHaveBeenCalled();
	});

	it("survives Saleor failing, and says no prices changed", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const unreadable: SyncDeps = {
			...deps(null).d,
			fetch: async () => ({ ok: false, message: "down" }),
		};
		expect(await syncDistributorPricing("co-1", unreadable)).toBeNull();

		const plan = await syncDistributorPricing("co-1", deps(checkout(distributor), false).d);
		expect(plan?.updates).toEqual([]);
		expect(warn).toHaveBeenCalled();
		expect(error).toHaveBeenCalled();
		warn.mockRestore();
		error.mockRestore();
	});
});
