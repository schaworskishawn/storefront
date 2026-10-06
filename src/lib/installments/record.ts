import { addDays, laterPaymentDates, type InstallmentPlan } from "./plan";

/**
 * The record kept on an installment order, and the rules for how it changes. Pure: no network, no clock of its own (callers
 * pass the date), so every case — a decline, a retry, a charge whose outcome we never learned — is unit-tested.
 *
 * It lives in the order's *private* metadata (the saved card's profile ids must not be readable by shoppers); a public marker
 * with just the plan's status lets the daily job find active plans without reading every order.
 */

export const RECORD_METADATA_KEY = "paper.installments.plan";
/** Public marker: the plan's status, so `orders(filter: { metadata })` can find active plans. */
export const STATUS_METADATA_KEY = "paper.installments";

/** Every installment is tried up to this many times, then the plan is given up on and a person takes over. */
export const MAX_ATTEMPTS = 3;
/** Days to wait after the 1st and 2nd failed attempts before trying again. */
export const RETRY_AFTER_DAYS = [3, 7] as const;
/** The shopper is told about a payment this many days before it is taken. */
export const REMINDER_DAYS_BEFORE = 2;
/** An attempt that started but never recorded a result for this long is treated as "outcome unknown". */
export const STALE_ATTEMPT_MS = 60 * 60 * 1000;

export type PaymentStatus = "pending" | "attempting" | "paid" | "failed" | "abandoned";

/**
 * - active: payments are still to come
 * - complete: all four paid
 * - defaulted: an installment failed every attempt; nothing more is charged and staff decide what to do
 * - cancelled: the order was cancelled, so nothing more is charged
 * - needs_review: a charge started and we never learned how it ended; nothing more is charged until staff check
 */
export type PlanStatus = "active" | "complete" | "defaulted" | "cancelled" | "needs_review";

export type ScheduledPayment = {
	/** 1 to 3: the payments after the deposit. */
	number: number;
	dueOn: string;
	amountCents: number;
	status: PaymentStatus;
	attempts: number;
	attemptedAt?: string;
	/** After a failure: the date the next attempt is due. */
	retryOn?: string;
	/** Authorize.net's transaction id, once paid. */
	transactionId?: string;
	/** Whether Saleor has been told this payment arrived (until it has, the order isn't marked paid). */
	reported?: boolean;
	reminded?: boolean;
	lastError?: string;
};

export type StoredCardRef = { customerProfileId: string; paymentProfileId: string };

export type InstallmentRecord = {
	version: 1;
	status: PlanStatus;
	currency: string;
	totalCents: number;
	depositCents: number;
	/** Authorize.net's id of the deposit payment. */
	depositTransactionId: string;
	/** The Saleor transaction every payment is reported on. */
	saleorTransactionId: string;
	card: StoredCardRef;
	payments: ScheduledPayment[];
	createdAt: string;
	note?: string;
};

export type NewRecordInput = {
	plan: InstallmentPlan;
	currency: string;
	depositTransactionId: string;
	saleorTransactionId: string;
	card: StoredCardRef;
	/** When the order was placed: the schedule counts from this day. */
	orderedAt: Date;
	now: Date;
};

export function createRecord(input: NewRecordInput): InstallmentRecord {
	return {
		version: 1,
		status: "active",
		currency: input.currency.toUpperCase(),
		totalCents: input.plan.totalCents,
		depositCents: input.plan.depositCents,
		depositTransactionId: input.depositTransactionId,
		saleorTransactionId: input.saleorTransactionId,
		card: input.card,
		payments: laterPaymentDates(input.orderedAt).map((dueOn, index) => ({
			number: index + 1,
			dueOn,
			amountCents: input.plan.installmentCents,
			status: "pending",
			attempts: 0,
		})),
		createdAt: input.now.toISOString(),
	};
}

export function serializeRecord(record: InstallmentRecord): string {
	return JSON.stringify(record);
}

const PAYMENT_STATUSES: readonly string[] = ["pending", "attempting", "paid", "failed", "abandoned"];
const PLAN_STATUSES: readonly string[] = ["active", "complete", "defaulted", "cancelled", "needs_review"];

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isCents = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/** Reads a stored record back. Null for anything that isn't one — a bad record must never be guessed at, or money could move wrongly. */
export function parseRecord(raw: string | null | undefined): InstallmentRecord | null {
	if (!raw) return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObject(value) || value.version !== 1) return null;
	if (!PLAN_STATUSES.includes(value.status as string)) return null;
	if (!isText(value.currency) || !isCents(value.totalCents) || !isCents(value.depositCents)) return null;
	if (!isText(value.depositTransactionId) || !isText(value.saleorTransactionId) || !isText(value.createdAt))
		return null;

	const card = value.card;
	if (!isObject(card) || !isText(card.customerProfileId) || !isText(card.paymentProfileId)) return null;

	if (!Array.isArray(value.payments) || value.payments.length === 0) return null;
	for (const payment of value.payments) {
		if (!isObject(payment)) return null;
		if (!Number.isInteger(payment.number) || !isText(payment.dueOn) || !isCents(payment.amountCents))
			return null;
		if (!PAYMENT_STATUSES.includes(payment.status as string) || !isCents(payment.attempts)) return null;
	}
	return value as unknown as InstallmentRecord;
}

const replacePayment = (
	record: InstallmentRecord,
	number: number,
	change: (payment: ScheduledPayment) => ScheduledPayment,
): InstallmentRecord => ({
	...record,
	payments: record.payments.map((payment) => (payment.number === number ? change(payment) : payment)),
});

/** The payments that should be attempted on `today` (an ISO date). Never one that started and has no recorded outcome. */
export function paymentsDue(record: InstallmentRecord, today: string): ScheduledPayment[] {
	if (record.status !== "active") return [];
	return record.payments.filter((payment) => {
		if (payment.status === "pending") return payment.dueOn <= today;
		if (payment.status === "failed") {
			return payment.attempts < MAX_ATTEMPTS && (payment.retryOn ?? payment.dueOn) <= today;
		}
		return false;
	});
}

/** Payments whose reminder should go out now: due within the reminder window and not yet reminded. */
export function remindersDue(record: InstallmentRecord, today: string): ScheduledPayment[] {
	if (record.status !== "active") return [];
	const windowEnd = addDays(new Date(`${today}T00:00:00Z`), REMINDER_DAYS_BEFORE);
	return record.payments.filter(
		(payment) =>
			payment.status === "pending" &&
			!payment.reminded &&
			payment.dueOn > today &&
			payment.dueOn <= windowEnd,
	);
}

export const markReminded = (record: InstallmentRecord, number: number): InstallmentRecord =>
	replacePayment(record, number, (payment) => ({ ...payment, reminded: true }));

/** Written to the order BEFORE the card is charged, so a crash mid-charge leaves a trace instead of a silent second charge. */
export const markAttempting = (record: InstallmentRecord, number: number, now: Date): InstallmentRecord =>
	replacePayment(record, number, (payment) => ({
		...payment,
		status: "attempting",
		attemptedAt: now.toISOString(),
	}));

/**
 * A charge went through. `reported` stays false until Saleor has been told, and the plan stays active until then: it is
 * only complete once every payment is paid AND reported (see `markReported`), or a payment Saleor never heard about would
 * drop out of the daily job's list for good.
 */
export function applyChargeSuccess(
	record: InstallmentRecord,
	number: number,
	transactionId: string,
): InstallmentRecord {
	return replacePayment(record, number, (payment) => ({
		...payment,
		status: "paid",
		attempts: payment.attempts + 1,
		transactionId,
		reported: false,
		retryOn: undefined,
		lastError: undefined,
	}));
}

export type FailureResult = { record: InstallmentRecord; givenUp: boolean; retryOn: string | null };

/** A charge was declined or errored: schedule the retry, or give up after the last attempt. */
export function applyChargeFailure(
	record: InstallmentRecord,
	number: number,
	message: string,
	today: string,
): FailureResult {
	const payment = record.payments.find((candidate) => candidate.number === number);
	const attempts = (payment?.attempts ?? 0) + 1;

	if (attempts >= MAX_ATTEMPTS) {
		const next = replacePayment(record, number, (current) => ({
			...current,
			status: "abandoned",
			attempts,
			retryOn: undefined,
			lastError: message,
		}));
		return { record: { ...next, status: "defaulted" }, givenUp: true, retryOn: null };
	}

	const retryOn = addDays(
		new Date(`${today}T00:00:00Z`),
		RETRY_AFTER_DAYS[attempts - 1] ?? RETRY_AFTER_DAYS.at(-1)!,
	);
	const next = replacePayment(record, number, (current) => ({
		...current,
		status: "failed",
		attempts,
		retryOn,
		lastError: message,
	}));
	return { record: next, givenUp: false, retryOn };
}

/** Saleor has been told about this payment. When that is true of every payment, the plan is complete. */
export function markReported(record: InstallmentRecord, number: number): InstallmentRecord {
	const next = replacePayment(record, number, (payment) => ({ ...payment, reported: true }));
	const done = next.payments.every((payment) => payment.status === "paid" && payment.reported);
	return done && next.status === "active" ? { ...next, status: "complete" } : next;
}

/** Paid payments Saleor hasn't been told about yet; they are reported before anything else happens. */
export const unreportedPayments = (record: InstallmentRecord): ScheduledPayment[] =>
	record.payments.filter(
		(payment) => payment.status === "paid" && payment.transactionId && !payment.reported,
	);

/** Attempts that started long ago and never recorded a result. */
export function staleAttempts(record: InstallmentRecord, now: Date): ScheduledPayment[] {
	return record.payments.filter(
		(payment) =>
			payment.status === "attempting" &&
			(!payment.attemptedAt || now.getTime() - new Date(payment.attemptedAt).getTime() > STALE_ATTEMPT_MS),
	);
}

export const withStatus = (
	record: InstallmentRecord,
	status: PlanStatus,
	note?: string,
): InstallmentRecord => ({
	...record,
	status,
	note: note ?? record.note,
});

/** What's still to be collected, in cents. */
export const remainingCents = (record: InstallmentRecord): number =>
	record.payments
		.filter((payment) => payment.status !== "paid")
		.reduce((sum, payment) => sum + payment.amountCents, 0);

export const nextPayment = (record: InstallmentRecord): ScheduledPayment | null =>
	record.payments.find((payment) => payment.status !== "paid") ?? null;
