import { describe, expect, it } from "vitest";
import { describePayIn4 } from "./wv-payments-copy";
import { readInstallmentConfig } from "@/lib/installments/plan";

describe("describePayIn4", () => {
	it("describes the plan from its settings", () => {
		const config = readInstallmentConfig({
			enabled: "true",
			channels: "cad",
			minTotal: "75",
			maxTotal: "1500",
		});
		expect(describePayIn4(config)).toBe(
			"Pay in 4: a quarter at checkout, then 3 equal payments every 14 days, with no interest or fees. Your order ships once the last payment is in. For orders from $75 to $1,500.",
		);
	});

	it("uses the default order limits when none are set", () => {
		expect(describePayIn4(readInstallmentConfig({ enabled: "true", channels: "cad" }))).toContain(
			"For orders from $50 to $1,000.",
		);
	});

	it("says nothing while the plan is switched off", () => {
		expect(describePayIn4(readInstallmentConfig({ enabled: "false", channels: "cad" }))).toBeNull();
		expect(describePayIn4(readInstallmentConfig({}))).toBeNull();
	});

	it("says nothing while the plan is offered in no channel", () => {
		expect(describePayIn4(readInstallmentConfig({ enabled: "true", channels: " , " }))).toBeNull();
	});
});
