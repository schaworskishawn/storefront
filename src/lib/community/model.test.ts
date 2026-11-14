import { describe, expect, it } from "vitest";
import { CHANNELS, DEFAULT_CHANNEL_ID, channelById } from "./channels";
import {
	GROUP_WINDOW_MS,
	MAX_LINKS,
	MESSAGE_MAX,
	avatarColor,
	canModerate,
	canPostIn,
	checkNickname,
	cleanMessage,
	countLinks,
	excerpt,
	initialOf,
	layoutFeed,
	mentions,
	messageProblem,
	nameKey,
	previousDayKey,
	timeFromId,
	type ChatMessage,
} from "./model";

const message = (over: Partial<ChatMessage> & Pick<ChatMessage, "id" | "at">): ChatMessage => ({
	authorId: "a",
	name: "Ava",
	role: "member",
	text: "hi",
	reply: null,
	reactions: {},
	...over,
});

describe("channels", () => {
	it("has a default channel anyone can post in", () => {
		const channel = channelById(DEFAULT_CHANNEL_ID);
		expect(channel).toBeDefined();
		expect(channel?.staffOnly).toBeFalsy();
	});

	it("uses unique, URL-safe ids", () => {
		const ids = CHANNELS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
	});

	it("finds nothing for an unknown channel", () => {
		expect(channelById("nope")).toBeUndefined();
		expect(channelById(null)).toBeUndefined();
	});

	it("keeps the rules and announcements to the team", () => {
		expect(canPostIn(channelById("rules")!, "member")).toBe(false);
		expect(canPostIn(channelById("announcements")!, "mod")).toBe(true);
		expect(canPostIn(channelById("general")!, "member")).toBe(true);
	});
});

describe("canModerate", () => {
	it("lets staff act on moderators and members, never other staff", () => {
		expect(canModerate("staff", "mod")).toBe(true);
		expect(canModerate("staff", "member")).toBe(true);
		expect(canModerate("staff", "staff")).toBe(false);
	});
	it("lets moderators act only on members", () => {
		expect(canModerate("mod", "member")).toBe(true);
		expect(canModerate("mod", "mod")).toBe(false);
		expect(canModerate("mod", "staff")).toBe(false);
	});
	it("gives members no powers", () => {
		expect(canModerate("member", "member")).toBe(false);
	});
});

describe("cleanMessage", () => {
	it("trims and unifies line breaks", () => {
		expect(cleanMessage("  hello\r\nthere  ")).toBe("hello\nthere");
	});
	it("drops runs of blank lines", () => {
		expect(cleanMessage("a\n\n\n\n\nb")).toBe("a\n\nb");
	});
	it("removes control characters and direction overrides", () => {
		expect(cleanMessage("a\u0000b‮c")).toBe("abc");
	});
	it("keeps emoji, including ones joined with a zero-width joiner", () => {
		const family = "👨‍👩‍👧";
		expect(cleanMessage(`hi ${family} 🔥`)).toBe(`hi ${family} 🔥`);
	});
	it("caps the length", () => {
		expect(cleanMessage("x".repeat(MESSAGE_MAX + 50))).toHaveLength(MESSAGE_MAX);
	});
	it("returns nothing for what isn't text", () => {
		expect(cleanMessage(42)).toBe("");
		expect(cleanMessage(null)).toBe("");
	});
});

describe("messageProblem", () => {
	it("asks for some text", () => {
		expect(messageProblem("")).toMatch(/something/);
	});
	it("allows ordinary messages and a couple of links", () => {
		expect(messageProblem("loving this flavour")).toBeNull();
		expect(messageProblem("see https://a.com and www.b.com")).toBeNull();
	});
	it("turns away a message with too many links", () => {
		const text = Array.from({ length: MAX_LINKS + 1 }, (_, i) => `https://site${i}.com`).join(" ");
		expect(countLinks(text)).toBe(MAX_LINKS + 1);
		expect(messageProblem(text)).toMatch(/links/);
	});
});

describe("excerpt", () => {
	it("flattens whitespace and shortens with an ellipsis", () => {
		expect(excerpt("a   b\nc")).toBe("a b c");
		expect(excerpt("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
	});
});

describe("timeFromId", () => {
	it("reads the timestamp out of a stream id", () => {
		expect(timeFromId("1728212345678-3")).toBe(1728212345678);
		expect(timeFromId("junk")).toBe(0);
	});
});

describe("checkNickname", () => {
	it("accepts ordinary names and normalises spacing", () => {
		expect(checkNickname("  Cloud  Chaser_9 ")).toEqual({ ok: true, name: "Cloud Chaser_9" });
		expect(checkNickname("Zoë")).toEqual({ ok: true, name: "Zoë" });
	});
	it("enforces the length", () => {
		expect(checkNickname("ab").ok).toBe(false);
		expect(checkNickname("x".repeat(21)).ok).toBe(false);
	});
	it("rejects odd characters and edges", () => {
		expect(checkNickname("bad<name>").ok).toBe(false);
		expect(checkNickname("-lead").ok).toBe(false);
		expect(checkNickname("trail_").ok).toBe(false);
		expect(checkNickname(7).ok).toBe(false);
	});
	it("rejects web addresses", () => {
		expect(checkNickname("buy.com").ok).toBe(false);
	});
	it("keeps names that sound like the team for the team", () => {
		expect(checkNickname("Admin Bob").ok).toBe(false);
		expect(checkNickname("WorldwideVapor").ok).toBe(false);
		expect(checkNickname("W_orldwide Vapor").ok).toBe(false);
		expect(checkNickname("Store.Support").ok).toBe(false);
		expect(checkNickname("Admin Bob", "staff")).toEqual({ ok: true, name: "Admin Bob" });
		expect(checkNickname("Support", "mod").ok).toBe(true);
	});
});

describe("nameKey", () => {
	it("ignores case and extra spaces", () => {
		expect(nameKey("Cloud  Chaser")).toBe(nameKey("cloud chaser"));
	});
});

describe("avatarColor and initialOf", () => {
	it("is stable per member and always a colour", () => {
		expect(avatarColor("abc")).toBe(avatarColor("abc"));
		expect(avatarColor("abc")).toMatch(/^#[0-9a-f]{6}$/);
	});
	it("takes the first letter, in capitals", () => {
		expect(initialOf("  cloud")).toBe("C");
		expect(initialOf("")).toBe("?");
		expect(initialOf("🔥fire")).toBe("🔥");
	});
});

describe("layoutFeed", () => {
	const day = (at: number) => (at < 1000 ? "day1" : "day2");

	it("shows a header for the first message and for a new author", () => {
		const rows = layoutFeed(
			[message({ id: "1-0", at: 1 }), message({ id: "2-0", at: 2, authorId: "b", name: "Ben" })],
			day,
		);
		expect(rows.map((r) => r.showHeader)).toEqual([true, true]);
	});

	it("continues a run from the same author within the window", () => {
		const rows = layoutFeed(
			[message({ id: "1-0", at: 1 }), message({ id: "2-0", at: 2 }), message({ id: "3-0", at: 3 })],
			day,
		);
		expect(rows.map((r) => r.showHeader)).toEqual([true, false, false]);
	});

	it("starts a new run after a pause or on a reply", () => {
		const rows = layoutFeed(
			[
				message({ id: "1-0", at: 1 }),
				message({ id: "2-0", at: 2 + GROUP_WINDOW_MS }),
				message({ id: "3-0", at: 3 + GROUP_WINDOW_MS, reply: { id: "1-0", name: "Ava", text: "hi" } }),
			],
			() => "same",
		);
		expect(rows.map((r) => r.showHeader)).toEqual([true, true, true]);
	});

	it("marks where a new day begins", () => {
		const rows = layoutFeed(
			[message({ id: "1-0", at: 1 }), message({ id: "2-0", at: 2 }), message({ id: "3-0", at: 5000 })],
			day,
		);
		expect(rows.map((r) => r.dayStart)).toEqual(["day1", null, "day2"]);
		expect(rows[2].showHeader).toBe(true);
	});

	it("handles an empty feed", () => {
		expect(layoutFeed([])).toEqual([]);
	});
});

describe("previousDayKey", () => {
	it("steps back a day, across month and year ends", () => {
		expect(previousDayKey("2026-10-07")).toBe("2026-10-06");
		expect(previousDayKey("2026-10-01")).toBe("2026-09-30");
		expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
		expect(previousDayKey("2024-03-01")).toBe("2024-02-29");
	});
});

describe("mentions", () => {
	it("finds an @name, ignoring case", () => {
		expect(mentions("hey @cloud chaser, look", "Cloud Chaser")).toBe(true);
		expect(mentions("@Ava hi", "ava")).toBe(true);
	});
	it("doesn't match inside another word or a longer name", () => {
		expect(mentions("email@ava.com", "ava")).toBe(false);
		expect(mentions("@avalon", "ava")).toBe(false);
		expect(mentions("no mention", "ava")).toBe(false);
	});
	it("treats a name with punctuation literally", () => {
		expect(mentions("hi @a.b-c!", "a.b-c")).toBe(true);
		expect(mentions("hi @axb-c", "a.b-c")).toBe(false);
	});
});
