import { describe, expect, it, vi } from "vitest";
import {
	ETRANSFER_DEFAULT_DEADLINE_HOURS,
	allowedETransferCountries,
	allowedETransferCurrencies,
	buildETransferEmail,
	isETransferCountry,
	needsCurrencyConversionNote,
	buildETransferMetadata,
	eTransferReference,
	isETransferCurrency,
	parseETransferDetails,
	readETransferConfig,
} from "./etransfer";

const ON = { NEXT_PUBLIC_ENABLE_ETRANSFER: "true", ETRANSFER_EMAIL: "pay@example.com" };

describe("readETransferConfig", () => {
	it("is off unless enabled and given a valid recipient", () => {
		expect(readETransferConfig({})).toBeNull();
		expect(readETransferConfig({ ETRANSFER_EMAIL: "pay@example.com" })).toBeNull();
		expect(readETransferConfig({ NEXT_PUBLIC_ENABLE_ETRANSFER: "true" })).toBeNull();
		expect(readETransferConfig({ ...ON, ETRANSFER_EMAIL: "not-an-email" })).toBeNull();
	});

	it("accepts either the public or the server-side flag", () => {
		expect(
			readETransferConfig({ ENABLE_ETRANSFER: "true", ETRANSFER_EMAIL: "pay@example.com" }),
		).not.toBeNull();
	});

	it("defaults the deadline and rejects nonsense values", () => {
		expect(readETransferConfig(ON)?.deadlineHours).toBe(ETRANSFER_DEFAULT_DEADLINE_HOURS);
		expect(readETransferConfig({ ...ON, ETRANSFER_DEADLINE_HOURS: "24" })?.deadlineHours).toBe(24);
		expect(readETransferConfig({ ...ON, ETRANSFER_DEADLINE_HOURS: "-5" })?.deadlineHours).toBe(
			ETRANSFER_DEFAULT_DEADLINE_HOURS,
		);
		expect(readETransferConfig({ ...ON, ETRANSFER_DEADLINE_HOURS: "abc" })?.deadlineHours).toBe(
			ETRANSFER_DEFAULT_DEADLINE_HOURS,
		);
	});

	it("needs both a security question and answer, otherwise treats the account as auto-deposit", () => {
		expect(readETransferConfig({ ...ON, ETRANSFER_SECURITY_QUESTION: "Colour?" })).toMatchObject({
			question: null,
			answer: null,
		});
		expect(
			readETransferConfig({
				...ON,
				ETRANSFER_SECURITY_QUESTION: "Colour?",
				ETRANSFER_SECURITY_ANSWER: "blue",
			}),
		).toMatchObject({ question: "Colour?", answer: "blue" });
	});
});

describe("e-Transfer metadata round trip", () => {
	const now = new Date("2026-10-04T12:00:00.000Z");

	it("stores the method, recipient and deadline on the order", () => {
		const config = readETransferConfig({ ...ON, ETRANSFER_DEADLINE_HOURS: "48" })!;
		const metadata = buildETransferMetadata(config, now);
		expect(metadata.find((m) => m.key === "payment_method")?.value).toBe("etransfer");

		const details = parseETransferDetails(metadata)!;
		expect(details.recipient).toBe("pay@example.com");
		expect(details.dueAt?.toISOString()).toBe("2026-10-06T12:00:00.000Z");
		expect(details.question).toBeNull();
	});

	it("round-trips a security question", () => {
		const config = readETransferConfig({
			...ON,
			ETRANSFER_SECURITY_QUESTION: "Colour?",
			ETRANSFER_SECURITY_ANSWER: "blue",
		})!;
		expect(parseETransferDetails(buildETransferMetadata(config, now))).toMatchObject({
			question: "Colour?",
			answer: "blue",
		});
	});

	it("does not treat other orders as e-Transfer orders", () => {
		expect(parseETransferDetails(null)).toBeNull();
		expect(parseETransferDetails([])).toBeNull();
		expect(parseETransferDetails([{ key: "payment_method", value: "card" }])).toBeNull();
		// Marked as e-Transfer but nothing to pay to: ignore rather than show a broken card.
		expect(parseETransferDetails([{ key: "payment_method", value: "etransfer" }])).toBeNull();
	});

	it("ignores a malformed deadline instead of failing", () => {
		const details = parseETransferDetails([
			{ key: "payment_method", value: "etransfer" },
			{ key: "etransfer_recipient", value: "pay@example.com" },
			{ key: "etransfer_due_at", value: "not a date" },
		]);
		expect(details?.dueAt).toBeNull();
	});
});

describe("buildETransferEmail", () => {
	const details = {
		recipient: "pay@example.com",
		dueAt: new Date("2026-10-06T18:00:00.000Z"),
		question: null,
		answer: null,
	};

	it("tells the customer exactly what to send, to whom, and with what message", () => {
		const email = buildETransferEmail({ orderNumber: 1234, amount: 99.5, currency: "CAD", details });
		expect(email.subject).toBe("Order #1234 — send your Interac e-Transfer");
		expect(email.text).toContain("pay@example.com");
		expect(email.text).toContain("Order #1234");
		expect(email.text).toMatch(/\$99\.50/);
		expect(email.text).toContain("auto-deposit");
		expect(email.html).toContain("pay@example.com");
	});

	it("includes the security question when the account uses one", () => {
		const email = buildETransferEmail({
			orderNumber: 7,
			amount: 10,
			currency: "CAD",
			details: { ...details, question: "Colour?", answer: "blue" },
		});
		expect(email.text).toContain("Colour?");
		expect(email.text).toContain("blue");
		expect(email.text).not.toContain("auto-deposit");
	});

	it("escapes customer-visible HTML and links back to the order", () => {
		const email = buildETransferEmail({
			orderNumber: 1,
			amount: 1,
			currency: "CAD",
			details: { ...details, question: "<b>Q</b>", answer: "a&b" },
			orderUrl: "https://shop.example/checkout/complete?order=abc",
		});
		expect(email.html).toContain("&lt;b&gt;Q&lt;/b&gt;");
		expect(email.html).toContain("a&amp;b");
		expect(email.html).toContain("https://shop.example/checkout/complete?order=abc");
	});
});

describe("helpers", () => {
	it("builds the payment reference", () => {
		expect(eTransferReference("42")).toBe("Order #42");
	});

	it("only offers e-Transfer in Canadian dollars by default", () => {
		expect(isETransferCurrency("CAD")).toBe(true);
		expect(isETransferCurrency("cad")).toBe(true);
		expect(isETransferCurrency("USD")).toBe(false);
		expect(isETransferCurrency(undefined)).toBe(false);
	});

	it("lets the merchant opt other currencies in, and asks the customer to send the CAD equivalent", () => {
		vi.stubEnv("NEXT_PUBLIC_ETRANSFER_CURRENCIES", "cad, usd, nonsense, 12");
		try {
			expect(allowedETransferCurrencies()).toEqual(["CAD", "USD"]);
			expect(isETransferCurrency("USD")).toBe(true);
			expect(isETransferCurrency("EUR")).toBe(false);
			expect(needsCurrencyConversionNote("USD")).toBe(true);
			expect(needsCurrencyConversionNote("CAD")).toBe(false);

			const email = buildETransferEmail({
				orderNumber: 5,
				amount: 20,
				currency: "USD",
				details: { recipient: "pay@example.com", dueAt: null, question: null, answer: null },
			});
			expect(email.text).toContain("CAD equivalent");
			expect(email.html).toContain("CAD equivalent");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("offers e-Transfer to customers in Canada only, unless the merchant opts countries in", () => {
		expect(isETransferCountry("CA")).toBe(true);
		expect(isETransferCountry("ca")).toBe(true);
		expect(isETransferCountry("US")).toBe(false);
		// No address yet: don't hide the option; the server re-checks the real address.
		expect(isETransferCountry(undefined)).toBe(true);

		vi.stubEnv("NEXT_PUBLIC_ETRANSFER_COUNTRIES", "ca, us, nope");
		try {
			expect(allowedETransferCountries()).toEqual(["CA", "US"]);
			expect(isETransferCountry("US")).toBe(true);
			expect(isETransferCountry("GB")).toBe(false);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("falls back to CAD when the currency list is empty or invalid", () => {
		vi.stubEnv("NEXT_PUBLIC_ETRANSFER_CURRENCIES", "  ,x");
		try {
			expect(allowedETransferCurrencies()).toEqual(["CAD"]);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
