import { describe, expect, it } from "vitest";
import {
	DEFAULT_INSTALLMENT_MAX_TOTAL,
	DEFAULT_INSTALLMENT_MIN_TOTAL,
	INSTALLMENT_PSP_PREFIX,
	addDays,
	buildInstallmentPlan,
	checkInstallmentEligibility,
	installmentTransactionId,
	isInstallmentPspReference,
	laterPaymentDates,
	readInstallmentConfig,
	type InstallmentConfig,
} from "./plan";

describe("buildInstallmentPlan", () => {
	it("splits an even total into four equal payments", () => {
		const plan = buildInstallmentPlan(100);
		expect(plan).toMatchObject({ deposit: 25, installment: 25, total: 100 });
	});

	it("puts leftover cents on the deposit, so the four payments add up exactly", () => {
		const plan = buildInstallmentPlan(100.03);
		expect(plan).toMatchObject({ depositCents: 2503, installmentCents: 2500 });
		expect(plan!.depositCents + 3 * plan!.installmentCents).toBe(plan!.totalCents);
	});

	it("always sums to the total and keeps the deposit within 3 cents of a quarter", () => {
		for (let cents = 4; cents <= 5000; cents += 1) {
			const plan = buildInstallmentPlan(cents / 100)!;
			expect(plan.depositCents + 3 * plan.installmentCents).toBe(cents);
			expect(plan.depositCents - plan.installmentCents).toBeGreaterThanOrEqual(0);
			expect(plan.depositCents - plan.installmentCents).toBeLessThanOrEqual(3);
		}
	});

	it("is not thrown off by floating point (e.g. 19.99, 33.33)", () => {
		expect(buildInstallmentPlan(19.99)).toMatchObject({
			totalCents: 1999,
			installmentCents: 499,
			depositCents: 502,
		});
		expect(buildInstallmentPlan(33.33)).toMatchObject({
			totalCents: 3333,
			installmentCents: 833,
			depositCents: 834,
		});
	});

	it("refuses a total that can't be split", () => {
		expect(buildInstallmentPlan(0)).toBeNull();
		expect(buildInstallmentPlan(-10)).toBeNull();
		expect(buildInstallmentPlan(Number.NaN)).toBeNull();
		expect(buildInstallmentPlan(Number.POSITIVE_INFINITY)).toBeNull();
		// Under four cents, a quarter rounds to nothing.
		expect(buildInstallmentPlan(0.03)).toBeNull();
	});
});

describe("laterPaymentDates", () => {
	it("is two, four and six weeks after the order", () => {
		expect(laterPaymentDates(new Date("2026-10-06T15:30:00Z"))).toEqual([
			"2026-10-20",
			"2026-11-03",
			"2026-11-17",
		]);
	});

	it("counts calendar days across month and year ends", () => {
		expect(laterPaymentDates(new Date("2026-12-20T00:00:00Z"))).toEqual([
			"2027-01-03",
			"2027-01-17",
			"2027-01-31",
		]);
		expect(addDays(new Date("2028-02-20T12:00:00Z"), 14)).toBe("2028-03-05");
	});

	it("uses the UTC date, whatever the time of day", () => {
		expect(addDays(new Date("2026-10-06T23:59:59Z"), 1)).toBe("2026-10-07");
		expect(addDays(new Date("2026-10-06T00:00:00Z"), 1)).toBe("2026-10-07");
	});
});

describe("readInstallmentConfig", () => {
	it("is off, with no channels and the default limits, when nothing is set", () => {
		expect(readInstallmentConfig({})).toEqual({
			enabled: false,
			channels: [],
			minTotal: DEFAULT_INSTALLMENT_MIN_TOTAL,
			maxTotal: DEFAULT_INSTALLMENT_MAX_TOTAL,
		});
	});

	it("reads the flag, a channel list and limits", () => {
		expect(
			readInstallmentConfig({
				enabled: "true",
				channels: " cad , default-channel,, ",
				minTotal: "75",
				maxTotal: "600.5",
			}),
		).toEqual({ enabled: true, channels: ["cad", "default-channel"], minTotal: 75, maxTotal: 600.5 });
	});

	it("falls back to the defaults for limits that aren't positive numbers", () => {
		const config = readInstallmentConfig({ minTotal: "abc", maxTotal: "-5" });
		expect(config.minTotal).toBe(DEFAULT_INSTALLMENT_MIN_TOTAL);
		expect(config.maxTotal).toBe(DEFAULT_INSTALLMENT_MAX_TOTAL);
	});

	it("only treats the literal string 'true' as on", () => {
		expect(readInstallmentConfig({ enabled: "1" }).enabled).toBe(false);
		expect(readInstallmentConfig({ enabled: "TRUE" }).enabled).toBe(false);
	});
});

describe("checkInstallmentEligibility", () => {
	const config: InstallmentConfig = { enabled: true, channels: ["cad"], minTotal: 50, maxTotal: 1000 };
	const ok = { total: 120, currency: "CAD", channel: "cad" };

	it("allows an order in a listed channel, a supported currency and range", () => {
		expect(checkInstallmentEligibility(ok, config)).toEqual({ ok: true });
		expect(checkInstallmentEligibility({ ...ok, currency: "cad" }, config)).toEqual({ ok: true });
		expect(checkInstallmentEligibility({ ...ok, total: 50 }, config)).toEqual({ ok: true });
		expect(checkInstallmentEligibility({ ...ok, total: 1000 }, config)).toEqual({ ok: true });
	});

	it("says why it refuses", () => {
		expect(checkInstallmentEligibility(ok, { ...config, enabled: false })).toEqual({
			ok: false,
			reason: "disabled",
		});
		expect(checkInstallmentEligibility({ ...ok, channel: "default-channel" }, config)).toEqual({
			ok: false,
			reason: "channel",
		});
		expect(checkInstallmentEligibility({ ...ok, channel: null }, config)).toEqual({
			ok: false,
			reason: "channel",
		});
		expect(checkInstallmentEligibility({ ...ok, currency: "EUR" }, config)).toEqual({
			ok: false,
			reason: "currency",
		});
		expect(checkInstallmentEligibility({ ...ok, total: 49.99 }, config)).toEqual({
			ok: false,
			reason: "amount",
		});
		expect(checkInstallmentEligibility({ ...ok, total: 1000.01 }, config)).toEqual({
			ok: false,
			reason: "amount",
		});
		expect(checkInstallmentEligibility({ ...ok, total: Number.NaN }, config)).toEqual({
			ok: false,
			reason: "amount",
		});
	});

	it("offers it nowhere until a channel is listed", () => {
		expect(checkInstallmentEligibility(ok, { ...config, channels: [] })).toEqual({
			ok: false,
			reason: "channel",
		});
	});
});

describe("installment pspReference", () => {
	it("recognises the deposit's prefix and reads the transaction id out of it", () => {
		expect(isInstallmentPspReference(`${INSTALLMENT_PSP_PREFIX}60123`)).toBe(true);
		expect(installmentTransactionId("inst:60123")).toBe("60123");
	});

	it("rejects anything else, including a card or crypto reference and a bare prefix", () => {
		for (const value of ["60123", "crypto:abc", "", null, undefined, "inst:"]) {
			expect(installmentTransactionId(value)).toBeNull();
		}
		expect(isInstallmentPspReference("60123")).toBe(false);
		expect(isInstallmentPspReference(null)).toBe(false);
	});
});
