import { describe, expect, it } from "vitest";
import {
	formatCents,
	formatDueDate,
	paymentFailedEmail,
	paymentReceivedEmail,
	planCompleteEmail,
	planDefaultedEmail,
	planStartedEmail,
	reminderEmail,
	staffAlert,
} from "./messages";
import { buildInstallmentPlan } from "./plan";
import { applyChargeSuccess, createRecord } from "./record";

const record = createRecord({
	plan: buildInstallmentPlan(100)!,
	currency: "CAD",
	depositTransactionId: "60001",
	saleorTransactionId: "txn",
	card: { customerProfileId: "9001", paymentProfileId: "8001" },
	orderedAt: new Date("2026-10-06T15:00:00Z"),
	now: new Date("2026-10-06T15:00:00Z"),
});
const ctx = { orderNumber: "1042", record };
const first = record.payments[0];

describe("formatting", () => {
	it("formats cents as currency and a date as a plain calendar date", () => {
		expect(formatCents(2500, "CAD")).toContain("25.00");
		expect(formatCents(1999, "USD")).toContain("19.99");
		expect(formatDueDate("2026-10-20")).toBe("October 20, 2026");
		expect(formatDueDate("2026-01-01")).toBe("January 1, 2026");
	});
});

describe("planStartedEmail", () => {
	const email = planStartedEmail(ctx);

	it("lays out all four payments with their dates, and says the first is paid", () => {
		expect(email.subject).toContain("#1042");
		expect(email.text).toContain("Today: ");
		expect(email.text).toContain("(paid)");
		for (const payment of record.payments) expect(email.text).toContain(formatDueDate(payment.dueOn));
		expect(email.text.match(/25\.00/g)).toHaveLength(4);
	});

	it("tells the shopper the terms: no fees, the card will be charged, shipping waits for the last payment", () => {
		expect(email.text).toMatch(/no interest or fees/);
		expect(email.text).toMatch(/charge the card you used/);
		expect(email.text).toMatch(/ship once the last payment/);
	});
});

describe("reminderEmail", () => {
	it("names the amount, the date and which payment of four it is", () => {
		const email = reminderEmail(ctx, first);
		expect(email.subject).toContain("25.00");
		expect(email.subject).toContain("October 20, 2026");
		expect(email.text).toContain("Payment 2 of 4");
		expect(email.text).toMatch(/reply to this email/);
	});
});

describe("paymentReceivedEmail", () => {
	it("says what is left and when the next payment is", () => {
		const after = applyChargeSuccess(record, 1, "70001");
		const email = paymentReceivedEmail({ orderNumber: "1042", record: after }, after.payments[0]);
		expect(email.text).toContain("payment 2 of 4");
		expect(email.text).toContain("Remaining: ");
		expect(email.text).toContain("50.00");
		expect(email.text).toContain("November 3, 2026");
	});
});

describe("planCompleteEmail", () => {
	it("says the order is paid in full and the saved card is deleted", () => {
		let done = record;
		for (const number of [1, 2, 3]) done = applyChargeSuccess(done, number, `7000${number}`);
		const email = planCompleteEmail({ orderNumber: "1042", record: done }, done.payments[2]);
		expect(email.subject).toMatch(/Paid in full/);
		expect(email.text).toMatch(/paid in full and will ship/);
		expect(email.text).toMatch(/deleted the card details/);
	});
});

describe("failure emails", () => {
	it("tells the shopper a payment was declined, when we'll retry, and that the order won't ship until paid", () => {
		const email = paymentFailedEmail(ctx, first, "2026-10-23");
		expect(email.text).toContain("declined");
		expect(email.text).toContain("October 23, 2026");
		expect(email.text).toMatch(/won't ship until all payments are made/);
	});

	it("asks the shopper to get in touch once charging has stopped", () => {
		const email = planDefaultedEmail(ctx, first);
		expect(email.subject).toMatch(/Action needed/);
		expect(email.text).toMatch(/stopped charging your card/);
		expect(email.text).toMatch(/hasn't shipped/);
	});
});

describe("staffAlert", () => {
	it("names the order and the problem, and says where to look", () => {
		const alert = staffAlert("needs-review", "1042", "Payment 2 started but its outcome was never recorded.");
		expect(alert.subject).toBe("[Pay in 4] A pay-in-4 payment needs checking (order #1042)");
		expect(alert.text).toContain("Payment 2 started");
		expect(alert.text).toContain("docs/payments-setup.md");
	});

	it("has a distinct subject for every kind", () => {
		const kinds = [
			"defaulted",
			"needs-review",
			"setup-failed",
			"deposit-mismatch",
			"unreadable-plan",
			"report-failed",
			"save-failed",
		] as const;
		expect(new Set(kinds.map((kind) => staffAlert(kind, "1", "x").subject)).size).toBe(kinds.length);
	});
});
