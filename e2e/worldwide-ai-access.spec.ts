import { expect, test } from "@playwright/test";

/**
 * The private Worldwide AI workspace, seen by someone who isn't signed in. Nothing here needs an account: the point is that
 * every page sends a visitor to sign-in before producing any content, the API answers 401, and neither can be cached or
 * indexed. Run against a normal server (not `pnpm worldwide-ai:preview`, which signs a stand-in operator in).
 */

const PAGES = [
	"/worldwide-ai",
	"/worldwide-ai/nexus",
	"/worldwide-ai/overview",
	"/worldwide-ai/team",
	"/worldwide-ai/team/vault",
	"/worldwide-ai/tasks",
	"/worldwide-ai/tasks/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/results/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/reports",
	"/worldwide-ai/reports/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/support",
	"/worldwide-ai/knowledge",
	"/worldwide-ai/review",
	"/worldwide-ai/lab",
	"/worldwide-ai/lab/ingredients",
	"/worldwide-ai/lab/ingredients/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/lab/movements",
	"/worldwide-ai/lab/recipes",
	"/worldwide-ai/lab/recipes/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/lab/batches",
	"/worldwide-ai/lab/finished",
	"/worldwide-ai/lab/batches/00000000-0000-4000-8000-000000000000/quality",
	"/worldwide-ai/manufacturing/equipment",
	"/worldwide-ai/manufacturing/equipment/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/manufacturing/training",
	"/worldwide-ai/rfid/tags",
	"/worldwide-ai/rfid/tags/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/rfid/scans",
	"/worldwide-ai/engineering/coding",
	"/worldwide-ai/engineering/coding/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/improvement/lessons",
	"/worldwide-ai/quality/specifications",
	"/worldwide-ai/quality/results",
	"/worldwide-ai/quality/deviations",
	"/worldwide-ai/quality/deviations/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/lab/batches/00000000-0000-4000-8000-000000000000",
	"/worldwide-ai/rfid",
	"/worldwide-ai/content",
	"/worldwide-ai/engineering",
	"/worldwide-ai/manufacturing",
	"/worldwide-ai/quality",
	"/worldwide-ai/compliance",
	"/worldwide-ai/integrations",
	"/worldwide-ai/activity",
	"/worldwide-ai/actions",
	"/worldwide-ai/improvement",
	"/worldwide-ai/skills",
	"/worldwide-ai/skills/relay-support-drafting",
	"/worldwide-ai/settings",
];

const API = [
	"/api/worldwide-ai/tasks/00000000-0000-4000-8000-000000000000",
	"/api/worldwide-ai/file?path=uploads%2Fanything.png",
];

test.describe("Worldwide AI turns away a visitor who isn't signed in", () => {
	for (const path of PAGES) {
		test(`${path} redirects to sign-in and sends no workspace content`, async ({ request }) => {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status()).toBe(307);
			const location = new URL(response.headers().location, "http://localhost");
			expect(location.pathname).toBe("/login");
			expect(location.searchParams.get("next")).toBe(path);
			expect(response.headers()["x-robots-tag"]).toContain("noindex");
			expect(response.headers()["cache-control"]).toContain("no-store");
			expect(await response.text()).not.toMatch(/wai-shell|Nexus|Private workspace/);
		});
	}

	for (const path of API) {
		test(`${path} answers 401 and can't be cached`, async ({ request }) => {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status()).toBe(401);
			expect(await response.json()).toEqual({ error: "Sign in first." });
			expect(response.headers()["cache-control"]).toBe("private, no-store");
			expect(response.headers()["x-robots-tag"]).toContain("noindex");
		});
	}

	test("an address ending in an image extension doesn't pick up the site's public image caching", async ({
		request,
	}) => {
		for (const path of ["/worldwide-ai/screenshot.png", "/api/worldwide-ai/anything.png"]) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.headers()["cache-control"] ?? "", path).not.toContain("public");
		}
	});

	test("a visitor following a link lands on the sign-in page, not an error", async ({ page }) => {
		await page.goto("/worldwide-ai/team");
		// Sign-in sits behind the store's age check, so a first-time visitor is taken there on the way. Either way the
		// address to come back to is carried along, and nothing of the workspace is shown.
		const landed = new URL(page.url());
		expect(["/login", "/age-verification"]).toContain(landed.pathname);
		expect(decodeURIComponent(decodeURIComponent(landed.search))).toContain("/worldwide-ai/team");
		await expect(page.locator("body")).not.toContainText("Worldwide AI");
		await expect(page.locator("body")).not.toContainText("Private workspace");
	});
});

test.describe("the public site is unaffected", () => {
	for (const viewport of [
		{ name: "desktop", width: 1440, height: 900 },
		{ name: "phone", width: 390, height: 844 },
	]) {
		test(`the contact page still renders at ${viewport.name} width with no link to the workspace`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await page.goto("/contact-us");
			await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
			expect(await page.locator('a[href*="/worldwide-ai"]').count()).toBe(0);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			expect(overflow).toBeLessThanOrEqual(1);
		});
	}
});
