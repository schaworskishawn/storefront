import { describe, expect, it } from "vitest";
import { AFFILIATE_APP_ID } from "@/lib/affiliates/manifest";
import { REWARDS_APP_ID } from "@/lib/rewards/manifest";
import { EMAILS_APP_ID, buildEmailsAppManifest } from "./manifest";

const manifest = buildEmailsAppManifest("https://shop.example/");

describe("emails app manifest", () => {
	it("is its own app, separate from the payments, rewards and affiliates apps", () => {
		expect(manifest.id).toBe(EMAILS_APP_ID);
		expect([REWARDS_APP_ID, AFFILIATE_APP_ID, "worldwide-vapor.payments"]).not.toContain(EMAILS_APP_ID);
	});

	it("asks only for what the account events need", () => {
		expect(manifest.permissions).toEqual(["MANAGE_USERS", "MANAGE_STAFF"]);
	});

	it("listens for the three account emails, each with the link's token and the person", () => {
		expect(manifest.webhooks.map((hook) => hook.asyncEvents)).toEqual([
			["ACCOUNT_CONFIRMATION_REQUESTED"],
			["ACCOUNT_SET_PASSWORD_REQUESTED"],
			["STAFF_SET_PASSWORD_REQUESTED"],
		]);
		for (const hook of manifest.webhooks) {
			expect(hook.targetUrl).toMatch(/^https:\/\/shop\.example\/api\/emails-app\/webhooks\//);
			expect(hook.query).toMatch(/redirectUrl\s+token\s+user \{ email firstName isConfirmed \}/);
		}
	});
});
