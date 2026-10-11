import { type NextRequest, NextResponse } from "next/server";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs, isAllowedStorefrontChannel } from "@/config/channels";
import { getDefaultLocaleSlug, isLocaleSlug, isStorefrontLocaleSlug } from "@/config/locale";
import { BROWSE_LOCALE_COOKIE, getBrowseLocaleCookieOptions } from "@/lib/browse-locale";
import { AGE_GATE_PATH, AGE_VERIFIED_COOKIE } from "@/lib/age-gate";
import { SITE_ACCESS_COOKIE, SITE_PASSWORD_PATH, getSitePassword, hasSiteAccess } from "@/lib/site-password";
import { buildStorefrontPath } from "@/lib/storefront-path";

/** Kept as a literal here: the middleware runs at the edge and must not pull in the workspace's server code. */
const WORKSPACE_PATH = "/worldwide-ai";

const RESERVED_ROOT_SEGMENTS = new Set([
	"api",
	"checkout",
	"_next",
	"favicon.ico",
	"robots.txt",
	"sitemap.xml",
]);

function isChannelSlug(segment: string): boolean {
	const allowed = getStaticStorefrontChannelSlugs();
	return isAllowedStorefrontChannel(segment, allowed);
}

function withBrowseLocaleCookie(request: NextRequest, response: NextResponse, locale: string): NextResponse {
	if (!isStorefrontLocaleSlug(locale)) {
		return response;
	}

	// Skip Set-Cookie when the value is already correct — re-setting on every HTML response
	// marks responses as uncacheable at shared CDNs even when nothing changed.
	const current = request.cookies.get(BROWSE_LOCALE_COOKIE)?.value;
	if (current === locale) {
		return response;
	}

	response.cookies.set(BROWSE_LOCALE_COOKIE, locale, getBrowseLocaleCookieOptions());
	return response;
}

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api") ||
		pathname.includes(".") // static files
	) {
		return NextResponse.next();
	}

	// Optional site-wide password (see lib/site-password.ts): only active while SITE_PASSWORD is set, and checked
	// before the age gate. /api stays open above so Saleor and Stripe webhooks and cache revalidation keep working.
	if (getSitePassword()) {
		if (
			pathname !== SITE_PASSWORD_PATH &&
			!(await hasSiteAccess(request.cookies.get(SITE_ACCESS_COOKIE)?.value))
		) {
			const url = request.nextUrl.clone();
			const next = `${pathname}${request.nextUrl.search}`;
			url.pathname = SITE_PASSWORD_PATH;
			url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
			return NextResponse.redirect(url, 307);
		}
	} else if (pathname === SITE_PASSWORD_PATH) {
		// No password configured: the gate page has nothing to ask.
		const url = request.nextUrl.clone();
		url.pathname = "/home";
		url.search = "";
		return NextResponse.redirect(url, 307);
	}

	// The private Worldwide AI workspace. Nobody without a store session gets as far as rendering it: they are sent to sign
	// in, with a real redirect. (Whether the signed-in account is an owner or staff member is decided on the server by every
	// page and action; a customer account gets "not found".) It has its own, stronger gate, so the age gate is skipped.
	if (pathname === WORKSPACE_PATH || pathname.startsWith(`${WORKSPACE_PATH}/`)) {
		const signedIn = request.cookies
			.getAll()
			.some((cookie) => cookie.value && /saleor_auth_(access_token|module_refresh_token)/.test(cookie.name));
		// Local preview only: `next dev` with the in-memory demonstration store and a named preview role (see docs/worldwide-ai.md).
		const preview =
			process.env.NODE_ENV === "development" &&
			!process.env.VERCEL &&
			process.env.WORLDWIDE_AI_STORE === "demo" &&
			(process.env.WORLDWIDE_AI_DEMO_OPERATOR === "owner" ||
				process.env.WORLDWIDE_AI_DEMO_OPERATOR === "staff");
		if (!signedIn && !preview) {
			const url = request.nextUrl.clone();
			url.pathname = "/login";
			url.search = `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
			return NextResponse.redirect(url, 307);
		}
		const response = NextResponse.next();
		response.headers.set("X-Robots-Tag", "noindex, nofollow");
		response.headers.set("Cache-Control", "private, no-store");
		return response;
	}

	// Site-wide age gate: everything except the gate pages themselves needs the "verified" cookie.
	if (
		pathname !== AGE_GATE_PATH &&
		pathname !== SITE_PASSWORD_PATH &&
		request.cookies.get(AGE_VERIFIED_COOKIE)?.value !== "1"
	) {
		const url = request.nextUrl.clone();
		const next = `${pathname}${request.nextUrl.search}`;
		url.pathname = AGE_GATE_PATH;
		url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
		return NextResponse.redirect(url, 307);
	}

	const segments = pathname.split("/").filter(Boolean);
	const defaultLocale = getDefaultLocaleSlug();
	const defaultChannel = DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0];

	// Root → this fork's actual homepage. Not `buildStorefrontPath(...)` (the stock Paper
	// template's `/{locale}/{channel}` scheme) — this fork uses flat routes (`/home`, `/shop`, …)
	// for its real site, so redirecting there instead sent every visitor of `/` to the generic,
	// unbranded template homepage. This runs before `(root)/page.tsx`, so fixing that alone (see
	// its comment) had no effect — middleware redirects before the page component ever executes.
	if (segments.length === 0) {
		const url = request.nextUrl.clone();
		url.pathname = "/home";
		return NextResponse.redirect(url, 307);
	}

	const [first, second, ...rest] = segments;

	if (RESERVED_ROOT_SEGMENTS.has(first)) {
		return NextResponse.next();
	}

	// Disabled locale slug (defined but not in NEXT_PUBLIC_STOREFRONT_LOCALES) → canonical default locale
	if (isLocaleSlug(first) && !isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second)) {
			const url = request.nextUrl.clone();
			const suffix = rest.length > 0 ? `/${rest.join("/")}` : "";
			url.pathname = buildStorefrontPath(defaultLocale, second, suffix);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
		}
		return NextResponse.next();
	}

	// Canonical format: /{locale}/{channel}/…
	if (isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second)) {
			return withBrowseLocaleCookie(request, NextResponse.next(), first);
		}

		// /{locale} only → add default channel
		if (!second && defaultChannel) {
			const url = request.nextUrl.clone();
			url.pathname = buildStorefrontPath(first, defaultChannel);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), first);
		}

		return NextResponse.next();
	}

	// Legacy: /{channel}/… → /{defaultLocale}/{channel}/…
	if (isChannelSlug(first)) {
		const url = request.nextUrl.clone();
		const suffix = [second, ...rest].filter(Boolean).join("/");
		url.pathname = buildStorefrontPath(defaultLocale, first, suffix ? `/${suffix}` : "");
		return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image).*)"],
};
