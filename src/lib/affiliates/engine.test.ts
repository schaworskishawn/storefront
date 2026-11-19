import { describe, expect, it, vi } from "vitest";
import {
	creditOrder,
	reverseOrder,
	type AffiliateAccount,
	type AffiliateEngineDeps,
	type AffiliateOrder,
} from "./engine";
import type { AffiliateRecord, OrderStamp } from "./records";

const NOW = new Date("2026-11-18T12:00:00.000Z");

const record = (over: Partial<AffiliateRecord> = {}): AffiliateRecord => ({
	status: "approved",
	code: "neo",
	vouchers: [],
	application: null,
	appliedAt: "2026-10-01T00:00:00.000Z",
	approvedAt: "2026-10-02T00:00:00.000Z",
	payouts: [],
	payoutMethod: { kind: "tokens" },
	autoHold: null,
	aiReview: null,
	aiFlag: null,
	...over,
});

const neo: AffiliateAccount = { userId: "u-neo", email: "neo@example.com", name: "Neo", record: record() };
const trin: AffiliateAccount = {
	userId: "u-trin",
	email: "trin@example.com",
	name: "Trinity",
	record: record({ code: "trinity", vouchers: ["TRIN10"] }),
};

const baseOrder = (over: Partial<AffiliateOrder> = {}): AffiliateOrder => ({
	id: "order-1",
	number: "1001",
	status: "UNFULFILLED",
	userId: "u-buyer",
	email: "buyer@example.com",
	currency: "USD",
	chargedCents: 12_000,
	shippingCents: 1_000,
	taxCents: 1_000,
	subtotalCents: 10_000,
	voucherCode: null,
	ref: "neo",
	campaign: null,
	stamp: null,
	...over,
});

function setup(order: AffiliateOrder | null, accounts: AffiliateAccount[] = [neo, trin]) {
	const stamps: { orderId: string; stamp: OrderStamp }[] = [];
	const notes: string[] = [];
	const alerts: string[] = [];
	const deps: AffiliateEngineDeps = {
		now: () => NOW,
		orders: {
			get: vi.fn(async () => ({ ok: true as const, value: order })),
			stamp: vi.fn(async (orderId: string, stamp: OrderStamp) => {
				stamps.push({ orderId, stamp });
				return { ok: true as const, value: undefined };
			}),
			note: vi.fn(async (_orderId: string, message: string) => {
				notes.push(message);
				return { ok: true as const, value: undefined };
			}),
		},
		affiliates: { list: vi.fn(async () => ({ ok: true as const, value: accounts })) },
		alertStaff: vi.fn(async (subject: string) => {
			alerts.push(subject);
		}),
	};
	return { deps, stamps, notes, alerts };
}

describe("creditOrder", () => {
	it("credits an order from a referral link on the products paid for (no shipping or tax)", async () => {
		const { deps, stamps, notes } = setup(baseOrder());
		expect(await creditOrder("order-1", deps)).toBe("credited");
		expect(stamps).toEqual([
			{
				orderId: "order-1",
				stamp: {
					code: "neo",
					affiliateId: "u-neo",
					via: "link",
					baseCents: 10_000,
					currency: "USD",
					paidAt: NOW.toISOString(),
					state: "earned",
				},
			},
		]);
		expect(notes[0]).toContain("credited to neo (referral link)");
	});

	it("keeps the link's campaign tag on the credit", async () => {
		const { deps, stamps } = setup(baseOrder({ campaign: "TikTok" }));
		expect(await creditOrder("order-1", deps)).toBe("credited");
		expect(stamps[0]?.stamp.campaign).toBe("tiktok");
	});

	it("drops a campaign tag that's malformed or came with another affiliate's link", async () => {
		const bad = setup(baseOrder({ campaign: "<script>" }));
		await creditOrder("order-1", bad.deps);
		expect(bad.stamps[0]?.stamp).not.toHaveProperty("campaign");

		const other = setup(baseOrder({ voucherCode: "trin10", ref: "neo", campaign: "instagram" }));
		await creditOrder("order-1", other.deps);
		expect(other.stamps[0]?.stamp).toMatchObject({ code: "trinity", via: "voucher" });
		expect(other.stamps[0]?.stamp).not.toHaveProperty("campaign");
	});

	it("lets a linked discount code win over the link", async () => {
		const { deps, stamps } = setup(baseOrder({ voucherCode: "trin10", ref: "neo" }));
		expect(await creditOrder("order-1", deps)).toBe("credited");
		expect(stamps[0]?.stamp).toMatchObject({ code: "trinity", via: "voucher" });
	});

	it("ignores a discount code that isn't linked to anyone and falls back to the link", async () => {
		const { deps, stamps } = setup(baseOrder({ voucherCode: "BLACKFRIDAY" }));
		expect(await creditOrder("order-1", deps)).toBe("credited");
		expect(stamps[0]?.stamp).toMatchObject({ code: "neo", via: "link" });
	});

	it("does nothing twice: an order already credited is left alone", async () => {
		const stamp: OrderStamp = {
			code: "neo",
			affiliateId: "u-neo",
			via: "link",
			baseCents: 1,
			currency: "USD",
			paidAt: NOW.toISOString(),
			state: "earned",
		};
		const { deps, stamps } = setup(baseOrder({ stamp }));
		expect(await creditOrder("order-1", deps)).toBe("already-credited");
		expect(stamps).toEqual([]);
		expect(deps.affiliates.list).not.toHaveBeenCalled();
	});

	it("doesn't credit an affiliate's own order, matched by account or email", async () => {
		const own = setup(baseOrder({ userId: "u-neo" }));
		expect(await creditOrder("order-1", own.deps)).toBe("self-referral");
		const sameEmail = setup(baseOrder({ userId: null, email: "NEO@example.com" }));
		expect(await creditOrder("order-1", sameEmail.deps)).toBe("self-referral");
		expect(own.stamps).toEqual([]);
	});

	it("doesn't credit an affiliate who is paused, pending or rejected", async () => {
		for (const status of ["paused", "pending", "rejected"] as const) {
			const { deps, stamps } = setup(baseOrder(), [{ ...neo, record: record({ status }) }]);
			expect(await creditOrder("order-1", deps)).toBe("not-approved");
			expect(stamps).toEqual([]);
		}
	});

	it("trusts only the private record: an unknown code, or no referral at all, earns nothing", async () => {
		const unknown = setup(baseOrder({ ref: "morpheus" }));
		expect(await creditOrder("order-1", unknown.deps)).toBe("unknown-affiliate");
		const none = setup(baseOrder({ ref: null }));
		expect(await creditOrder("order-1", none.deps)).toBe("no-referral");
		expect(none.deps.affiliates.list).not.toHaveBeenCalled();
	});

	it("earns nothing on an order paid entirely with gift cards or tokens", async () => {
		const { deps, stamps } = setup(baseOrder({ chargedCents: 2_000 }));
		expect(await creditOrder("order-1", deps)).toBe("nothing-to-earn");
		expect(stamps).toEqual([]);
	});

	it("skips cancelled orders and alerts staff when the affiliates can't be read", async () => {
		expect(await creditOrder("order-1", setup(baseOrder({ status: "CANCELED" })).deps)).toBe("stopped");
		const broken = setup(baseOrder());
		broken.deps.affiliates.list = vi.fn(async () => ({ ok: false as const, message: "boom" }));
		expect(await creditOrder("order-1", broken.deps)).toBe("failed");
		expect(broken.alerts).toHaveLength(1);
	});
});

describe("reverseOrder", () => {
	const stamp: OrderStamp = {
		code: "neo",
		affiliateId: "u-neo",
		via: "link",
		baseCents: 10_000,
		currency: "USD",
		paidAt: "2026-11-01T00:00:00.000Z",
		state: "earned",
	};

	it("marks a credited order reversed, once", async () => {
		const { deps, stamps } = setup(baseOrder({ stamp }));
		expect(await reverseOrder("order-1", deps)).toBe("reversed");
		expect(stamps[0]?.stamp).toMatchObject({ state: "reversed", reversedAt: NOW.toISOString() });
		const again = setup(baseOrder({ stamp: { ...stamp, state: "reversed" } }));
		expect(await reverseOrder("order-1", again.deps)).toBe("already-reversed");
		expect(again.stamps).toEqual([]);
	});

	it("leaves an order that was never credited alone", async () => {
		const { deps, stamps } = setup(baseOrder());
		expect(await reverseOrder("order-1", deps)).toBe("not-credited");
		expect(stamps).toEqual([]);
	});
});
