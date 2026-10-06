import { describe, expect, it, vi } from "vitest";
import { earnForOrder, reverseForOrder, type RewardsDeps } from "./engine";
import type { LotUsage, LotWithCode, RewardsOrder } from "./saleor-rewards";
import type { RewardsConfig } from "./tokens";

const NOW = new Date("2026-10-06T15:00:00Z");
const config: RewardsConfig = { enabled: true, tokensPerDollar: 3, expiryMonths: 12 };

const order = (overrides: Partial<RewardsOrder> = {}): RewardsOrder => ({
	id: "ORDER-1",
	number: "1042",
	createdAt: "2026-10-06T14:00:00Z",
	status: "UNFULFILLED",
	email: "buyer@example.com",
	userId: "USER-1",
	channel: "cad",
	currency: "CAD",
	// A $100 order, plus $10 shipping and $13 tax, all paid in money.
	chargedCents: 12300,
	shippingCents: 1000,
	taxCents: 1300,
	subtotalCents: 10000,
	...overrides,
});

const lot = (overrides: Partial<LotWithCode> = {}): LotWithCode => ({
	id: "LOT-1",
	currency: "CAD",
	balanceCents: 300,
	initialCents: 300,
	expiryDate: "2027-10-06",
	createdAt: "2026-10-06T15:00:00Z",
	isActive: true,
	orderId: "ORDER-1",
	code: "CODE-ABC",
	...overrides,
});

function harness(cfg: RewardsConfig = config) {
	const customerEmails: Array<{ to: string; subject: string; text: string }> = [];
	const staffEmails: Array<{ subject: string; text: string }> = [];
	const notes: string[] = [];

	const deps = {
		now: () => NOW,
		config: cfg,
		orders: {
			get: vi.fn<RewardsDeps["orders"]["get"]>(async () => ({ ok: true, value: order() })),
			note: vi.fn<RewardsDeps["orders"]["note"]>(async (_id, message) => {
				notes.push(message);
				return { ok: true, value: true };
			}),
		},
		lots: {
			findByOrder: vi.fn<RewardsDeps["lots"]["findByOrder"]>(async () => ({ ok: true, value: [] })),
			create: vi.fn<RewardsDeps["lots"]["create"]>(async () => ({
				ok: true,
				value: { id: "LOT-NEW", code: "NEW-CODE" },
			})),
			storeCode: vi.fn<RewardsDeps["lots"]["storeCode"]>(async () => ({ ok: true, value: true })),
			readCode: vi.fn<RewardsDeps["lots"]["readCode"]>(async () => ({ ok: true, value: null })),
			deactivate: vi.fn<RewardsDeps["lots"]["deactivate"]>(async () => ({ ok: true, value: true })),
			adjust: vi.fn<RewardsDeps["lots"]["adjust"]>(async () => ({ ok: true, value: true })),
			usageForOrder: vi.fn<RewardsDeps["lots"]["usageForOrder"]>(async () => ({ ok: true, value: [] })),
			markRestored: vi.fn<RewardsDeps["lots"]["markRestored"]>(async () => ({ ok: true, value: true })),
		},
		notify: {
			customer: vi.fn<RewardsDeps["notify"]["customer"]>(async (to, email) => {
				customerEmails.push({ to, ...email });
			}),
			staff: vi.fn<RewardsDeps["notify"]["staff"]>(async (email) => {
				staffEmails.push(email);
			}),
		},
	} satisfies RewardsDeps;

	return { deps, customerEmails, staffEmails, notes };
}

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("earnForOrder: awarding", () => {
	it("awards 3 tokens per dollar of products paid for, not counting shipping or tax", async () => {
		const h = harness();
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("awarded");
		// $100 of products -> 300 tokens, worth CA$3.00.
		expect(h.deps.lots.create).toHaveBeenCalledWith({
			tokens: 300,
			currency: "CAD",
			expiryDate: "2027-10-06",
			userId: "USER-1",
			orderId: "ORDER-1",
			orderNumber: "1042",
		});
	});

	it("stores the lot's code, notes the order, and emails the customer what they earned and when it expires", async () => {
		const h = harness();
		await earnForOrder("ORDER-1", h.deps);

		expect(h.deps.lots.storeCode).toHaveBeenCalledWith("LOT-NEW", "NEW-CODE");
		expect(h.notes[0]).toMatch(/300 tokens awarded/);
		expect(h.customerEmails).toHaveLength(1);
		expect(h.customerEmails[0]).toMatchObject({ to: "buyer@example.com" });
		expect(h.customerEmails[0].subject).toContain("300 Vapor Tokens");
		expect(h.customerEmails[0].text).toContain("October 6, 2027");
		expect(h.staffEmails).toHaveLength(0);
	});

	it("earns nothing on the part paid with tokens, because only money paid counts", async () => {
		const h = harness();
		// $30 was covered by tokens, so only $93 was paid in money.
		h.deps.orders.get.mockResolvedValue({ ok: true, value: order({ chargedCents: 9300 }) });
		await earnForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.create.mock.calls[0][0].tokens).toBe(210);
	});

	it("gives a lot that never expires no expiry date when the program says so", async () => {
		const h = harness({ ...config, expiryMonths: 0 });
		await earnForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.create.mock.calls[0][0].expiryDate).toBeNull();
		expect(h.customerEmails[0].text).toMatch(/don't expire/);
	});

	it("uses the program's own rate", async () => {
		const h = harness({ ...config, tokensPerDollar: 5 });
		await earnForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.create.mock.calls[0][0].tokens).toBe(500);
	});

	it("still awards, and skips the email, when the order has no email address", async () => {
		const h = harness();
		h.deps.orders.get.mockResolvedValue({ ok: true, value: order({ email: null }) });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("awarded");
		expect(h.customerEmails).toHaveLength(0);
	});
});

describe("earnForOrder: when nothing is awarded", () => {
	it("does nothing, reading nothing, while the program is off", async () => {
		const h = harness({ ...config, enabled: false });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("disabled");
		expect(h.deps.orders.get).not.toHaveBeenCalled();
	});

	it("awards nothing to a guest order, a cancelled order, or an order that earns no whole token", async () => {
		const h = harness();
		h.deps.orders.get.mockResolvedValue({ ok: true, value: order({ userId: null }) });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("guest");
		h.deps.orders.get.mockResolvedValue({ ok: true, value: order({ status: "CANCELED" }) });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("stopped");
		h.deps.orders.get.mockResolvedValue({ ok: true, value: order({ chargedCents: 500 }) });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("nothing-to-earn");
		expect(h.deps.lots.create).not.toHaveBeenCalled();
	});

	it("says so when the order can't be found or read", async () => {
		const spy = quiet();
		const h = harness();
		h.deps.orders.get.mockResolvedValue({ ok: true, value: null });
		expect(await earnForOrder("gone", h.deps)).toBe("not-found");
		h.deps.orders.get.mockResolvedValue({ ok: false, message: "Saleor answered 401." });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("failed");
		expect(h.deps.lots.create).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe("earnForOrder: safe to repeat", () => {
	it("does not award a second time when the order already has its lot", async () => {
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [lot()] });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("already-awarded");
		expect(h.deps.lots.create).not.toHaveBeenCalled();
		expect(h.customerEmails).toHaveLength(0);
	});

	it("repairs an existing lot whose code was never stored, using Saleor's own code while it is unused", async () => {
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [lot({ code: null })] });
		h.deps.lots.readCode.mockResolvedValue({ ok: true, value: "NATIVE-CODE" });
		await earnForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.storeCode).toHaveBeenCalledWith("LOT-1", "NATIVE-CODE");
		expect(h.staffEmails).toHaveLength(0);
	});

	it("tells staff when a lot's code can't be repaired", async () => {
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [lot({ code: null })] });
		await earnForOrder("ORDER-1", h.deps);
		expect(h.staffEmails[0].subject).toMatch(/no stored code/);
	});

	it("keeps the oldest lot and empties and deactivates any duplicate from a repeated event", async () => {
		const h = harness();
		const original = lot({ id: "LOT-OLD", createdAt: "2026-10-06T15:00:00Z" });
		const duplicate = lot({ id: "LOT-DUP", createdAt: "2026-10-06T15:00:05Z" });
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [duplicate, original] });
		await earnForOrder("ORDER-1", h.deps);

		expect(h.deps.lots.adjust).toHaveBeenCalledWith("LOT-DUP", -300);
		expect(h.deps.lots.deactivate).toHaveBeenCalledWith("LOT-DUP");
		expect(h.deps.lots.deactivate).not.toHaveBeenCalledWith("LOT-OLD");
		expect(h.staffEmails[0].subject).toMatch(/awarded twice/);
	});

	it("doesn't award when it can't check whether the order was already awarded", async () => {
		const spy = quiet();
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: false, message: "down" });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("failed");
		expect(h.deps.lots.create).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe("earnForOrder: when Saleor misbehaves", () => {
	it("alerts staff, and reports failure, when the lot can't be created", async () => {
		const h = harness();
		h.deps.lots.create.mockResolvedValue({ ok: false, message: "No permission." });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("failed");
		expect(h.staffEmails[0].subject).toMatch(/could not be awarded/);
		expect(h.customerEmails).toHaveLength(0);
	});

	it("still counts the award, but alerts staff, when the code can't be stored", async () => {
		const h = harness();
		h.deps.lots.storeCode.mockResolvedValue({ ok: false, message: "down" });
		expect(await earnForOrder("ORDER-1", h.deps)).toBe("awarded");
		expect(h.staffEmails[0].subject).toMatch(/no stored code/);
	});

	it("alerts staff when Saleor doesn't return the new lot's code", async () => {
		const h = harness();
		h.deps.lots.create.mockResolvedValue({ ok: true, value: { id: "LOT-NEW", code: null } });
		await earnForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.storeCode).not.toHaveBeenCalled();
		expect(h.staffEmails[0].subject).toMatch(/no stored code/);
	});
});

describe("reverseForOrder", () => {
	const usage = (overrides: Partial<LotUsage> = {}): LotUsage => ({
		lotId: "LOT-OTHER",
		currency: "CAD",
		usedCents: 500,
		restored: false,
		...overrides,
	});

	it("takes back the tokens the order earned by deactivating its lot", async () => {
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [lot()] });
		const outcome = await reverseForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.deactivate).toHaveBeenCalledWith("LOT-1");
		expect(outcome).toMatchObject({ takenBack: 1, failed: false });
		expect(h.notes.at(-1)).toMatch(/taken back/);
	});

	it("leaves a lot that is already deactivated alone", async () => {
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [lot({ isActive: false })] });
		expect((await reverseForOrder("ORDER-1", h.deps)).takenBack).toBe(0);
		expect(h.deps.lots.deactivate).not.toHaveBeenCalled();
	});

	it("gives back the tokens the order spent, marks them returned, and tells the customer", async () => {
		const h = harness();
		h.deps.lots.usageForOrder.mockResolvedValue({ ok: true, value: [usage()] });
		const outcome = await reverseForOrder("ORDER-1", h.deps);

		expect(h.deps.lots.adjust).toHaveBeenCalledWith("LOT-OTHER", 500);
		expect(h.deps.lots.markRestored).toHaveBeenCalledWith("LOT-OTHER", "1042");
		expect(outcome.returnedTokens).toBe(500);
		expect(h.notes.at(-1)).toMatch(/500 tokens spent on this order were returned/);
		expect(h.customerEmails[0].subject).toMatch(/returned/);
		expect(h.customerEmails[0].text).toContain("500 Vapor Tokens");
	});

	it("never gives the same spending back twice", async () => {
		const h = harness();
		h.deps.lots.usageForOrder.mockResolvedValue({ ok: true, value: [usage({ restored: true })] });
		const outcome = await reverseForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.adjust).not.toHaveBeenCalled();
		expect(outcome.returnedTokens).toBe(0);
		expect(h.customerEmails).toHaveLength(0);
	});

	it("returns tokens to each lot they came from", async () => {
		const h = harness();
		h.deps.lots.usageForOrder.mockResolvedValue({
			ok: true,
			value: [usage({ lotId: "A", usedCents: 200 }), usage({ lotId: "B", usedCents: 300 })],
		});
		const outcome = await reverseForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.adjust).toHaveBeenCalledWith("A", 200);
		expect(h.deps.lots.adjust).toHaveBeenCalledWith("B", 300);
		expect(outcome.returnedTokens).toBe(500);
	});

	it("alerts staff, and doesn't mark it returned, when tokens can't be given back", async () => {
		const h = harness();
		h.deps.lots.usageForOrder.mockResolvedValue({ ok: true, value: [usage()] });
		h.deps.lots.adjust.mockResolvedValue({ ok: false, message: "down" });
		const outcome = await reverseForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.markRestored).not.toHaveBeenCalled();
		expect(outcome).toMatchObject({ failed: true, returnedTokens: 0 });
		expect(h.staffEmails[0].subject).toMatch(/could not be returned/);
	});

	it("alerts staff when the earned tokens can't be taken back", async () => {
		const h = harness();
		h.deps.lots.findByOrder.mockResolvedValue({ ok: true, value: [lot()] });
		h.deps.lots.deactivate.mockResolvedValue({ ok: false, message: "down" });
		const outcome = await reverseForOrder("ORDER-1", h.deps);
		expect(outcome.failed).toBe(true);
		expect(h.staffEmails[0].subject).toMatch(/could not be taken back/);
	});

	it("does nothing for a missing order, and reports a failure to read it", async () => {
		const spy = quiet();
		const h = harness();
		h.deps.orders.get.mockResolvedValue({ ok: true, value: null });
		expect(await reverseForOrder("gone", h.deps)).toEqual({ takenBack: 0, returnedTokens: 0, failed: false });
		h.deps.orders.get.mockResolvedValue({ ok: false, message: "down" });
		expect((await reverseForOrder("ORDER-1", h.deps)).failed).toBe(true);
		spy.mockRestore();
	});

	it("looks for spent tokens only on an order that belongs to a customer", async () => {
		const h = harness();
		h.deps.orders.get.mockResolvedValue({ ok: true, value: order({ userId: null }) });
		await reverseForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.usageForOrder).not.toHaveBeenCalled();
	});

	it("does the work only once when the same event arrives twice", async () => {
		const h = harness();
		let active = true;
		let restored = false;
		h.deps.lots.findByOrder.mockImplementation(async () => ({
			ok: true,
			value: [lot({ isActive: active })],
		}));
		h.deps.lots.deactivate.mockImplementation(async () => {
			active = false;
			return { ok: true, value: true };
		});
		h.deps.lots.usageForOrder.mockImplementation(async () => ({ ok: true, value: [usage({ restored })] }));
		h.deps.lots.markRestored.mockImplementation(async () => {
			restored = true;
			return { ok: true, value: true };
		});

		await reverseForOrder("ORDER-1", h.deps);
		await reverseForOrder("ORDER-1", h.deps);
		expect(h.deps.lots.deactivate).toHaveBeenCalledTimes(1);
		expect(h.deps.lots.adjust).toHaveBeenCalledTimes(1);
	});
});
