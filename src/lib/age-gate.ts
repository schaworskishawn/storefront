/** Site-wide age gate: cookie set by /age-verification, checked in src/middleware.ts. */
export const AGE_GATE_PATH = "/age-verification";
export const AGE_VERIFIED_COOKIE = "wv-age-verified";

/** Only same-site relative paths are allowed as the post-verification destination (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
	if (
		!next ||
		!next.startsWith("/") ||
		next.startsWith("//") ||
		next.startsWith("/\\") ||
		next.startsWith(AGE_GATE_PATH)
	)
		return fallback;
	return next;
}
