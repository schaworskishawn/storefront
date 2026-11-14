import type { Channel } from "./channels";

/** What a member, a message and a reaction look like, plus the rules about what may be said. No I/O here. */

export const MESSAGE_MAX = 500;
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
export const MAX_LINKS = 2;
export const REPLY_EXCERPT_MAX = 90;
/** A member counts as online for this long after their last heartbeat (the page sends one a minute). */
export const ONLINE_WINDOW_MS = 150_000;

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "🙏"] as const;

export type Role = "member" | "mod" | "staff";

/** Who is looking: a member id is the public, random identity (never the Saleor user id or email). */
export type Viewer = { memberId: string; name: string; role: Role };

/** Who reacted with each emoji, by member id. The page works out the counts and which are the viewer's own. */
export type Reactions = Record<string, string[]>;

export type ReplyRef = { id: string; name: string; text: string };

export type ChatMessage = {
	/** The Redis stream id, "<ms>-<seq>", so it sorts in posting order. */
	id: string;
	authorId: string;
	name: string;
	role: Role;
	text: string;
	/** Milliseconds since the epoch. */
	at: number;
	reply: ReplyRef | null;
	reactions: Reactions;
};

export type OnlineMember = { memberId: string; name: string; role: Role };

export const isModerator = (role: Role): boolean => role === "mod" || role === "staff";

export const canPostIn = (channel: Channel, role: Role): boolean => !channel.staffOnly || isModerator(role);

/** Staff can act on anyone but other staff; a moderator can only act on ordinary members. */
export function canModerate(actor: Role, target: Role): boolean {
	if (actor === "staff") return target !== "staff";
	if (actor === "mod") return target === "member";
	return false;
}

// ---- Messages --------------------------------------------------------------

/**
 * Strip control characters and the invisible direction overrides, unify line breaks, drop runs of blank lines, trim, and
 * cap the length. The zero-width joiner (U+200D) stays: compound emoji like 👨‍👩‍👧 are built with it.
 */
export function cleanMessage(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​‌‎‏‪-‮⁦-⁩]/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.slice(0, MESSAGE_MAX);
}

const LINK = /https?:\/\/\S+|\bwww\.\S+/gi;

export const countLinks = (text: string): number => text.match(LINK)?.length ?? 0;

/** Returns what to tell the member when the message can't be posted, or null when it can. */
export function messageProblem(text: string): string | null {
	if (!text) return "Write something first.";
	if (countLinks(text) > MAX_LINKS) return `Keep it to ${MAX_LINKS} links or fewer per message.`;
	return null;
}

export const excerpt = (text: string, max = REPLY_EXCERPT_MAX): string => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** A stream id's timestamp. */
export function timeFromId(id: string): number {
	const ms = Number(id.split("-")[0]);
	return Number.isFinite(ms) ? ms : 0;
}

// ---- Nicknames ---------------------------------------------------------------

const NICKNAME_SHAPE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]*[\p{L}\p{N}]$/u;

/** Names that read as the store or its team. Only moderators and staff may use them. */
const RESERVED = ["admin", "moderator", "staff", "owner", "official", "worldwidevapor", "support"];

const flatName = (name: string) => name.toLowerCase().replace(/[\s_.-]/g, "");

export type NicknameResult = { ok: true; name: string } | { ok: false; message: string };

export function checkNickname(raw: unknown, role: Role = "member"): NicknameResult {
	const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
	if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX)
		return { ok: false, message: `Use ${NICKNAME_MIN} to ${NICKNAME_MAX} characters.` };
	if (!NICKNAME_SHAPE.test(name))
		return {
			ok: false,
			message:
				"Use letters, numbers, spaces, dots, dashes and underscores, starting and ending with a letter or number.",
		};
	if (/\.[a-z]{2,}/i.test(name)) return { ok: false, message: "Nicknames can't look like a web address." };
	if (!isModerator(role) && RESERVED.some((word) => flatName(name).includes(word)))
		return { ok: false, message: "That name looks like it belongs to the store's team. Pick another." };
	return { ok: true, name };
}

/** The key a nickname is unique under: case and spacing don't make a different name. */
export const nameKey = (name: string): string => name.toLowerCase().replace(/\s+/g, " ").trim();

// ---- Looks -------------------------------------------------------------------

/** Avatar background colours, all dark enough for white lettering. Data, not styling, so they live in this file. */
const AVATAR_COLORS = [
	"#7a1fa2",
	"#1f6fa2",
	"#a21f6f",
	"#1fa28a",
	"#a2641f",
	"#4c3fb0",
	"#2b8a3e",
	"#b0423f",
];

export function avatarColor(memberId: string): string {
	let hash = 0;
	for (let i = 0; i < memberId.length; i++) hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
	return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

// ---- Layout of the feed ------------------------------------------------------

/** Two messages by the same member this close together share one name and avatar. */
export const GROUP_WINDOW_MS = 5 * 60_000;

export type FeedRow = {
	message: ChatMessage;
	/** The day divider to draw above this message, as a stable key ("2026-10-06"), or null. */
	dayStart: string | null;
	/** Show the avatar, name and time, rather than just the text continuing the message above. */
	showHeader: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** The visitor's local calendar day for a timestamp. */
export const localDayKey = (at: number): string => {
	const d = new Date(at);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The day before a local day key ("2026-10-01" -> "2026-09-30"). */
export function previousDayKey(key: string): string {
	const [year, month, day] = key.split("-").map(Number);
	return localDayKey(new Date(year, month - 1, day - 1).getTime());
}

export function layoutFeed(
	messages: readonly ChatMessage[],
	dayOf: (at: number) => string = localDayKey,
): FeedRow[] {
	return messages.map((message, index) => {
		const previous = messages[index - 1];
		const day = dayOf(message.at);
		const dayStart = !previous || dayOf(previous.at) !== day ? day : null;
		const showHeader =
			dayStart !== null ||
			!previous ||
			previous.authorId !== message.authorId ||
			message.at - previous.at > GROUP_WINDOW_MS ||
			message.reply !== null;
		return { message, dayStart, showHeader };
	});
}

/** Whether a message mentions this nickname ("@name", not the middle of another word). */
export function mentions(text: string, name: string): boolean {
	if (!name) return false;
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(text);
}
