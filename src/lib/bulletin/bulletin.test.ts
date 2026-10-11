import { describe, expect, it } from "vitest";
import { parseEditorJSToParagraphs } from "@/lib/editorjs";
import { BULLETIN_MAX_CHARS, BULLETIN_MAX_PARAGRAPHS, shorten, toBulletin } from "./bulletin";

const editorJs = (...paragraphs: string[]) =>
	JSON.stringify({ blocks: paragraphs.map((text) => ({ type: "paragraph", data: { text } })) });

describe("parseEditorJSToParagraphs", () => {
	it("returns each paragraph's text with the formatting tags stripped", () => {
		expect(parseEditorJSToParagraphs(editorJs("Hello <b>there</b>", "Second&nbsp;one"))).toEqual([
			"Hello there",
			"Second one",
		]);
	});

	it("turns the entities EditorJS writes back into characters, without decoding twice", () => {
		expect(parseEditorJSToParagraphs(editorJs("Fish &amp; chips &quot;to go&quot; &#39;s&#39;"))).toEqual([
			"Fish & chips \"to go\" 's'",
		]);
		expect(parseEditorJSToParagraphs(editorJs("a &amp;lt; b"))).toEqual(["a &lt; b"]);
	});

	it("drops empty paragraphs and collapses stray whitespace", () => {
		expect(parseEditorJSToParagraphs(editorJs("  spaced   out  ", "", "   "))).toEqual(["spaced out"]);
	});

	it("removes scripts completely", () => {
		expect(parseEditorJSToParagraphs(editorJs("safe <script>alert(1)</script>text"))).toEqual(["safe text"]);
	});

	it("treats anything that isn't EditorJS as plain text split on blank lines", () => {
		expect(parseEditorJSToParagraphs("One line\n\nAnother <i>one</i>")).toEqual(["One line", "Another one"]);
	});

	it("copes with nothing", () => {
		expect(parseEditorJSToParagraphs(null)).toEqual([]);
		expect(parseEditorJSToParagraphs("")).toEqual([]);
		expect(parseEditorJSToParagraphs(JSON.stringify({ blocks: [{ type: "image", data: {} }] }))).toEqual([]);
	});
});

describe("shorten", () => {
	it("leaves short text alone", () => {
		expect(shorten("short enough", 50)).toBe("short enough");
	});

	it("cuts long text at a word and adds an ellipsis", () => {
		const out = shorten("one two three four five six seven eight", 20);
		expect(out.endsWith("…")).toBe(true);
		expect(out.length).toBeLessThanOrEqual(20);
		expect(out).not.toMatch(/\s…$/);
		expect("one two three four five six seven eight".startsWith(out.slice(0, -1))).toBe(true);
	});
});

describe("toBulletin", () => {
	const page = {
		title: "Shawn",
		content: editorJs("Restocked the Geek Bar range today."),
		isPublished: true,
		publishedAt: "2026-10-06T14:30:00+00:00",
		created: "2026-09-01T10:00:00+00:00",
	};

	it("turns a published page into who it is from, the message, and the date", () => {
		expect(toBulletin(page)).toEqual({
			author: "Shawn",
			paragraphs: ["Restocked the Geek Bar range today."],
			updatedOn: "2026-10-06",
		});
	});

	it("falls back to the date the page was created when it has no publication date", () => {
		expect(toBulletin({ ...page, publishedAt: null })?.updatedOn).toBe("2026-09-01");
	});

	it("says no date rather than inventing one", () => {
		expect(toBulletin({ ...page, publishedAt: null, created: null })?.updatedOn).toBeNull();
		expect(toBulletin({ ...page, publishedAt: "not a date", created: "also not" })?.updatedOn).toBeNull();
	});

	it("gives nothing for a missing, unpublished or empty page", () => {
		expect(toBulletin(null)).toBeNull();
		expect(toBulletin(undefined)).toBeNull();
		expect(toBulletin({ ...page, isPublished: false })).toBeNull();
		expect(toBulletin({ ...page, title: "   " })).toBeNull();
		expect(toBulletin({ ...page, content: editorJs("", " ") })).toBeNull();
		expect(toBulletin({ ...page, content: null })).toBeNull();
	});

	it("keeps it short: a few paragraphs, a few hundred characters", () => {
		const many = toBulletin({ ...page, content: editorJs("a one", "b two", "c three", "d four", "e five") });
		expect(many?.paragraphs).toHaveLength(BULLETIN_MAX_PARAGRAPHS);
		const long = toBulletin({ ...page, content: editorJs("word ".repeat(400)) });
		const total = long?.paragraphs.join("").length ?? 0;
		expect(total).toBeLessThanOrEqual(BULLETIN_MAX_CHARS);
		expect(long?.paragraphs.at(-1)?.endsWith("…")).toBe(true);
	});

	it("stops adding paragraphs once the length is used up", () => {
		const first = "x".repeat(BULLETIN_MAX_CHARS - 10);
		const result = toBulletin({
			...page,
			content: editorJs(first, "second paragraph that does not fit whole"),
		});
		expect(result?.paragraphs.join("").length).toBeLessThanOrEqual(BULLETIN_MAX_CHARS);
		expect(result?.paragraphs[0]).toBe(first);
	});
});
