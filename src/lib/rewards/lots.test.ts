import { describe, expect, it } from "vitest";
import { addCalendarDays } from "./dates";
import {
	balanceFor,
	balances,
	expiringSoon,
	isUsable,
	planApplication,
	usableLots,
	type TokenLot,
} from "./lots";

const NOW = new Date("2026-10-06T15:00:00Z");

let n = 0;
const lot = (overrides: Partial<TokenLot> = {}): TokenLot => {
	n += 1;
	return {
		id: `lot-${n}`,
		currency: "CAD",
		balanceCents: 1000,
		initialCents: 1000,
		expiryDate: "2027-10-06",
		createdAt: `2026-0${(n % 9) + 1}-01T00:00:00Z`,
		isActive: true,
		orderId: `order-${n}`,
		...overrides,
	};
};

describe("addCalendarDays", () => {
	it("counts calendar days across months and years", () => {
		expect(addCalendarDays("2026-10-06", 30)).toBe("2026-11-05");
		expect(addCalendarDays("2026-12-20", 30)).toBe("2027-01-19");
		expect(addCalendarDays("2028-02-20", 10)).toBe("2028-03-01");
	});
});

describe("isUsable", () => {
	it("is true for an active lot with a balance that hasn't expired", () => {
		expect(isUsable(lot(), NOW)).toBe(true);
		expect(isUsable(lot({ expiryDate: null }), NOW)).toBe(true);
	});

	it("is still usable on its expiry date, and not the day after", () => {
		expect(isUsable(lot({ expiryDate: "2026-10-06" }), NOW)).toBe(true);
		expect(isUsable(lot({ expiryDate: "2026-10-05" }), NOW)).toBe(false);
	});

	it("is false when deactivated or spent", () => {
		expect(isUsable(lot({ isActive: false }), NOW)).toBe(false);
		expect(isUsable(lot({ balanceCents: 0 }), NOW)).toBe(false);
	});
});

describe("balances", () => {
	it("adds up only the usable lots, per currency, in tokens", () => {
		const lots = [
			lot({ currency: "CAD", balanceCents: 300 }),
			lot({ currency: "CAD", balanceCents: 450 }),
			lot({ currency: "USD", balanceCents: 1000 }),
			lot({ currency: "CAD", balanceCents: 9999, expiryDate: "2026-01-01" }),
			lot({ currency: "CAD", balanceCents: 9999, isActive: false }),
		];
		expect(balances(lots, NOW)).toEqual([
			{ currency: "CAD", cents: 750, tokens: 150 },
			{ currency: "USD", cents: 1000, tokens: 200 },
		]);
	});

	it("is empty for no lots, and balanceFor gives zero for a currency with none", () => {
		expect(balances([], NOW)).toEqual([]);
		expect(balanceFor([lot({ currency: "USD" })], NOW, "cad")).toEqual({
			currency: "CAD",
			tokens: 0,
			cents: 0,
		});
		expect(balanceFor([lot({ currency: "CAD", balanceCents: 250 })], NOW, "cad")).toEqual({
			currency: "CAD",
			tokens: 50,
			cents: 250,
		});
	});
});

describe("usableLots", () => {
	it("keeps one currency and orders soonest-expiring first, never-expiring last", () => {
		const late = lot({ expiryDate: "2027-09-01" });
		const soon = lot({ expiryDate: "2026-11-01" });
		const never = lot({ expiryDate: null });
		const usd = lot({ currency: "USD", expiryDate: "2026-10-10" });
		expect(usableLots([never, late, usd, soon], NOW, "cad").map((l) => l.id)).toEqual([
			soon.id,
			late.id,
			never.id,
		]);
	});

	it("breaks ties by age, oldest first", () => {
		const older = lot({ expiryDate: "2027-01-01", createdAt: "2026-01-01T00:00:00Z" });
		const newer = lot({ expiryDate: "2027-01-01", createdAt: "2026-06-01T00:00:00Z" });
		expect(usableLots([newer, older], NOW, "CAD").map((l) => l.id)).toEqual([older.id, newer.id]);
	});
});

describe("expiringSoon", () => {
	it("totals what expires within 30 days and names the first date", () => {
		const lots = [
			lot({ balanceCents: 200, expiryDate: "2026-10-20" }),
			lot({ balanceCents: 300, expiryDate: "2026-11-02" }),
			lot({ balanceCents: 999, expiryDate: "2026-12-30" }),
			lot({ balanceCents: 999, expiryDate: null }),
		];
		expect(expiringSoon(lots, NOW, "CAD")).toEqual({ tokens: 100, firstDate: "2026-10-20" });
	});

	it("includes the last day of the window and ignores other currencies, expired and empty lots", () => {
		const lots = [
			lot({ balanceCents: 100, expiryDate: "2026-11-05" }),
			lot({ balanceCents: 100, expiryDate: "2026-11-06" }),
			lot({ balanceCents: 100, expiryDate: "2026-10-10", currency: "USD" }),
			lot({ balanceCents: 100, expiryDate: "2026-10-01" }),
			lot({ balanceCents: 0, expiryDate: "2026-10-10" }),
		];
		expect(expiringSoon(lots, NOW, "CAD")).toEqual({ tokens: 20, firstDate: "2026-11-05" });
	});

	it("is null when nothing is about to expire", () => {
		expect(expiringSoon([lot({ expiryDate: "2027-10-06" })], NOW, "CAD")).toBeNull();
		expect(expiringSoon([], NOW, "CAD")).toBeNull();
	});
});

describe("planApplication", () => {
	it("applies just enough lots, soonest-expiring first", () => {
		const a = lot({ balanceCents: 300, expiryDate: "2026-11-01" });
		const b = lot({ balanceCents: 300, expiryDate: "2026-12-01" });
		const c = lot({ balanceCents: 300, expiryDate: "2027-01-01" });
		const plan = planApplication([c, a, b], NOW, "CAD", 500);
		expect(plan.lots.map((l) => l.id)).toEqual([a.id, b.id]);
		expect(plan.coveredCents).toBe(600);
	});

	it("applies everything it has when the order is bigger than the balance", () => {
		const lots = [lot({ balanceCents: 200 }), lot({ balanceCents: 300 })];
		const plan = planApplication(lots, NOW, "CAD", 10000);
		expect(plan.lots).toHaveLength(2);
		expect(plan.coveredCents).toBe(500);
	});

	it("uses one lot when the soonest-expiring lot covers the order alone, even if it holds more than is needed", () => {
		const big = lot({ balanceCents: 5000, expiryDate: "2026-11-01" });
		const small = lot({ balanceCents: 100, expiryDate: "2027-06-01" });
		const plan = planApplication([small, big], NOW, "CAD", 1200);
		expect(plan.lots.map((l) => l.id)).toEqual([big.id]);
		expect(plan.coveredCents).toBe(5000);
	});

	it("spends the soonest-expiring lot first even when a later one is bigger", () => {
		const small = lot({ balanceCents: 100, expiryDate: "2026-11-01" });
		const big = lot({ balanceCents: 5000, expiryDate: "2027-06-01" });
		expect(planApplication([big, small], NOW, "CAD", 1200).lots.map((l) => l.id)).toEqual([small.id, big.id]);
	});

	it("skips lots already on the checkout, so applying twice adds nothing", () => {
		const a = lot({ balanceCents: 300, expiryDate: "2026-11-01" });
		const b = lot({ balanceCents: 300, expiryDate: "2026-12-01" });
		expect(planApplication([a, b], NOW, "CAD", 250, new Set([a.id])).lots.map((l) => l.id)).toEqual([b.id]);
		expect(planApplication([a, b], NOW, "CAD", 250, new Set([a.id, b.id])).lots).toEqual([]);
	});

	it("ignores other currencies, expired, deactivated and spent lots", () => {
		const lots = [
			lot({ currency: "USD" }),
			lot({ expiryDate: "2026-01-01" }),
			lot({ isActive: false }),
			lot({ balanceCents: 0 }),
		];
		expect(planApplication(lots, NOW, "CAD", 500)).toEqual({ lots: [], coveredCents: 0 });
	});

	it("applies nothing to an order that costs nothing", () => {
		expect(planApplication([lot()], NOW, "CAD", 0)).toEqual({ lots: [], coveredCents: 0 });
		expect(planApplication([lot()], NOW, "CAD", -5)).toEqual({ lots: [], coveredCents: 0 });
	});
});
