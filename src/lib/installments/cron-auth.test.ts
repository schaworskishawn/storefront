import { describe, expect, it } from "vitest";
import { MIN_CRON_SECRET_LENGTH, isAuthorizedCronRequest } from "./cron-auth";

const secret = "a-long-enough-cron-secret-123";

describe("isAuthorizedCronRequest", () => {
	it("accepts the right bearer token", () => {
		expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
	});

	it("rejects a wrong, truncated, extended or differently-cased token", () => {
		expect(isAuthorizedCronRequest("Bearer nope", secret)).toBe(false);
		expect(isAuthorizedCronRequest(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false);
		expect(isAuthorizedCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
		expect(isAuthorizedCronRequest(`Bearer ${secret.toUpperCase()}`, secret)).toBe(false);
	});

	it("rejects a missing header or one that isn't a bearer token", () => {
		for (const header of [null, undefined, "", secret, `Basic ${secret}`, "Bearer", "Bearer "]) {
			expect(isAuthorizedCronRequest(header, secret)).toBe(false);
		}
	});

	it("never authorises when no secret is set, so the endpoint can't run open", () => {
		expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
		expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
		expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
	});

	it("refuses a secret that is too short, even if it matches", () => {
		const weak = "x".repeat(MIN_CRON_SECRET_LENGTH - 1);
		expect(isAuthorizedCronRequest(`Bearer ${weak}`, weak)).toBe(false);
		const ok = "x".repeat(MIN_CRON_SECRET_LENGTH);
		expect(isAuthorizedCronRequest(`Bearer ${ok}`, ok)).toBe(true);
	});
});
