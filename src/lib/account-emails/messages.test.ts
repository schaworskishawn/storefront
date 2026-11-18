import { describe, expect, it } from "vitest";
import { accountEmail, actionLink } from "./messages";

describe("actionLink", () => {
	it("adds the email and token to the page the request asked to come back to, keeping its own query", () => {
		const link = actionLink(
			"https://www.worldwidevapor.com/en/default-channel/login?confirm=1",
			"neo+1@example.com",
			"abc-123",
		);
		const url = new URL(link ?? "");
		expect(url.pathname).toBe("/en/default-channel/login");
		expect(url.searchParams.get("confirm")).toBe("1");
		expect(url.searchParams.get("email")).toBe("neo+1@example.com");
		expect(url.searchParams.get("token")).toBe("abc-123");
	});

	it("refuses anything that isn't a web address", () => {
		expect(actionLink("javascript:alert(1)", "a@b.co", "t")).toBeNull();
		expect(actionLink("not a url", "a@b.co", "t")).toBeNull();
	});
});

describe("accountEmail", () => {
	it("writes each email with its link, in text and as a button", () => {
		const email = accountEmail("reset-password", {
			firstName: "Neo",
			link: "https://shop.example/reset?email=a&token=b",
		});
		expect(email.subject).toBe("Reset your Worldwide Vapor password");
		expect(email.text).toContain("Hi Neo,");
		expect(email.text).toContain("https://shop.example/reset?email=a&token=b");
		expect(email.html).toContain('href="https://shop.example/reset?email=a&amp;token=b"');
		expect(accountEmail("confirm-account", { firstName: "", link: "https://x.example" }).text).toContain(
			"Hi there,",
		);
		expect(
			accountEmail("staff-set-password", { firstName: "A", link: "https://x.example" }).subject,
		).toContain("staff password");
	});

	it("escapes what it puts into the HTML", () => {
		const email = accountEmail("confirm-account", {
			firstName: "<b>Neo</b>",
			link: 'https://x.example/?a="q"',
		});
		expect(email.html).not.toContain("<b>Neo</b>");
		expect(email.html).toContain("&lt;b&gt;Neo&lt;/b&gt;");
		expect(email.html).not.toContain('a="q"');
	});
});
