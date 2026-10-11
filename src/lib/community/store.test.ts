import { beforeEach, describe, expect, it } from "vitest";
import { createFakeRedis } from "./fake-redis.test-util";
import { MESSAGE_MAX, ONLINE_WINDOW_MS, type Role } from "./model";
import {
	MESSAGES_PER_MINUTE,
	forgetState,
	heartbeat,
	listMessages,
	moderate,
	postMessage,
	readFeed,
	readRoster,
	resolveMember,
	setNickname,
	toggleReaction,
	type Member,
} from "./store";

let clock = 1_700_000_000_000;
const now = () => clock;

function setup() {
	clock = 1_700_000_000_000;
	forgetState();
	return createFakeRedis(now);
}

/** A member with a nickname already chosen. */
async function member(
	redis: ReturnType<typeof setup>["redis"],
	saleorId: string,
	name: string,
	role: Role = "member",
) {
	const resolved = await resolveMember(redis, saleorId, role);
	const result = await setNickname(redis, resolved, name, clock);
	if (!result.ok) throw new Error(result.message);
	return { ...resolved, name } satisfies Member;
}

beforeEach(() => forgetState());

describe("resolveMember", () => {
	it("gives an account one stable, random public id", async () => {
		const { redis } = setup();
		const first = await resolveMember(redis, "User:42", "member");
		const second = await resolveMember(redis, "User:42", "member");
		expect(second.memberId).toBe(first.memberId);
		expect(first.memberId).toMatch(/^[0-9a-f]{12}$/);
		expect(first.memberId).not.toContain("42");
		expect(first.name).toBeNull();
	});

	it("gives different accounts different ids", async () => {
		const { redis } = setup();
		const a = await resolveMember(redis, "User:1", "member");
		const b = await resolveMember(redis, "User:2", "member");
		expect(a.memberId).not.toBe(b.memberId);
	});

	it("keeps the stored role in step with the account", async () => {
		const { redis } = setup();
		await member(redis, "User:1", "Pat");
		const promoted = await resolveMember(redis, "User:1", "mod");
		expect(promoted.role).toBe("mod");
		const again = await resolveMember(redis, "User:1", "mod");
		expect(again.name).toBe("Pat");
	});
});

describe("setNickname", () => {
	it("sets a first nickname", async () => {
		const { redis } = setup();
		const m = await resolveMember(redis, "User:1", "member");
		expect(await setNickname(redis, m, "  Cloud   Chaser ", clock)).toEqual({
			ok: true,
			name: "Cloud Chaser",
		});
		expect((await resolveMember(redis, "User:1", "member")).name).toBe("Cloud Chaser");
	});

	it("refuses an invalid nickname", async () => {
		const { redis } = setup();
		const m = await resolveMember(redis, "User:1", "member");
		const result = await setNickname(redis, m, "x", clock);
		expect(result).toMatchObject({ ok: false, status: 400 });
	});

	it("keeps nicknames unique, ignoring case", async () => {
		const { redis } = setup();
		await member(redis, "User:1", "Pat");
		const other = await resolveMember(redis, "User:2", "member");
		expect(await setNickname(redis, other, "pat", clock)).toMatchObject({ ok: false, status: 409 });
	});

	it("lets a member change the case of their own name, then limits changes to one an hour", async () => {
		const { redis } = setup();
		const pat = await member(redis, "User:1", "Pat");
		expect(await setNickname(redis, pat, "PAT", clock)).toEqual({ ok: true, name: "PAT" });
		const renamed = await resolveMember(redis, "User:1", "member");
		expect(await setNickname(redis, renamed, "Patricia", clock)).toMatchObject({ ok: false, status: 429 });
		clock += 3_601_000;
		expect(await setNickname(redis, renamed, "Patricia", clock)).toEqual({ ok: true, name: "Patricia" });
	});

	it("frees the old nickname when someone changes it", async () => {
		const { redis } = setup();
		const pat = await member(redis, "User:1", "Pat");
		clock += 3_601_000;
		expect(await setNickname(redis, pat, "Patricia", clock)).toMatchObject({ ok: true });
		const other = await resolveMember(redis, "User:2", "member");
		expect(await setNickname(redis, other, "Pat", clock)).toMatchObject({ ok: true });
	});

	it("doesn't let an ordinary member take a name that sounds like the team", async () => {
		const { redis } = setup();
		const m = await resolveMember(redis, "User:1", "member");
		expect(await setNickname(redis, m, "Store Admin", clock)).toMatchObject({ ok: false, status: 400 });
		const staff = await resolveMember(redis, "User:2", "staff");
		expect(await setNickname(redis, staff, "Store Admin", clock)).toMatchObject({ ok: true });
	});
});

describe("postMessage", () => {
	it("posts a message that anyone can read back", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const posted = await postMessage(
			redis,
			{ channel: "general", member: ava, text: "  hello there  " },
			clock,
		);
		expect(posted).toMatchObject({ ok: true, message: { name: "Ava", text: "hello there", role: "member" } });

		const page = await listMessages(redis, "general");
		expect(page.messages.map((m) => m.text)).toEqual(["hello there"]);
		expect(page.messages[0].authorId).toBe(ava.memberId);
		expect(page.hasOlder).toBe(false);
	});

	it("needs a nickname, a real channel, and permission", async () => {
		const { redis } = setup();
		const nameless = await resolveMember(redis, "User:1", "member");
		expect(
			await postMessage(redis, { channel: "general", member: nameless, text: "hi" }, clock),
		).toMatchObject({
			ok: false,
			status: 403,
		});
		const ava = await member(redis, "User:2", "Ava");
		expect(await postMessage(redis, { channel: "nope", member: ava, text: "hi" }, clock)).toMatchObject({
			ok: false,
			status: 404,
		});
		expect(await postMessage(redis, { channel: "rules", member: ava, text: "hi" }, clock)).toMatchObject({
			ok: false,
			status: 403,
		});
		const mod = await member(redis, "User:3", "Mo Derator", "mod");
		expect(
			await postMessage(redis, { channel: "announcements", member: mod, text: "Restock" }, clock),
		).toMatchObject({
			ok: true,
		});
	});

	it("refuses empty messages and messages with too many links", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		expect(await postMessage(redis, { channel: "general", member: ava, text: "   " }, clock)).toMatchObject({
			ok: false,
			status: 400,
		});
		expect(
			await postMessage(
				redis,
				{ channel: "general", member: ava, text: "https://a.com https://b.com https://c.com" },
				clock,
			),
		).toMatchObject({ ok: false, status: 400 });
	});

	it("caps the length of what is stored", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const posted = await postMessage(
			redis,
			{ channel: "general", member: ava, text: "x".repeat(MESSAGE_MAX * 2) },
			clock,
		);
		expect(posted.ok && posted.message.text).toHaveLength(MESSAGE_MAX);
	});

	it("makes a member wait between messages and refuses a repeat", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		expect(await postMessage(redis, { channel: "general", member: ava, text: "one" }, clock)).toMatchObject({
			ok: true,
		});
		expect(await postMessage(redis, { channel: "general", member: ava, text: "two" }, clock)).toMatchObject({
			ok: false,
			status: 429,
		});
		clock += 2000;
		expect(await postMessage(redis, { channel: "general", member: ava, text: "one" }, clock)).toMatchObject({
			ok: false,
			status: 400,
		});
		expect(await postMessage(redis, { channel: "general", member: ava, text: "two" }, clock)).toMatchObject({
			ok: true,
		});
	});

	it("stops a member who sends too many in a minute, but not the team", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const results = [];
		// Spaced past the minimum gap, and all inside one minute.
		for (let i = 0; i < MESSAGES_PER_MINUTE + 3; i++) {
			clock += 1600;
			results.push(await postMessage(redis, { channel: "general", member: ava, text: `msg ${i}` }, clock));
		}
		expect(results.slice(0, MESSAGES_PER_MINUTE).every((r) => r.ok)).toBe(true);
		const refused = results[MESSAGES_PER_MINUTE];
		expect(refused).toMatchObject({ ok: false, status: 429 });
		expect(!refused.ok && refused.message).toMatch(/too fast/);

		const staff = await member(redis, "User:2", "Boss Person", "staff");
		for (let i = 0; i < MESSAGES_PER_MINUTE + 3; i++) {
			const result = await postMessage(
				redis,
				{ channel: "general", member: staff, text: `staff ${i}` },
				clock,
			);
			expect(result.ok).toBe(true);
		}
	});

	it("quotes the message it replies to", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const ben = await member(redis, "User:2", "Ben");
		const first = await postMessage(
			redis,
			{ channel: "general", member: ava, text: "Which coil lasts longest?" },
			clock,
		);
		if (!first.ok) throw new Error("setup");
		const reply = await postMessage(
			redis,
			{ channel: "general", member: ben, text: "the mesh ones", replyTo: first.message.id },
			clock,
		);
		expect(reply).toMatchObject({
			ok: true,
			message: { reply: { id: first.message.id, name: "Ava", text: "Which coil lasts longest?" } },
		});
	});

	it("ignores a reply to something that isn't there", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const posted = await postMessage(
			redis,
			{ channel: "general", member: ava, text: "hi", replyTo: "1-1" },
			clock,
		);
		expect(posted).toMatchObject({ ok: true, message: { reply: null } });
	});
});

describe("listMessages", () => {
	async function seed(count: number) {
		const fake = setup();
		const ava = await member(fake.redis, "User:1", "Ava");
		const staff = await member(fake.redis, "User:2", "Boss Person", "staff");
		const ids: string[] = [];
		for (let i = 0; i < count; i++) {
			clock += 10;
			const posted = await postMessage(
				fake.redis,
				{ channel: "general", member: staff, text: `m${i}` },
				clock,
			);
			if (posted.ok) ids.push(posted.message.id);
		}
		return { ...fake, ava, staff, ids };
	}

	it("returns the newest page, oldest first, and says when there is more", async () => {
		const { redis } = await seed(8);
		const page = await listMessages(redis, "general", { limit: 5 });
		expect(page.messages.map((m) => m.text)).toEqual(["m3", "m4", "m5", "m6", "m7"]);
		expect(page.hasOlder).toBe(true);
	});

	it("pages back from a message", async () => {
		const { redis, ids } = await seed(8);
		const page = await listMessages(redis, "general", { before: ids[3], limit: 5 });
		expect(page.messages.map((m) => m.text)).toEqual(["m0", "m1", "m2"]);
		expect(page.hasOlder).toBe(false);
	});

	it("returns only what came after a message", async () => {
		const { redis, ids } = await seed(5);
		const page = await listMessages(redis, "general", { after: ids[2] });
		expect(page.messages.map((m) => m.text)).toEqual(["m3", "m4"]);
	});

	it("ignores a malformed message id instead of passing it to Redis", async () => {
		const { redis } = await seed(2);
		const page = await listMessages(redis, "general", { after: "x y z" });
		expect(page.messages).toHaveLength(2);
	});

	it("lists who reacted with each emoji", async () => {
		const { redis, ava, staff, ids } = await seed(1);
		expect(
			await toggleReaction(redis, {
				channel: "general",
				messageId: ids[0],
				emoji: "🔥",
				memberId: ava.memberId,
			}),
		).toEqual({ ok: true });
		expect(
			await toggleReaction(redis, {
				channel: "general",
				messageId: ids[0],
				emoji: "🔥",
				memberId: staff.memberId,
			}),
		).toEqual({ ok: true });

		const [message] = (await listMessages(redis, "general")).messages;
		expect(message.reactions["🔥"]).toEqual([ava.memberId, staff.memberId]);
	});
});

describe("toggleReaction", () => {
	it("adds a reaction and takes it back", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const posted = await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock);
		if (!posted.ok) throw new Error("setup");
		const args = { channel: "general", messageId: posted.message.id, emoji: "👍", memberId: ava.memberId };

		await toggleReaction(redis, args);
		expect((await listMessages(redis, "general")).messages[0].reactions).toEqual({ "👍": [ava.memberId] });
		await toggleReaction(redis, args);
		expect((await listMessages(redis, "general")).messages[0].reactions).toEqual({});
	});

	it("only accepts the offered emoji on a message that exists", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const posted = await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock);
		if (!posted.ok) throw new Error("setup");
		expect(
			await toggleReaction(redis, {
				channel: "general",
				messageId: posted.message.id,
				emoji: "💩",
				memberId: "x",
			}),
		).toMatchObject({ ok: false, status: 400 });
		expect(
			await toggleReaction(redis, { channel: "general", messageId: "5-5", emoji: "👍", memberId: "x" }),
		).toMatchObject({ ok: false, status: 404 });
		expect(
			await toggleReaction(redis, {
				channel: "nope",
				messageId: posted.message.id,
				emoji: "👍",
				memberId: "x",
			}),
		).toMatchObject({ ok: false, status: 400 });
	});
});

describe("readFeed", () => {
	it("sends the latest page to a new visitor, nothing when nothing changed, and only the new messages after that", async () => {
		const { redis, log } = setup();
		const ava = await member(redis, "User:1", "Ava");
		await postMessage(redis, { channel: "general", member: ava, text: "first" }, clock);

		const opening = await readFeed(redis, { channel: "general" }, clock);
		expect(opening.mode).toBe("replace");
		expect(opening.messages.map((m) => m.text)).toEqual(["first"]);

		const quiet = await readFeed(redis, { channel: "general", cursor: opening.cursor }, clock + 5000);
		expect(quiet).toMatchObject({ mode: "none", messages: [] });

		clock += 3000;
		await postMessage(redis, { channel: "general", member: ava, text: "second" }, clock);
		const update = await readFeed(redis, { channel: "general", cursor: opening.cursor }, clock);
		expect(update.mode).toBe("append");
		expect(update.messages.map((m) => m.text)).toEqual(["second"]);
		expect(update.cursor).not.toBe(opening.cursor);
		expect(log.filter((c) => c[0] === "MGET").length).toBeGreaterThan(0);
	});

	it("asks Redis once for many visitors polling within a moment", async () => {
		const { redis, log } = setup();
		await readFeed(redis, { channel: "general" }, clock);
		const before = log.filter((c) => c[0] === "MGET").length;
		await readFeed(redis, { channel: "general" }, clock + 200);
		await readFeed(redis, { channel: "general" }, clock + 400);
		expect(log.filter((c) => c[0] === "MGET").length).toBe(before);
	});

	it("resends the page after a reaction or a removal so the change shows", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const staff = await member(redis, "User:2", "Boss Person", "staff");
		const posted = await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock);
		if (!posted.ok) throw new Error("setup");
		const opening = await readFeed(redis, { channel: "general" }, clock);

		clock += 2000;
		await toggleReaction(redis, {
			channel: "general",
			messageId: posted.message.id,
			emoji: "❤️",
			memberId: staff.memberId,
		});
		const afterReaction = await readFeed(redis, { channel: "general", cursor: opening.cursor }, clock);
		expect(afterReaction.mode).toBe("replace");
		expect(afterReaction.messages[0].reactions["❤️"]).toEqual([staff.memberId]);

		clock += 2000;
		await moderate(redis, staff, { kind: "delete", channel: "general", messageId: posted.message.id }, clock);
		const afterRemoval = await readFeed(redis, { channel: "general", cursor: afterReaction.cursor }, clock);
		expect(afterRemoval).toMatchObject({ mode: "replace", messages: [] });
	});

	it("reports the newest message in every channel, for unread dots", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const posted = await postMessage(redis, { channel: "off-topic", member: ava, text: "hi" }, clock);
		if (!posted.ok) throw new Error("setup");
		const feed = await readFeed(redis, { channel: "general" }, clock);
		expect(feed.heads["off-topic"]).toBe(posted.message.id);
		expect(feed.heads.general).toBe("");
	});
});

describe("presence", () => {
	it("lists who is online, team first, and drops people who left", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const staff = await member(redis, "User:2", "Boss Person", "staff");
		const gone = await member(redis, "User:3", "Zed");
		await heartbeat(redis, ava.memberId, clock);
		await heartbeat(redis, staff.memberId, clock);
		await heartbeat(redis, gone.memberId, clock - ONLINE_WINDOW_MS - 1);

		const roster = await readRoster(redis, clock);
		expect(roster.online.map((m) => m.name)).toEqual(["Boss Person", "Ava"]);
		expect(roster.total).toBe(3);
	});

	it("is empty when nobody is here", async () => {
		const { redis } = setup();
		expect(await readRoster(redis, clock)).toEqual({ online: [], total: 0 });
	});
});

describe("moderate", () => {
	it("lets moderators remove a member's message but not a team member's", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const mod = await member(redis, "User:2", "Mo Derator", "mod");
		const staff = await member(redis, "User:3", "Boss Person", "staff");
		const a = await postMessage(redis, { channel: "general", member: ava, text: "bad" }, clock);
		const s = await postMessage(redis, { channel: "general", member: staff, text: "ok" }, clock);
		if (!a.ok || !s.ok) throw new Error("setup");

		expect(
			await moderate(redis, mod, { kind: "delete", channel: "general", messageId: s.message.id }, clock),
		).toMatchObject({ ok: false, status: 403 });
		expect(
			await moderate(redis, mod, { kind: "delete", channel: "general", messageId: a.message.id }, clock),
		).toEqual({ ok: true });
		expect((await listMessages(redis, "general")).messages.map((m) => m.text)).toEqual(["ok"]);
		expect(
			await moderate(redis, mod, { kind: "delete", channel: "general", messageId: a.message.id }, clock),
		).toMatchObject({ ok: false, status: 404 });
	});

	it("lets a team member remove their own message", async () => {
		const { redis } = setup();
		const staff = await member(redis, "User:3", "Boss Person", "staff");
		const s = await postMessage(redis, { channel: "general", member: staff, text: "oops" }, clock);
		if (!s.ok) throw new Error("setup");
		expect(
			await moderate(redis, staff, { kind: "delete", channel: "general", messageId: s.message.id }, clock),
		).toEqual({ ok: true });
	});

	it("refuses everyone else", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		expect(await moderate(redis, ava, { kind: "ban", memberId: "x" }, clock)).toMatchObject({
			ok: false,
			status: 403,
		});
	});

	it("times a member out, then lets them post again afterwards", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const mod = await member(redis, "User:2", "Mo Derator", "mod");
		expect(
			await moderate(redis, mod, { kind: "timeout", memberId: ava.memberId, minutes: 10 }, clock),
		).toEqual({ ok: true });

		const blocked = await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock);
		expect(blocked).toMatchObject({ ok: false, status: 403 });
		expect(!blocked.ok && blocked.message).toMatch(/10 minutes/);

		clock += 11 * 60_000;
		expect(await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock)).toMatchObject({
			ok: true,
		});
	});

	it("removes and restores a member", async () => {
		const { redis } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const staff = await member(redis, "User:2", "Boss Person", "staff");
		await moderate(redis, staff, { kind: "ban", memberId: ava.memberId }, clock);
		expect(await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock)).toMatchObject({
			ok: false,
			status: 403,
		});
		await moderate(redis, staff, { kind: "unban", memberId: ava.memberId }, clock);
		expect(await postMessage(redis, { channel: "general", member: ava, text: "hi" }, clock)).toMatchObject({
			ok: true,
		});
	});

	it("won't act on yourself, the team, or someone who doesn't exist", async () => {
		const { redis } = setup();
		const mod = await member(redis, "User:2", "Mo Derator", "mod");
		const staff = await member(redis, "User:3", "Boss Person", "staff");
		expect(await moderate(redis, mod, { kind: "ban", memberId: mod.memberId }, clock)).toMatchObject({
			ok: false,
			status: 403,
		});
		expect(await moderate(redis, mod, { kind: "ban", memberId: staff.memberId }, clock)).toMatchObject({
			ok: false,
			status: 403,
		});
		expect(await moderate(redis, staff, { kind: "ban", memberId: "nobody" }, clock)).toMatchObject({
			ok: false,
			status: 404,
		});
	});

	it("logs what moderators do", async () => {
		const { redis, list } = setup();
		const ava = await member(redis, "User:1", "Ava");
		const mod = await member(redis, "User:2", "Mo Derator", "mod");
		await moderate(redis, mod, { kind: "timeout", memberId: ava.memberId, minutes: 5 }, clock);
		const entries = list("wv:chat:modlog").map((e) => JSON.parse(e));
		expect(entries).toEqual([
			{ at: clock, by: "Mo Derator", action: "timeout", member: "Ava", memberId: ava.memberId, minutes: 5 },
		]);
	});
});
