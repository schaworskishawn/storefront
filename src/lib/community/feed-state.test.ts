import { describe, expect, it } from "vitest";
import {
	IDLE_AFTER_MS,
	POLL_ACTIVE_MS,
	POLL_IDLE_MS,
	STOP_AFTER_MS,
	backoff,
	headOfCursor,
	mergeAppend,
	mergeOlder,
	pollDelay,
	reactionChips,
	toggleReactionLocal,
	unreadChannels,
	withoutMessage,
} from "./feed-state";
import type { ChatMessage } from "./model";

const msg = (id: string): ChatMessage => ({
	id,
	authorId: "a",
	name: "Ava",
	role: "member",
	text: id,
	at: 0,
	reply: null,
	reactions: {},
});

describe("pollDelay", () => {
	it("polls quickly while the visitor is active and slowly once idle", () => {
		expect(pollDelay(0, true)).toBe(POLL_ACTIVE_MS);
		expect(pollDelay(IDLE_AFTER_MS - 1, true)).toBe(POLL_ACTIVE_MS);
		expect(pollDelay(IDLE_AFTER_MS, true)).toBe(POLL_IDLE_MS);
	});
	it("stops in a hidden tab and after a long idle spell", () => {
		expect(pollDelay(0, false)).toBeNull();
		expect(pollDelay(STOP_AFTER_MS, true)).toBeNull();
	});
});

describe("backoff", () => {
	it("doubles with each failure, to eight times", () => {
		expect([0, 1, 2, 3, 4, 9].map((n) => backoff(1000, n))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
	});
});

describe("mergeAppend", () => {
	it("adds only messages not already shown", () => {
		const shown = [msg("1-0"), msg("2-0")];
		expect(mergeAppend(shown, [msg("2-0"), msg("3-0")]).map((m) => m.id)).toEqual(["1-0", "2-0", "3-0"]);
	});
	it("returns the same list when there is nothing new", () => {
		const shown = [msg("1-0")];
		expect(mergeAppend(shown, [])).toBe(shown);
		expect(mergeAppend(shown, [msg("1-0")])).toBe(shown);
	});
});

describe("mergeOlder and withoutMessage", () => {
	it("puts older messages in front without repeats", () => {
		expect(mergeOlder([msg("3-0")], [msg("1-0"), msg("2-0"), msg("3-0")]).map((m) => m.id)).toEqual([
			"1-0",
			"2-0",
			"3-0",
		]);
	});
	it("drops one message", () => {
		expect(withoutMessage([msg("1-0"), msg("2-0")], "1-0").map((m) => m.id)).toEqual(["2-0"]);
	});
});

describe("unreadChannels", () => {
	const heads = { general: "5-0", rules: "", "off-topic": "9-0" };

	it("marks channels whose newest message hasn't been seen", () => {
		expect([...unreadChannels(heads, { general: "4-0" }, "rules")].sort()).toEqual(["general", "off-topic"]);
	});
	it("ignores the channel you are in, empty channels and seen ones", () => {
		expect([...unreadChannels(heads, { general: "5-0" }, "off-topic")]).toEqual([]);
	});
});

describe("headOfCursor", () => {
	it("reads the newest id out of a cursor", () => {
		expect(headOfCursor("12-3|4")).toBe("12-3");
		expect(headOfCursor("|0")).toBe("");
		expect(headOfCursor(null)).toBe("");
	});
});

describe("reactions", () => {
	it("lists reactions in the usual order and marks the viewer's own", () => {
		const chips = reactionChips({ "🔥": ["a", "b"], "👍": ["me"], "❤️": [] }, "me");
		expect(chips).toEqual([
			{ emoji: "👍", count: 1, mine: true },
			{ emoji: "🔥", count: 2, mine: false },
		]);
	});
	it("marks none as the viewer's own for a guest", () => {
		expect(reactionChips({ "👍": ["me"] }, null)).toEqual([{ emoji: "👍", count: 1, mine: false }]);
	});
	it("toggles locally the way the server does", () => {
		const once = toggleReactionLocal({}, "👍", "me");
		expect(once).toEqual({ "👍": ["me"] });
		expect(toggleReactionLocal(once, "👍", "you")).toEqual({ "👍": ["me", "you"] });
		expect(toggleReactionLocal(once, "👍", "me")).toEqual({});
	});
});
