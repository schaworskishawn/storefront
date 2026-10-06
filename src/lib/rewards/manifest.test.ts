import { describe, expect, it } from "vitest";
import {
	REWARDS_APP_ID,
	REWARDS_APP_PERMISSIONS,
	REWARDS_WEBHOOK_DEFINITIONS,
	buildRewardsAppManifest,
} from "./manifest";

const manifest = buildRewardsAppManifest("https://shop.example/");

describe("rewards app manifest", () => {
	it("is its own app, separate from the payments app", () => {
		expect(manifest.id).toBe(REWARDS_APP_ID);
		expect(REWARDS_APP_ID).not.toBe("worldwide-vapor.payments");
	});

	it("asks only for what it needs: orders and gift cards, and nothing to do with payments", () => {
		expect(manifest.permissions).toEqual(["MANAGE_ORDERS", "MANAGE_GIFT_CARD"]);
		expect(REWARDS_APP_PERMISSIONS).not.toContain("HANDLE_PAYMENTS");
	});

	it("points the install check and every webhook at this site", () => {
		expect(manifest.appUrl).toBe("https://shop.example");
		expect(manifest.tokenTargetUrl).toBe("https://shop.example/api/rewards-app/register");
		for (const hook of manifest.webhooks)
			expect(hook.targetUrl).toMatch(/^https:\/\/shop\.example\/api\/rewards-app\/webhooks\//);
	});

	it("listens for an order being paid in full, cancelled and fully refunded, all in the background", () => {
		expect(manifest.webhooks.map((hook) => hook.asyncEvents)).toEqual([
			["ORDER_FULLY_PAID"],
			["ORDER_CANCELLED"],
			["ORDER_FULLY_REFUNDED"],
		]);
		for (const hook of manifest.webhooks) {
			expect(hook).not.toHaveProperty("syncEvents");
			expect(hook.isActive).toBe(true);
		}
	});

	it("asks for nothing but the order's id, since the app re-reads the order and never trusts the payload", () => {
		for (const { query } of REWARDS_WEBHOOK_DEFINITIONS) {
			expect(query).toContain("order { id }");
			expect(query).not.toMatch(/total|amount|email|user/);
		}
	});

	it("gives every webhook its own address", () => {
		expect(new Set(manifest.webhooks.map((hook) => hook.targetUrl)).size).toBe(manifest.webhooks.length);
	});
});
