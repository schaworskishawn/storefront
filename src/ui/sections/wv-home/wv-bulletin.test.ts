import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Bulletin } from "@/lib/bulletin/bulletin";
import { BulletinCard } from "./wv-bulletin";

const bulletin: Bulletin = {
	author: "Shawn",
	paragraphs: ["Restocked the Geek Bar range today.", "New e-liquids land Friday."],
	updatedOn: "2026-10-06",
};

const render = (value: Bulletin, bcp47 = "en-CA") =>
	renderToStaticMarkup(createElement(BulletinCard, { bulletin: value, bcp47 }));
const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

describe("BulletinCard", () => {
	it("says who it is from, with the message and the real date", () => {
		const html = render(bulletin);
		const shown = text(html);
		expect(shown).toContain("From the desk of");
		expect(shown).toContain("Shawn");
		expect(shown).toContain("Restocked the Geek Bar range today.");
		expect(shown).toContain("New e-liquids land Friday.");
		expect(shown).toContain("Updated October 6, 2026");
		expect(html).toContain('<time dateTime="2026-10-06">');
	});

	it("labels the panel for people who can't see it", () => {
		expect(render(bulletin)).toContain('aria-label="From the desk of Shawn"');
	});

	it("shows the date in the language of the site", () => {
		expect(text(render(bulletin, "fr-CA"))).toContain("6 octobre 2026");
	});

	it("leaves out the updated line when there is no date, rather than making one up", () => {
		const shown = text(render({ ...bulletin, updatedOn: null }));
		expect(shown).not.toContain("Updated");
		expect(shown).toContain("Restocked");
	});

	it("shows text as text: markup typed into the message is not run", () => {
		const html = render({ ...bulletin, paragraphs: ["<img src=x onerror=alert(1)> hi"] });
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});
});
