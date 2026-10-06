/**
 * "Pay in 4": the store's own pay-over-time plan. The shopper pays a quarter now and the rest in three equal payments, two
 * weeks apart, with no interest or fees. The order ships only after the last payment (layaway style), so the store never
 * hands over goods it hasn't been paid for.
 *
 * Pure and client-safe (no server imports): the checkout uses it to show the schedule, the payments app to validate the
 * deposit it is asked to charge, and the daily job to build the schedule. Money is worked out in whole cents so the four
 * payments always add up to the order total exactly.
 */

/** Payments after the deposit. */
export const LATER_PAYMENT_COUNT = 3;
/** Days between payments (the first later payment is due this many days after the order). */
export const INSTALLMENT_INTERVAL_DAYS = 14;
/** Authorize.net settles in one currency per account, and only these two. */
export const INSTALLMENT_CURRENCIES = ["USD", "CAD"] as const;

/**
 * The deposit transaction carries this prefix on its Saleor `pspReference`, which is how the payments app (and the daily
 * job) tell installment orders apart from ordinary card payments and crypto.
 */
export const INSTALLMENT_PSP_PREFIX = "inst:";

export const DEFAULT_INSTALLMENT_MIN_TOTAL = 50;
export const DEFAULT_INSTALLMENT_MAX_TOTAL = 1000;

export type InstallmentPlan = {
	totalCents: number;
	depositCents: number;
	/** Each of the three later payments. */
	installmentCents: number;
	total: number;
	deposit: number;
	installment: number;
};

/**
 * Splits an order total into the deposit and three equal payments. Each later payment is a quarter rounded down, so any odd
 * cents land on the deposit (which is therefore 25% to 25% + 3 cents). Null for a total that can't be split.
 */
export function buildInstallmentPlan(total: number): InstallmentPlan | null {
	const totalCents = Math.round(total * 100);
	if (!Number.isFinite(totalCents) || totalCents <= 0) return null;

	const installmentCents = Math.floor(totalCents / 4);
	if (installmentCents <= 0) return null;

	const depositCents = totalCents - LATER_PAYMENT_COUNT * installmentCents;
	return {
		totalCents,
		depositCents,
		installmentCents,
		total: totalCents / 100,
		deposit: depositCents / 100,
		installment: installmentCents / 100,
	};
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` in UTC. */
export function toIsoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Calendar date `days` after `from`, in UTC. Due dates are whole dates, not moments. */
export function addDays(from: Date, days: number): string {
	const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
	return toIsoDate(new Date(start + days * DAY_MS));
}

/** The due dates of the three later payments, counted from the day the order was placed. */
export function laterPaymentDates(orderedAt: Date): string[] {
	return Array.from({ length: LATER_PAYMENT_COUNT }, (_, index) =>
		addDays(orderedAt, INSTALLMENT_INTERVAL_DAYS * (index + 1)),
	);
}

/** Storefront-side settings, all optional. Read from NEXT_PUBLIC_ variables so the checkout and the server agree. */
export type InstallmentConfig = {
	enabled: boolean;
	/** Channel slugs the plan is offered in. Empty means nowhere: the channel must allow unpaid orders. */
	channels: string[];
	minTotal: number;
	maxTotal: number;
};

type PublicEnv = {
	enabled?: string;
	channels?: string;
	minTotal?: string;
	maxTotal?: string;
};

// Literal `process.env.NEXT_PUBLIC_…` reads, so Next inlines them into the browser bundle.
const publicEnv = (): PublicEnv => ({
	enabled: process.env.NEXT_PUBLIC_ENABLE_INSTALLMENTS,
	channels: process.env.NEXT_PUBLIC_INSTALLMENT_CHANNELS,
	minTotal: process.env.NEXT_PUBLIC_INSTALLMENT_MIN_TOTAL,
	maxTotal: process.env.NEXT_PUBLIC_INSTALLMENT_MAX_TOTAL,
});

const positiveNumber = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseFloat(value ?? "");
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function readInstallmentConfig(env: PublicEnv = publicEnv()): InstallmentConfig {
	return {
		enabled: env.enabled === "true",
		channels: (env.channels ?? "")
			.split(",")
			.map((slug) => slug.trim())
			.filter(Boolean),
		minTotal: positiveNumber(env.minTotal, DEFAULT_INSTALLMENT_MIN_TOTAL),
		maxTotal: positiveNumber(env.maxTotal, DEFAULT_INSTALLMENT_MAX_TOTAL),
	};
}

export type EligibilityInput = { total: number; currency: string; channel: string | null | undefined };

export type EligibilityResult =
	| { ok: true }
	| { ok: false; reason: "disabled" | "channel" | "currency" | "amount" };

/** Whether an order can be paid in installments: the feature is on, the channel allows it, and the total is in range. */
export function checkInstallmentEligibility(
	input: EligibilityInput,
	config: InstallmentConfig = readInstallmentConfig(),
): EligibilityResult {
	if (!config.enabled) return { ok: false, reason: "disabled" };
	if (!input.channel || !config.channels.includes(input.channel)) return { ok: false, reason: "channel" };
	if (!(INSTALLMENT_CURRENCIES as readonly string[]).includes(input.currency.toUpperCase())) {
		return { ok: false, reason: "currency" };
	}
	if (!(input.total >= config.minTotal && input.total <= config.maxTotal))
		return { ok: false, reason: "amount" };
	return { ok: true };
}

/** Whether a Saleor `pspReference` belongs to an installment deposit. */
export function isInstallmentPspReference(pspReference: string | null | undefined): boolean {
	return !!pspReference && pspReference.startsWith(INSTALLMENT_PSP_PREFIX);
}

/** The Authorize.net transaction id inside an installment `pspReference`, or null if it isn't one. */
export function installmentTransactionId(pspReference: string | null | undefined): string | null {
	if (!isInstallmentPspReference(pspReference)) return null;
	const id = (pspReference as string).slice(INSTALLMENT_PSP_PREFIX.length);
	return id || null;
}
