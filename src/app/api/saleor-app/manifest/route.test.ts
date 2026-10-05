import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

type Manifest = { appUrl: string; tokenTargetUrl: string; webhooks: Array<{ targetUrl: string }> };

const request = (origin: string) => ({ nextUrl: { origin } }) as never;

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("payments app manifest address", () => {
	it("uses the configured storefront address", async () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.example");
		const manifest = (await GET(request("https://other.example")).json()) as Manifest;
		expect(manifest.appUrl).toBe("https://shop.example");
		expect(manifest.webhooks[0].targetUrl).toMatch(/^https:\/\/shop\.example\/api\/saleor-app\/webhooks\//);
	});

	it("falls back to the address the request came to", async () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "");
		const manifest = (await GET(request("https://other.example")).json()) as Manifest;
		expect(manifest.appUrl).toBe("https://other.example");
	});

	it("advertises a Vercel preview's own address, not the live site's", async () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.example");
		vi.stubEnv("VERCEL_ENV", "preview");
		const manifest = (await GET(
			request("https://storefront-git-claude-payments.vercel.app"),
		).json()) as Manifest;
		expect(manifest.appUrl).toBe("https://storefront-git-claude-payments.vercel.app");
		expect(manifest.tokenTargetUrl).toBe(
			"https://storefront-git-claude-payments.vercel.app/api/saleor-app/register",
		);
	});

	it("keeps the configured address on a production deployment", async () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.example");
		vi.stubEnv("VERCEL_ENV", "production");
		const manifest = (await GET(request("https://storefront-abc.vercel.app")).json()) as Manifest;
		expect(manifest.appUrl).toBe("https://shop.example");
	});
});
