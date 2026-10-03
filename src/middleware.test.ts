import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGE_VERIFIED_COOKIE } from "@/lib/age-gate";
import { SITE_ACCESS_COOKIE, sitePasswordToken } from "@/lib/site-password";
import { middleware } from "./middleware";

const request = (path: string, cookies: Record<string, string> = {}) =>
	new NextRequest(`http://localhost:3000${path}`, {
		headers: {
			cookie: Object.entries(cookies)
				.map(([k, v]) => `${k}=${v}`)
				.join("; "),
		},
	});

const location = (res: Response) => {
	const header = res.headers.get("location");
	return header ? new URL(header).pathname + new URL(header).search : null;
};
const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("site password gate", () => {
	it("is off by default: the age gate still applies and the password page redirects home", async () => {
		vi.stubEnv("SITE_PASSWORD", "");
		expect(location(await middleware(request("/shop")))).toBe("/age-verification?next=%2Fshop");
		expect(location(await middleware(request("/site-password")))).toBe("/home");
	});

	it("sends visitors without the access cookie to the password page, remembering where they were going", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		const res = await middleware(request("/shop?category=coils", { [AGE_VERIFIED_COOKIE]: "1" }));
		expect(res.status).toBe(307);
		expect(location(res)).toBe("/site-password?next=%2Fshop%3Fcategory%3Dcoils");
	});

	it("does not remember the home page as a destination", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		expect(location(await middleware(request("/")))).toBe("/site-password");
	});

	it("rejects a wrong or stale access cookie", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		const stale = await sitePasswordToken("old-password");
		expect(location(await middleware(request("/shop", { [SITE_ACCESS_COOKIE]: stale })))).toContain(
			"/site-password",
		);
		expect(location(await middleware(request("/shop", { [SITE_ACCESS_COOKIE]: "nope" })))).toContain(
			"/site-password",
		);
	});

	it("shows the password page itself, before the age gate", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		expect(passesThrough(await middleware(request("/site-password")))).toBe(true);
	});

	it("keeps /api and static files open so webhooks, revalidation and assets keep working", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		expect(passesThrough(await middleware(request("/api/revalidate")))).toBe(true);
		expect(passesThrough(await middleware(request("/api/webhooks/stripe-identity")))).toBe(true);
		expect(passesThrough(await middleware(request("/home/imgBrand.png")))).toBe(true);
		expect(passesThrough(await middleware(request("/robots.txt")))).toBe(true);
	});

	it("lets a visitor with the right cookie on to the age gate and then the site", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		const access = { [SITE_ACCESS_COOKIE]: await sitePasswordToken("open-sesame") };
		expect(location(await middleware(request("/shop", access)))).toBe("/age-verification?next=%2Fshop");
		const full = { ...access, [AGE_VERIFIED_COOKIE]: "1" };
		expect(passesThrough(await middleware(request("/shop", full)))).toBe(true);
	});
});
