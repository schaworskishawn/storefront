import type {
	ProfileChargeInput,
	StoredCardOutcome,
	TransactionOutcome,
} from "@/lib/payments-app/authorizenet";
import type { ReportEventInput, ReportEventOutcome } from "@/lib/payments-app/saleor-api";
import {
	paymentFailedEmail,
	paymentReceivedEmail,
	planCompleteEmail,
	planDefaultedEmail,
	planStartedEmail,
	reminderEmail,
	staffAlert,
	type AlertKind,
	type EmailContent,
} from "./messages";
import {
	addDays,
	buildInstallmentPlan,
	installmentTransactionId,
	isInstallmentPspReference,
	toIsoDate,
} from "./plan";
import {
	applyChargeFailure,
	applyChargeSuccess,
	createRecord,
	markAttempting,
	markReminded,
	markReported,
	paymentsDue,
	remindersDue,
	staleAttempts,
	unreportedPayments,
	withStatus,
	type InstallmentRecord,
	type ScheduledPayment,
} from "./record";
import type { OrderSnapshot, SaleorResult } from "./saleor-orders";

/**
 * The installment job. Two things happen each run: orders that paid a deposit get a plan (the saved card and the schedule),
 * and every active plan is checked for payments to take, remind about, retry or report.
 *
 * Every outside effect (Authorize.net, Saleor, email) comes in through `EngineDeps`, so each path — including the ones that
 * should almost never happen — is tested with fakes. The rule that runs through all of it: when we are not sure whether a
 * card was charged, we stop and tell a person; we never guess and charge again.
 */

export type EngineDeps = {
	now(): Date;
	card: {
		save(input: {
			transactionId: string;
			merchantCustomerId: string;
			email: string | null;
		}): Promise<StoredCardOutcome>;
		charge(input: ProfileChargeInput): Promise<TransactionOutcome>;
		remove(customerProfileId: string): Promise<{ ok: boolean; message: string }>;
	};
	orders: {
		listActive(): Promise<SaleorResult<OrderSnapshot[]>>;
		listSince(isoDate: string): Promise<SaleorResult<OrderSnapshot[]>>;
		save(orderId: string, record: InstallmentRecord): Promise<SaleorResult<true>>;
		note(orderId: string, message: string): Promise<SaleorResult<true>>;
	};
	report(input: ReportEventInput): Promise<ReportEventOutcome>;
	notify: {
		customer(to: string, email: EmailContent): Promise<void>;
		staff(email: EmailContent): Promise<void>;
	};
};

export type RunSummary = {
	setUp: number;
	setupFailed: number;
	reminded: number;
	charged: number;
	declined: number;
	completed: number;
	cancelled: number;
	needsReview: number;
	reportedLate: number;
	errors: string[];
};

export const emptySummary = (): RunSummary => ({
	setUp: 0,
	setupFailed: 0,
	reminded: 0,
	charged: 0,
	declined: 0,
	completed: 0,
	cancelled: 0,
	needsReview: 0,
	reportedLate: 0,
	errors: [],
});

/** Saleor statuses after which nothing more should be charged. */
const STOPPED_ORDER_STATUSES = new Set(["CANCELED", "EXPIRED"]);

/** How far back the job looks for installment orders that never got a plan (the order webhook normally handles them at once). */
const SETUP_LOOKBACK_DAYS = 3;

const NOTE_PREFIX = "Pay in 4: ";

async function note(deps: EngineDeps, order: OrderSnapshot, message: string): Promise<void> {
	const result = await deps.orders.note(order.id, `${NOTE_PREFIX}${message}`);
	if (!result.ok)
		console.error(`[installments] couldn't add a note to order ${order.number}: ${result.message}`);
}

async function alertStaff(
	deps: EngineDeps,
	kind: AlertKind,
	order: OrderSnapshot,
	detail: string,
): Promise<void> {
	await deps.notify.staff(staffAlert(kind, order.number, detail));
	await note(deps, order, detail);
}

async function persist(deps: EngineDeps, order: OrderSnapshot, record: InstallmentRecord): Promise<boolean> {
	const saved = await deps.orders.save(order.id, record);
	if (!saved.ok) {
		console.error(`[installments] couldn't save the plan on order ${order.number}: ${saved.message}`);
		return false;
	}
	return true;
}

const emailCustomer = async (deps: EngineDeps, order: OrderSnapshot, email: EmailContent) => {
	if (order.email) await deps.notify.customer(order.email, email);
};

export function depositTransactionOf(order: OrderSnapshot) {
	return order.transactions.find((transaction) => isInstallmentPspReference(transaction.pspReference));
}

/** "waiting": the deposit isn't on the order yet (Saleor may still be attaching it), so try again on the next run. */
export type SetupOutcome = "created" | "exists" | "not-installment" | "stopped" | "waiting" | "failed";

/**
 * Gives an order that paid an installment deposit its plan: saves the card used for the deposit and records the schedule.
 * Safe to run twice for the same order — it won't create a second plan, and the card is looked up rather than saved again.
 */
export async function setUpPlan(order: OrderSnapshot, deps: EngineDeps): Promise<SetupOutcome> {
	if (order.record) return "exists";

	const deposit = depositTransactionOf(order);
	if (!deposit) return "not-installment";
	if (STOPPED_ORDER_STATUSES.has(order.status)) return "stopped";

	if (order.unreadablePlan) {
		// Never replace a damaged plan with a fresh one: the shopper might be charged twice.
		await alertStaff(
			deps,
			"unreadable-plan",
			order,
			"The plan stored on this order can't be read, so nothing will be charged until someone looks at it.",
		);
		return "failed";
	}

	const plan = buildInstallmentPlan(order.totalCents / 100);
	if (!plan) {
		await alertStaff(deps, "setup-failed", order, "The order total can't be split into four payments.");
		return "failed";
	}
	if (deposit.chargedCents === 0) return "waiting";
	if (Math.abs(deposit.chargedCents - plan.depositCents) > 1) {
		await alertStaff(
			deps,
			"deposit-mismatch",
			order,
			`The deposit charged was ${deposit.chargedCents / 100} but a quarter of this order's total is ${plan.deposit}. The order total probably changed after the deposit was taken, so no plan was created. Settle the difference with the customer.`,
		);
		return "failed";
	}

	const depositTransactionId = installmentTransactionId(deposit.pspReference);
	if (!depositTransactionId) return "not-installment";

	const stored = await deps.card.save({
		transactionId: depositTransactionId,
		merchantCustomerId: `WV${order.number}`,
		email: order.email,
	});
	if (!stored.ok) {
		await alertStaff(
			deps,
			"setup-failed",
			order,
			`The card used for the deposit couldn't be saved for the later payments (${stored.message}). The job will try again on its next run; if it keeps failing, collect the remaining payments another way.`,
		);
		return "failed";
	}

	const record = createRecord({
		plan,
		currency: order.currency,
		depositTransactionId,
		saleorTransactionId: deposit.id,
		card: stored.card,
		orderedAt: new Date(order.createdAt),
		now: deps.now(),
	});
	if (!(await persist(deps, order, record))) return "failed";

	await emailCustomer(deps, order, planStartedEmail({ orderNumber: order.number, record }));
	await note(
		deps,
		order,
		`plan started. Deposit paid; ${record.payments.length} more payments due ${record.payments.map((p) => p.dueOn).join(", ")}. The order is paid in full after the last one.`,
	);
	return "created";
}

type Counter = Exclude<keyof RunSummary, "errors">;
const bump = (summary: RunSummary, key: Counter) => {
	summary[key] += 1;
};

/** Tells Saleor about payments it hasn't heard of yet. Returns the updated record. */
async function reportPending(
	order: OrderSnapshot,
	record: InstallmentRecord,
	deps: EngineDeps,
	summary: RunSummary,
): Promise<InstallmentRecord> {
	let current = record;
	for (const payment of unreportedPayments(record)) {
		const reported = await deps.report({
			transactionId: current.saleorTransactionId,
			type: "CHARGE_SUCCESS",
			amount: payment.amountCents / 100,
			pspReference: payment.transactionId as string,
			message: `Pay in 4: payment ${payment.number + 1} of 4`,
		});
		if (!reported.ok) {
			await alertStaff(
				deps,
				"report-failed",
				order,
				`Payment ${payment.number + 1} of 4 (Authorize.net transaction ${payment.transactionId}) was taken, but Saleor couldn't be told (${reported.message}). The job will keep trying; the order shows as unpaid until it succeeds.`,
			);
			continue;
		}
		current = markReported(current, payment.number);
		bump(summary, "reportedLate");
		if (!(await persist(deps, order, current))) break;
	}
	return current;
}

/** One run for one order with an active plan. */
export async function processOrder(
	order: OrderSnapshot,
	deps: EngineDeps,
	summary: RunSummary,
): Promise<void> {
	const stored = order.record;
	if (!stored) {
		if (order.unreadablePlan) {
			await alertStaff(
				deps,
				"unreadable-plan",
				order,
				"The plan stored on this order can't be read, so nothing will be charged until someone looks at it.",
			);
		}
		return;
	}
	if (stored.status !== "active") return;

	const now = deps.now();
	const today = toIsoDate(now);
	const ctx = (record: InstallmentRecord) => ({ orderNumber: order.number, record });

	// 1. Payments already taken that Saleor doesn't know about come first: until it does, the order looks unpaid.
	let record = await reportPending(order, stored, deps, summary);
	if (record.status === "complete") {
		await finish(order, record, deps, summary);
		return;
	}

	// 2. A cancelled order must never be charged again, and its saved card is deleted.
	if (STOPPED_ORDER_STATUSES.has(order.status)) {
		record = withStatus(record, "cancelled", `Order ${order.status.toLowerCase()}.`);
		await persist(deps, order, record);
		await deps.card.remove(record.card.customerProfileId);
		await note(
			deps,
			order,
			"the order was cancelled, so no more payments will be taken and the saved card was deleted.",
		);
		bump(summary, "cancelled");
		return;
	}

	// 3. A charge that started and never recorded how it ended: we can't know if the card was charged, so stop.
	const stale = staleAttempts(record, now);
	if (stale.length > 0) {
		record = withStatus(record, "needs_review", "A charge started but its outcome was never recorded.");
		await persist(deps, order, record);
		await alertStaff(
			deps,
			"needs-review",
			order,
			`Payment ${stale[0].number + 1} of 4 started but its outcome was never recorded, so it's unknown whether the customer's card was charged. Check Authorize.net for a transaction on invoice WV${order.number}-${stale[0].number + 1}; then correct the plan on this order (Dashboard, order metadata) and set its status back to "active".`,
		);
		bump(summary, "needsReview");
		return;
	}

	// 4. Reminders, a couple of days before each payment.
	for (const payment of remindersDue(record, today)) {
		await emailCustomer(deps, order, reminderEmail(ctx(record), payment));
		record = markReminded(record, payment.number);
		bump(summary, "reminded");
	}
	if (record !== stored) await persist(deps, order, record);

	// 5. The payment that is due. One per run, even if the job was down for days, so a shopper is never charged twice at once.
	const [due] = paymentsDue(record, today);
	if (!due) return;
	await attempt(order, record, due, deps, summary, today);
}

async function attempt(
	order: OrderSnapshot,
	before: InstallmentRecord,
	due: ScheduledPayment,
	deps: EngineDeps,
	summary: RunSummary,
	today: string,
): Promise<void> {
	// Written BEFORE the card is charged: a crash mid-charge leaves this trace instead of inviting a second charge.
	let record = markAttempting(before, due.number, deps.now());
	if (!(await persist(deps, order, record))) return;

	const outcome = await deps.card.charge({
		card: record.card,
		amount: due.amountCents / 100,
		currency: record.currency,
		invoiceNumber: `WV${order.number}-${due.number + 1}`,
		description: `Worldwide Vapor order #${order.number}, payment ${due.number + 1} of 4`,
	});

	if (outcome.ok) {
		record = applyChargeSuccess(record, due.number, outcome.transactionId);
		if (!(await persist(deps, order, record))) {
			await alertStaff(
				deps,
				"save-failed",
				order,
				`Payment ${due.number + 1} of 4 was charged (Authorize.net transaction ${outcome.transactionId}) but couldn't be recorded on the order. The plan will be flagged for review on the next run. Don't charge it again.`,
			);
			return;
		}
		bump(summary, "charged");
		const reported = await reportPending(order, record, deps, summary);
		const paid = reported.payments.find((payment) => payment.number === due.number) ?? due;
		if (reported.status === "complete") {
			await emailCustomer(
				deps,
				order,
				planCompleteEmail({ orderNumber: order.number, record: reported }, paid),
			);
			await finish(order, reported, deps, summary);
		} else {
			await emailCustomer(
				deps,
				order,
				paymentReceivedEmail({ orderNumber: order.number, record: reported }, paid),
			);
			await note(
				deps,
				order,
				`payment ${due.number + 1} of 4 received (transaction ${outcome.transactionId}).`,
			);
		}
		return;
	}

	// A decline is a real answer and gets the retry schedule. Anything else (a network error, a fraud hold) leaves us unsure
	// whether the card was charged, and retrying days later could charge it twice, so a person decides.
	if (outcome.reason !== "declined") {
		record = withStatus(record, "needs_review", `Charge not confirmed: ${outcome.message}`);
		await persist(deps, order, record);
		await alertStaff(
			deps,
			"needs-review",
			order,
			`Payment ${due.number + 1} of 4 wasn't confirmed (${outcome.reason}: ${outcome.message}), so it's unknown whether the customer's card was charged. Check Authorize.net for invoice WV${order.number}-${due.number + 1}; then correct the plan on this order (Dashboard, order metadata) and set its status back to "active".`,
		);
		bump(summary, "needsReview");
		return;
	}

	const failure = applyChargeFailure(record, due.number, outcome.message, today);
	const failedPayment = failure.record.payments.find((payment) => payment.number === due.number) ?? due;
	await persist(deps, order, failure.record);
	bump(summary, "declined");

	// Best effort: shows the failed attempt in the Dashboard's transaction history.
	await deps.report({
		transactionId: failure.record.saleorTransactionId,
		type: "CHARGE_FAILURE",
		amount: due.amountCents / 100,
		pspReference: `inst-failed:${order.number}-${due.number}-${failedPayment.attempts}`,
		message: `Pay in 4: payment ${due.number + 1} of 4 declined (${outcome.message}).`,
	});

	if (failure.givenUp) {
		await emailCustomer(
			deps,
			order,
			planDefaultedEmail({ orderNumber: order.number, record: failure.record }, failedPayment),
		);
		await alertStaff(
			deps,
			"defaulted",
			order,
			`Payment ${due.number + 1} of 4 was declined ${failedPayment.attempts} times (${outcome.message}). Charging has stopped. The order hasn't shipped: contact the customer to finish it, or cancel it and refund what they paid.`,
		);
		return;
	}
	await emailCustomer(
		deps,
		order,
		paymentFailedEmail(
			{ orderNumber: order.number, record: failure.record },
			failedPayment,
			failure.retryOn as string,
		),
	);
	await note(
		deps,
		order,
		`payment ${due.number + 1} of 4 declined (${outcome.message}); will retry on ${failure.retryOn}.`,
	);
}

/** The last payment is in and Saleor knows: the saved card is no longer needed. */
async function finish(
	order: OrderSnapshot,
	record: InstallmentRecord,
	deps: EngineDeps,
	summary: RunSummary,
) {
	await persist(deps, order, record);
	const removed = await deps.card.remove(record.card.customerProfileId);
	if (!removed.ok)
		console.error(
			`[installments] couldn't delete the saved card for order ${order.number}: ${removed.message}`,
		);
	await note(
		deps,
		order,
		"all four payments received. The order is paid in full and the saved card was deleted.",
	);
	bump(summary, "completed");
}

/** A whole run: give new installment orders their plan, then work through every active plan. */
export async function runInstallments(deps: EngineDeps): Promise<RunSummary> {
	const summary = emptySummary();

	const since = addDays(deps.now(), -SETUP_LOOKBACK_DAYS);
	const recent = await deps.orders.listSince(since);
	if (!recent.ok) {
		summary.errors.push(`Couldn't list recent orders: ${recent.message}`);
	} else {
		for (const order of recent.value) {
			if (order.record || !depositTransactionOf(order)) continue;
			const outcome = await setUpPlan(order, deps);
			if (outcome === "created") bump(summary, "setUp");
			if (outcome === "failed") bump(summary, "setupFailed");
		}
	}

	const active = await deps.orders.listActive();
	if (!active.ok) {
		summary.errors.push(`Couldn't list active plans: ${active.message}`);
		return summary;
	}
	for (const order of active.value) {
		try {
			await processOrder(order, deps, summary);
		} catch (error) {
			// One bad order must not stop the others being charged on time.
			console.error(`[installments] order ${order.number} failed`, error);
			summary.errors.push(
				`Order ${order.number}: ${error instanceof Error ? error.message : "unexpected error"}`,
			);
		}
	}
	return summary;
}
