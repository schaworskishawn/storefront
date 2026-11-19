import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import type { CommissionLine } from "./ledger";
import { campaignReport, campaignSuggestions, destinationFromInput } from "./link-tools";
import { qrMatrix, qrSvg } from "./qr";
import {
	CAMPAIGN_COOKIE,
	REFERRAL_COOKIE,
	normalizeCampaign,
	referralLink,
	withReferralCookie,
} from "./referral";

const ORIGIN = "https://www.worldwidevapor.com";

describe("referralLink", () => {
	it("links to any page, keeping its query, with the code and the campaign tag", () => {
		expect(referralLink(ORIGIN, "neo")).toBe(`${ORIGIN}/home?aff=neo`);
		expect(referralLink(ORIGIN, "neo", "/product/elf-bar", "TikTok")).toBe(
			`${ORIGIN}/product/elf-bar?aff=neo&sub=tiktok`,
		);
		expect(referralLink(ORIGIN, "neo", "/shop?category=disposables&aff=someone&sub=old", "bio")).toBe(
			`${ORIGIN}/shop?category=disposables&aff=neo&sub=bio`,
		);
		expect(referralLink(ORIGIN, "neo", "/shop", "not a tag!")).toBe(`${ORIGIN}/shop?aff=neo`);
	});
});

describe("normalizeCampaign", () => {
	it("lowercases, turns spaces into dashes, and refuses anything else", () => {
		expect(normalizeCampaign(" Insta Story ")).toBe("insta-story");
		expect(normalizeCampaign("yt_review-2")).toBe("yt_review-2");
		expect(normalizeCampaign("")).toBeNull();
		expect(normalizeCampaign("-bio")).toBeNull();
		expect(normalizeCampaign("<b>")).toBeNull();
		expect(normalizeCampaign("x".repeat(33))).toBeNull();
		expect(normalizeCampaign(7)).toBeNull();
	});
});

describe("withReferralCookie", () => {
	const visit = (query: string, cookies: Record<string, string> = {}) => {
		const request = new NextRequest(`${ORIGIN}/home${query}`, {
			headers: {
				cookie: Object.entries(cookies)
					.map(([k, v]) => `${k}=${v}`)
					.join("; "),
			},
		});
		return withReferralCookie(request, NextResponse.next()).cookies;
	};

	it("remembers the link's campaign tag with its code", () => {
		const set = visit("?aff=neo&sub=Instagram");
		expect(set.get(REFERRAL_COOKIE)?.value).toBe("neo");
		expect(set.get(CAMPAIGN_COOKIE)?.value).toBe("instagram");
	});

	it("clears an earlier link's tag when the next link has none, so orders aren't reported under the wrong campaign", () => {
		const set = visit("?aff=neo", { [REFERRAL_COOKIE]: "neo", [CAMPAIGN_COOKIE]: "tiktok" });
		expect(set.get(CAMPAIGN_COOKIE)?.value).toBe("");
	});

	it("leaves the cookies alone without a referral, or with a malformed tag and none to clear", () => {
		expect(visit("?sub=tiktok").getAll()).toEqual([]);
		expect(visit("?aff=neo&sub=<b>", { [REFERRAL_COOKIE]: "neo" }).getAll()).toEqual([]);
	});
});

describe("destinationFromInput", () => {
	it("accepts any page of the shop, pasted however it was copied, dropping old aff and sub", () => {
		expect(destinationFromInput(`${ORIGIN}/product/elf-bar?flavour=mint&aff=x#reviews`, ORIGIN)).toEqual({
			ok: true,
			path: "/product/elf-bar?flavour=mint",
		});
		expect(destinationFromInput("worldwidevapor.com/shop", ORIGIN)).toEqual({ ok: true, path: "/shop" });
		expect(destinationFromInput("/rewards", ORIGIN)).toEqual({ ok: true, path: "/rewards" });
		expect(destinationFromInput(`${ORIGIN}/`, ORIGIN)).toEqual({ ok: true, path: "/home" });
	});

	it("refuses other sites, pages behind a sign-in, and things that aren't links", () => {
		expect(destinationFromInput("https://evil.example/home", ORIGIN)).toEqual({
			ok: false,
			message: expect.stringContaining("worldwidevapor.com"),
		});
		expect(destinationFromInput(`${ORIGIN}/account/orders`, ORIGIN).ok).toBe(false);
		expect(destinationFromInput(`${ORIGIN}/checkout?id=1`, ORIGIN).ok).toBe(false);
		expect(destinationFromInput("javascript:alert(1)", ORIGIN).ok).toBe(false);
		expect(destinationFromInput("   ", ORIGIN).ok).toBe(false);
	});
});

const line = (over: Partial<CommissionLine>): CommissionLine => ({
	orderId: "o",
	number: "1",
	month: "2026-11",
	paidAt: "2026-11-02T00:00:00.000Z",
	payableAt: "2026-11-17T00:00:00.000Z",
	via: "link",
	currency: "USD",
	baseCents: 10_000,
	tierId: "cloud",
	rateBps: 1000,
	commissionCents: 1_000,
	status: "payable",
	campaign: null,
	...over,
});

describe("campaignReport", () => {
	it("adds up each tag's orders, sales and commission, busiest first, leaving out reversed orders", () => {
		const rows = campaignReport([
			line({ campaign: "tiktok" }),
			line({ campaign: "tiktok", currency: "CAD", baseCents: 5_000, commissionCents: 500 }),
			line({ campaign: "bio" }),
			line({ campaign: "bio", status: "reversed", commissionCents: 0 }),
			line({}),
			line({ via: "voucher" }),
		]);
		expect(rows.map((r) => [r.label, r.orders])).toEqual([
			["tiktok", 2],
			["bio", 1],
			["Untagged link", 1],
			["Discount code", 1],
		]);
		expect(rows[0]).toMatchObject({
			salesCents: { USD: 10_000, CAD: 5_000 },
			commissionCents: { USD: 1_000, CAD: 500 },
		});
	});

	it("suggests the tags used before, newest first, then the presets", () => {
		const s = campaignSuggestions([
			line({ campaign: "podcast", paidAt: "2026-10-01T00:00:00.000Z" }),
			line({ campaign: "reddit", paidAt: "2026-11-10T00:00:00.000Z" }),
		]);
		expect(s.slice(0, 3)).toEqual(["reddit", "podcast", "instagram"]);
		expect(new Set(s).size).toBe(s.length);
	});
});

describe("qr", () => {
	const link = `${ORIGIN}/product/elf-bar?aff=neo&sub=tiktok`;

	it("makes a square module grid with the three finder squares in their corners", () => {
		const m = qrMatrix(link);
		const n = m.length;
		expect(n).toBeGreaterThanOrEqual(21);
		expect((n - 17) % 4).toBe(0); // A real QR size: 21, 25, 29, …
		for (const [r, c] of [
			[0, 0],
			[0, n - 7],
			[n - 7, 0],
		] as const) {
			expect(m[r]![c]).toBe(true); // Outer ring corner.
			expect(m[r + 1]![c + 1]).toBe(false); // The light ring inside it.
			expect(m[r + 3]![c + 3]).toBe(true); // The centre.
		}
		expect(qrMatrix(link)).toEqual(m);
	});

	it("draws a neon tile or a classic white code, sized for download, with no light-on-dark modules", () => {
		const m = qrMatrix(link);
		const neon = qrSvg(m, "neon", 1024);
		const classic = qrSvg(m, "classic", 512);
		expect(neon).toMatch(/^<svg [^>]*width="1024" height="1024"/);
		expect(neon).toContain('fill="url(#tile)"');
		expect(neon).toContain('fill="#05030a"');
		expect(classic).toContain('fill="#fff"');
		expect(classic).toMatch(/width="512"/);
	});
});
