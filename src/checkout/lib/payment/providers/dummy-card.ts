import { digitsOnly, luhnValid, validateCard } from "@/checkout/components/payment/wvpay/card-validation";

/**
 * Test credit card behaviour for the Saleor Dummy Payment gateway, in the spirit of the dummy app itself: no real processor,
 * no real money. The card form on a test checkout reads these numbers to decide whether the simulated charge succeeds or is
 * declined, so declines and their messages can be tried without any payment account.
 *
 * Only ever used where the dummy gateway is allowed (see `isDummyPaymentAllowed`) — it must never be switched on for a store
 * taking real orders, because it approves nearly any card number.
 */

export const TEST_CARD_NUMBERS = {
	approved: "4242424242424242",
	declined: "4000000000000002",
	insufficientFunds: "4000000000009995",
	incorrectCvc: "4000000000000127",
} as const;

export type DeclineReason = "declined" | "insufficientFunds" | "incorrectCvc";

export const DECLINE_MESSAGES: Record<DeclineReason, string> = {
	declined: "Your card was declined.",
	insufficientFunds: "Your card has insufficient funds.",
	incorrectCvc: "Your card's security code is incorrect.",
};

/** Shown when the test card form is submitted with a card that isn't well-formed. */
export const DUMMY_CARD_INVALID_MESSAGE =
	"Enter a valid test card — for example 4242 4242 4242 4242 with any future expiry and any 3-digit security code.";

export type TestCardOutcome =
	| { kind: "approved" }
	| { kind: "declined"; reason: DeclineReason; message: string };

const DECLINES: ReadonlyArray<{ number: string; reason: DeclineReason }> = [
	{ number: TEST_CARD_NUMBERS.declined, reason: "declined" },
	{ number: TEST_CARD_NUMBERS.insufficientFunds, reason: "insufficientFunds" },
	{ number: TEST_CARD_NUMBERS.incorrectCvc, reason: "incorrectCvc" },
];

/** The special decline numbers fail; any other well-formed (Luhn-valid) number is approved. */
export function evaluateTestCard(number: string): TestCardOutcome {
	const digits = digitsOnly(number);
	const decline = DECLINES.find((entry) => entry.number === digits);
	return decline
		? { kind: "declined", reason: decline.reason, message: DECLINE_MESSAGES[decline.reason] }
		: { kind: "approved" };
}

export type DummyCardEntry = { number: string; expiry: string; cvv: string };

export type DummyCardCheck =
	| { ok: true; outcome: TestCardOutcome }
	/** The card isn't well-formed, so nothing should be sent to Saleor. */
	| { ok: false; message: string };

export function checkDummyCardEntry(entry: DummyCardEntry, now: Date = new Date()): DummyCardCheck {
	if (!luhnValid(entry.number) || Object.keys(validateCard(entry, now)).length > 0) {
		return { ok: false, message: DUMMY_CARD_INVALID_MESSAGE };
	}
	return { ok: true, outcome: evaluateTestCard(entry.number) };
}

/** What the card form pre-fills, so a test checkout still completes with a single click on Pay. */
export const DEFAULT_DUMMY_CARD: DummyCardEntry = {
	number: "4242 4242 4242 4242",
	expiry: "12 / 34",
	cvv: "123",
};

/**
 * The card currently typed into the test card form. The checkout's Pay button lives outside that form (the dummy gateway
 * is submit-mode "server"), so the form leaves its entry here for `executeDummyPayment` to read — the same module-level
 * coordination the other payment modules use. Null until a form has been shown. It is not cleared when the form unmounts:
 * Pay replaces the whole step with the "processing" screen before the card is read.
 */
let currentEntry: DummyCardEntry | null = null;

export function setDummyCardEntry(entry: DummyCardEntry | null): void {
	currentEntry = entry;
}

export function getDummyCardEntry(): DummyCardEntry | null {
	return currentEntry;
}
