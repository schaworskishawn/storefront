/**
 * Money is a whole number of minor units (cents) together with its currency, always. An amount without a currency is not
 * representable here, and amounts in different currencies are never added: both are errors, not conversions. All arithmetic
 * is integer arithmetic, so there is no floating-point drift.
 */

export type Money = { amountMinor: number; currency: string };

/** Decimal places for the currencies whose exponent isn't 2. Anything not listed has two. */
const EXPONENTS: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, CLP: 0, BHD: 3, KWD: 3, JOD: 3 };

export const currencyExponent = (currency: string): number => EXPONENTS[currency] ?? 2;

const CURRENCY = /^[A-Z]{3}$/;

export class MoneyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MoneyError";
	}
}

export function makeMoney(amountMinor: number, currency: string): Money {
	if (!CURRENCY.test(currency)) throw new MoneyError(`"${currency}" is not an ISO 4217 currency code.`);
	if (!Number.isSafeInteger(amountMinor))
		throw new MoneyError("Money must be a whole number of minor units.");
	return { amountMinor, currency };
}

export const isMoney = (value: unknown): value is Money => {
	const m = value as Money | null;
	return (
		!!m &&
		typeof m === "object" &&
		Number.isSafeInteger(m.amountMinor) &&
		typeof m.currency === "string" &&
		CURRENCY.test(m.currency)
	);
};

export function addMoney(a: Money, b: Money): Money {
	if (a.currency !== b.currency) throw new MoneyError(`Can't add ${a.currency} to ${b.currency}.`);
	return makeMoney(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
	if (a.currency !== b.currency) throw new MoneyError(`Can't subtract ${b.currency} from ${a.currency}.`);
	return makeMoney(a.amountMinor - b.amountMinor, a.currency);
}

/** Sums a list; an empty list needs the currency spelled out because zero of "what" matters. */
export function sumMoney(items: readonly Money[], currency: string): Money {
	return items.reduce((total, item) => addMoney(total, item), makeMoney(0, currency));
}

/** Parses "12.34" (or "12", "-0.5") into minor units without going through a float. Rejects more decimals than the currency has. */
export function parseMoney(text: string, currency: string): Money {
	const exponent = currencyExponent(currency);
	const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
	if (!match) throw new MoneyError(`"${text}" is not an amount.`);
	const [, sign, whole, fraction = ""] = match;
	if (fraction.length > exponent)
		throw new MoneyError(`${currency} has ${exponent} decimal places; "${text}" has more.`);
	const minor = Number(whole + fraction.padEnd(exponent, "0"));
	return makeMoney(sign ? -minor : minor, currency);
}

/** "CAD 12.34", with the currency code always shown so two currencies are never confused. */
export function formatMoney(money: Money): string {
	const exponent = currencyExponent(money.currency);
	const negative = money.amountMinor < 0;
	const digits = String(Math.abs(money.amountMinor)).padStart(exponent + 1, "0");
	const whole = exponent === 0 ? digits : digits.slice(0, -exponent);
	const fraction = exponent === 0 ? "" : `.${digits.slice(-exponent)}`;
	return `${negative ? "-" : ""}${money.currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
}
