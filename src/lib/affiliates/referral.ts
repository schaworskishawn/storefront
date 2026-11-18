import type { NextRequest, NextResponse } from "next/server";
import { REFERRAL_COOKIE_DAYS } from "./tiers";

/**
 * Referral links: `https://www.worldwidevapor.com/<any page>?aff=<code>`. The middleware remembers the code in a cookie for
 * 30 days (the last link clicked wins), the checkout copies it onto the order, and the affiliates app credits the order
 * once it's paid (engine.ts). The cookie is only a claim: the app checks the code belongs to an approved affiliate.
 *
 * Kept free of server-only imports, as the middleware and the checkout both use it.
 */

export const REFERRAL_PARAM = "aff";
export const REFERRAL_COOKIE = "wv_aff";

const CODE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

/** A well-formed affiliate code (3–32 of a-z, 0-9, _ and -, starting with a letter or digit), lowercased; else null. */
export function normalizeAffiliateCode(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const code = raw.trim().toLowerCase();
	return CODE.test(code) ? code : null;
}

export const referralCookieOptions = () => ({
	httpOnly: true,
	sameSite: "lax" as const,
	secure: process.env.NODE_ENV === "production",
	path: "/",
	maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
});

/**
 * Sets the referral cookie on whatever the middleware answers (a page, or the age-gate or password redirect) when the
 * request carries a well-formed `?aff=`. Without one, or when the cookie already holds that code, the response is untouched.
 */
export function withReferralCookie<R extends NextResponse>(request: NextRequest, response: R): R {
	const code = normalizeAffiliateCode(request.nextUrl.searchParams.get(REFERRAL_PARAM));
	if (code && request.cookies.get(REFERRAL_COOKIE)?.value !== code) {
		response.cookies.set(REFERRAL_COOKIE, code, referralCookieOptions());
	}
	return response;
}

/** The affiliate's link to a page of the shop (the home page by default). */
export function referralLink(origin: string, code: string, path = "/home"): string {
	return `${origin.replace(/\/+$/, "")}${path}?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}
