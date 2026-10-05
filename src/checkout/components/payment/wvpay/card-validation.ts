/**
 * Card-entry helpers for the Authorize.net form. These only catch typos before a round trip — the processor is the real
 * authority — and they never see or keep card data beyond the form's own state.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export const digitsOnly = (value: string): string => value.replace(/\D/g, "");

export function detectBrand(number: string): CardBrand {
	const digits = digitsOnly(number);
	if (/^4/.test(digits)) return "visa";
	if (/^3[47]/.test(digits)) return "amex";
	if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "mastercard";
	if (/^(6011|65|64[4-9])/.test(digits)) return "discover";
	return "unknown";
}

/** Groups digits for display: 4-6-5 for American Express, 4-4-4-4 otherwise. Caps at 19 digits. */
export function formatCardNumber(input: string): string {
	const digits = digitsOnly(input).slice(0, 19);
	const groups = detectBrand(digits) === "amex" ? [4, 6, 5] : [4, 4, 4, 4, 3];
	const parts: string[] = [];
	let index = 0;
	for (const size of groups) {
		if (index >= digits.length) break;
		parts.push(digits.slice(index, index + size));
		index += size;
	}
	return parts.join(" ");
}

export function luhnValid(number: string): boolean {
	const digits = digitsOnly(number);
	if (digits.length < 12 || digits.length > 19) return false;
	let sum = 0;
	let double = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let n = Number(digits[i]);
		if (double) {
			n *= 2;
			if (n > 9) n -= 9;
		}
		sum += n;
		double = !double;
	}
	return sum % 10 === 0;
}

/** "1228" → "12 / 28", while typing. A first digit above 1 is taken as a single-digit month ("4" → "04"). */
export function formatExpiry(input: string): string {
	let digits = digitsOnly(input).slice(0, 4);
	if (digits.length === 1 && Number(digits) > 1) digits = `0${digits}`;
	if (digits.length <= 2) return digits;
	return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

export type ParsedExpiry = { month: string; year: string };

/** "12 / 28", "12/2028", "1228" → { month: "12", year: "2028" }; null if it isn't a real month/year. */
export function parseExpiry(input: string): ParsedExpiry | null {
	const digits = digitsOnly(input);
	if (digits.length !== 4 && digits.length !== 6) return null;
	const month = Number(digits.slice(0, 2));
	if (month < 1 || month > 12) return null;
	const year = digits.length === 4 ? 2000 + Number(digits.slice(2)) : Number(digits.slice(2));
	return { month: String(month).padStart(2, "0"), year: String(year) };
}

/** A card is good through the END of its expiry month. */
export function isExpiryInFuture(expiry: ParsedExpiry, now: Date = new Date()): boolean {
	const endOfMonth = new Date(Number(expiry.year), Number(expiry.month), 1);
	return endOfMonth.getTime() > now.getTime();
}

export function cvvLengthFor(brand: CardBrand): number {
	return brand === "amex" ? 4 : 3;
}

export type CardErrorKey = "numberInvalid" | "expiryInvalid" | "expiryPast" | "cvvInvalid";
export type CardErrors = Partial<Record<"number" | "expiry" | "cvv", CardErrorKey>>;

export function validateCard(
	input: { number: string; expiry: string; cvv: string },
	now: Date = new Date(),
): CardErrors {
	const errors: CardErrors = {};
	const brand = detectBrand(input.number);

	if (!luhnValid(input.number)) errors.number = "numberInvalid";

	const expiry = parseExpiry(input.expiry);
	if (!expiry) errors.expiry = "expiryInvalid";
	else if (!isExpiryInFuture(expiry, now)) errors.expiry = "expiryPast";

	const cvv = digitsOnly(input.cvv);
	if (cvv.length !== cvvLengthFor(brand) || cvv !== input.cvv.trim()) errors.cvv = "cvvInvalid";

	return errors;
}
