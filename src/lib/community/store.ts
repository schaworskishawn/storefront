import { CHANNELS, channelById } from "./channels";
import {
	ONLINE_WINDOW_MS,
	REACTION_EMOJIS,
	REPLY_EXCERPT_MAX,
	canModerate,
	canPostIn,
	checkNickname,
	cleanMessage,
	excerpt,
	isModerator,
	messageProblem,
	nameKey,
	timeFromId,
	type ChatMessage,
	type OnlineMember,
	type Reactions,
	type Role,
} from "./model";
import type { Redis, RedisCommand } from "./redis";

/**
 * Everything the community keeps in Redis, and the rules for changing it. Each channel is a Redis stream (ordered,
 * trimmed, and a message can be removed by id); everything else is a plain key, hash or sorted set. The routes call these
 * functions and nothing else touches Redis, so the rules below hold however a request arrives.
 *
 * Keys, all under `wv:chat:`:
 *   uid:<saleor user id>   -> the member's public id        m:<member id>   -> {name, role, joined} as JSON
 *   names                  -> hash of lowercase nickname -> member id (keeps nicknames unique)
 *   s:<channel>            -> the channel's messages (stream, newest ~1000)
 *   head:<channel>         -> id of the newest message      rev:<channel>   -> bumps on a reaction or removal
 *   react:<channel>        -> hash of message id -> {emoji: [member ids]}
 *   online                 -> sorted set of member id by last heartbeat
 *   ban:<id>, mute:<id>    -> present while a member is removed / timed out
 *   rl:<id>:<minute>, gap:<id>, last:<id>, namechg:<id> -> rate limits and the last message, expiring on their own
 *   modlog                 -> the last 200 moderator actions
 */

const P = "wv:chat:";
const key = {
	uid: (saleorUserId: string) => `${P}uid:${saleorUserId}`,
	member: (memberId: string) => `${P}m:${memberId}`,
	names: `${P}names`,
	stream: (channel: string) => `${P}s:${channel}`,
	head: (channel: string) => `${P}head:${channel}`,
	rev: (channel: string) => `${P}rev:${channel}`,
	react: (channel: string) => `${P}react:${channel}`,
	online: `${P}online`,
	ban: (memberId: string) => `${P}ban:${memberId}`,
	mute: (memberId: string) => `${P}mute:${memberId}`,
	rate: (memberId: string, minute: number) => `${P}rl:${memberId}:${minute}`,
	gap: (memberId: string) => `${P}gap:${memberId}`,
	last: (memberId: string) => `${P}last:${memberId}`,
	nameChange: (memberId: string) => `${P}namechg:${memberId}`,
	modlog: `${P}modlog`,
};

export const STREAM_LIMIT = 1000;
export const PAGE_SIZE = 50;
export const MESSAGES_PER_MINUTE = 12;
export const MIN_GAP_MS = 1500;
export const MAX_REACTORS = 200;
export const MAX_TIMEOUT_MINUTES = 7 * 24 * 60;
const ONLINE_LIST_MAX = 60;
const MESSAGE_ID = /^\d+-\d+$/;

type Failure = { ok: false; status: number; message: string };
const fail = (status: number, message: string): Failure => ({ ok: false, status, message });

const parseJson = <T>(raw: unknown): T | null => {
	if (typeof raw !== "string") return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
};

const asRole = (value: unknown): Role => (value === "staff" || value === "mod" ? value : "member");

// ---- Members -----------------------------------------------------------------

export type Member = { memberId: string; name: string | null; role: Role; joined: number | null };
type StoredMember = { name: string; role: Role; joined: number };

const newMemberId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/**
 * The community identity for a signed-in store account, created on first sight. The public member id is random and kept
 * apart from the Saleor user id, so nothing shown to other members can be traced back to the account.
 */
export async function resolveMember(redis: Redis, saleorUserId: string, role: Role): Promise<Member> {
	let memberId = await redis.run<string | null>(["GET", key.uid(saleorUserId)]);
	if (!memberId) {
		await redis.run(["SET", key.uid(saleorUserId), newMemberId(), "NX"]);
		// Another request for the same account may have won; read back whichever id is stored.
		memberId = await redis.run<string>(["GET", key.uid(saleorUserId)]);
	}
	const stored = parseJson<StoredMember>(await redis.run(["GET", key.member(memberId)]));
	if (stored && stored.role !== role) {
		await redis.run(["SET", key.member(memberId), JSON.stringify({ ...stored, role })]);
	}
	return { memberId, name: stored?.name ?? null, role, joined: stored?.joined ?? null };
}

export type NicknameOutcome = { ok: true; name: string } | Failure;

/** Set or change a member's nickname. Nicknames are unique ignoring case; an existing one can change once an hour. */
export async function setNickname(
	redis: Redis,
	member: Member,
	requested: unknown,
	now: number = Date.now(),
): Promise<NicknameOutcome> {
	const checked = checkNickname(requested, member.role);
	if (!checked.ok) return fail(400, checked.message);
	const name = checked.name;
	if (member.name === name) return { ok: true, name };

	const wanted = nameKey(name);
	const current = member.name ? nameKey(member.name) : null;
	if (current && !isModerator(member.role)) {
		const cooling = await redis.run<string | null>(["GET", key.nameChange(member.memberId)]);
		if (cooling) return fail(429, "You can change your nickname once an hour.");
	}

	const claimed = await redis.run<number>(["HSETNX", key.names, wanted, member.memberId]);
	if (claimed !== 1) {
		const owner = await redis.run<string | null>(["HGET", key.names, wanted]);
		if (owner !== member.memberId) return fail(409, "That nickname is taken. Try another.");
	}
	if (current && current !== wanted) await redis.run(["HDEL", key.names, current]);

	const record: StoredMember = { name, role: member.role, joined: member.joined ?? now };
	await redis.run(["SET", key.member(member.memberId), JSON.stringify(record)]);
	if (current) await redis.run(["SET", key.nameChange(member.memberId), "1", "EX", 3600]);
	return { ok: true, name };
}

async function memberRecord(redis: Redis, memberId: string): Promise<StoredMember | null> {
	return parseJson<StoredMember>(await redis.run(["GET", key.member(memberId)]));
}

// ---- Messages ----------------------------------------------------------------

type StreamEntry = [id: string, fields: string[]];

function parseEntry(entry: StreamEntry, reactions: unknown): ChatMessage {
	const [id, flat] = entry;
	const f: Record<string, string> = {};
	for (let i = 0; i + 1 < flat.length; i += 2) f[flat[i]] = flat[i + 1];

	const data = parseJson<Record<string, unknown>>(reactions) ?? {};
	const summary: Reactions = {};
	for (const emoji of REACTION_EMOJIS) {
		const who = data[emoji];
		if (Array.isArray(who) && who.length)
			summary[emoji] = who.filter((id): id is string => typeof id === "string");
	}

	return {
		id,
		authorId: f.a ?? "",
		name: f.n ?? "",
		role: asRole(f.r),
		text: f.t ?? "",
		at: timeFromId(id),
		reply: f.p ? { id: f.p, name: f.pn ?? "", text: f.pt ?? "" } : null,
		reactions: summary,
	};
}

async function withReactions(redis: Redis, channel: string, entries: StreamEntry[]): Promise<ChatMessage[]> {
	if (!entries.length) return [];
	const raw = await redis.run<Array<string | null>>([
		"HMGET",
		key.react(channel),
		...entries.map((e) => e[0]),
	]);
	return entries.map((entry, i) => parseEntry(entry, raw[i]));
}

export type PostOutcome = { ok: true; message: ChatMessage } | Failure;

export async function postMessage(
	redis: Redis,
	input: { channel: string; member: Member; text: unknown; replyTo?: unknown },
	now: number = Date.now(),
): Promise<PostOutcome> {
	const { member } = input;
	const channel = channelById(input.channel);
	if (!channel) return fail(404, "That channel doesn't exist.");
	if (!member.name) return fail(403, "Choose a nickname before you post.");
	if (!canPostIn(channel, member.role)) return fail(403, "Only the team can post in this channel.");

	const text = cleanMessage(input.text);
	const problem = messageProblem(text);
	if (problem) return fail(400, problem);

	const [banned, muteMs, last] = (await redis.pipeline([
		["GET", key.ban(member.memberId)],
		["PTTL", key.mute(member.memberId)],
		["GET", key.last(member.memberId)],
	])) as [string | null, number, string | null];
	if (banned) return fail(403, "You have been removed from the community.");
	if (muteMs > 0) {
		const minutes = Math.max(1, Math.ceil(muteMs / 60_000));
		return fail(403, `You are timed out for another ${minutes} minute${minutes === 1 ? "" : "s"}.`);
	}

	if (!isModerator(member.role)) {
		if (last === text) return fail(400, "You already said that.");
		const turn = await redis.run<string | null>([
			"SET",
			key.gap(member.memberId),
			"1",
			"PX",
			MIN_GAP_MS,
			"NX",
		]);
		if (!turn) return fail(429, "Slow down a little.");
		const minute = Math.floor(now / 60_000);
		const rate = key.rate(member.memberId, minute);
		const [, count] = (await redis.pipeline([
			["SET", rate, 0, "EX", 120, "NX"],
			["INCR", rate],
		])) as [unknown, number];
		if (count > MESSAGES_PER_MINUTE)
			return fail(429, "You're sending messages too fast. Try again in a minute.");
	}

	const fields: Array<string | number> = [
		"a",
		member.memberId,
		"n",
		member.name,
		"r",
		member.role,
		"t",
		text,
	];
	const replyId = typeof input.replyTo === "string" && MESSAGE_ID.test(input.replyTo) ? input.replyTo : null;
	if (replyId) {
		const [target] = await redis.run<StreamEntry[]>([
			"XRANGE",
			key.stream(channel.id),
			replyId,
			replyId,
			"COUNT",
			1,
		]);
		if (target) {
			const quoted = parseEntry(target, null);
			fields.push("p", replyId, "pn", quoted.name, "pt", excerpt(quoted.text, REPLY_EXCERPT_MAX));
		}
	}

	const id = await redis.run<string>([
		"XADD",
		key.stream(channel.id),
		"MAXLEN",
		"~",
		STREAM_LIMIT,
		"*",
		...fields,
	]);
	await redis.pipeline([
		["SET", key.head(channel.id), id],
		["SET", key.last(member.memberId), text, "EX", 120],
	]);
	forgetState();

	return { ok: true, message: parseEntry([id, fields.map(String)], null) };
}

export type Page = { messages: ChatMessage[]; hasOlder: boolean };

/** One page of a channel, oldest first: the newest `limit`, or the `limit` before / after a message. */
export async function listMessages(
	redis: Redis,
	channel: string,
	options: { after?: string; before?: string; limit?: number } = {},
): Promise<Page> {
	const limit = options.limit ?? PAGE_SIZE;
	const stream = key.stream(channel);
	let entries: StreamEntry[];
	let hasOlder = false;

	if (options.after && MESSAGE_ID.test(options.after)) {
		entries = await redis.run<StreamEntry[]>(["XRANGE", stream, `(${options.after}`, "+", "COUNT", limit]);
	} else {
		const upper = options.before && MESSAGE_ID.test(options.before) ? `(${options.before}` : "+";
		const newestFirst = await redis.run<StreamEntry[]>(["XREVRANGE", stream, upper, "-", "COUNT", limit]);
		entries = newestFirst.reverse();
		hasOlder = newestFirst.length === limit;
	}
	return { messages: await withReactions(redis, channel, entries), hasOlder };
}

// ---- Polling -----------------------------------------------------------------

export type ChannelState = { heads: Record<string, string>; revs: Record<string, string> };

const STATE_TTL_MS = 1500;
let stateCache: { redis: Redis; at: number; value: ChannelState } | null = null;

/** Forget the cached state, so the next poll on this server sees a change just made here. */
export const forgetState = () => {
	stateCache = null;
};

/**
 * The newest message id and the change counter of every channel, in one command. Many visitors poll at once, so a server
 * answers them from a copy that is at most a second or two old rather than asking Redis each time.
 */
export async function readState(redis: Redis, now: number = Date.now()): Promise<ChannelState> {
	if (stateCache && stateCache.redis === redis && now - stateCache.at < STATE_TTL_MS) return stateCache.value;
	const keys = [...CHANNELS.map((c) => key.head(c.id)), ...CHANNELS.map((c) => key.rev(c.id))];
	const values = await redis.run<Array<string | null>>(["MGET", ...keys]);
	const heads: Record<string, string> = {};
	const revs: Record<string, string> = {};
	CHANNELS.forEach((c, i) => {
		heads[c.id] = values[i] ?? "";
		revs[c.id] = values[CHANNELS.length + i] ?? "0";
	});
	const value = { heads, revs };
	stateCache = { redis, at: now, value };
	return value;
}

export type FeedMode = "none" | "replace" | "append";
export type Feed = {
	/** Hand this back on the next poll: "<newest id>|<change counter>". */
	cursor: string;
	mode: FeedMode;
	messages: ChatMessage[];
	hasOlder: boolean;
	/** The newest message id in every channel, so the page can show which channels have something new. */
	heads: Record<string, string>;
};

/**
 * What a visitor needs to catch up. With nothing new it costs one Redis command; a new message sends only what came after
 * the last one they have; a reaction or removal sends the latest page again so the change shows up.
 */
export async function readFeed(
	redis: Redis,
	input: { channel: string; cursor?: string | null },
	now: number = Date.now(),
): Promise<Feed> {
	const state = await readState(redis, now);
	const head = state.heads[input.channel] ?? "";
	const cursor = `${head}|${state.revs[input.channel] ?? "0"}`;
	const base = { cursor, heads: state.heads };
	if (input.cursor === cursor) return { ...base, mode: "none", messages: [], hasOlder: false };

	const [knownHead, knownRev] = (input.cursor ?? "").split("|");
	if (input.cursor && knownHead && knownRev === (state.revs[input.channel] ?? "0")) {
		const page = await listMessages(redis, input.channel, { after: knownHead, limit: 100 });
		return { ...base, mode: "append", messages: page.messages, hasOlder: false };
	}
	const page = await listMessages(redis, input.channel);
	return { ...base, mode: "replace", messages: page.messages, hasOlder: page.hasOlder };
}

// ---- Reactions ---------------------------------------------------------------

export type ReactOutcome = { ok: true } | Failure;

/** Add the member's reaction, or take it back if they had already given it. */
export async function toggleReaction(
	redis: Redis,
	input: { channel: string; messageId: unknown; emoji: unknown; memberId: string },
): Promise<ReactOutcome> {
	const channel = channelById(input.channel);
	const messageId =
		typeof input.messageId === "string" && MESSAGE_ID.test(input.messageId) ? input.messageId : null;
	const emoji = REACTION_EMOJIS.find((e) => e === input.emoji);
	if (!channel || !messageId || !emoji) return fail(400, "That reaction isn't available.");

	const [found, raw] = (await redis.pipeline([
		["XRANGE", key.stream(channel.id), messageId, messageId, "COUNT", 1],
		["HGET", key.react(channel.id), messageId],
	])) as [StreamEntry[], string | null];
	if (!found.length) return fail(404, "That message is gone.");

	const data = parseJson<Record<string, string[]>>(raw) ?? {};
	const who = data[emoji] ?? [];
	if (who.includes(input.memberId)) data[emoji] = who.filter((id) => id !== input.memberId);
	else if (who.length >= MAX_REACTORS) return fail(400, "That reaction is already everywhere.");
	else data[emoji] = [...who, input.memberId];
	if (!data[emoji].length) delete data[emoji];

	await redis.pipeline([
		Object.keys(data).length
			? ["HSET", key.react(channel.id), messageId, JSON.stringify(data)]
			: ["HDEL", key.react(channel.id), messageId],
		["INCR", key.rev(channel.id)],
	]);
	forgetState();
	return { ok: true };
}

// ---- Presence ----------------------------------------------------------------

/** Mark a member as here right now. */
export async function heartbeat(redis: Redis, memberId: string, now: number = Date.now()): Promise<void> {
	await redis.pipeline([
		["ZADD", key.online, now, memberId],
		["ZREMRANGEBYSCORE", key.online, "-inf", now - ONLINE_WINDOW_MS * 10],
	]);
}

export type Roster = { online: OnlineMember[]; total: number };

const RANK: Record<Role, number> = { staff: 0, mod: 1, member: 2 };

/** Who has been here in the last couple of minutes, team first, and how many people have joined in all. */
export async function readRoster(redis: Redis, now: number = Date.now()): Promise<Roster> {
	const [ids, total] = (await redis.pipeline([
		["ZRANGEBYSCORE", key.online, now - ONLINE_WINDOW_MS, "+inf", "LIMIT", 0, ONLINE_LIST_MAX],
		["HLEN", key.names],
	])) as [string[], number];
	if (!ids.length) return { online: [], total };

	const records = await redis.run<Array<string | null>>(["MGET", ...ids.map((id) => key.member(id))]);
	const online: OnlineMember[] = [];
	ids.forEach((memberId, i) => {
		const stored = parseJson<StoredMember>(records[i]);
		if (stored?.name) online.push({ memberId, name: stored.name, role: asRole(stored.role) });
	});
	online.sort((a, b) => RANK[a.role] - RANK[b.role] || a.name.localeCompare(b.name));
	return { online, total };
}

// ---- Moderation --------------------------------------------------------------

export type ModAction =
	| { kind: "delete"; channel: string; messageId: string }
	| { kind: "timeout"; memberId: string; minutes: number }
	| { kind: "ban"; memberId: string }
	| { kind: "unban"; memberId: string };

export type ModOutcome = { ok: true } | Failure;

/** A moderator or staff member removing a message, timing someone out, or removing / restoring a member. Every action is logged. */
export async function moderate(
	redis: Redis,
	actor: Member,
	action: ModAction,
	now: number = Date.now(),
): Promise<ModOutcome> {
	if (!isModerator(actor.role)) return fail(403, "Only moderators can do that.");
	const commands: RedisCommand[] = [];
	let logged: Record<string, unknown>;

	if (action.kind === "delete") {
		const channel = channelById(action.channel);
		if (!channel || !MESSAGE_ID.test(action.messageId)) return fail(400, "That message can't be found.");
		const [entry] = await redis.run<StreamEntry[]>([
			"XRANGE",
			key.stream(channel.id),
			action.messageId,
			action.messageId,
			"COUNT",
			1,
		]);
		if (!entry) return fail(404, "That message is already gone.");
		const target = parseEntry(entry, null);
		if (target.authorId !== actor.memberId && !canModerate(actor.role, target.role))
			return fail(403, "You can't remove that message.");
		commands.push(
			["XDEL", key.stream(channel.id), action.messageId],
			["HDEL", key.react(channel.id), action.messageId],
			["INCR", key.rev(channel.id)],
		);
		logged = { action: "delete", channel: channel.id, author: target.name, text: excerpt(target.text, 120) };
	} else {
		const target = await memberRecord(redis, action.memberId);
		if (!target) return fail(404, "That member doesn't exist.");
		if (action.memberId === actor.memberId || !canModerate(actor.role, asRole(target.role)))
			return fail(403, "You can't do that to this member.");
		if (action.kind === "timeout") {
			const minutes = Math.min(Math.max(Math.floor(action.minutes), 1), MAX_TIMEOUT_MINUTES);
			commands.push(["SET", key.mute(action.memberId), "1", "EX", minutes * 60]);
			logged = { action: "timeout", member: target.name, memberId: action.memberId, minutes };
		} else if (action.kind === "ban") {
			commands.push(["SET", key.ban(action.memberId), "1"]);
			logged = { action: "ban", member: target.name, memberId: action.memberId };
		} else {
			commands.push(["DEL", key.ban(action.memberId)], ["DEL", key.mute(action.memberId)]);
			logged = { action: "unban", member: target.name, memberId: action.memberId };
		}
	}

	commands.push(
		["LPUSH", key.modlog, JSON.stringify({ at: now, by: actor.name, ...logged })],
		["LTRIM", key.modlog, 0, 199],
	);
	await redis.pipeline(commands);
	forgetState();
	return { ok: true };
}
