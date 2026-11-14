/**
 * Browsers send an Origin header on a cross-site POST; refuse one that isn't this site. (The auth cookie is SameSite=Lax,
 * so this is a second lock, not the only one.) A request with no Origin, like a script, is let through.
 */
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin) return true;
	const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
	try {
		return !!host && new URL(origin).host === host;
	} catch {
		return false;
	}
}

/** The first address in X-Forwarded-For (the visitor's, as Vercel reports it), for the per-connection backstop limits. */
export const clientIp = (request: Request): string =>
	request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
	request.headers.get("x-real-ip") ||
	"unknown";
