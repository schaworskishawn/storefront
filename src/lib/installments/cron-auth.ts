import { timingSafeEqual } from "node:crypto";

/** Shorter than this and the secret is too easy to guess for an endpoint that charges cards. */
export const MIN_CRON_SECRET_LENGTH = 16;

/**
 * Is this request from the scheduler? Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that variable is set.
 * The header is the only accepted place (a token in the URL ends up in logs), the comparison is timing-safe, and with no
 * secret set — or a weak one — nothing is authorised, so the endpoint can never run open.
 */
export function isAuthorizedCronRequest(
	authorization: string | null | undefined,
	secret: string | undefined,
): boolean {
	if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
	if (!authorization?.startsWith("Bearer ")) return false;

	const provided = Buffer.from(authorization.slice("Bearer ".length));
	const expected = Buffer.from(secret);
	if (provided.length !== expected.length) return false;
	return timingSafeEqual(provided, expected);
}
