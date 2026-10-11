import { daysBetween, opsDayKey } from "../time";

/**
 * Whether an approved document can still be trusted, decided on the Winnipeg calendar by plain date comparison (never by a
 * model). Expired documents are not used as sources at all; stale ones are used but flagged, so a reviewer sees it.
 */

export type FreshnessState = "current" | "stale" | "expired";
export type Freshness = { state: FreshnessState; reasons: string[] };

export type FreshnessInput = {
	approvedAt: string | Date | null;
	/** "YYYY-MM-DD": when someone should look at it again. */
	reviewDue: string | null;
	/** "YYYY-MM-DD": the last day it is valid. */
	expiresAt: string | null;
	now: Date;
	/** With no review date, a document this many days past its approval counts as stale. */
	staleAfterDays: number;
};

export function evaluateFreshness(input: FreshnessInput): Freshness {
	const today = opsDayKey(input.now);

	if (input.expiresAt && today > input.expiresAt)
		return { state: "expired", reasons: [`Expired on ${input.expiresAt}.`] };

	if (input.reviewDue && today > input.reviewDue)
		return { state: "stale", reasons: [`A review was due on ${input.reviewDue}.`] };

	if (!input.reviewDue && input.approvedAt) {
		const age = daysBetween(opsDayKey(input.approvedAt), today);
		if (age > input.staleAfterDays)
			return {
				state: "stale",
				reasons: [`Approved ${age} days ago and has no review date (limit ${input.staleAfterDays} days).`],
			};
	}
	return { state: "current", reasons: [] };
}

/** Days until a "YYYY-MM-DD" date on the Winnipeg calendar: 0 is today, negative is past. */
export const daysUntil = (date: string, now: Date): number => daysBetween(opsDayKey(now), date);

export const isIsoDay = (value: unknown): value is string => {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
