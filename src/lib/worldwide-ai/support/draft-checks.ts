/**
 * Checks on a draft that are done by plain code, not by asking the model to check itself. They look for figures, links and
 * promises in the draft that nothing in the approved sources or the customer's own message supports, because that is what an
 * invented policy looks like. They only ever add warnings for the reviewer to see; the reviewer decides.
 */

const normalize = (text: string) => text.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");

const FIGURE =
	/\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d+\s*(?:business\s+|working\s+|calendar\s+)?(?:days?|weeks?|hours?|months?|years?)\b/gi;
const URL_PATTERN = /https?:\/\/[^\s)>\]"']+|\bwww\.[^\s)>\]"']+/gi;

/** Words that, in a reply, commit the business to something. Each must be in a source or the customer's message to go unflagged. */
const PROMISES = [
	"refund",
	"replacement",
	"compensation",
	"guarantee",
	"free shipping",
	"discount",
	"coupon",
	"store credit",
];

export type DraftCheckInput = {
	body: string;
	/** The text of every approved source the draft was given. */
	sourceTexts: string[];
	/** The customer's subject and message. */
	caseText: string;
};

export function checkDraftBody({ body, sourceTexts, caseText }: DraftCheckInput): string[] {
	const warnings: string[] = [];
	const haystack = normalize([...sourceTexts, caseText].join("\n"));
	const supported = (needle: string) => haystack.includes(normalize(needle).replace(/\s+/g, " ").trim());

	const seenFigures = new Set<string>();
	for (const match of body.matchAll(FIGURE)) {
		const figure = match[0].trim();
		const key = normalize(figure).replace(/\s/g, "");
		// (Not `Set.has`: this repo types it as a type guard, which would narrow `key` to never after the `continue`.)
		const figuresBefore = seenFigures.size;
		seenFigures.add(key);
		if (seenFigures.size === figuresBefore) continue;
		// "30 days" should match "30 days" and "30-day"; compare the digits and unit stem.
		const compact = haystack.replace(/\s/g, "").replace(/-/g, "");
		const stem = key.endsWith("s") ? key.slice(0, -1) : key;
		if (!compact.includes(key) && !compact.includes(stem))
			warnings.push(
				`The draft mentions "${figure}", which isn't in any approved source or in the customer's message.`,
			);
	}

	const seenUrls = new Set<string>();
	for (const match of body.matchAll(URL_PATTERN)) {
		const url = match[0].replace(/[.,;:!?]+$/, "");
		const urlsBefore = seenUrls.size;
		seenUrls.add(url);
		if (seenUrls.size === urlsBefore) continue;
		if (!supported(url)) warnings.push(`The draft links to ${url}, which isn't in any approved source.`);
	}

	const lowered = normalize(body);
	for (const word of PROMISES) {
		if (lowered.includes(word) && !supported(word))
			warnings.push(
				`The draft mentions "${word}", but no approved source or part of the customer's message does.`,
			);
	}
	return warnings;
}
