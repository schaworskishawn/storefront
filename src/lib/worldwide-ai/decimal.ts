/**
 * Exact decimal arithmetic for quantities, densities, rates and money. Values are whole numbers of 10^-12, held as BigInt, so
 * there is no binary floating point anywhere in a calculation: 0.1 + 0.2 is 0.3, and a result is only rounded where the
 * caller says so (for display, or to a documented weighing or currency precision).
 */

const PLACES = 12;
const UNIT = 10n ** BigInt(PLACES);

export type Dec = { readonly v: bigint };

export class DecimalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DecimalError";
	}
}

const PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** Reads a plain decimal ("12", "-0.125", "1,250.50"). Anything else (an exponent, a unit, a blank) is refused. */
export function dec(input: string | number | bigint | Dec): Dec {
	if (typeof input === "object") return input;
	if (typeof input === "bigint") return { v: input * UNIT };
	if (typeof input === "number") {
		if (!Number.isFinite(input)) throw new DecimalError("Not a finite number.");
		// A JavaScript number is read through its text at twelve places, which drops the binary noise (0.1 + 0.2 reads as 0.3).
		return dec(numberText(input));
	}
	const text = input.trim().replace(/(?<=\d),(?=\d{3}(\D|$))/g, "");
	const match = PATTERN.exec(text);
	if (!match) throw new DecimalError(`"${input}" isn't a plain decimal number.`);
	const [, sign, whole, fraction = ""] = match;
	if (fraction.length > PLACES) throw new DecimalError(`"${input}" has more than ${PLACES} decimal places.`);
	const magnitude = BigInt(whole) * UNIT + BigInt(fraction.padEnd(PLACES, "0") || "0");
	return { v: sign === "-" ? -magnitude : magnitude };
}

function numberText(value: number): string {
	const text = value.toFixed(PLACES);
	return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** `dec`, but a value that can't be read gives null instead of throwing. Blank text is null too. */
export function tryDec(input: unknown): Dec | null {
	if (input === null || input === undefined) return null;
	if (typeof input === "string" && input.trim() === "") return null;
	if (typeof input !== "string" && typeof input !== "number" && typeof input !== "bigint") return null;
	try {
		return dec(input);
	} catch {
		return null;
	}
}

export const ZERO: Dec = { v: 0n };
export const ONE: Dec = { v: UNIT };

export const add = (a: Dec, b: Dec): Dec => ({ v: a.v + b.v });
export const sub = (a: Dec, b: Dec): Dec => ({ v: a.v - b.v });
export const neg = (a: Dec): Dec => ({ v: -a.v });
export const abs = (a: Dec): Dec => ({ v: a.v < 0n ? -a.v : a.v });
export const cmp = (a: Dec, b: Dec): -1 | 0 | 1 => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0);
export const eq = (a: Dec, b: Dec): boolean => a.v === b.v;
export const lt = (a: Dec, b: Dec): boolean => a.v < b.v;
export const lte = (a: Dec, b: Dec): boolean => a.v <= b.v;
export const gt = (a: Dec, b: Dec): boolean => a.v > b.v;
export const gte = (a: Dec, b: Dec): boolean => a.v >= b.v;
export const isZero = (a: Dec): boolean => a.v === 0n;
export const isNegative = (a: Dec): boolean => a.v < 0n;
export const minDec = (a: Dec, b: Dec): Dec => (a.v <= b.v ? a : b);
export const maxDec = (a: Dec, b: Dec): Dec => (a.v >= b.v ? a : b);
export const sum = (values: readonly Dec[]): Dec => ({ v: values.reduce((total, d) => total + d.v, 0n) });

/** Divides rounding half away from zero at the last kept place. */
function divRound(numerator: bigint, denominator: bigint): bigint {
	if (denominator === 0n) throw new DecimalError("Division by zero.");
	const negative = numerator < 0n !== denominator < 0n;
	const n = numerator < 0n ? -numerator : numerator;
	const d = denominator < 0n ? -denominator : denominator;
	const quotient = (n * 2n + d) / (d * 2n);
	return negative ? -quotient : quotient;
}

export const mul = (a: Dec, b: Dec): Dec => ({ v: divRound(a.v * b.v, UNIT) });
export const div = (a: Dec, b: Dec): Dec => ({ v: divRound(a.v * UNIT, b.v) });

/** Rounds to a number of decimal places, half away from zero (the usual rule for money and weighing instructions). */
export function round(a: Dec, places: number): Dec {
	if (!Number.isInteger(places) || places < 0 || places > PLACES)
		throw new DecimalError("Places must be between 0 and 12.");
	const step = 10n ** BigInt(PLACES - places);
	return { v: divRound(a.v, step) * step };
}

/** Text for a value. With `places`, rounded and padded to exactly that many; without, trailing zeros are dropped. */
export function toText(a: Dec, places?: number): string {
	const value = places === undefined ? a : round(a, places);
	const negative = value.v < 0n;
	const magnitude = negative ? -value.v : value.v;
	const whole = (magnitude / UNIT).toString();
	let fraction = (magnitude % UNIT).toString().padStart(PLACES, "0");
	fraction = places === undefined ? fraction.replace(/0+$/, "") : fraction.slice(0, places);
	const text = fraction ? `${whole}.${fraction}` : whole;
	return negative && magnitude !== 0n ? `-${text}` : text;
}

/** For charts and sorting only. Never feed the result back into a calculation. */
export const toNumber = (a: Dec): number => Number(toText(a));

/** A percentage of `part` in `whole`, to two places, or null when there is nothing to divide by. */
export function percentOf(part: Dec, whole: Dec): string | null {
	if (isZero(whole)) return null;
	return toText(mul(div(part, whole), dec(100)), 2);
}
