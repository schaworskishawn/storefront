import { describe, expect, it } from "vitest";
import { getCheckoutSteps, getCurrentStepFromParams } from "./flow";

describe("getCurrentStepFromParams", () => {
	it("stays on payment when returning from Stripe redirect", () => {
		const params = new URLSearchParams("checkout=abc&processingPayment=true&payment_intent=pi_123");

		expect(getCurrentStepFromParams(params, true).id).toBe("PAYMENT");
	});

	it("defaults to contact when step is missing", () => {
		const params = new URLSearchParams("checkout=abc");

		expect(getCurrentStepFromParams(params, true).id).toBe("INFO");
	});
});

describe("getCheckoutSteps — identity verification step", () => {
	it("is omitted by default (env-gated, off in tests)", () => {
		const steps = getCheckoutSteps(true);

		expect(steps.map((s) => s.id)).toEqual(["INFO", "SHIPPING", "PAYMENT"]);
	});

	it("slots in after shipping, before payment, when explicitly required", () => {
		const steps = getCheckoutSteps(true, undefined, true);

		expect(steps.map((s) => s.id)).toEqual(["INFO", "SHIPPING", "IDENTITY", "PAYMENT"]);
		expect(steps.find((s) => s.id === "IDENTITY")?.slug).toBe("identity");
	});

	it("slots in after information when shipping isn't required", () => {
		const steps = getCheckoutSteps(false, undefined, true);

		expect(steps.map((s) => s.id)).toEqual(["INFO", "IDENTITY", "PAYMENT"]);
	});

	it("keeps 1-based indices contiguous with the extra step present", () => {
		const steps = getCheckoutSteps(true, undefined, true);

		expect(steps.map((s) => s.index)).toEqual([1, 2, 3, 4]);
	});
});
