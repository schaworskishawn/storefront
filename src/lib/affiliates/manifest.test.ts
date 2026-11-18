import { describe, expect, it } from "vitest";
import { REWARDS_APP_ID } from "@/lib/rewards/manifest";
import { AFFILIATE_APP_ID, buildAffiliateAppManifest } from "./manifest";

const manifest = buildAffiliateAppManifest("https://shop.example/");

describe("affiliates app manifest", () => {
	it("is its own app, separate from the payments and rewards apps", () => {
		expect(manifest.id).toBe(AFFILIATE_APP_ID);
		expect(AFFILIATE_APP_ID).not.toBe(REWARDS_APP_ID);
		expect(AFFILIATE_APP_ID).not.toBe("worldwide-vapor.payments");
	});

	it("asks only for orders and customers, nothing to do with payments, gift cards or discounts", () => {
		expect(manifest.permissions).toEqual(["MANAGE_ORDERS", "MANAGE_USERS"]);
	});

	it("points the install check, the admin page and every webhook at this site", () => {
		expect(manifest.appUrl).toBe("https://shop.example/affiliate-admin");
		expect(manifest.tokenTargetUrl).toBe("https://shop.example/api/affiliate-app/register");
		for (const hook of manifest.webhooks)
			expect(hook.targetUrl).toMatch(/^https:\/\/shop\.example\/api\/affiliate-app\/webhooks\//);
	});

	it("listens for an order being paid in full, cancelled and fully refunded, selecting only its id", () => {
		expect(manifest.webhooks.map((hook) => hook.asyncEvents)).toEqual([
			["ORDER_FULLY_PAID"],
			["ORDER_CANCELLED"],
			["ORDER_FULLY_REFUNDED"],
		]);
		for (const hook of manifest.webhooks) {
			expect(hook.isActive).toBe(true);
			expect(hook.query.replace(/\s+/g, " ")).toMatch(/order \{ id \}/);
		}
	});
});
