import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_FAQS, parseProductFaq } from "./product-faq";

describe("parseProductFaq", () => {
	it("reads a JSON array of questions and answers", () => {
		expect(
			parseProductFaq(JSON.stringify([{ q: "Is a battery included?", a: "No, this is the wrap only." }])),
		).toEqual([{ q: "Is a battery included?", a: "No, this is the wrap only." }]);
	});

	it("returns nothing for empty, missing or malformed values", () => {
		expect(parseProductFaq(undefined)).toEqual([]);
		expect(parseProductFaq(null)).toEqual([]);
		expect(parseProductFaq("  ")).toEqual([]);
		expect(parseProductFaq("not json")).toEqual([]);
		expect(parseProductFaq('{"q":"a","a":"b"}')).toEqual([]);
	});

	it("skips entries without both a question and an answer, and repeats", () => {
		const raw = JSON.stringify([
			{ q: "One?", a: "Yes." },
			{ q: "Two?" },
			{ a: "Orphan answer." },
			{ q: "  ", a: "Blank question." },
			{ q: 3, a: "Not text." },
			null,
			"text",
			{ q: "One?", a: "Again." },
		]);
		expect(parseProductFaq(raw)).toEqual([{ q: "One?", a: "Yes." }]);
	});

	it("tidies whitespace", () => {
		expect(
			parseProductFaq(JSON.stringify([{ q: "  Why\n re-wrap? ", a: "A  torn\twrap can short. " }])),
		).toEqual([{ q: "Why re-wrap?", a: "A torn wrap can short." }]);
	});

	it(`keeps at most ${MAX_PRODUCT_FAQS}`, () => {
		const many = Array.from({ length: MAX_PRODUCT_FAQS + 5 }, (_, i) => ({ q: `Q${i}?`, a: `A${i}.` }));
		expect(parseProductFaq(JSON.stringify(many))).toHaveLength(MAX_PRODUCT_FAQS);
	});
});
