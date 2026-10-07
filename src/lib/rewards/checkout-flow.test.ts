import { describe, expect, it, vi } from "vitest";
import {
	applyTokens,
	readTokensView,
	removeTokens,
	type Changed,
	type FlowCheckout,
	type FlowDeps,
	type Outcome,
} from "./checkout-flow";
import type { LotWithCode } from "./saleor-rewards";

const NOW = new Date("2026-10-06T15:00:00Z");
const ME = "VXNlcjox";

type Shown = { name: string };

let n = 0;
const lot = (overrides: Partial<LotWithCode> = {}): LotWithCode => {
	n += 1;
	return {
		id: `lot-${n}`,
		currency: "CAD",
		balanceCents: 500,
		initialCents: 500,
		expiryDate: "2027-10-06",
		createdAt: `2026-09-0${n % 9 || 1}T00:00:00Z`,
		isActive: true,
		orderId: `order-${n}`,
		code: `CODE-${n}`,
		...overrides,
	};
};

const checkoutOf = (overrides: Partial<FlowCheckout> = {}): FlowCheckout => ({
	id: "checkout-1",
	currency: "CAD",
	totalCents: 2300,
	shippingCents: 500,
	taxCents: 300,
	subtotalCents: 1500,
	userId: ME,
	giftCardIds: [],
	...overrides,
});

type Setup = {
	checkout?: FlowCheckout | null;
	userId?: string | null;
	lots?: LotWithCode[] | "error";
	enabled?: boolean;
	codes?: Record<string, string | null>;
};

/**
 * Fakes where applying a code takes its lot's balance off the checkout, like Saleor does, so the flow's choices show in the
 * resulting totals and in the calls that were made.
 */
function setup({ checkout = checkoutOf(), userId = ME, lots = [], enabled = true, codes = {} }: Setup = {}) {
	let current = checkout;
	const all = lots === "error" ? [] : lots;
	const calls: string[] = [];
	const reports: string[] = [];
	const shown = (): Shown => ({ name: `checkout:${current?.totalCents}` });
	const changed = (): Outcome<Changed<Shown>> =>
		current ? { ok: true, value: { checkout: shown(), flow: current } } : { ok: false, message: "gone" };

	const deps: FlowDeps<Shown> = {
		now: () => NOW,
		config: { enabled, tokensPerDollar: 3, expiryMonths: 12 },
		checkout: async () => current,
		userId: async () => userId,
		lots: async (_user, withCode) =>
			lots === "error"
				? { ok: false, message: "Saleor is down" }
				: { ok: true, value: all.map((l) => ({ ...l, code: withCode ? l.code : null })) },
		readCode: async (id) => ({ ok: true, value: codes[id] ?? null }),
		attach: async () => {
			calls.push("attach");
			if (current) current = { ...current, userId: ME };
			return changed();
		},
		apply: async (_id, code) => {
			calls.push(`apply:${code}`);
			const found = all.find((l) => l.code === code || codes[l.id] === code);
			if (!found || !current) return { ok: false, message: "Promo code is invalid" };
			current = {
				...current,
				totalCents: Math.max(0, current.totalCents - found.balanceCents),
				giftCardIds: [...current.giftCardIds, found.id],
			};
			return changed();
		},
		remove: async (_id, giftCardId) => {
			calls.push(`remove:${giftCardId}`);
			if (!current) return { ok: false, message: "gone" };
			current = { ...current, giftCardIds: current.giftCardIds.filter((id) => id !== giftCardId) };
			return changed();
		},
		report: (message) => reports.push(message),
	};
	return { deps, calls, reports, current: () => current };
}

describe("readTokensView", () => {
	it("is off when rewards are off, without touching Saleor", async () => {
		const { deps } = setup({ enabled: false });
		const checkout = vi.spyOn(deps, "checkout");
		expect(await readTokensView("checkout-1", deps)).toEqual({ status: "disabled" });
		expect(checkout).not.toHaveBeenCalled();
	});

	it("tells a guest what the order would earn, and nothing about tokens to spend", async () => {
		const { deps } = setup({ userId: null, lots: [lot()] });
		// $15 of products at 3 tokens a dollar.
		expect(await readTokensView("checkout-1", deps)).toEqual({ status: "guest", willEarnTokens: 45 });
	});

	it("shows a signed-in customer's balance in the checkout's currency", async () => {
		const { deps } = setup({
			lots: [lot({ balanceCents: 300 }), lot({ balanceCents: 450 }), lot({ currency: "USD" })],
		});
		expect(await readTokensView("checkout-1", deps)).toMatchObject({
			status: "ready",
			currency: "CAD",
			balanceTokens: 150,
			canApply: true,
			willEarnTokens: 45,
		});
	});

	it("never returns lot codes", async () => {
		const { deps } = setup({ lots: [lot({ code: "SECRET-CODE" })] });
		expect(JSON.stringify(await readTokensView("checkout-1", deps))).not.toContain("SECRET-CODE");
	});

	it("is unavailable for a checkout that belongs to someone else", async () => {
		const { deps } = setup({ checkout: checkoutOf({ userId: "someone-else" }), lots: [lot()] });
		expect(await readTokensView("checkout-1", deps)).toEqual({ status: "unavailable" });
	});

	it("treats a checkout with no customer yet as the signed-in customer's", async () => {
		const { deps } = setup({ checkout: checkoutOf({ userId: null }), lots: [lot()] });
		expect(await readTokensView("checkout-1", deps)).toMatchObject({ status: "ready", balanceTokens: 100 });
	});

	it("is unavailable, and reports it, when the tokens can't be read, rather than showing a zero balance", async () => {
		const { deps, reports } = setup({ lots: "error" });
		expect(await readTokensView("checkout-1", deps)).toEqual({ status: "unavailable" });
		expect(reports[0]).toContain("Saleor is down");
	});

	it("is unavailable when the checkout is gone", async () => {
		const { deps } = setup({ checkout: null });
		expect(await readTokensView("checkout-1", deps)).toEqual({ status: "unavailable" });
	});
});

describe("applyTokens", () => {
	it("refuses when rewards are off, for a guest, for a missing checkout and for someone else's", async () => {
		expect(await applyTokens("c", setup({ enabled: false, lots: [lot()] }).deps)).toMatchObject({
			code: "disabled",
		});
		expect(await applyTokens("c", setup({ userId: null, lots: [lot()] }).deps)).toMatchObject({
			code: "sign-in",
		});
		expect(await applyTokens("c", setup({ checkout: null, lots: [lot()] }).deps)).toMatchObject({
			code: "no-checkout",
		});
		const theirs = setup({ checkout: checkoutOf({ userId: "someone-else" }), lots: [lot()] });
		expect(await applyTokens("c", theirs.deps)).toMatchObject({ code: "not-yours" });
		expect(theirs.calls).toEqual([]);
	});

	it("applies one lot that covers the order", async () => {
		const a = lot({ balanceCents: 5000, code: "BIG" });
		const { deps, calls } = setup({ lots: [a] });
		expect(await applyTokens("checkout-1", deps)).toEqual({ ok: true, checkout: { name: "checkout:0" } });
		expect(calls).toEqual(["apply:BIG"]);
	});

	it("applies soonest-expiring first and only as many lots as the order needs", async () => {
		const later = lot({ balanceCents: 1000, expiryDate: "2027-06-01", code: "LATER" });
		const sooner = lot({ balanceCents: 1500, expiryDate: "2026-12-01", code: "SOONER" });
		const soonest = lot({ balanceCents: 400, expiryDate: "2026-10-20", code: "SOONEST" });
		const { deps, calls } = setup({ lots: [later, sooner, soonest] }); // $23.00 to pay
		await applyTokens("checkout-1", deps);
		// 400 then 1500 leaves 400 to pay; 1000 then covers it. All three: nothing is skipped when it is needed.
		expect(calls).toEqual(["apply:SOONEST", "apply:SOONER", "apply:LATER"]);
	});

	it("stops once the order is covered, leaving the later lots alone", async () => {
		const a = lot({ balanceCents: 1500, expiryDate: "2026-12-01", code: "A" });
		const b = lot({ balanceCents: 1500, expiryDate: "2027-01-01", code: "B" });
		const c = lot({ balanceCents: 1500, expiryDate: "2027-02-01", code: "C" });
		const { deps, calls } = setup({ lots: [a, b, c] }); // $23.00: two lots cover it
		await applyTokens("checkout-1", deps);
		expect(calls).toEqual(["apply:A", "apply:B"]);
	});

	it("applies part of the order's cost when the balance is smaller, leaving the rest to the card", async () => {
		const { deps, current } = setup({ lots: [lot({ balanceCents: 700 })] });
		expect(await applyTokens("checkout-1", deps)).toEqual({ ok: true, checkout: { name: "checkout:1600" } });
		expect(current()?.totalCents).toBe(1600);
	});

	it("skips lots that are expired, spent, deactivated or in another currency", async () => {
		const { deps, calls } = setup({
			lots: [
				lot({ expiryDate: "2026-01-01" }),
				lot({ balanceCents: 0 }),
				lot({ isActive: false }),
				lot({ currency: "USD" }),
			],
		});
		expect(await applyTokens("checkout-1", deps)).toMatchObject({ ok: false, code: "no-tokens" });
		expect(calls).toEqual([]);
	});

	it("doesn't apply a lot that is already on the checkout again", async () => {
		const a = lot({ balanceCents: 700, code: "A" });
		const b = lot({ balanceCents: 5000, code: "B", expiryDate: "2028-01-01" });
		const { deps, calls } = setup({
			lots: [a, b],
			checkout: checkoutOf({ giftCardIds: [a.id], totalCents: 1600 }),
		});
		await applyTokens("checkout-1", deps);
		expect(calls).toEqual(["apply:B"]);
	});

	it("does nothing when the order is already covered", async () => {
		const { deps, calls } = setup({ lots: [lot()], checkout: checkoutOf({ totalCents: 0 }) });
		expect(await applyTokens("checkout-1", deps)).toMatchObject({ ok: false, code: "no-tokens" });
		expect(calls).toEqual([]);
	});

	it("reads a lot's code from Saleor when the stored copy is missing", async () => {
		const a = lot({ balanceCents: 5000, code: null });
		const { deps, calls } = setup({ lots: [a], codes: { [a.id]: "FROM-SALEOR" } });
		await applyTokens("checkout-1", deps);
		expect(calls).toEqual(["apply:FROM-SALEOR"]);
	});

	it("skips a lot whose code can't be found, reports it, and uses the next one", async () => {
		const lost = lot({ balanceCents: 5000, code: null, expiryDate: "2026-11-01" });
		const good = lot({ balanceCents: 5000, code: "GOOD", expiryDate: "2027-01-01" });
		const { deps, calls, reports } = setup({ lots: [lost, good] });
		await applyTokens("checkout-1", deps);
		expect(calls).toEqual(["apply:GOOD"]);
		expect(reports.some((r) => r.includes(lost.id))).toBe(true);
	});

	it("says it couldn't when no lot could be applied", async () => {
		const { deps, reports } = setup({ lots: [lot({ code: null })] });
		expect(await applyTokens("checkout-1", deps)).toMatchObject({ ok: false, code: "unavailable" });
		expect(reports).toHaveLength(1);
	});

	it("passes on Saleor's message when the first lot is refused", async () => {
		const { deps } = setup({ lots: [lot({ code: "X" })] });
		deps.apply = async () => ({ ok: false, message: "Promo code is invalid" });
		expect(await applyTokens("checkout-1", deps)).toEqual({
			ok: false,
			code: "failed",
			message: "Promo code is invalid",
		});
	});

	it("keeps what was applied when a later lot is refused", async () => {
		const a = lot({ balanceCents: 1000, code: "A", expiryDate: "2026-12-01" });
		const b = lot({ balanceCents: 1000, code: "B", expiryDate: "2027-01-01" });
		const { deps } = setup({ lots: [a, b] });
		const apply = deps.apply;
		let first = true;
		deps.apply = async (id, code) => {
			if (first) {
				first = false;
				return apply(id, code);
			}
			return { ok: false, message: "Promo code is invalid" };
		};
		expect(await applyTokens("checkout-1", deps)).toEqual({ ok: true, checkout: { name: "checkout:1300" } });
	});

	it("attaches the customer first when the checkout has none yet", async () => {
		const { deps, calls } = setup({
			checkout: checkoutOf({ userId: null }),
			lots: [lot({ balanceCents: 5000, code: "A" })],
		});
		await applyTokens("checkout-1", deps);
		expect(calls).toEqual(["attach", "apply:A"]);
	});

	it("is unavailable, and reports it, when the tokens can't be read", async () => {
		const { deps, calls, reports } = setup({ lots: "error" });
		expect(await applyTokens("checkout-1", deps)).toMatchObject({ ok: false, code: "unavailable" });
		expect(calls).toEqual([]);
		expect(reports).toHaveLength(1);
	});
});

describe("removeTokens", () => {
	it("refuses a guest, someone else's checkout and a disabled store", async () => {
		expect(await removeTokens("c", setup({ userId: null, lots: [lot()] }).deps)).toMatchObject({
			code: "sign-in",
		});
		expect(
			await removeTokens(
				"c",
				setup({ checkout: checkoutOf({ userId: "someone-else" }), lots: [lot()] }).deps,
			),
		).toMatchObject({ code: "not-yours" });
		expect(await removeTokens("c", setup({ enabled: false, lots: [lot()] }).deps)).toMatchObject({
			code: "disabled",
		});
	});

	it("takes the customer's token lots off and leaves other gift cards alone", async () => {
		const a = lot();
		const b = lot();
		const { deps, calls, current } = setup({
			lots: [a, b],
			checkout: checkoutOf({ giftCardIds: [a.id, "someone-giftcard", b.id] }),
		});
		expect(await removeTokens("checkout-1", deps)).toMatchObject({ ok: true });
		expect(calls).toEqual([`remove:${a.id}`, `remove:${b.id}`]);
		expect(current()?.giftCardIds).toEqual(["someone-giftcard"]);
	});

	it("removes a lot that has since expired", async () => {
		const expired = lot({ expiryDate: "2026-01-01" });
		const { deps, calls } = setup({ lots: [expired], checkout: checkoutOf({ giftCardIds: [expired.id] }) });
		await removeTokens("checkout-1", deps);
		expect(calls).toEqual([`remove:${expired.id}`]);
	});

	it("says there is nothing to remove when no tokens are on the checkout", async () => {
		const { deps, calls } = setup({
			lots: [lot()],
			checkout: checkoutOf({ giftCardIds: ["someone-giftcard"] }),
		});
		expect(await removeTokens("checkout-1", deps)).toMatchObject({ ok: false, code: "no-tokens" });
		expect(calls).toEqual([]);
	});

	it("passes on Saleor's message when a removal fails", async () => {
		const a = lot();
		const { deps } = setup({ lots: [a], checkout: checkoutOf({ giftCardIds: [a.id] }) });
		deps.remove = async () => ({ ok: false, message: "nope" });
		expect(await removeTokens("checkout-1", deps)).toEqual({ ok: false, code: "failed", message: "nope" });
	});
});
