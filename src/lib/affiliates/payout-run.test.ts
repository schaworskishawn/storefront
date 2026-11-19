import { describe, expect, it, vi } from "vitest";
import type { WeeklyReview } from "./ai-review";
import type { AffiliateAccount } from "./engine";
import { computeLedger, type LedgerOrder } from "./ledger";
import type { DigestLine } from "./messages";
import { payInTokens, runAffiliatePayouts, tokensFor, type PayoutRunDeps } from "./payout-run";
import type { AffiliateRecord, OrderStamp, Payout } from "./records";
import type { AffiliateSignals } from "./signals";

// Wednesday 18 November 2026: the monthly payout date (1 November) has passed since approval, so what's owed is due.
const NOW = new Date("2026-11-18T15:00:00.000Z");
const TRON = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";

const record = (over: Partial<AffiliateRecord> = {}): AffiliateRecord => ({
	status: "approved",
	code: "neo",
	vouchers: [],
	application: null,
	appliedAt: "2026-09-01T00:00:00.000Z",
	approvedAt: "2026-09-02T00:00:00.000Z",
	payouts: [],
	payoutMethod: { kind: "tokens" },
	autoHold: null,
	aiReview: null,
	aiFlag: null,
	...over,
});

const account = (over: Partial<AffiliateRecord> = {}, userId = "u-neo"): AffiliateAccount => ({
	userId,
	email: `${userId}@example.com`,
	name: userId,
	record: record({ code: userId.replace("u-", ""), ...over }),
});

/** One October order per currency: a $1,000 sale earns $100 (Cloud, 10%); $3,000 earns $360 (Vapor, 12%). */
const sale = (n: number, baseCents: number, currency = "USD"): LedgerOrder => {
	const stamp: OrderStamp = {
		code: "neo",
		affiliateId: "u-neo",
		via: "link",
		baseCents,
		currency,
		paidAt: "2026-10-10T12:00:00.000Z",
		state: "earned",
	};
	return { orderId: `o${n}`, number: String(n), stamp };
};

type Fakes = {
	accounts?: AffiliateAccount[];
	orders?: LedgerOrder[];
	existingLots?: Record<string, string>;
	over?: Partial<PayoutRunDeps>;
};

function setup({
	accounts = [account()],
	orders = [sale(1, 100_000)],
	existingLots = {},
	over = {},
}: Fakes = {}) {
	const saved = new Map<string, AffiliateRecord>();
	const owner: DigestLine[][] = [];
	const created: Array<{ tokens: number; key: string; currency: string; userId: string }> = [];
	let n = 0;
	const deps: PayoutRunDeps = {
		now: () => NOW,
		newId: () => `id-${++n}`,
		autoPayoutsOn: true,
		tokensOn: true,
		tokenValueCents: 5,
		accounts: {
			list: async () => ({ ok: true, value: accounts }),
			save: async (userId, r) => {
				saved.set(userId, r);
				return { ok: true, value: undefined };
			},
		},
		ledger: async (a) => ({ ok: true, value: computeLedger(orders, a.record.payouts, NOW) }),
		tokens: {
			find: async (key) => ({ ok: true, value: existingLots[key] ? [{ id: existingLots[key]! }] : [] }),
			create: vi.fn(async (lot) => {
				created.push(lot);
				return { ok: true as const, value: { id: `lot-${created.length}`, code: "CODE" } };
			}),
			storeCode: vi.fn(async () => ({ ok: true as const, value: null })),
		},
		crypto: null,
		ai: null,
		notify: {
			tokensPaid: vi.fn(async () => {}),
			cryptoSent: vi.fn(async () => {}),
			owner: vi.fn(async (lines: readonly DigestLine[]) => {
				owner.push([...lines]);
			}),
			weekly: vi.fn(async () => {}),
		},
		...over,
	};
	return { deps, saved, owner, created };
}

describe("tokensFor", () => {
	it("adds the 25% bonus and covers whole tokens only, leaving the odd cents owed", () => {
		expect(tokensFor(10_000, 5)).toEqual({ tokens: 2_500, coveredCents: 10_000 });
		expect(tokensFor(10_003, 5)).toEqual({ tokens: 2_500, coveredCents: 10_000 });
		expect(tokensFor(3, 5)).toEqual({ tokens: 0, coveredCents: 0 });
	});
});

describe("runAffiliatePayouts: Vapor Tokens", () => {
	it("pays what's due as a never-expiring token lot keyed to the payout date, records it and tells the affiliate", async () => {
		const { deps, saved, owner, created } = setup();
		const summary = await runAffiliatePayouts(deps, { weekly: false });

		expect(summary.paidTokens).toBe(1);
		expect(created).toEqual([
			expect.objectContaining({
				tokens: 2_500,
				currency: "USD",
				userId: "u-neo",
				key: "affiliate-payout:u-neo:2026-11-01:USD",
			}),
		]);
		const payouts = saved.get("u-neo")!.payouts;
		expect(payouts).toEqual([
			expect.objectContaining({
				kind: "tokens",
				amounts: { USD: 10_000 },
				tokens: 2_500,
				bonusBps: 2_500,
				lotIds: ["lot-1"],
			}),
		]);
		expect(deps.notify.tokensPaid).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-neo" }), {
			tokens: 2_500,
			currency: "USD",
			coveredCents: 10_000,
		});
		expect(owner).toEqual([]); // Nothing needed the owner.
	});

	it("doesn't pay again once the payout is recorded (the schedule restarts from it)", async () => {
		const paid: Payout = {
			id: "p1",
			at: "2026-11-02T15:00:00.000Z",
			amounts: { USD: 10_000 },
			method: "tokens",
			kind: "tokens",
			lotIds: ["lot-9"],
		};
		const { deps, created } = setup({ accounts: [account({ payouts: [paid] })] });
		const summary = await runAffiliatePayouts(deps, { weekly: false });
		expect(summary.paidTokens).toBe(0);
		expect(created).toEqual([]);
	});

	it("reuses the lot an interrupted run already made instead of making a second one", async () => {
		const { deps, saved, created } = setup({
			existingLots: { "affiliate-payout:u-neo:2026-11-01:USD": "lot-old" },
		});
		await runAffiliatePayouts(deps, { weekly: false });
		expect(created).toEqual([]);
		expect(saved.get("u-neo")!.payouts[0]!.lotIds).toEqual(["lot-old"]);
	});

	it("never records a lot that's already on a payout (a double click)", async () => {
		const a = account({
			payouts: [
				{
					id: "p1",
					at: "2026-10-01T00:00:00.000Z",
					amounts: { USD: 1 },
					method: "tokens",
					lotIds: ["lot-old"],
				},
			],
		});
		const { deps } = setup();
		const result = await payInTokens(a, "USD", 10_000, "manual", {
			...deps,
			tokens: { ...deps.tokens, find: async () => ({ ok: true, value: [{ id: "lot-old" }] }) },
		});
		expect(result).toEqual({ ok: true, value: null });
	});

	it.each([
		["over the $250 limit", { orders: [sale(1, 300_000)] }, /over the \$250\.00 automatic limit/],
		[
			"held by an AI flag or the owner",
			{ accounts: [account({ autoHold: { reason: "AI flag: odd", at: NOW.toISOString() } })] },
			/payouts are held/,
		],
		["switched off", { over: { autoPayoutsOn: false } }, /automatic payouts are switched off/],
		["Vapor Tokens off", { over: { tokensOn: false } }, /Vapor Tokens are switched off/],
	] as const)("holds the payout for the owner when %s", async (_name, fakes, reason) => {
		const { deps, saved, owner, created } = setup(fakes as Fakes);
		const summary = await runAffiliatePayouts(deps, { weekly: false });
		expect(summary.paidTokens).toBe(0);
		expect(created).toEqual([]);
		expect(saved.size).toBe(0);
		expect(owner[0]).toEqual([{ section: "held", text: expect.stringMatching(reason) }]);
	});

	it("holds every currency when one is over the limit, so the held one stays due", async () => {
		const { deps, created, owner } = setup({ orders: [sale(1, 100_000, "USD"), sale(2, 300_000, "CAD")] });
		await runAffiliatePayouts(deps, { weekly: false });
		expect(created).toEqual([]);
		// $4,000 across both currencies puts the month on Vapor (12%): $120 USD is under the limit, $360 CAD isn't.
		expect(owner[0]).toEqual([
			{
				section: "held",
				text: expect.stringContaining("$120.00 USD + $360.00 CAD in tokens, over the $250.00"),
			},
		]);
	});

	it("pays nothing with pay: false", async () => {
		const { deps, created } = setup();
		const summary = await runAffiliatePayouts(deps, { weekly: false, pay: false });
		expect(summary.paidTokens).toBe(0);
		expect(created).toEqual([]);
	});
});

describe("runAffiliatePayouts: crypto and e-Transfer", () => {
	const crypto = (
		over: Partial<NonNullable<PayoutRunDeps["crypto"]>> = {},
	): NonNullable<PayoutRunDeps["crypto"]> => ({
		autoVerify: false,
		send: vi.fn(async () => ({
			ok: true as const,
			value: { batchId: "b1", payoutIds: ["w1"], amounts: [99.9], verified: true },
		})),
		state: vi.fn(async () => ({ ok: true as const, value: "pending" as const })),
		...over,
	});
	const wallet = (setAt: string) => ({
		kind: "crypto" as const,
		currency: "usdttrc20" as const,
		address: TRON,
		setAt,
	});

	it("lists a new wallet for whitelisting and doesn't pay it during the 72-hour cooling-off", async () => {
		const c = crypto({ autoVerify: true });
		const { deps, owner } = setup({
			accounts: [account({ payoutMethod: wallet("2026-11-17T15:00:00.000Z") })],
			over: { crypto: c },
		});
		await runAffiliatePayouts(deps, { weekly: false });
		expect(c.send).not.toHaveBeenCalled();
		expect(owner[0]).toEqual([
			{ section: "wallets", text: expect.stringContaining("it can be paid from 2026-11-20") },
		]);
	});

	it("lists a ready crypto payout for the owner's 2FA code when the job can't verify batches", async () => {
		const c = crypto();
		const { deps, owner } = setup({
			accounts: [account({ payoutMethod: wallet("2026-10-01T00:00:00.000Z") })],
			over: { crypto: c },
		});
		await runAffiliatePayouts(deps, { weekly: false });
		expect(c.send).not.toHaveBeenCalled();
		expect(owner[0]).toEqual([
			{ section: "cash", text: expect.stringContaining("$100.00 USD to USDT (TRON)") },
		]);
	});

	it("sends and records a crypto payout itself when allowed, as processing until NOWPayments finishes it", async () => {
		const c = crypto({ autoVerify: true });
		const { deps, saved, owner } = setup({
			accounts: [account({ payoutMethod: wallet("2026-10-01T00:00:00.000Z") })],
			over: { crypto: c },
		});
		const summary = await runAffiliatePayouts(deps, { weekly: false });
		expect(summary.sentCrypto).toBe(1);
		expect(c.send).toHaveBeenCalledWith([
			expect.objectContaining({ cents: 10_000, currency: "USD", coin: "usdttrc20", address: TRON }),
		]);
		expect(saved.get("u-neo")!.payouts).toEqual([
			expect.objectContaining({
				kind: "crypto",
				batchId: "b1",
				payoutIds: ["w1"],
				status: "processing",
				coinAmount: 99.9,
				verifiedAt: NOW.toISOString(),
			}),
		]);
		expect(deps.notify.cryptoSent).toHaveBeenCalled();
		expect(owner).toEqual([]);
	});

	it("saves the payout as sending before any coins go out, and sends nothing if that save fails", async () => {
		const c = crypto({ autoVerify: true });
		const { deps, owner } = setup({
			accounts: [account({ payoutMethod: wallet("2026-10-01T00:00:00.000Z") })],
			over: { crypto: c },
		});
		const saves: AffiliateRecord[] = [];
		deps.accounts.save = async (_userId, r) => {
			saves.push(r);
			return { ok: false, message: "throttled" };
		};
		await runAffiliatePayouts(deps, { weekly: false });
		expect(saves[0]!.payouts).toEqual([
			expect.objectContaining({ kind: "crypto", batchId: "sending", status: "processing" }),
		]);
		expect(c.send).not.toHaveBeenCalled();
		expect(owner[0]!.map((l) => l.section)).toContain("problems");
	});

	it("records a batch it couldn't verify, so the status check settles it, and tells the owner", async () => {
		const c = crypto({
			autoVerify: true,
			send: vi.fn(async () => ({
				ok: true as const,
				value: {
					batchId: "b2",
					payoutIds: ["w2"],
					amounts: [99.9],
					verified: false,
					problem: "Batch b2 not verified",
				},
			})),
		});
		const { deps, saved, owner } = setup({
			accounts: [account({ payoutMethod: wallet("2026-10-01T00:00:00.000Z") })],
			over: { crypto: c },
		});
		const summary = await runAffiliatePayouts(deps, { weekly: false });
		expect(summary.sentCrypto).toBe(0);
		const [payout] = saved.get("u-neo")!.payouts;
		expect(payout).toEqual(
			expect.objectContaining({ batchId: "b2", payoutIds: ["w2"], status: "processing" }),
		);
		expect(payout!.verifiedAt).toBeUndefined();
		expect(deps.notify.cryptoSent).not.toHaveBeenCalled();
		expect(owner[0]).toEqual([{ section: "problems", text: "Batch b2 not verified" }]);
	});

	it("drops the sending payout when NOWPayments refused before making a batch", async () => {
		const c = crypto({
			autoVerify: true,
			send: vi.fn(async () => ({ ok: false as const, message: "IP not whitelisted" })),
		});
		const { deps, saved } = setup({
			accounts: [account({ payoutMethod: wallet("2026-10-01T00:00:00.000Z") })],
			over: { crypto: c },
		});
		await runAffiliatePayouts(deps, { weekly: false });
		expect(saved.get("u-neo")!.payouts).toEqual([]);
	});

	it("marks a rejected crypto payout failed, so it's owed again, and tells the owner", async () => {
		const sent: Payout = {
			id: "p1",
			at: "2026-11-02T15:00:00.000Z",
			amounts: { USD: 10_000 },
			method: "USDT (TRON): 99.9 to TQn9Y2…LSE",
			kind: "crypto",
			batchId: "b0",
			payoutIds: ["w0"],
			status: "processing",
		};
		const c = crypto({ state: vi.fn(async () => ({ ok: true as const, value: "failed" as const })) });
		const { deps, saved, owner } = setup({
			accounts: [account({ payoutMethod: wallet("2026-10-01T00:00:00.000Z"), payouts: [sent] })],
			over: { crypto: c },
		});
		await runAffiliatePayouts(deps, { weekly: false });
		expect(saved.get("u-neo")!.payouts[0]!.status).toBe("failed");
		// Owed again, and due again (a failed payout doesn't restart the schedule).
		expect(owner[0]!.map((l) => l.section)).toEqual(["failed", "cash"]);
	});

	it("always lists e-Transfer payouts for the owner", async () => {
		const { deps, owner } = setup({
			accounts: [account({ payoutMethod: { kind: "etransfer", email: "neo@bank.example" } })],
		});
		await runAffiliatePayouts(deps, { weekly: false });
		expect(owner[0]).toEqual([
			{ section: "cash", text: expect.stringContaining("Interac e-Transfer to neo@bank.example") },
		]);
	});
});

describe("runAffiliatePayouts: the weekly AI review", () => {
	const signals = (code: string) => ({ code }) as AffiliateSignals;
	const ai = (review: WeeklyReview) => ({
		signals: vi.fn(async (a: AffiliateAccount) => ({ ok: true as const, value: signals(a.record.code!) })),
		weekly: vi.fn(async () => ({ ok: true as const, value: review })),
	});

	it("holds an affiliate's automatic payouts on a high flag, before paying them", async () => {
		const review: WeeklyReview = {
			summary: "One problem.",
			flags: [
				{
					code: "neo",
					severity: "high",
					reason: "9 of 10 orders from one postcode",
					suggestedAction: "Check",
					at: NOW.toISOString(),
				},
			],
		};
		const a = ai(review);
		const { deps, saved, created } = setup({ over: { ai: a } });
		await runAffiliatePayouts(deps, { weekly: true });
		expect(created).toEqual([]); // Monday's payout waits for the owner too.
		const r = saved.get("u-neo")!;
		expect(r.aiFlag).toEqual({
			severity: "high",
			reason: "9 of 10 orders from one postcode",
			at: NOW.toISOString(),
		});
		expect(r.autoHold?.reason).toMatch(/^AI flag: 9 of 10/);
		expect(deps.notify.weekly).toHaveBeenCalledWith(review, ["neo"]);
	});

	it("notes a low flag without holding anyone", async () => {
		const a = ai({
			summary: "Fine.",
			flags: [
				{
					code: "neo",
					severity: "low",
					reason: "A jump in sales",
					suggestedAction: "None",
					at: NOW.toISOString(),
				},
			],
		});
		const { deps, saved } = setup({ over: { ai: a } });
		await runAffiliatePayouts(deps, { weekly: true, pay: false });
		expect(saved.get("u-neo")!.autoHold).toBeNull();
		expect(deps.notify.weekly).toHaveBeenCalledWith(expect.anything(), []);
	});

	it("tells the owner when the review fails", async () => {
		const a = {
			signals: ai({ summary: "", flags: [] }).signals,
			weekly: vi.fn(async () => ({ ok: false as const, message: "declined" })),
		};
		const { deps, owner } = setup({ over: { ai: a } });
		const summary = await runAffiliatePayouts(deps, { weekly: true, pay: false });
		expect(summary.weekly).toBe("failed");
		expect(owner[0]).toEqual([{ section: "problems", text: expect.stringContaining("declined") }]);
	});
});
