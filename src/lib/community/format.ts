/**
 * A message's text as a list of pieces to render. Rendering from pieces (never from HTML) means nothing a member types can
 * become markup. Supported: **bold**, *italic*, `code`, links, and @nickname.
 */

export type Piece =
	| { kind: "text"; text: string }
	| { kind: "bold"; text: string }
	| { kind: "italic"; text: string }
	| { kind: "code"; text: string }
	| { kind: "mention"; text: string }
	| { kind: "link"; text: string; href: string };

const PATTERN =
	/(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(https?:\/\/[^\s<]+|\bwww\.[^\s<]+)|((?<![\p{L}\p{N}_@])@[\p{L}\p{N}][\p{L}\p{N}_.-]{1,19})/giu;

const TRAILING = /[.,!?:;)\]}'"]+$/;

/** A link's address, or null when it isn't a plain web address. */
function safeHref(raw: string): string | null {
	const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
	try {
		const url = new URL(candidate);
		return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

export function parseMessage(text: string): Piece[] {
	const pieces: Piece[] = [];
	let last = 0;
	const push = (piece: Piece) => {
		const previous = pieces[pieces.length - 1];
		if (piece.kind === "text" && previous?.kind === "text") previous.text += piece.text;
		else pieces.push(piece);
	};

	for (const match of text.matchAll(PATTERN)) {
		const start = match.index ?? 0;
		let token = match[0];
		if (start > last) push({ kind: "text", text: text.slice(last, start) });

		if (match[1]) push({ kind: "code", text: token.slice(1, -1) });
		else if (match[2]) push({ kind: "bold", text: token.slice(2, -2) });
		else if (match[3]) push({ kind: "italic", text: token.slice(1, -1) });
		else if (match[4]) {
			// Punctuation that ends a sentence isn't part of the address.
			const trailing = TRAILING.exec(token)?.[0] ?? "";
			token = trailing ? token.slice(0, -trailing.length) : token;
			const href = safeHref(token);
			if (href) {
				push({ kind: "link", text: token, href });
				if (trailing) push({ kind: "text", text: trailing });
			} else push({ kind: "text", text: token + trailing });
		} else push({ kind: "mention", text: token });

		last = start + match[0].length;
	}
	if (last < text.length) push({ kind: "text", text: text.slice(last) });
	return pieces;
}
