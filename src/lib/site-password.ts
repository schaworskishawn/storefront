import { safeNextPath } from "@/lib/age-gate";

/**
 * Optional site-wide password gate (pre-launch / staging lock). Off unless `SITE_PASSWORD` is set.
 *
 * Visitors enter the password on /site-password; a server action then sets an httpOnly cookie holding an HMAC of the
 * password (never the password itself), and src/middleware.ts lets a request through only when that cookie matches.
 * Changing or removing `SITE_PASSWORD` invalidates every existing cookie. Kept free of Node-only APIs (Web Crypto only)
 * so the middleware can import it.
 */
export const SITE_PASSWORD_PATH = "/site-password";
export const SITE_ACCESS_COOKIE = "wv-site-access";
export const SITE_ACCESS_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** `redirectTo` is set once the password was right; the browser then loads it (see SitePasswordForm). */
export type UnlockState = { error: string | null; redirectTo?: string };

/** The configured password, or null when the gate is off. */
export function getSitePassword(): string | null {
	const value = process.env.SITE_PASSWORD?.trim();
	return value ? value : null;
}

const encoder = new TextEncoder();

async function hmacHex(key: string, message: string): Promise<string> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value that proves a visitor knows `password`. */
export function sitePasswordToken(password: string): Promise<string> {
	return hmacHex(process.env.SITE_PASSWORD_SECRET || SITE_ACCESS_COOKIE, password);
}

/** Constant-time string comparison (the strings compared here are fixed-length hex digests). */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Does this cookie value grant access to the site? Always true when the gate is off. */
export async function hasSiteAccess(cookieValue: string | undefined): Promise<boolean> {
	const password = getSitePassword();
	if (!password) return true;
	if (!cookieValue) return false;
	return safeEqual(cookieValue, await sitePasswordToken(password));
}

/** Is the entered password right? Always false when the gate is off. */
export async function checkSitePassword(input: string): Promise<boolean> {
	const password = getSitePassword();
	if (!password) return false;
	return safeEqual(await sitePasswordToken(input), await sitePasswordToken(password));
}

/** Same-site relative destination after unlocking; never the gate pages themselves (no open redirects). */
export function safeSiteNextPath(next: string | null | undefined): string {
	const path = safeNextPath(next);
	return path.startsWith(SITE_PASSWORD_PATH) ? "/home" : path;
}
