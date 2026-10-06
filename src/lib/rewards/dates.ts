const DAY_MS = 24 * 60 * 60 * 1000;

/** The `YYYY-MM-DD` calendar date `days` after the given `YYYY-MM-DD` date (UTC, so no timezone shifting). */
export function addCalendarDays(isoDate: string, days: number): string {
	const start = new Date(`${isoDate}T00:00:00Z`).getTime();
	return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}
