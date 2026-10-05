import { afterEach, describe, expect, it } from "vitest";
import { luhnValid } from "@/checkout/components/payment/wvpay/card-validation";
import {
	DECLINE_MESSAGES,
	DEFAULT_DUMMY_CARD,
	DUMMY_CARD_INVALID_MESSAGE,
	TEST_CARD_NUMBERS,
	checkDummyCardEntry,
	evaluateTestCard,
	getDummyCardEntry,
	setDummyCardEntry,
} from "./dummy-card";

afterEach(() => {
	setDummyCardEntry(null);
});

const NOW = new Date("2026-10-05T12:00:00Z");

describe("test card numbers", () => {
	it("are all well-formed, so the card form accepts them", () => {
		for (const number of Object.values(TEST_CARD_NUMBERS)) {
			expect(luhnValid(number)).toBe(true);
		}
	});
});

describe("evaluateTestCard", () => {
	it("approves the standard test card and any other well-formed number", () => {
		expect(evaluateTestCard(TEST_CARD_NUMBERS.approved)).toEqual({ kind: "approved" });
		expect(evaluateTestCard("5555 5555 5555 4444")).toEqual({ kind: "approved" });
	});

	it("declines the special numbers with their reasons, however they are typed", () => {
		expect(evaluateTestCard("4000 0000 0000 0002")).toEqual({
			kind: "declined",
			reason: "declined",
			message: DECLINE_MESSAGES.declined,
		});
		expect(evaluateTestCard(TEST_CARD_NUMBERS.insufficientFunds)).toMatchObject({
			kind: "declined",
			reason: "insufficientFunds",
		});
		expect(evaluateTestCard("4000-0000-0000-0127")).toMatchObject({
			kind: "declined",
			reason: "incorrectCvc",
		});
	});
});

describe("checkDummyCardEntry", () => {
	it("accepts the pre-filled default card", () => {
		expect(checkDummyCardEntry(DEFAULT_DUMMY_CARD, NOW)).toEqual({ ok: true, outcome: { kind: "approved" } });
	});

	it("reports a decline for a well-formed decline card", () => {
		const result = checkDummyCardEntry({ ...DEFAULT_DUMMY_CARD, number: "4000 0000 0000 0002" }, NOW);
		expect(result).toMatchObject({ ok: true, outcome: { kind: "declined", reason: "declined" } });
	});

	it("rejects anything malformed before it could reach Saleor", () => {
		const invalid = { ok: false, message: DUMMY_CARD_INVALID_MESSAGE };
		expect(checkDummyCardEntry({ ...DEFAULT_DUMMY_CARD, number: "4242 4242 4242 4241" }, NOW)).toEqual(
			invalid,
		);
		expect(checkDummyCardEntry({ ...DEFAULT_DUMMY_CARD, number: "" }, NOW)).toEqual(invalid);
		expect(checkDummyCardEntry({ ...DEFAULT_DUMMY_CARD, expiry: "01 / 20" }, NOW)).toEqual(invalid);
		expect(checkDummyCardEntry({ ...DEFAULT_DUMMY_CARD, expiry: "13 / 30" }, NOW)).toEqual(invalid);
		expect(checkDummyCardEntry({ ...DEFAULT_DUMMY_CARD, cvv: "12" }, NOW)).toEqual(invalid);
	});
});

describe("card entry store", () => {
	it("holds the card from the form until it is cleared", () => {
		expect(getDummyCardEntry()).toBeNull();
		setDummyCardEntry(DEFAULT_DUMMY_CARD);
		expect(getDummyCardEntry()).toEqual(DEFAULT_DUMMY_CARD);
		setDummyCardEntry(null);
		expect(getDummyCardEntry()).toBeNull();
	});
});
