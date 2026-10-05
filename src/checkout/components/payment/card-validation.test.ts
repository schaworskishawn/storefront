import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	type CardErrorKey,
	cvvLengthFor,
	detectBrand,
	formatCardNumber,
	formatExpiry,
	isExpiryInFuture,
	luhnValid,
	parseExpiry,
	validateCard,
} from "./card-validation";

const NOW = new Date("2026-10-04T12:00:00");

describe("validation messages", () => {
	// The test-card form shows `checkout.payment.cardErrors.<key>`; a missing key only fails at runtime, so check every locale.
	const keys: CardErrorKey[] = ["numberInvalid", "expiryInvalid", "expiryPast", "cvvInvalid"];
	const dir = new URL("../../../../messages/", import.meta.url);

	it.each(readdirSync(dir).filter((file) => file.endsWith(".json")))(
		"%s has a message for each error",
		(file) => {
			const messages = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as {
				checkout: { payment: { cardErrors?: Record<string, unknown> } };
			};
			for (const key of keys) {
				expect(typeof messages.checkout.payment.cardErrors?.[key]).toBe("string");
			}
		},
	);
});

describe("detectBrand", () => {
	it("recognises the major brands", () => {
		expect(detectBrand("4111 1111 1111 1111")).toBe("visa");
		expect(detectBrand("5555555555554444")).toBe("mastercard");
		expect(detectBrand("2223003122003222")).toBe("mastercard");
		expect(detectBrand("378282246310005")).toBe("amex");
		expect(detectBrand("6011111111111117")).toBe("discover");
		expect(detectBrand("9999")).toBe("unknown");
	});
});

describe("formatCardNumber", () => {
	it("groups in fours, and 4-6-5 for Amex", () => {
		expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
		expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
		expect(formatCardNumber("41111")).toBe("4111 1");
	});

	it("strips junk and caps the length", () => {
		expect(formatCardNumber("4111-1111 abcd 1111 1111 9999 9999")).toBe("4111 1111 1111 1111 999");
	});
});

describe("luhnValid", () => {
	it("accepts real test numbers and rejects typos", () => {
		expect(luhnValid("4111 1111 1111 1111")).toBe(true);
		expect(luhnValid("378282246310005")).toBe(true);
		expect(luhnValid("4111 1111 1111 1112")).toBe(false);
		expect(luhnValid("1234")).toBe(false);
		expect(luhnValid("")).toBe(false);
	});
});

describe("expiry", () => {
	it("formats as you type", () => {
		expect(formatExpiry("1")).toBe("1");
		expect(formatExpiry("4")).toBe("04");
		expect(formatExpiry("12")).toBe("12");
		expect(formatExpiry("122")).toBe("12 / 2");
		expect(formatExpiry("1228")).toBe("12 / 28");
		expect(formatExpiry("12289999")).toBe("12 / 28");
	});

	it("parses two- and four-digit years", () => {
		expect(parseExpiry("12 / 28")).toEqual({ month: "12", year: "2028" });
		expect(parseExpiry("1/2028")).toBeNull();
		expect(parseExpiry("01/2028")).toEqual({ month: "01", year: "2028" });
		expect(parseExpiry("13/28")).toBeNull();
		expect(parseExpiry("00/28")).toBeNull();
		expect(parseExpiry("12")).toBeNull();
	});

	it("treats a card as valid through the end of its month", () => {
		expect(isExpiryInFuture({ month: "10", year: "2026" }, NOW)).toBe(true);
		expect(isExpiryInFuture({ month: "09", year: "2026" }, NOW)).toBe(false);
		expect(isExpiryInFuture({ month: "12", year: "2026" }, NOW)).toBe(true);
	});
});

describe("validateCard", () => {
	const good = { number: "4111 1111 1111 1111", expiry: "12 / 28", cvv: "123" };

	it("passes a good card", () => {
		expect(validateCard(good, NOW)).toEqual({});
	});

	it("flags each bad field separately", () => {
		expect(validateCard({ ...good, number: "4111 1111 1111 1112" }, NOW)).toEqual({
			number: "numberInvalid",
		});
		expect(validateCard({ ...good, expiry: "13 / 28" }, NOW)).toEqual({ expiry: "expiryInvalid" });
		expect(validateCard({ ...good, expiry: "01 / 25" }, NOW)).toEqual({ expiry: "expiryPast" });
		expect(validateCard({ ...good, cvv: "12" }, NOW)).toEqual({ cvv: "cvvInvalid" });
		expect(validateCard({ ...good, cvv: "12a" }, NOW)).toEqual({ cvv: "cvvInvalid" });
	});

	it("wants a 4-digit code on American Express and 3 elsewhere", () => {
		expect(cvvLengthFor("amex")).toBe(4);
		expect(cvvLengthFor("visa")).toBe(3);
		expect(validateCard({ number: "378282246310005", expiry: "12 / 28", cvv: "1234" }, NOW)).toEqual({});
		expect(validateCard({ number: "378282246310005", expiry: "12 / 28", cvv: "123" }, NOW)).toEqual({
			cvv: "cvvInvalid",
		});
	});
});
