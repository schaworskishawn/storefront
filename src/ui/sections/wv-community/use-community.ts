"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import {
	call,
	type FeedReply,
	type OlderReply,
	type Roster,
	type SessionState,
	type ViewerInfo,
} from "@/lib/community/client";
import { DEFAULT_CHANNEL_ID, channelById } from "@/lib/community/channels";
import {
	HEARTBEAT_MS,
	STOP_AFTER_MS,
	backoff,
	headOfCursor,
	mergeAppend,
	mergeOlder,
	pollDelay,
	toggleReactionLocal,
	unreadChannels,
	withoutMessage,
} from "@/lib/community/feed-state";
import type { ChatMessage } from "@/lib/community/model";

/**
 * Everything the community page does with the server: who the visitor is, the messages of the channel they are in (kept per
 * channel, so switching back is instant), a poll that slows down when they go idle and stops when the tab is hidden, the
 * online list, unread dots, and the actions (send, react, moderate, choose a nickname).
 */

type ChannelData = { messages: ChatMessage[]; cursor: string | null; hasOlder: boolean; loaded: boolean };
type Data = Record<string, ChannelData>;

type Action =
	| { type: "replace"; channel: string; messages: ChatMessage[]; cursor: string; hasOlder: boolean }
	| { type: "append"; channel: string; messages: ChatMessage[]; cursor: string }
	| { type: "older"; channel: string; messages: ChatMessage[]; hasOlder: boolean }
	| { type: "add"; channel: string; message: ChatMessage }
	| { type: "remove"; channel: string; id: string }
	| { type: "react"; channel: string; id: string; emoji: string; memberId: string };

const EMPTY: ChannelData = { messages: [], cursor: null, hasOlder: false, loaded: false };

function reducer(state: Data, action: Action): Data {
	const current = state[action.channel] ?? EMPTY;
	const set = (next: Partial<ChannelData>): Data => ({ ...state, [action.channel]: { ...current, ...next } });
	switch (action.type) {
		case "replace":
			return set({
				messages: action.messages,
				cursor: action.cursor,
				hasOlder: action.hasOlder,
				loaded: true,
			});
		case "append":
			return set({
				messages: mergeAppend(current.messages, action.messages),
				cursor: action.cursor,
				loaded: true,
			});
		case "older":
			return set({ messages: mergeOlder(current.messages, action.messages), hasOlder: action.hasOlder });
		case "add":
			return set({ messages: mergeAppend(current.messages, [action.message]) });
		case "remove":
			return set({ messages: withoutMessage(current.messages, action.id) });
		case "react":
			return set({
				messages: current.messages.map((m) =>
					m.id === action.id
						? { ...m, reactions: toggleReactionLocal(m.reactions, action.emoji, action.memberId) }
						: m,
				),
			});
	}
}

const SEEN_KEY = "wv-community-seen-v1";

function readSeen(): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
	} catch {
		return {};
	}
}

const writeSeen = (seen: Record<string, string>) => {
	try {
		localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
	} catch {
		// Private windows can refuse storage; unread dots just won't persist.
	}
};

/** The channel lives in the URL's #fragment (/community#product-talk), so a link can open straight into one. */
const hashListeners = new Set<() => void>();

function subscribeHash(notify: () => void) {
	hashListeners.add(notify);
	window.addEventListener("hashchange", notify);
	return () => {
		hashListeners.delete(notify);
		window.removeEventListener("hashchange", notify);
	};
}

const readHash = () => window.location.hash.slice(1);
const noHash = () => "";

type SessionReply = { status: "guest" | "unavailable" | "needs-name" | "member"; viewer?: ViewerInfo };

async function fetchSession(): Promise<SessionState> {
	const result = await call<SessionReply>("/api/community/session");
	if (!result.ok) return { status: "unavailable" };
	const { status, viewer } = result.data;
	if ((status === "member" || status === "needs-name") && viewer) return { status, viewer };
	return { status: status === "guest" ? "guest" : "unavailable" };
}

export type Outcome = { ok: true } | { ok: false; message: string };

export type ModerationRequest =
	| { action: "delete"; channel: string; messageId: string }
	| { action: "timeout"; memberId: string; minutes: number }
	| { action: "ban" | "unban"; memberId: string };

export function useCommunity() {
	const [session, setSession] = useState<SessionState>({ status: "loading" });
	const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
	const channelId = channelById(hash)?.id ?? DEFAULT_CHANNEL_ID;
	const [data, dispatch] = useReducer(reducer, {} as Data);
	const [heads, setHeads] = useState<Record<string, string>>({});
	const [seen, setSeen] = useState(readSeen);
	const [roster, setRoster] = useState<Roster>({ online: [], total: 0 });
	const [offline, setOffline] = useState(false);
	const [loadingOlder, setLoadingOlder] = useState(false);

	const dataRef = useRef(data);
	const lastActive = useRef(0);
	const wakers = useRef(new Set<() => void>());
	useEffect(() => {
		dataRef.current = data;
	}, [data]);

	// ---- Who is looking ----------------------------------------------------
	useEffect(() => {
		let cancelled = false;
		void fetchSession().then((state) => {
			if (!cancelled) setSession(state);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// ---- Which channel -----------------------------------------------------
	const selectChannel = useCallback((id: string) => {
		if (!channelById(id)) return;
		window.history.replaceState(null, "", `#${id}`);
		hashListeners.forEach((notify) => notify());
	}, []);

	// What the visitor has read, for the unread dots.
	const markSeen = useCallback((channel: string, head: string) => {
		if (!head) return;
		setSeen((previous) => {
			if (previous[channel] === head) return previous;
			const next = { ...previous, [channel]: head };
			writeSeen(next);
			return next;
		});
	}, []);

	// ---- Activity: slow down when the visitor is idle, stop when they leave ----
	useEffect(() => {
		lastActive.current = Date.now();
		const touch = () => {
			lastActive.current = Date.now();
			wakers.current.forEach((wake) => wake());
		};
		const events = ["pointerdown", "keydown", "touchstart", "wheel", "focus"] as const;
		for (const name of events) window.addEventListener(name, touch, { passive: true });
		document.addEventListener("visibilitychange", touch);
		return () => {
			for (const name of events) window.removeEventListener(name, touch);
			document.removeEventListener("visibilitychange", touch);
		};
	}, []);

	// ---- The feed of the channel they are in --------------------------------
	useEffect(() => {
		let stopped = false;
		let inFlight = false;
		let paused = false;
		let failures = 0;
		let timer: number | undefined;
		const controller = new AbortController();
		const registry = wakers.current;

		const run = async () => {
			timer = undefined;
			if (stopped || inFlight) return;
			const wait = pollDelay(Date.now() - lastActive.current, document.visibilityState === "visible");
			if (wait === null) {
				paused = true;
				return;
			}
			inFlight = true;
			const cursor = dataRef.current[channelId]?.cursor;
			const result = await call<FeedReply>(
				`/api/community/feed?channel=${channelId}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
				undefined,
				controller.signal,
			);
			inFlight = false;
			if (stopped) return;

			if (result.ok) {
				failures = 0;
				setOffline(false);
				const reply = result.data;
				setHeads(reply.heads);
				markSeen(channelId, headOfCursor(reply.cursor));
				if (reply.mode === "replace")
					dispatch({
						type: "replace",
						channel: channelId,
						messages: reply.messages,
						cursor: reply.cursor,
						hasOlder: reply.hasOlder,
					});
				else if (reply.mode === "append")
					dispatch({ type: "append", channel: channelId, messages: reply.messages, cursor: reply.cursor });
			} else {
				failures += 1;
				if (failures >= 2) setOffline(true);
			}
			timer = window.setTimeout(run, backoff(wait, failures));
		};

		const resume = () => {
			if (!paused || stopped) return;
			paused = false;
			void run();
		};
		registry.add(resume);
		void run();

		return () => {
			stopped = true;
			controller.abort();
			if (timer !== undefined) window.clearTimeout(timer);
			registry.delete(resume);
		};
	}, [channelId, markSeen]);

	// ---- The online list, which doubles as "I'm here" for a member ---------------
	const signedIn = session.status === "member";
	const known = session.status !== "loading";
	useEffect(() => {
		if (!known) return;
		let stopped = false;
		const beat = async () => {
			if (document.visibilityState !== "visible" || Date.now() - lastActive.current >= STOP_AFTER_MS) return;
			const result = await call<Roster>("/api/community/members", signedIn ? {} : undefined);
			if (!stopped && result.ok) setRoster(result.data);
		};
		void beat();
		const interval = window.setInterval(beat, HEARTBEAT_MS);
		// Coming back to the tab refreshes the list at once instead of waiting for the next beat.
		document.addEventListener("visibilitychange", beat);
		return () => {
			stopped = true;
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", beat);
		};
	}, [known, signedIn]);

	// ---- Actions -----------------------------------------------------------------
	const viewer = session.status === "member" || session.status === "needs-name" ? session.viewer : null;

	const send = useCallback(
		async (text: string, replyTo: string | null): Promise<Outcome> => {
			const result = await call<{ message: ChatMessage }>("/api/community/messages", {
				channel: channelId,
				text,
				replyTo,
			});
			if (result.ok) {
				dispatch({ type: "add", channel: channelId, message: result.data.message });
				return { ok: true };
			}
			if (result.status === 401) void fetchSession().then(setSession);
			return { ok: false, message: result.message };
		},
		[channelId],
	);

	const react = useCallback(
		async (messageId: string, emoji: string) => {
			if (session.status !== "member") return;
			const local = {
				type: "react",
				channel: channelId,
				id: messageId,
				emoji,
				memberId: session.viewer.memberId,
			} as const;
			dispatch(local);
			const result = await call("/api/community/react", { channel: channelId, messageId, emoji });
			if (!result.ok) dispatch(local); // The same toggle again puts it back.
		},
		[channelId, session],
	);

	const moderate = useCallback(async (request: ModerationRequest): Promise<Outcome> => {
		const result = await call("/api/community/mod", request);
		if (!result.ok) return { ok: false, message: result.message };
		if (request.action === "delete")
			dispatch({ type: "remove", channel: request.channel, id: request.messageId });
		return { ok: true };
	}, []);

	const chooseNickname = useCallback(async (name: string): Promise<Outcome> => {
		const result = await call<{ viewer: ViewerInfo }>("/api/community/profile", { name });
		if (!result.ok) return { ok: false, message: result.message };
		setSession({ status: "member", viewer: result.data.viewer });
		return { ok: true };
	}, []);

	const loadOlder = useCallback(async () => {
		const first = dataRef.current[channelId]?.messages[0];
		if (!first || loadingOlder) return;
		setLoadingOlder(true);
		const result = await call<OlderReply>(
			`/api/community/feed?channel=${channelId}&before=${encodeURIComponent(first.id)}`,
		);
		setLoadingOlder(false);
		if (result.ok)
			dispatch({
				type: "older",
				channel: channelId,
				messages: result.data.messages,
				hasOlder: result.data.hasOlder,
			});
	}, [channelId, loadingOlder]);

	const channel = data[channelId] ?? EMPTY;
	return {
		session,
		viewer,
		channelId,
		selectChannel,
		messages: channel.messages,
		loaded: channel.loaded,
		hasOlder: channel.hasOlder,
		loadingOlder,
		loadOlder,
		unread: unreadChannels(heads, seen, channelId),
		roster,
		offline,
		send,
		react,
		moderate,
		chooseNickname,
	};
}
