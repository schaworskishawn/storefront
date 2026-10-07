import { describe, expect, it } from "vitest";
import { lotRows, lotStatus } from "./history";
import type { TokenLot } from "./lots";

const NOW = new Date("2026-10-06T15:00:00Z");

const lot = (overrides: Partial<TokenLot> = {}): TokenLot => ({
	id: "lot-1",
	currency: "CAD",
	balanceCents: 300,
	initialCents: 300,
	expiryDate: "2027-10-06",
	createdAt: "2026-09-01T12:00:00Z",
	isActive: true,
	orderId: "order-1",
	...overrides,
});

describe("lotStatus", () => {
	it("is active while there are tokens left and the date hasn't passed", () => {
		expect(lotStatus(lot(), NOW)).toBe("active");
		expect(lotStatus(lot({ expiryDate: null }), NOW)).toBe("active");
	});

	it("is still active on the expiry day itself", () => {
		expect(lotStatus(lot({ expiryDate: "2026-10-06" }), NOW)).toBe("active");
	});

	it("is expired once the day has passed with tokens left", () => {
		expect(lotStatus(lot({ expiryDate: "2026-10-05" }), NOW)).toBe("expired");
	});

	it("is used when nothing is left, even if it has also expired", () => {
		expect(lotStatus(lot({ balanceCents: 0 }), NOW)).toBe("used");
		expect(lotStatus(lot({ balanceCents: 0, expiryDate: "2026-01-01" }), NOW)).toBe("used");
	});

	it("is closed when the order that earned it was cancelled or refunded, whatever else is true", () => {
		expect(lotStatus(lot({ isActive: false }), NOW)).toBe("closed");
		expect(lotStatus(lot({ isActive: false, balanceCents: 0 }), NOW)).toBe("closed");
	});
});

describe("lotRows", () => {
	it("lists newest first, with what was earned and what is left", () => {
		const rows = lotRows(
			[
				lot({ id: "old", createdAt: "2026-01-10T00:00:00Z", initialCents: 500, balanceCents: 120 }),
				lot({ id: "new", createdAt: "2026-09-20T08:00:00Z", initialCents: 900, balanceCents: 900 }),
			],
			NOW,
		);
		expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
		expect(rows[0]).toMatchObject({
			earnedOn: "2026-09-20",
			earnedTokens: 180,
			remainingTokens: 180,
			status: "active",
		});
		expect(rows[1]).toMatchObject({ earnedOn: "2026-01-10", earnedTokens: 100, remainingTokens: 24 });
	});

	it("keeps each lot's currency and expiry, and doesn't change the list it was given", () => {
		const input = [
			lot({ id: "a", currency: "USD", expiryDate: null, createdAt: "2026-02-01T00:00:00Z" }),
			lot({ id: "b" }),
		];
		const rows = lotRows(input, NOW);
		expect(rows.find((row) => row.id === "a")).toMatchObject({ currency: "USD", expiryDate: null });
		expect(input.map((l) => l.id)).toEqual(["a", "b"]);
	});

	it("is empty with no lots", () => {
		expect(lotRows([], NOW)).toEqual([]);
	});
});
