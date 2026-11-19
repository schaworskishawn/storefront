import type { NextRequest, NextResponse } from "next/server";
import { REFERRAL_COOKIE_DAYS } from "./tiers";

/**
 * Referral links: `https://www.worldwidevapor.com/<any page>?aff=<code>`, optionally with a campaign tag, `&sub=<tag>`
 * (an affiliate's own label for where the link was posted: instagram, bio, a video). The middleware remembers the code and
 * the tag in cookies for 30 days (the last link clicked wins, tag included), the checkout copies both onto the order, and
 * the affiliates app credits the order once it's paid (engine.ts), keeping the tag on the credit so the dashboard can
 * report by campaign. The cookies are only a claim: the app checks the code belongs to an approved affiliate.
 *
 * Kept free of server-only imports, as the middleware, the checkout and the dashboard's link builder all use it.
 */

export const REFERRAL_PARAM = "aff";
export const REFERRAL_COOKIE = "wv_aff";
export const CAMPAIGN_PARAM = "sub";
export const CAMPAIGN_COOKIE = "wv_aff_sub";

const CODE = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const CAMPAIGN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** A well-formed affiliate code (3–32 of a-z, 0-9, _ and -, starting with a letter or digit), lowercased; else null. */
export function normalizeAffiliateCode(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const code = raw.trim().toLowerCase();
	return CODE.test(code) ? code : null;
}

/**
 * A well-formed campaign tag (1–32 of a-z, 0-9, _ and -, starting with a letter or digit), lowercased, with spaces
 * turned into dashes ("Insta Story" is "insta-story"); else null.
 */
export function normalizeCampaign(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
	return CAMPAIGN.test(tag) ? tag : null;
}

export const referralCookieOptions = () => ({
	httpOnly: true,
	sameSite: "lax" as const,
	secure: process.env.NODE_ENV === "production",
	path: "/",
	maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
});

/**
 * Sets the referral cookies on whatever the middleware answers (a page, or the age-gate or password redirect) when the
 * request carries a well-formed `?aff=`. The campaign tag follows the link it came with: a link with `&sub=` sets it, and
 * a link without one clears an earlier link's tag, so an order is never reported under a campaign it didn't come from.
 * Without `?aff=`, or when the cookies already hold these values, the response is untouched.
 */
export function withReferralCookie<R extends NextResponse>(request: NextRequest, response: R): R {
	const code = normalizeAffiliateCode(request.nextUrl.searchParams.get(REFERRAL_PARAM));
	if (!code) return response;
	if (request.cookies.get(REFERRAL_COOKIE)?.value !== code) {
		response.cookies.set(REFERRAL_COOKIE, code, referralCookieOptions());
	}
	const campaign = normalizeCampaign(request.nextUrl.searchParams.get(CAMPAIGN_PARAM));
	const current = request.cookies.get(CAMPAIGN_COOKIE)?.value;
	if (campaign && current !== campaign)
		response.cookies.set(CAMPAIGN_COOKIE, campaign, referralCookieOptions());
	else if (!campaign && current !== undefined) response.cookies.delete(CAMPAIGN_COOKIE);
	return response;
}

/**
 * The affiliate's link to a page of the shop (the home page by default), keeping any query the page already has and
 * adding the campaign tag when there is one: "/product/x?flavour=mint" becomes "/product/x?flavour=mint&aff=neo&sub=tiktok".
 */
export function referralLink(origin: string, code: string, path = "/home", campaign?: string | null): string {
	const base = origin.replace(/\/+$/, "");
	const [pathname = "/", query = ""] = path.split("?", 2);
	const params = new URLSearchParams(query);
	params.delete(REFERRAL_PARAM);
	params.delete(CAMPAIGN_PARAM);
	params.set(REFERRAL_PARAM, code);
	const tag = normalizeCampaign(campaign);
	if (tag) params.set(CAMPAIGN_PARAM, tag);
	return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}?${params.toString()}`;
}
