import { parseEditorJSToParagraphs } from "@/lib/editorjs";

/**
 * The owner's bulletin: a short "From the desk of…" message, with the date it was last updated. It is one Saleor page, edited in
 * the Dashboard under Models: the page's title is who it is from, its content is the message, and its publication date is
 * the "updated" date. Nothing here is made up: a page that is missing, unpublished or empty gives no panel at all, and a page
 * without a usable date gives a panel without an "updated" line.
 */

/** The Saleor page slug the bulletin is read from. */
export const BULLETIN_SLUG = "owner-bulletin";

/** The bulletin stays short: at most this many paragraphs, and about this many characters in all. */
export const BULLETIN_MAX_PARAGRAPHS = 3;
export const BULLETIN_MAX_CHARS = 600;

export type Bulletin = {
	/** Who it is from: "From the desk of {author}". */
	author: string;
	paragraphs: string[];
	/** `YYYY-MM-DD`, or null when the page has no usable date. */
	updatedOn: string | null;
};

/** What the bulletin reads off the Saleor page. */
export type BulletinPage = {
	title?: string | null;
	content?: string | null;
	isPublished?: boolean | null;
	publishedAt?: string | null;
	created?: string | null;
};

/** The date part of an ISO timestamp, if it is a real date. */
function dayOf(value: string | null | undefined): string | null {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

/** Cuts text to `limit` characters at a word boundary, with an ellipsis; text already short enough is untouched. */
export function shorten(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit - 1);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function toBulletin(page: BulletinPage | null | undefined): Bulletin | null {
	if (!page || page.isPublished === false) return null;
	const author = (page.title ?? "").trim();
	if (!author) return null;

	const paragraphs: string[] = [];
	let used = 0;
	for (const paragraph of parseEditorJSToParagraphs(page.content).slice(0, BULLETIN_MAX_PARAGRAPHS)) {
		const room = BULLETIN_MAX_CHARS - used;
		if (room <= 0) break;
		const text = shorten(paragraph, room);
		paragraphs.push(text);
		used += text.length;
		if (text !== paragraph) break;
	}
	if (paragraphs.length === 0) return null;

	return { author, paragraphs, updatedOn: dayOf(page.publishedAt) ?? dayOf(page.created) };
}
