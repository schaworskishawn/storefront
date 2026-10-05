/**
 * Helpers for the Android app (the Capacitor shell in android/, which loads this same site in a web view).
 *
 * The site cannot tell from the server that it is inside the app, and must not try: reading the request would make every page
 * dynamic. Detection is client-side only — Capacitor injects `window.Capacitor` into the web view, and the shell also
 * appends a marker to the user agent (capacitor.config.ts) as a second signal.
 */

export const NATIVE_APP_USER_AGENT_MARKER = "WorldwideVaporApp";

type NativeEnvironment = {
	Capacitor?: { getPlatform?: () => string };
	userAgent?: string;
};

/** True only inside the Android app — never in a mobile browser, and not in the iOS app. */
export function isAndroidApp({ Capacitor, userAgent }: NativeEnvironment): boolean {
	if (Capacitor?.getPlatform?.() === "android") {
		return true;
	}
	return Boolean(userAgent?.includes(NATIVE_APP_USER_AGENT_MARKER) && /android/i.test(userAgent));
}

export type NativeTabKey = "home" | "shop" | "wishlist" | "orders" | "account";

export type NativeTab = { key: NativeTabKey; label: string; href: string };

/** The bottom bar's tabs, in order. The links are the site's top-level paths, which work with or without a locale prefix. */
export const NATIVE_TABS: readonly NativeTab[] = [
	{ key: "home", label: "Home", href: "/home" },
	{ key: "shop", label: "Shop", href: "/shop" },
	{ key: "wishlist", label: "Wishlist", href: "/wishlist" },
	{ key: "orders", label: "Orders", href: "/orders" },
	{ key: "account", label: "Account", href: "/account" },
];

/** `/en/cad/orders` → `/orders`. Only a two-letter locale followed by a channel slug counts as a prefix. */
export function stripLocaleChannelPrefix(pathname: string): string {
	return pathname.replace(/^\/[a-z]{2}(?:-[A-Za-z]{2})?\/[a-z0-9-]+(?=\/|$)/, "") || "/";
}

const normalize = (pathname: string): string => {
	const stripped = stripLocaleChannelPrefix(pathname);
	return stripped.length > 1 ? stripped.replace(/\/+$/, "") : stripped;
};

const startsWithSegment = (path: string, segment: string) =>
	path === segment || path.startsWith(`${segment}/`);

/** Which tab a page belongs to, or null when none of them does (e.g. the cart). */
export function activeNativeTab(pathname: string): NativeTabKey | null {
	const path = normalize(pathname);

	if (path === "/" || startsWithSegment(path, "/home")) return "home";
	if (startsWithSegment(path, "/wishlist")) return "wishlist";
	if (startsWithSegment(path, "/orders")) return "orders";
	if (
		["/account", "/account-settings", "/addresses", "/payment-methods", "/my-reviews"].some((segment) =>
			startsWithSegment(path, segment),
		)
	) {
		return "account";
	}
	if (
		["/shop", "/product", "/products", "/search", "/categories", "/collections"].some((segment) =>
			startsWithSegment(path, segment),
		)
	) {
		return "shop";
	}
	return null;
}

/** Full-screen steps that must not have a bar under them: the age gate, sign-in and the like. */
const HIDDEN_SEGMENTS = [
	"/age-verification",
	"/site-password",
	"/login",
	"/logout",
	"/register",
	"/signup",
	"/forgot-password",
	"/reset-password",
	"/verify-email",
	"/checkout",
];

export function shouldShowNativeTabBar(pathname: string): boolean {
	const path = normalize(pathname);
	return !HIDDEN_SEGMENTS.some((segment) => startsWithSegment(path, segment));
}
