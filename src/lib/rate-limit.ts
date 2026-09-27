/** Tiny in-memory limiter (per server instance): `max` hits per hour per key. Good enough to blunt form spam. */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;

export function rateLimited(key: string, max: number): boolean {
	const now = Date.now();
	const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (recent.length >= max) {
		hits.set(key, recent);
		return true;
	}
	hits.set(key, [...recent, now]);
	return false;
}
