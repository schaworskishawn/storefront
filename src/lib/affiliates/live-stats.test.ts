import { describe, expect, it } from "vitest";
import { computeLedger, payoutStatus, payoutsSince, type LedgerOrder } from "./ledger";
import { affiliateLiveView, money, programLiveView } from "./live-stats";
import type { OrderStamp, Payout } from "./records";

const NOW = new Date("2026-11-19T12:00:00.000Z");

const order = (n: number, stamp: Partial<OrderStamp>): LedgerOrder => ({
	orderId: `o${n}`,
	number: String(n),
	stamp: {
		code: "neo",
		affiliateId: "u1",
		via: "link",
		baseCents: 10_000,
		currency: "USD",
		paidAt: "2026-10-10T12:00:00.000Z",
		state: "earned",
		...stamp,
	},
});

function view(orders: LedgerOrder[], payouts: Payout[] = []) {
	const ledger = computeLedger(orders, payouts, NOW);
	const status = payoutStatus(
		ledger,
		ledger.thisMonth.tier.schedule,
		payoutsSince(payouts, "2026-09-01T00:00:00.000Z"),
		NOW,
	);
	return affiliateLiveView(ledger, status, { kind: "tokens" }, NOW);
}

const stat = (v: ReturnType<typeof view>, id: string) => v.stats.find((s) => s.id === id)!;

describe("money", () => {
	it("lists each currency, leaving out empty ones", () => {
		expect(money({ USD: 1_250, CAD: 300 })).toBe("$3.00 CAD + $12.50 USD");
		expect(money({ USD: 0 })).toBe("$0.00");
		expect(money({})).toBe("$0.00");
	});
});

describe("affiliateLiveView", () => {
	it("shows a new affiliate's zeros honestly", () => {
		const v = view([]);
		expect(v.stats.map((s) => [s.label, s.value])).toEqual([
			["TOTAL EARNED", "$0.00"],
			["REFERRED ORDERS", "0 orders"],
			["THIS MONTH'S SALES", "$0.00"],
			["IN THE RETURN WINDOW", "$0.00"],
		]);
		expect(v.payout.value).toBe("$0.00");
		expect(v.payout.rows[1]).toEqual(["Paid in", "Vapor Tokens (+25%)"]);
	});

	it("adds up what they've earned, this month's share, and what's still pending", () => {
		const v = view([
			order(1, {}), // October, payable: $10.00
			order(2, { paidAt: "2026-11-15T12:00:00.000Z", baseCents: 20_000 }), // This week, pending: $20.00
			order(3, { paidAt: "2026-11-02T12:00:00.000Z", state: "reversed" }), // Doesn't count.
		]);
		expect(stat(v, "earned")).toMatchObject({ value: "$30.00 USD", note: "+$20.00 USD this month" });
		expect(stat(v, "orders")).toMatchObject({ value: "2 orders", note: "+1 this week" });
		expect(stat(v, "pending")).toMatchObject({ value: "$20.00 USD", note: "Payable from Nov 30, 2026" });
		expect(stat(v, "month").note).toBe("Cloud 10% · $800.01 more to Vapor 12%");
		expect(stat(v, "month").progress?.percent).toBeCloseTo(20, 0);
	});

	it("shows what's owed now and when it's paid", () => {
		const v = view([order(1, { baseCents: 100_000 })]); // $100.00 payable, due since Nov 1.
		expect(v.payout).toMatchObject({ label: "TO BE PAID", value: "$100.00 USD" });
		expect(v.payout.rows[0]).toEqual(["Next payout", "Due now"]);

		const paid = view(
			[order(1, { baseCents: 100_000 })],
			[{ id: "p", at: "2026-11-02T00:00:00.000Z", amounts: { USD: 10_000 }, method: "tokens" }],
		);
		expect(paid.payout.value).toBe("$0.00");
		expect(paid.payout.rows[0]).toEqual(["Next payout", "Dec 1, 2026"]);
	});
});

describe("programLiveView", () => {
	it("shows the program's real terms and the real next payout date", () => {
		const v = programLiveView(NOW);
		expect(v.stats.map((s) => s.value)).toEqual(["10–20%", "30 days", "15 days", "+25%"]);
		expect(v.payout).toMatchObject({ label: "NEXT PAYOUT DATE", value: "Dec 1, 2026" });
		expect(v.payout.rows[0]).toEqual(["Schedule", "Monthly, on the 1st; weekly at Global"]);
	});
});
