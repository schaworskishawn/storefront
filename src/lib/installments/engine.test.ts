import { describe, expect, it, vi } from "vitest";
import { emptySummary, processOrder, runInstallments, setUpPlan, type EngineDeps } from "./engine";
import { buildInstallmentPlan } from "./plan";
import {
	applyChargeSuccess,
	createRecord,
	markAttempting,
	markReported,
	withStatus,
	type InstallmentRecord,
} from "./record";
import type { OrderSnapshot } from "./saleor-orders";

const ORDERED = new Date("2026-10-06T15:00:00Z");
const card = { customerProfileId: "9001", paymentProfileId: "8001" };

const approved = {
	ok: true as const,
	transactionId: "70001",
	authCode: "A",
	accountLast4: "4242",
	accountType: "Visa",
	message: "Approved",
};
const declined = {
	ok: false as const,
	reason: "declined" as const,
	code: "2",
	message: "This transaction has been declined.",
};

const freshRecord = (): InstallmentRecord =>
	createRecord({
		plan: buildInstallmentPlan(100)!,
		currency: "CAD",
		depositTransactionId: "60001",
		saleorTransactionId: "SALEOR-TXN",
		card,
		orderedAt: ORDERED,
		now: ORDERED,
	});

function order(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
	return {
		id: "ORDER-1",
		number: "1042",
		createdAt: ORDERED.toISOString(),
		status: "UNFULFILLED",
		email: "buyer@example.com",
		channel: "cad",
		currency: "CAD",
		totalCents: 10000,
		transactions: [{ id: "SALEOR-TXN", pspReference: "inst:60001", chargedCents: 2500 }],
		record: null,
		unreadablePlan: false,
		...overrides,
	};
}

type Harness = ReturnType<typeof harness>;

function harness(opts: { at?: string } = {}) {
	let now = new Date(opts.at ?? "2026-10-06T16:00:00Z");
	const log: string[] = [];
	const saves: InstallmentRecord[] = [];
	const customerEmails: Array<{ to: string; subject: string; text: string }> = [];
	const staffEmails: Array<{ subject: string; text: string }> = [];
	const notes: string[] = [];

	const deps = {
		now: () => now,
		card: {
			save: vi.fn<EngineDeps["card"]["save"]>(async () => ({ ok: true, card })),
			charge: vi.fn<EngineDeps["card"]["charge"]>(async () => {
				log.push("charge");
				return approved;
			}),
			remove: vi.fn<EngineDeps["card"]["remove"]>(async () => ({ ok: true, message: "Deleted." })),
		},
		orders: {
			listActive: vi.fn<EngineDeps["orders"]["listActive"]>(async () => ({ ok: true, value: [] })),
			listSince: vi.fn<EngineDeps["orders"]["listSince"]>(async () => ({ ok: true, value: [] })),
			save: vi.fn<EngineDeps["orders"]["save"]>(async (_id, record) => {
				log.push(`save:${record.payments.map((p) => p.status[0]).join("")}:${record.status}`);
				saves.push(structuredClone(record));
				return { ok: true, value: true };
			}),
			note: vi.fn<EngineDeps["orders"]["note"]>(async (_id, message) => {
				notes.push(message);
				return { ok: true, value: true };
			}),
		},
		report: vi.fn<EngineDeps["report"]>(async () => ({ ok: true, alreadyProcessed: false })),
		notify: {
			customer: vi.fn<EngineDeps["notify"]["customer"]>(async (to, email) => {
				customerEmails.push({ to, ...email });
			}),
			staff: vi.fn<EngineDeps["notify"]["staff"]>(async (email) => {
				staffEmails.push(email);
			}),
		},
	} satisfies EngineDeps;

	return {
		deps,
		log,
		saves,
		customerEmails,
		staffEmails,
		notes,
		setNow: (iso: string) => {
			now = new Date(iso);
		},
		last: () => saves.at(-1),
	};
}

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("setUpPlan", () => {
	it("saves the card used for the deposit, records the schedule, and tells the shopper", async () => {
		const h = harness();
		expect(await setUpPlan(order(), h.deps)).toBe("created");

		expect(h.deps.card.save).toHaveBeenCalledWith({
			transactionId: "60001",
			merchantCustomerId: "WV1042",
			email: "buyer@example.com",
		});
		expect(h.last()).toMatchObject({
			status: "active",
			depositTransactionId: "60001",
			saleorTransactionId: "SALEOR-TXN",
			card,
		});
		expect(h.last()!.payments.map((p) => p.dueOn)).toEqual(["2026-10-20", "2026-11-03", "2026-11-17"]);
		expect(h.customerEmails).toHaveLength(1);
		expect(h.customerEmails[0]).toMatchObject({ to: "buyer@example.com" });
		expect(h.customerEmails[0].subject).toContain("payment schedule");
		expect(h.notes[0]).toMatch(/plan started/);
	});

	it("does nothing for an order that already has a plan, isn't an installment order, or is cancelled", async () => {
		const h = harness();
		expect(await setUpPlan(order({ record: freshRecord() }), h.deps)).toBe("exists");
		expect(
			await setUpPlan(
				order({ transactions: [{ id: "T", pspReference: "60001", chargedCents: 10000 }] }),
				h.deps,
			),
		).toBe("not-installment");
		expect(await setUpPlan(order({ status: "CANCELED" }), h.deps)).toBe("stopped");
		expect(h.deps.card.save).not.toHaveBeenCalled();
		expect(h.saves).toHaveLength(0);
	});

	it("waits, without raising an alarm, while the deposit hasn't been attached to the order yet", async () => {
		const h = harness();
		const result = await setUpPlan(
			order({ transactions: [{ id: "T", pspReference: "inst:60001", chargedCents: 0 }] }),
			h.deps,
		);
		expect(result).toBe("waiting");
		expect(h.deps.card.save).not.toHaveBeenCalled();
		expect(h.staffEmails).toHaveLength(0);
		expect(h.saves).toHaveLength(0);
	});

	it("refuses when the deposit doesn't match a quarter of the order, and says so", async () => {
		const h = harness();
		const result = await setUpPlan(
			order({ transactions: [{ id: "T", pspReference: "inst:60001", chargedCents: 1800 }] }),
			h.deps,
		);
		expect(result).toBe("failed");
		expect(h.deps.card.save).not.toHaveBeenCalled();
		expect(h.staffEmails[0].subject).toMatch(/deposit doesn't match/);
	});

	it("tells staff, and creates no plan, when the card can't be saved", async () => {
		const h = harness();
		h.deps.card.save.mockResolvedValueOnce({ ok: false, code: "E1", message: "No luck" });
		expect(await setUpPlan(order(), h.deps)).toBe("failed");
		expect(h.saves).toHaveLength(0);
		expect(h.staffEmails[0].text).toContain("No luck");
		expect(h.customerEmails).toHaveLength(0);
	});

	it("doesn't email the shopper a schedule that was never saved", async () => {
		const spy = quiet();
		const h = harness();
		h.deps.orders.save.mockResolvedValueOnce({ ok: false, message: "down" });
		expect(await setUpPlan(order(), h.deps)).toBe("failed");
		expect(h.customerEmails).toHaveLength(0);
		spy.mockRestore();
	});

	it("never replaces a damaged plan with a fresh one", async () => {
		const h = harness();
		expect(await setUpPlan(order({ unreadablePlan: true }), h.deps)).toBe("failed");
		expect(h.deps.card.save).not.toHaveBeenCalled();
		expect(h.saves).toHaveLength(0);
		expect(h.staffEmails[0].subject).toMatch(/damaged/);
	});
});

describe("processOrder: taking a payment", () => {
	const dueOrder = (record = freshRecord()) => order({ record });

	it("takes nothing before a payment is due", async () => {
		const h = harness({ at: "2026-10-10T14:00:00Z" });
		await processOrder(dueOrder(), h.deps, emptySummary());
		expect(h.deps.card.charge).not.toHaveBeenCalled();
		expect(h.saves).toHaveLength(0);
	});

	it("writes 'attempting' to the order BEFORE it charges the card", async () => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		await processOrder(dueOrder(), h.deps, emptySummary());
		const firstSave = h.log.findIndex((entry) => entry.startsWith("save:"));
		const charge = h.log.indexOf("charge");
		expect(firstSave).toBeGreaterThanOrEqual(0);
		expect(firstSave).toBeLessThan(charge);
		// Payment 1 'a'ttempting, payments 2 and 3 still 'p'ending.
		expect(h.log[firstSave]).toBe("save:app:active");
		expect(h.saves[0].payments[0].status).toBe("attempting");
	});

	it("charges the stored card the right amount, with a reference tied to the order and payment", async () => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		await processOrder(dueOrder(), h.deps, emptySummary());
		expect(h.deps.card.charge).toHaveBeenCalledWith({
			card,
			amount: 25,
			currency: "CAD",
			invoiceNumber: "WV1042-2",
			description: "Worldwide Vapor order #1042, payment 2 of 4",
		});
	});

	it("reports the payment to Saleor, records it as reported, and emails the shopper a receipt", async () => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		const summary = emptySummary();
		await processOrder(dueOrder(), h.deps, summary);

		expect(h.deps.report).toHaveBeenCalledWith({
			transactionId: "SALEOR-TXN",
			type: "CHARGE_SUCCESS",
			amount: 25,
			pspReference: "70001",
			message: "Pay in 4: payment 2 of 4",
		});
		expect(h.last()!.payments[0]).toMatchObject({ status: "paid", transactionId: "70001", reported: true });
		expect(h.customerEmails.at(-1)!.subject).toContain("Payment received");
		expect(summary).toMatchObject({ charged: 1, completed: 0 });
	});

	it("takes only one payment per run, even if two are overdue", async () => {
		const h = harness({ at: "2026-11-10T14:00:00Z" });
		await processOrder(dueOrder(), h.deps, emptySummary());
		expect(h.deps.card.charge).toHaveBeenCalledTimes(1);
	});

	it("never charges if it can't first record that it is about to", async () => {
		const spy = quiet();
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		h.deps.orders.save.mockResolvedValueOnce({ ok: false, message: "down" });
		await processOrder(dueOrder(), h.deps, emptySummary());
		expect(h.deps.card.charge).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("leaves plans that aren't active alone", async () => {
		const h = harness({ at: "2026-12-01T14:00:00Z" });
		for (const status of ["complete", "defaulted", "cancelled", "needs_review"] as const) {
			await processOrder(dueOrder(withStatus(freshRecord(), status)), h.deps, emptySummary());
		}
		expect(h.deps.card.charge).not.toHaveBeenCalled();
	});
});

describe("processOrder: the last payment", () => {
	it("completes the plan, deletes the saved card, and tells the shopper the order is paid", async () => {
		const h = harness({ at: "2026-11-17T14:00:00Z" });
		let record = freshRecord();
		for (const number of [1, 2])
			record = markReported(applyChargeSuccess(record, number, `600${number}`), number);
		const summary = emptySummary();
		await processOrder(order({ record }), h.deps, summary);

		expect(h.last()).toMatchObject({ status: "complete" });
		expect(h.deps.card.remove).toHaveBeenCalledWith("9001");
		expect(h.customerEmails.at(-1)!.subject).toMatch(/Paid in full/);
		expect(summary.completed).toBe(1);
	});

	it("keeps the plan active, so it is retried, when Saleor can't be told about the last payment", async () => {
		const h = harness({ at: "2026-11-17T14:00:00Z" });
		let record = freshRecord();
		for (const number of [1, 2])
			record = markReported(applyChargeSuccess(record, number, `600${number}`), number);
		h.deps.report.mockResolvedValue({ ok: false, message: "Saleor is down", retryable: true });
		await processOrder(order({ record }), h.deps, emptySummary());

		expect(h.last()).toMatchObject({ status: "active" });
		expect(h.last()!.payments[2]).toMatchObject({ status: "paid", reported: false });
		expect(h.deps.card.remove).not.toHaveBeenCalled();
		expect(h.staffEmails[0].subject).toMatch(/Saleor wasn't updated/);
	});
});

describe("processOrder: reporting payments Saleor missed", () => {
	it("reports them before doing anything else, and doesn't charge again for them", async () => {
		const h = harness({ at: "2026-10-21T14:00:00Z" });
		const record = applyChargeSuccess(freshRecord(), 1, "70001");
		const summary = emptySummary();
		await processOrder(order({ record }), h.deps, summary);

		expect(h.deps.report).toHaveBeenCalledWith(
			expect.objectContaining({ pspReference: "70001", type: "CHARGE_SUCCESS" }),
		);
		expect(h.deps.card.charge).not.toHaveBeenCalled();
		expect(summary.reportedLate).toBe(1);
		expect(h.last()!.payments[0].reported).toBe(true);
	});
});

describe("processOrder: a declined card", () => {
	const declinedRun = async (h: Harness, record: InstallmentRecord, at: string) => {
		h.setNow(at);
		h.deps.card.charge.mockResolvedValue(declined);
		const summary = emptySummary();
		await processOrder(order({ record }), h.deps, summary);
		return summary;
	};

	it("schedules a retry, tells the shopper, and records the failed attempt in Saleor", async () => {
		const h = harness();
		const summary = await declinedRun(h, freshRecord(), "2026-10-20T14:00:00Z");

		expect(h.last()!.payments[0]).toMatchObject({ status: "failed", attempts: 1, retryOn: "2026-10-23" });
		expect(h.customerEmails.at(-1)!.subject).toMatch(/couldn't take your payment/);
		expect(h.deps.report).toHaveBeenCalledWith(
			expect.objectContaining({ type: "CHARGE_FAILURE", pspReference: "inst-failed:1042-1-1" }),
		);
		expect(h.staffEmails).toHaveLength(0);
		expect(summary.declined).toBe(1);
	});

	it("retries on the date it promised, not before", async () => {
		const h = harness();
		await declinedRun(h, freshRecord(), "2026-10-20T14:00:00Z");
		const failed = h.last()!;

		const early = harness({ at: "2026-10-22T14:00:00Z" });
		await processOrder(order({ record: failed }), early.deps, emptySummary());
		expect(early.deps.card.charge).not.toHaveBeenCalled();

		const onTime = harness({ at: "2026-10-23T14:00:00Z" });
		await processOrder(order({ record: failed }), onTime.deps, emptySummary());
		expect(onTime.deps.card.charge).toHaveBeenCalledTimes(1);
	});

	it("gives up after the third decline, stops charging, and tells both the shopper and staff", async () => {
		const h = harness();
		await declinedRun(h, freshRecord(), "2026-10-20T14:00:00Z");
		await declinedRun(h, h.last()!, "2026-10-23T14:00:00Z");
		await declinedRun(h, h.last()!, "2026-10-30T14:00:00Z");

		expect(h.last()).toMatchObject({ status: "defaulted" });
		expect(h.last()!.payments[0]).toMatchObject({ status: "abandoned", attempts: 3 });
		expect(h.customerEmails.at(-1)!.subject).toMatch(/Action needed/);
		expect(h.staffEmails.at(-1)!.subject).toMatch(/failed every attempt/);

		const after = harness({ at: "2026-12-30T14:00:00Z" });
		await processOrder(order({ record: h.last()! }), after.deps, emptySummary());
		expect(after.deps.card.charge).not.toHaveBeenCalled();
	});
});

describe("processOrder: when it can't be sure a card was charged", () => {
	it.each([
		[
			"a network error",
			{
				ok: false as const,
				reason: "error" as const,
				code: null,
				message: "We couldn't reach the payment processor.",
			},
		],
		[
			"a fraud hold",
			{ ok: false as const, reason: "held" as const, code: "252", message: "Held for review" },
		],
	])("stops and calls staff after %s, and does not retry", async (_label, outcome) => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		h.deps.card.charge.mockResolvedValue(outcome);
		const summary = emptySummary();
		await processOrder(order({ record: freshRecord() }), h.deps, summary);

		expect(h.last()).toMatchObject({ status: "needs_review" });
		expect(h.staffEmails[0].subject).toMatch(/needs checking/);
		expect(h.staffEmails[0].text).toContain("WV1042-2");
		expect(h.customerEmails).toHaveLength(0);
		expect(summary.needsReview).toBe(1);

		const later = harness({ at: "2026-10-27T14:00:00Z" });
		await processOrder(order({ record: h.last()! }), later.deps, emptySummary());
		expect(later.deps.card.charge).not.toHaveBeenCalled();
	});

	it("flags a charge that started and never recorded how it ended, instead of charging again", async () => {
		const h = harness({ at: "2026-10-21T14:00:00Z" });
		const record = markAttempting(freshRecord(), 1, new Date("2026-10-20T14:00:00Z"));
		const summary = emptySummary();
		await processOrder(order({ record }), h.deps, summary);

		expect(h.deps.card.charge).not.toHaveBeenCalled();
		expect(h.last()).toMatchObject({ status: "needs_review" });
		expect(h.staffEmails[0].subject).toMatch(/needs checking/);
		expect(summary.needsReview).toBe(1);
	});

	it("tells staff when a charge went through but couldn't be recorded, and the next run then flags it", async () => {
		const spy = quiet();
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		h.deps.orders.save
			.mockResolvedValueOnce({ ok: true, value: true }) // 'attempting'
			.mockResolvedValueOnce({ ok: false, message: "down" }); // the result
		await processOrder(order({ record: freshRecord() }), h.deps, emptySummary());
		expect(h.staffEmails[0].subject).toMatch(/not recorded/);
		expect(h.deps.report).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe("processOrder: cancelled orders", () => {
	it.each(["CANCELED", "EXPIRED"])("stops a %s order's plan and deletes the saved card", async (status) => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		const summary = emptySummary();
		await processOrder(order({ status, record: freshRecord() }), h.deps, summary);

		expect(h.deps.card.charge).not.toHaveBeenCalled();
		expect(h.last()).toMatchObject({ status: "cancelled" });
		expect(h.deps.card.remove).toHaveBeenCalledWith("9001");
		expect(summary.cancelled).toBe(1);
	});
});

describe("processOrder: reminders", () => {
	it("emails the shopper two days before a payment, once", async () => {
		const h = harness({ at: "2026-10-18T14:00:00Z" });
		const summary = emptySummary();
		await processOrder(order({ record: freshRecord() }), h.deps, summary);

		expect(h.customerEmails).toHaveLength(1);
		expect(h.customerEmails[0].subject).toMatch(/Reminder/);
		expect(summary.reminded).toBe(1);
		expect(h.deps.card.charge).not.toHaveBeenCalled();

		const again = harness({ at: "2026-10-19T14:00:00Z" });
		await processOrder(order({ record: h.last()! }), again.deps, emptySummary());
		expect(again.customerEmails).toHaveLength(0);
	});

	it("skips the email, not the plan, when the order has no email address", async () => {
		const h = harness({ at: "2026-10-18T14:00:00Z" });
		await processOrder(order({ email: null, record: freshRecord() }), h.deps, emptySummary());
		expect(h.customerEmails).toHaveLength(0);
		expect(h.last()!.payments[0].reminded).toBe(true);
	});
});

describe("runInstallments", () => {
	it("gives a new installment order its plan, then works through the active ones", async () => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		const fresh = order({ number: "2001", id: "O-NEW" });
		const active = order({ number: "2002", id: "O-ACTIVE", record: freshRecord() });
		h.deps.orders.listSince.mockResolvedValue({ ok: true, value: [fresh, active] });
		h.deps.orders.listActive.mockResolvedValue({ ok: true, value: [active] });

		const summary = await runInstallments(h.deps);
		expect(summary).toMatchObject({ setUp: 1, charged: 1, errors: [] });
		expect(h.deps.card.save).toHaveBeenCalledTimes(1);
	});

	it("looks back three days for orders that missed their plan", async () => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		await runInstallments(h.deps);
		expect(h.deps.orders.listSince).toHaveBeenCalledWith("2026-10-17");
	});

	it("keeps going when one order blows up, so the others are still charged on time", async () => {
		const spy = quiet();
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		const a = order({ number: "3001", id: "A", record: freshRecord() });
		const b = order({ number: "3002", id: "B", record: freshRecord() });
		h.deps.orders.listActive.mockResolvedValue({ ok: true, value: [a, b] });
		h.deps.card.charge.mockRejectedValueOnce(new Error("kaboom"));

		const summary = await runInstallments(h.deps);
		expect(summary.errors[0]).toContain("3001");
		expect(summary.charged).toBe(1);
		spy.mockRestore();
	});

	it("records, rather than hides, a failure to list orders, and still processes the other list", async () => {
		const h = harness({ at: "2026-10-20T14:00:00Z" });
		h.deps.orders.listSince.mockResolvedValue({ ok: false, message: "Saleor answered 401." });
		h.deps.orders.listActive.mockResolvedValue({ ok: true, value: [order({ record: freshRecord() })] });
		const summary = await runInstallments(h.deps);
		expect(summary.errors[0]).toContain("recent orders");
		expect(summary.charged).toBe(1);

		const broken = harness();
		broken.deps.orders.listActive.mockResolvedValue({ ok: false, message: "Saleor answered 401." });
		expect((await runInstallments(broken.deps)).errors.join(" ")).toContain("active plans");
	});
});
