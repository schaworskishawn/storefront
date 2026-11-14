import { describe, expect, it } from "vitest";
import { parseMessage } from "./format";

describe("parseMessage", () => {
	it("keeps plain text as one piece", () => {
		expect(parseMessage("just words")).toEqual([{ kind: "text", text: "just words" }]);
	});

	it("reads bold, italic and code", () => {
		expect(parseMessage("a **b** *c* `d` e")).toEqual([
			{ kind: "text", text: "a " },
			{ kind: "bold", text: "b" },
			{ kind: "text", text: " " },
			{ kind: "italic", text: "c" },
			{ kind: "text", text: " " },
			{ kind: "code", text: "d" },
			{ kind: "text", text: " e" },
		]);
	});

	it("doesn't format inside code", () => {
		expect(parseMessage("`**not bold**`")).toEqual([{ kind: "code", text: "**not bold**" }]);
	});

	it("turns web addresses into links without the sentence's punctuation", () => {
		expect(parseMessage("see https://example.com/a?b=1, ok")).toEqual([
			{ kind: "text", text: "see " },
			{ kind: "link", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
			{ kind: "text", text: ", ok" },
		]);
	});

	it("links a bare www address over https", () => {
		const [piece] = parseMessage("www.example.com");
		expect(piece).toEqual({ kind: "link", text: "www.example.com", href: "https://www.example.com/" });
	});

	it("never makes a link out of another scheme", () => {
		const pieces = parseMessage("javascript:alert(1) and data:text/html,hi");
		expect(pieces.every((p) => p.kind === "text")).toBe(true);
	});

	it("keeps markup as text", () => {
		expect(parseMessage('<img src=x onerror="alert(1)">')).toEqual([
			{ kind: "text", text: '<img src=x onerror="alert(1)">' },
		]);
	});

	it("marks @mentions but not email addresses", () => {
		expect(parseMessage("hi @Cloud_9 and me@site.com")).toEqual([
			{ kind: "text", text: "hi " },
			{ kind: "mention", text: "@Cloud_9" },
			{ kind: "text", text: " and me@site.com" },
		]);
	});

	it("leaves a lone asterisk or backtick alone", () => {
		expect(parseMessage("2 * 3 and a ` b")).toEqual([{ kind: "text", text: "2 * 3 and a ` b" }]);
	});
});
