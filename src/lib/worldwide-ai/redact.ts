/**
 * Redaction for anything that leaves the application's own tables: traces, logs, task events. It removes what is plainly
 * personal or secret (emails, phone numbers, card numbers, keys and tokens). It cannot find a name or a street address in
 * free text, which is why raw prompts and outputs are not recorded unless it is switched on (see config.ts).
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi;
const PREFIXED_KEY = /\b(?:sk|pk|rk|lf|whsec|xox[abp]|ghp|gho|glpat|tr)[-_][A-Za-z0-9_-]{12,}\b/gi;
const LONG_SECRET =
	/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9+/_-])/g;
const LONG_HEX = /\b[a-f0-9]{32,}\b/gi;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /(?<![\w.])\+?\d[\d\s().-]{8,}\d(?![\w])/g;

/** Luhn check, so a 16-digit order number isn't mistaken for a card. */
export function passesLuhn(digits: string): boolean {
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
	return digits.length >= 13 && sum % 10 === 0;
}

export function redactText(text: string): string {
	return (
		text
			.replace(JWT, "[token]")
			.replace(BEARER, "Bearer [token]")
			.replace(EMAIL, "[email]")
			.replace(PREFIXED_KEY, "[secret]")
			.replace(CARD_CANDIDATE, (match) => (passesLuhn(match.replace(/\D/g, "")) ? "[card]" : match))
			.replace(LONG_HEX, "[secret]")
			// Our own ids are UUIDs: they identify records and are kept so history stays readable.
			.replace(LONG_SECRET, (match) => (UUID.test(match) ? match : "[secret]"))
			.replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 10 ? "[phone]" : match))
	);
}

/**
 * Keys whose values are never kept, whatever they contain: a field called "password" or "apiKey", or ending in a capitalised
 * Secret, Token, Password… (accessToken). Counts like "inputTokens" are not secrets and are kept.
 */
const SECRET_KEY_WHOLE =
	/^(pass(word|wd)?|secret|token|authorization|api[_-]?key|cookie|set-cookie|credentials?|private[_-]?key|service[_-]?key|client[_-]?secret)$/i;
const SECRET_KEY_SUFFIX =
	/([_-](password|secret|token|api[_-]?key|authorization|cookie)|(Password|Secret|Token|ApiKey|Authorization|Cookie|Credentials?|PrivateKey|ServiceKey))$/;
const isSecretKey = (key: string) => SECRET_KEY_WHOLE.test(key) || SECRET_KEY_SUFFIX.test(key);

/** Hashes and digests are fingerprints, not secrets, and a later check needs them intact. */
const HASH_KEY = /(sha256|sha1|hash|digest|checksum)$/i;

/** Redacts every string inside an object, array or primitive (depth-limited, cycle-safe), and drops secret-named fields. */
export function redactDeep<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
	if (typeof value === "string") return redactText(value) as T;
	if (value === null || typeof value !== "object") return value;
	if (depth > 8 || seen.has(value as object)) return "[truncated]" as T;
	seen.add(value as object);
	if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1, seen)) as T;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, item]) => [
			key,
			isSecretKey(key)
				? "[redacted]"
				: typeof item === "string" && HASH_KEY.test(key)
					? item
					: redactDeep(item, depth + 1, seen),
		]),
	) as T;
}

/** A short, redacted preview of long text for task history: enough to recognise it, not enough to leak it. */
export function previewText(text: string, max = 160): string {
	const flat = redactText(text).replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
