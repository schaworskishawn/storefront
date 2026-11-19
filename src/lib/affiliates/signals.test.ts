import { describe, expect, it } from "vitest";
import { computeLedger, type LedgerOrder } from "./ledger";
import type { OrderStamp } from "./records";
import { computeSignals, type ReferredOrder } from "./signals";

const NOW = new Date("2026-11-18T12:00:00.000Z");

const stamp = (over: Partial<OrderStamp> = {}): OrderStamp => ({
	code: "neo",
	affiliateId: "u-neo",
	via: "link",
	baseCents: 10_000,
	currency: "USD",
	paidAt: "2026-11-02T12:00:00.000Z",
	state: "earned",
	...over,
});

const order = (n: number, over: Partial<ReferredOrder> = {}): ReferredOrder => ({
	id: `o${n}`,
	createdAt: "2026-11-02T12:00:00.000Z",
	status: "FULFILLED",
	buyerEmail: `buyer${n}@example.com`,
	postalCode: `M5V ${n}A${n}`,
	voucherCode: null,
	stamp: stamp(),
	...over,
});

const ledgerFor = (orders: ReferredOrder[]) =>
	computeLedger(
		orders.filter((o) => o.stamp).map((o): LedgerOrder => ({ orderId: o.id, number: o.id, stamp: o.stamp! })),
		[],
		NOW,
	);

describe("computeSignals", () => {
	it("counts credited, reversed and uncredited orders over the last 90 days", () => {
		const orders = [
			order(1),
			order(2, { stamp: stamp({ state: "reversed" }) }),
			order(3, { stamp: null }),
			order(4, { createdAt: "2026-01-01T00:00:00.000Z" }), // Older than 90 days.
		];
		const s = computeSignals("neo", "neo@example.com", orders, ledgerFor(orders), NOW);
		expect(s).toMatchObject({
			code: "neo",
			referredOrders: 3,
			creditedOrders: 2,
			reversedOrders: 1,
			reversalRate: 0.5,
			uncreditedOrders: 1,
		});
	});

	it("spots the affiliate's own email and lookalikes", () => {
		const orders = [
			order(1, { buyerEmail: "NEO@example.com", stamp: null }),
			order(2, { buyerEmail: "neo.anderson+2@gmail.com" }),
			order(3, { buyerEmail: "someone@example.com" }),
		];
		const s = computeSignals("neo", "neoanderson@example.com", orders, ledgerFor(orders), NOW);
		expect(s.ownEmailOrders).toBe(0);
		expect(s.lookalikeEmailOrders).toBe(1);
		expect(computeSignals("neo", "neo@example.com", orders, ledgerFor(orders), NOW).ownEmailOrders).toBe(1);
	});

	it("measures how many orders come from one place or one buyer", () => {
		const orders = [
			order(1, { postalCode: "m5v 2a2", buyerEmail: "a@x.com" }),
			order(2, { postalCode: "M5V2A2", buyerEmail: "a@x.com" }),
			order(3, { postalCode: "M5V 2A2", buyerEmail: "b@x.com" }),
			order(4, { postalCode: "H2X 1Y4", buyerEmail: "c@x.com" }),
		];
		const s = computeSignals("neo", "neo@example.com", orders, ledgerFor(orders), NOW);
		expect(s.topPostalCodeShare).toBe(0.75);
		expect(s.topBuyerShare).toBe(0.5);
	});

	it("leaves no names, emails or postal codes in what goes to the AI", () => {
		const orders = [order(1), order(2), order(3, { voucherCode: "NEO10", stamp: stamp({ via: "voucher" }) })];
		const s = computeSignals("neo", "neo@example.com", orders, ledgerFor(orders), NOW);
		const sent = JSON.stringify(s);
		expect(sent).not.toMatch(/@|M5V|example/);
		expect(s.discountCodeShare).toBe(0.33);
	});
});
