import { describe, expect, it } from "vitest";
import { buildInstallmentPlan } from "./plan";
import {
	MAX_ATTEMPTS,
	STALE_ATTEMPT_MS,
	applyChargeFailure,
	applyChargeSuccess,
	createRecord,
	markAttempting,
	markReminded,
	markReported,
	nextPayment,
	parseRecord,
	paymentsDue,
	remainingCents,
	remindersDue,
	serializeRecord,
	staleAttempts,
	unreportedPayments,
	withStatus,
	type InstallmentRecord,
} from "./record";

const ordered = new Date("2026-10-06T15:00:00Z");

const fresh = (): InstallmentRecord =>
	createRecord({
		plan: buildInstallmentPlan(100)!,
		currency: "cad",
		depositTransactionId: "60001",
		saleorTransactionId: "VHJhbnNhY3Rpb25JdGVtOjE=",
		card: { customerProfileId: "9001", paymentProfileId: "8001" },
		orderedAt: ordered,
		now: ordered,
	});

describe("createRecord", () => {
	it("schedules the three later payments two, four and six weeks out, all pending", () => {
		const record = fresh();
		expect(record.payments.map((p) => [p.number, p.dueOn, p.amountCents, p.status, p.attempts])).toEqual([
			[1, "2026-10-20", 2500, "pending", 0],
			[2, "2026-11-03", 2500, "pending", 0],
			[3, "2026-11-17", 2500, "pending", 0],
		]);
		expect(record).toMatchObject({
			status: "active",
			currency: "CAD",
			totalCents: 10000,
			depositCents: 2500,
		});
	});

	it("keeps the deposit and the payments adding up to the total", () => {
		const record = createRecord({ ...{ ...baseInput() }, plan: buildInstallmentPlan(100.03)! });
		const later = record.payments.reduce((sum, p) => sum + p.amountCents, 0);
		expect(record.depositCents + later).toBe(record.totalCents);
	});
});

function baseInput() {
	return {
		plan: buildInstallmentPlan(100)!,
		currency: "CAD",
		depositTransactionId: "60001",
		saleorTransactionId: "txn",
		card: { customerProfileId: "9001", paymentProfileId: "8001" },
		orderedAt: ordered,
		now: ordered,
	};
}

describe("serializing", () => {
	it("round-trips a record", () => {
		const record = fresh();
		expect(parseRecord(serializeRecord(record))).toEqual(record);
	});

	it("refuses anything that isn't a complete record", () => {
		const good = JSON.parse(serializeRecord(fresh())) as Record<string, any>;
		const broken = (patch: Record<string, unknown>) => JSON.stringify({ ...good, ...patch });
		expect(parseRecord(null)).toBeNull();
		expect(parseRecord("")).toBeNull();
		expect(parseRecord("not json")).toBeNull();
		expect(parseRecord("[]")).toBeNull();
		expect(parseRecord(broken({ version: 2 }))).toBeNull();
		expect(parseRecord(broken({ status: "weird" }))).toBeNull();
		expect(parseRecord(broken({ card: { customerProfileId: "9001" } }))).toBeNull();
		expect(parseRecord(broken({ totalCents: 10.5 }))).toBeNull();
		expect(parseRecord(broken({ payments: [] }))).toBeNull();
		expect(
			parseRecord(
				broken({
					payments: [{ number: 1, dueOn: "2026-10-20", amountCents: 2500, status: "nope", attempts: 0 }],
				}),
			),
		).toBeNull();
	});
});

describe("paymentsDue", () => {
	it("has nothing due before the first due date, and the payment on and after it", () => {
		const record = fresh();
		expect(paymentsDue(record, "2026-10-19")).toEqual([]);
		expect(paymentsDue(record, "2026-10-20").map((p) => p.number)).toEqual([1]);
		expect(paymentsDue(record, "2026-10-25").map((p) => p.number)).toEqual([1]);
	});

	it("lists every payment that has come due when the job missed some days", () => {
		expect(paymentsDue(fresh(), "2026-11-04").map((p) => p.number)).toEqual([1, 2]);
	});

	it("waits for the retry date after a failure", () => {
		const failed = applyChargeFailure(fresh(), 1, "declined", "2026-10-20").record;
		expect(paymentsDue(failed, "2026-10-22")).toEqual([]);
		expect(paymentsDue(failed, "2026-10-23").map((p) => p.number)).toEqual([1]);
	});

	it("never retries a charge that started and has no recorded outcome", () => {
		const attempting = markAttempting(fresh(), 1, ordered);
		expect(paymentsDue(attempting, "2026-12-01").map((p) => p.number)).toEqual([2, 3]);
	});

	it("skips paid payments and plans that are not active", () => {
		const paid = applyChargeSuccess(fresh(), 1, "60002");
		expect(paymentsDue(paid, "2026-10-20")).toEqual([]);
		for (const status of ["complete", "defaulted", "cancelled", "needs_review"] as const) {
			expect(paymentsDue(withStatus(fresh(), status), "2026-12-01")).toEqual([]);
		}
	});
});

describe("remindersDue", () => {
	it("reminds from two days before a payment is due", () => {
		const record = fresh();
		expect(remindersDue(record, "2026-10-17")).toEqual([]);
		expect(remindersDue(record, "2026-10-18").map((p) => p.number)).toEqual([1]);
		expect(remindersDue(record, "2026-10-19").map((p) => p.number)).toEqual([1]);
	});

	it("doesn't remind on the due date itself, twice, or for a paid payment", () => {
		const record = fresh();
		expect(remindersDue(record, "2026-10-20")).toEqual([]);
		expect(remindersDue(markReminded(record, 1), "2026-10-18")).toEqual([]);
		expect(remindersDue(applyChargeSuccess(record, 1, "1"), "2026-10-18")).toEqual([]);
	});

	it("stays quiet once the plan is not active", () => {
		expect(remindersDue(withStatus(fresh(), "defaulted"), "2026-10-18")).toEqual([]);
	});
});

describe("applyChargeSuccess", () => {
	it("marks the payment paid and keeps the plan active while others remain", () => {
		const next = applyChargeSuccess(fresh(), 1, "60002");
		expect(next.payments[0]).toMatchObject({
			status: "paid",
			attempts: 1,
			transactionId: "60002",
			reported: false,
		});
		expect(next.status).toBe("active");
	});

	it("keeps the plan active until Saleor has been told about every payment, so none is left unreported", () => {
		let record = fresh();
		for (const number of [1, 2, 3]) record = applyChargeSuccess(record, number, `6000${number + 1}`);
		expect(record.status).toBe("active");
		expect(remainingCents(record)).toBe(0);
		expect(nextPayment(record)).toBeNull();
		expect(unreportedPayments(record)).toHaveLength(3);

		for (const number of [1, 2]) record = markReported(record, number);
		expect(record.status).toBe("active");
		record = markReported(record, 3);
		expect(record.status).toBe("complete");
	});

	it("clears an earlier failure's retry date and message", () => {
		const failed = applyChargeFailure(fresh(), 1, "declined", "2026-10-20").record;
		const paid = applyChargeSuccess(failed, 1, "60002").payments[0];
		expect(paid.retryOn).toBeUndefined();
		expect(paid.lastError).toBeUndefined();
		expect(paid.attempts).toBe(2);
	});
});

describe("applyChargeFailure", () => {
	it("retries after 3 days, then 7 days, then gives up", () => {
		const first = applyChargeFailure(fresh(), 1, "declined", "2026-10-20");
		expect(first).toMatchObject({ givenUp: false, retryOn: "2026-10-23" });
		expect(first.record.payments[0]).toMatchObject({ status: "failed", attempts: 1, lastError: "declined" });

		const second = applyChargeFailure(first.record, 1, "declined", "2026-10-23");
		expect(second).toMatchObject({ givenUp: false, retryOn: "2026-10-30" });

		const third = applyChargeFailure(second.record, 1, "declined again", "2026-10-30");
		expect(third.givenUp).toBe(true);
		expect(third.retryOn).toBeNull();
		expect(third.record.status).toBe("defaulted");
		expect(third.record.payments[0]).toMatchObject({
			status: "abandoned",
			attempts: MAX_ATTEMPTS,
			lastError: "declined again",
		});
	});

	it("leaves the other payments alone, and a defaulted plan charges nothing more", () => {
		const given = applyChargeFailure(
			applyChargeFailure(applyChargeFailure(fresh(), 1, "x", "2026-10-20").record, 1, "x", "2026-10-23")
				.record,
			1,
			"x",
			"2026-10-30",
		).record;
		expect(given.payments.slice(1).every((p) => p.status === "pending")).toBe(true);
		expect(paymentsDue(given, "2026-12-31")).toEqual([]);
	});
});

describe("attempts with no recorded outcome", () => {
	it("are stale only after the grace period", () => {
		const record = markAttempting(fresh(), 1, ordered);
		expect(staleAttempts(record, new Date(ordered.getTime() + STALE_ATTEMPT_MS - 1))).toEqual([]);
		expect(
			staleAttempts(record, new Date(ordered.getTime() + STALE_ATTEMPT_MS + 1)).map((p) => p.number),
		).toEqual([1]);
	});

	it("count as stale when there is no start time at all", () => {
		const record = fresh();
		record.payments[0] = { ...record.payments[0], status: "attempting" };
		expect(staleAttempts(record, ordered).map((p) => p.number)).toEqual([1]);
	});
});

describe("reporting to Saleor", () => {
	it("lists paid payments Saleor hasn't been told about, until they are marked reported", () => {
		const paid = applyChargeSuccess(fresh(), 1, "60002");
		expect(unreportedPayments(paid).map((p) => p.number)).toEqual([1]);
		expect(unreportedPayments(markReported(paid, 1))).toEqual([]);
	});

	it("never lists unpaid payments", () => {
		expect(unreportedPayments(fresh())).toEqual([]);
	});
});

describe("what's left", () => {
	it("counts the unpaid payments and points at the next one", () => {
		const record = applyChargeSuccess(fresh(), 1, "60002");
		expect(remainingCents(record)).toBe(5000);
		expect(nextPayment(record)?.number).toBe(2);
	});
});

describe("a whole plan, start to finish", () => {
	it("is paid in four, the last payment completes it", () => {
		let record = fresh();
		const days = ["2026-10-20", "2026-11-03", "2026-11-17"];
		days.forEach((today, index) => {
			const due = paymentsDue(record, today);
			expect(due.map((p) => p.number)).toEqual([index + 1]);
			record = markAttempting(record, due[0].number, new Date(`${today}T14:00:00Z`));
			record = applyChargeSuccess(record, due[0].number, `7000${index}`);
			record = markReported(record, due[0].number);
		});
		expect(record.status).toBe("complete");
		expect(record.payments.map((p) => p.transactionId)).toEqual(["70000", "70001", "70002"]);
		expect(unreportedPayments(record)).toEqual([]);
	});
});
