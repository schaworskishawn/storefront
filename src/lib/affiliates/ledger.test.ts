import { describe, expect, it } from "vitest";
import {
	computeLedger,
	formatCents,
	payoutSlots,
	payoutStatus,
	payoutsSince,
	type LedgerOrder,
} from "./ledger";
import type { OrderStamp, Payout } from "./records";
import { benefitsThrough, rangeLabel, tierById, tierForVolume } from "./tiers";

const order = (n: number, stamp: Partial<OrderStamp>): LedgerOrder => ({
	orderId: `o${n}`,
	number: String(n),
	stamp: {
		code: "neo",
		affiliateId: "u1",
		via: "link",
		baseCents: 10_000,
		currency: "USD",
		paidAt: "2026-11-02T12:00:00.000Z",
		state: "earned",
		...stamp,
	},
});

const payout = (at: string, amounts: Record<string, number>): Payout => ({
	id: at,
	at,
	amounts,
	method: "e-Transfer",
});

describe("tiers", () => {
	it("are set by more than $1,000, $5,000 and $15,000 a month", () => {
		expect(tierForVolume(0).id).toBe("cloud");
		expect(tierForVolume(100_000).id).toBe("cloud");
		expect(tierForVolume(100_001).id).toBe("vapor");
		expect(tierForVolume(500_000).id).toBe("vapor");
		expect(tierForVolume(500_001).id).toBe("surge");
		expect(tierForVolume(1_500_001).id).toBe("global");
	});

	it("label their ranges without overlapping", () => {
		expect(["cloud", "vapor", "surge", "global"].map((id) => rangeLabel(tierById(id as never)))).toEqual([
			"$0 - $1,000 / mo",
			"$1,001 - $5,000 / mo",
			"$5,001 - $15,000 / mo",
			"$15,001+ / mo",
		]);
	});

	it("include every benefit of the tiers below, keeping only the fastest payouts", () => {
		const global = benefitsThrough(tierById("global"));
		expect(global).toContain("Basic marketing banners");
		expect(global).toContain("Custom discount codes");
		expect(global).toContain("Weekly payouts");
		expect(global).not.toContain("Monthly payouts");
		expect(global).not.toContain("Bi-weekly payouts");
		expect(benefitsThrough(tierById("cloud"))).toContain("Monthly payouts");
	});
});

describe("computeLedger", () => {
	const now = new Date("2026-11-30T12:00:00.000Z");

	it("pays a month's rate on all of that month's sales once they cross a threshold", () => {
		const ledger = computeLedger(
			[
				order(1, { baseCents: 60_000, paidAt: "2026-11-02T12:00:00.000Z" }),
				order(2, { baseCents: 60_000, paidAt: "2026-11-03T12:00:00.000Z" }),
			],
			[],
			now,
		);
		expect(ledger.thisMonth.volumeCents).toBe(120_000);
		expect(ledger.thisMonth.tier.id).toBe("vapor");
		expect(ledger.lines.map((l) => l.commissionCents)).toEqual([7_200, 7_200]);
	});

	it("keeps each month's tier to itself", () => {
		const ledger = computeLedger(
			[
				order(1, { baseCents: 600_000, paidAt: "2026-10-05T12:00:00.000Z" }),
				order(2, { baseCents: 10_000, paidAt: "2026-11-05T12:00:00.000Z" }),
			],
			[],
			now,
		);
		const byNumber = Object.fromEntries(ledger.lines.map((l) => [l.number, l]));
		expect(byNumber["1"]?.rateBps).toBe(1500);
		expect(byNumber["2"]?.rateBps).toBe(1000);
	});

	it("holds commission for 15 days after an order is paid", () => {
		const ledger = computeLedger(
			[order(1, { paidAt: "2026-11-15T12:00:00.000Z" }), order(2, { paidAt: "2026-11-16T12:00:00.000Z" })],
			[],
			now,
		);
		const byNumber = Object.fromEntries(ledger.lines.map((l) => [l.number, l]));
		expect(byNumber["1"]?.status).toBe("payable");
		expect(byNumber["2"]?.status).toBe("pending");
		expect(ledger.totals.USD).toMatchObject({ payableCents: 1_000, pendingCents: 1_000, owedCents: 1_000 });
	});

	it("drops a reversed order from its month and its commission", () => {
		const ledger = computeLedger(
			[
				order(1, { baseCents: 90_000 }),
				order(2, { baseCents: 20_000, state: "reversed", reversedAt: "2026-11-10T00:00:00.000Z" }),
			],
			[],
			now,
		);
		expect(ledger.thisMonth.volumeCents).toBe(90_000);
		expect(ledger.thisMonth.tier.id).toBe("cloud");
		expect(ledger.lines.find((l) => l.number === "2")).toMatchObject({
			status: "reversed",
			commissionCents: 0,
		});
	});

	it("keeps currencies apart, counts payouts against them, and can owe less than nothing after a reversal", () => {
		const ledger = computeLedger(
			[
				order(1, { baseCents: 50_000, currency: "USD", paidAt: "2026-10-01T00:00:00.000Z" }),
				order(2, {
					baseCents: 30_000,
					currency: "CAD",
					paidAt: "2026-10-01T00:00:00.000Z",
					state: "reversed",
				}),
			],
			[payout("2026-10-20T00:00:00.000Z", { USD: 5_000, CAD: 3_000 })],
			now,
		);
		expect(ledger.totals.USD).toMatchObject({ payableCents: 5_000, paidCents: 5_000, owedCents: 0 });
		expect(ledger.totals.CAD).toMatchObject({ payableCents: 0, paidCents: 3_000, owedCents: -3_000 });
	});

	it("says how far the next tier is", () => {
		const ledger = computeLedger([order(1, { baseCents: 40_000 })], [], now);
		expect(ledger.thisMonth.next?.id).toBe("vapor");
		expect(ledger.thisMonth.toNextCents).toBe(60_001);
		const top = computeLedger([order(1, { baseCents: 2_000_000 })], [], now);
		expect(top.thisMonth.next).toBeNull();
		expect(top.thisMonth.toNextCents).toBeNull();
	});
});

describe("payout schedule", () => {
	const at = (iso: string) => new Date(iso);
	const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

	it("falls on the 1st, every other Monday, or every Monday", () => {
		const wed = at("2026-11-18T15:00:00.000Z");
		expect(iso(payoutSlots("monthly", wed).last)).toBe("2026-11-01");
		expect(iso(payoutSlots("monthly", wed).next)).toBe("2026-12-01");
		expect(iso(payoutSlots("weekly", wed).last)).toBe("2026-11-16");
		expect(iso(payoutSlots("weekly", wed).next)).toBe("2026-11-23");
		expect(new Date(payoutSlots("biweekly", wed).last).getUTCDay()).toBe(1);
		expect(payoutSlots("biweekly", wed).next - payoutSlots("biweekly", wed).last).toBe(14 * 86_400_000);
	});

	it("is due once a payout date has passed since the last payout and at least $50 is owed", () => {
		const now = at("2026-12-02T10:00:00.000Z");
		const ledger = computeLedger(
			[order(1, { baseCents: 60_000, paidAt: "2026-11-01T00:00:00.000Z" })],
			[],
			now,
		);
		expect(payoutStatus(ledger, "monthly", "2026-10-15T00:00:00.000Z", now)).toEqual({
			due: [{ currency: "USD", cents: 6_000 }],
			nextDate: "2026-12-01T00:00:00.000Z",
		});
		// Paid already since the last date: wait for the next one.
		expect(payoutStatus(ledger, "monthly", "2026-12-01T09:00:00.000Z", now).due).toEqual([]);
	});

	it("waits below the $50 minimum", () => {
		const now = at("2026-12-02T10:00:00.000Z");
		const ledger = computeLedger(
			[order(1, { baseCents: 40_000, paidAt: "2026-11-01T00:00:00.000Z" })],
			[],
			now,
		);
		const status = payoutStatus(ledger, "monthly", "2026-10-15T00:00:00.000Z", now);
		expect(status.due).toEqual([]);
		expect(status.nextDate).toBe("2027-01-01T00:00:00.000Z");
	});

	it("counts from the latest payout, or approval when there's none", () => {
		expect(payoutsSince([], "2026-10-01T00:00:00.000Z")).toBe("2026-10-01T00:00:00.000Z");
		expect(
			payoutsSince(
				[payout("2026-11-01T00:00:00.000Z", { USD: 1 }), payout("2026-11-20T00:00:00.000Z", { USD: 1 })],
				"2026-10-01T00:00:00.000Z",
			),
		).toBe("2026-11-20T00:00:00.000Z");
	});
});

describe("formatCents", () => {
	it("writes money with its currency, including a negative balance", () => {
		expect(formatCents(123_456, "USD")).toBe("$1,234.56 USD");
		expect(formatCents(-3_000, "CAD")).toBe("-$30.00 CAD");
	});
});
