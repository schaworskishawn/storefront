/**
 * Times are stored as UTC (timestamptz, ISO 8601) and only turned into local wording at the edge. The business operates in
 * Winnipeg, so that is the zone every operational time on the dashboard is shown in.
 */

export const OPS_TIME_ZONE = "America/Winnipeg";

const toDate = (value: Date | string | number): Date => (value instanceof Date ? value : new Date(value));

const dateTime = new Intl.DateTimeFormat("en-CA", {
	timeZone: OPS_TIME_ZONE,
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
	timeZoneName: "short",
});

const dateOnly = new Intl.DateTimeFormat("en-CA", {
	timeZone: OPS_TIME_ZONE,
	year: "numeric",
	month: "short",
	day: "numeric",
});

/** "Oct 7, 2026, 1:05 p.m. CDT". Returns "—" for a missing or invalid time rather than "Invalid Date". */
export function formatOpsDateTime(value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined) return "—";
	const date = toDate(value);
	return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

/** "Oct 7, 2026" on the Winnipeg calendar (so 11 p.m. there is still that evening's date, not tomorrow's UTC date). */
export function formatOpsDate(value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined) return "—";
	const date = toDate(value);
	return Number.isNaN(date.getTime()) ? "—" : dateOnly.format(date);
}

/** The Winnipeg calendar day of a moment, as "YYYY-MM-DD". Deadlines and expiry dates are compared on this. */
export function opsDayKey(value: Date | string | number): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: OPS_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(toDate(value));
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days from one "YYYY-MM-DD" to another (positive when `to` is later). Pure calendar arithmetic, no time zones. */
export function daysBetween(from: string, to: string): number {
	const parse = (key: string) => {
		const [y, m, d] = key.split("-").map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** "3 min ago", "2 h ago", "5 days ago" (or "just now"). */
export function formatAge(from: Date | string | number, now: Date | number = Date.now()): string {
	const seconds = Math.max(0, Math.floor((+toDate(now) - +toDate(from)) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} h ago`;
	return `${Math.round(hours / 24)} days ago`;
}
