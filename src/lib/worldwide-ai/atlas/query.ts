/**
 * Turns free text (a customer's message) into a Postgres full-text query that matches a document containing ANY of its
 * meaningful words, ranked by how many it has. Words are reduced to plain a-z0-9 first, so nothing a customer writes can
 * reach the query syntax.
 */

const STOPWORDS = new Set(
	(
		"a about above after again all also am an and any are as at be because been before being below between both but by " +
		"can could did do does doing down during each few for from further had has have having he her here hers him his how " +
		"i if in into is it its just me more most my myself no nor not now of off on once only or other our ours out over own " +
		"same she should so some such than that the their theirs them then there these they this those through to too under " +
		"until up very was we were what when where which while who whom why will with would you your yours hello hi thanks " +
		"thank please dear regards order orders ordered ordering item items product products vape vapes vaping worldwide"
	).split(" "),
);

const MAX_TERMS = 24;

export function searchTerms(text: string): string[] {
	const folded = text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
	const seen = new Set<string>();
	for (const match of folded.matchAll(/[a-z0-9]+/g)) {
		const word = match[0];
		if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
		seen.add(word);
		if (seen.size >= MAX_TERMS) break;
	}
	return [...seen];
}

/** The text for `to_tsquery('english', …)`, or null when there is nothing to search for. */
export function buildOrQuery(text: string): string | null {
	const terms = searchTerms(text);
	return terms.length ? terms.join(" | ") : null;
}
