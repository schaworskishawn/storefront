import { REACTION_EMOJIS, type ChatMessage, type Reactions } from "./model";

/**
 * The page's side of the feed, with no React in it so it can be tested: when to poll, how new messages join the ones
 * already shown, which channels have something unread, and how reactions look to the person viewing them.
 */

export const POLL_ACTIVE_MS = 4000;
export const POLL_IDLE_MS = 12_000;
/** After this long without the visitor doing anything, polling slows down. */
export const IDLE_AFTER_MS = 60_000;
/** After this long it stops until they touch the page again (so a forgotten tab costs nothing). */
export const STOP_AFTER_MS = 10 * 60_000;
export const HEARTBEAT_MS = 60_000;

/** How long to wait before the next poll, or null to stop until the visitor comes back. */
export function pollDelay(idleMs: number, visible: boolean): number | null {
	if (!visible || idleMs >= STOP_AFTER_MS) return null;
	return idleMs >= IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
}

/** After a failed poll, wait longer each time (up to eight times as long) so a struggling server isn't hammered. */
export const backoff = (delay: number, failures: number): number => delay * 2 ** Math.min(failures, 3);

/** Add messages that arrived after the ones shown, skipping any already there (a message you just sent also comes back in a poll). */
export function mergeAppend(shown: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
	if (!incoming.length) return shown as ChatMessage[];
	const have = new Set(shown.map((m) => m.id));
	const fresh = incoming.filter((m) => !have.has(m.id));
	return fresh.length ? [...shown, ...fresh] : (shown as ChatMessage[]);
}

/** Put a page of older messages in front, skipping any already there. */
export function mergeOlder(shown: readonly ChatMessage[], older: readonly ChatMessage[]): ChatMessage[] {
	const have = new Set(shown.map((m) => m.id));
	return [...older.filter((m) => !have.has(m.id)), ...shown];
}

export const withoutMessage = (shown: readonly ChatMessage[], id: string): ChatMessage[] =>
	shown.filter((m) => m.id !== id);

/**
 * The channels with something the visitor hasn't seen: the newest message there isn't the one they last saw. The channel
 * they are in never counts, and a channel with no messages never does.
 */
export function unreadChannels(
	heads: Readonly<Record<string, string>>,
	seen: Readonly<Record<string, string>>,
	current: string,
): Set<string> {
	const unread = new Set<string>();
	for (const [channel, head] of Object.entries(heads)) {
		if (channel !== current && head && seen[channel] !== head) unread.add(channel);
	}
	return unread;
}

/** The newest message id a cursor ("<id>|<counter>") points at, or "" for an empty channel. */
export const headOfCursor = (cursor: string | null | undefined): string => cursor?.split("|")[0] ?? "";

export type ReactionChip = { emoji: string; count: number; mine: boolean };

/** The reactions on a message as the viewer sees them: in the usual emoji order, with their own marked. */
export function reactionChips(reactions: Reactions, viewerId: string | null): ReactionChip[] {
	return REACTION_EMOJIS.flatMap((emoji) => {
		const who = reactions[emoji];
		return who?.length ? [{ emoji, count: who.length, mine: !!viewerId && who.includes(viewerId) }] : [];
	});
}

/** The same toggle the server will make, applied at once so a tap feels instant. The next poll replaces it with the truth. */
export function toggleReactionLocal(reactions: Reactions, emoji: string, memberId: string): Reactions {
	const who = reactions[emoji] ?? [];
	const next = who.includes(memberId) ? who.filter((id) => id !== memberId) : [...who, memberId];
	const { [emoji]: _removed, ...rest } = reactions;
	return next.length ? { ...rest, [emoji]: next } : rest;
}
