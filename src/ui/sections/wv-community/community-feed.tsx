"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Channel } from "@/lib/community/channels";
import { layoutFeed, localDayKey, previousDayKey, type ChatMessage } from "@/lib/community/model";
import { ArrowDownIcon, HashIcon } from "./community-icons";
import { MessageRow, type RowActions } from "./community-message";
import { RulesCard } from "./community-rules";

const dayFormat = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "long",
	day: "numeric",
	year: "numeric",
});

/** "Today", "Yesterday", or the full date, for a local day key like "2026-10-06". */
function dayLabel(key: string, todayKey: string, yesterdayKey: string): string {
	if (key === todayKey) return "Today";
	if (key === yesterdayKey) return "Yesterday";
	const [year, month, day] = key.split("-").map(Number);
	return dayFormat.format(new Date(year, month - 1, day));
}

/** The visitor's "today" as a day key, re-read every minute so "Today" rolls over at midnight. The server never has one. */
function subscribeMinute(notify: () => void) {
	const timer = window.setInterval(notify, 60_000);
	return () => window.clearInterval(timer);
}
const readToday = () => localDayKey(Date.now());
const noToday = () => "";

/** Within this many pixels of the bottom counts as "at the bottom", so new messages keep the view pinned there. */
const NEAR_BOTTOM = 80;

type Props = {
	channel: Channel;
	messages: ChatMessage[];
	loaded: boolean;
	hasOlder: boolean;
	loadingOlder: boolean;
	onLoadOlder: () => void;
	/** Bumps each time the visitor sends a message, to bring the view back to the bottom. */
	sendTick: number;
	actions: RowActions;
};

/** One channel's messages: grouped by author, split by day, pinned to the bottom unless the visitor scrolled up. */
export function Feed({
	channel,
	messages,
	loaded,
	hasOlder,
	loadingOlder,
	onLoadOlder,
	sendTick,
	actions,
}: Props) {
	const scroller = useRef<HTMLDivElement>(null);
	// The rules open at the top, where the rules are; every other channel opens at its newest message.
	const pinned = useRef(channel.id !== "rules");
	const newest = useRef("");
	const olderFrom = useRef<{ height: number; firstId: string } | null>(null);
	const [away, setAway] = useState(false);
	// The newest message the visitor has had in view; a newer one while they are scrolled up is "new messages".
	const [readId, setReadId] = useState("");
	const today = useSyncExternalStore(subscribeMinute, readToday, noToday);

	const rows = useMemo(() => layoutFeed(messages), [messages]);
	const newestId = messages[messages.length - 1]?.id ?? "";
	const firstId = messages[0]?.id ?? "";
	const unseen = away && newestId !== readId;

	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return;
		newest.current = newestId;
		const anchor = olderFrom.current;
		if (anchor && firstId !== anchor.firstId) {
			// Older messages were added above: keep what the visitor was reading where it was.
			el.scrollTop += el.scrollHeight - anchor.height;
			olderFrom.current = null;
		} else if (pinned.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages, newestId, firstId]);

	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el || sendTick === 0) return;
		pinned.current = true;
		el.scrollTop = el.scrollHeight;
	}, [sendTick]);

	const onScroll = () => {
		const el = scroller.current;
		if (!el) return;
		const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
		pinned.current = near;
		setAway(!near);
		if (near) setReadId(newest.current);
	};

	const jumpToLatest = () => {
		const el = scroller.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	};

	const loadOlder = () => {
		const el = scroller.current;
		if (el) olderFrom.current = { height: el.scrollHeight, firstId };
		onLoadOlder();
	};

	const jump = (id: string) => {
		const target = document.getElementById(`msg-${id}`);
		if (!target) return actions.notify("That message is further back. Load earlier messages to see it.");
		target.scrollIntoView({ block: "center", behavior: "smooth" });
		target.classList.remove("wv-chat-flash");
		void target.offsetWidth; // restart the animation if it is already running
		target.classList.add("wv-chat-flash");
	};

	return (
		<div className="relative min-h-0 flex-1">
			<div
				ref={scroller}
				onScroll={onScroll}
				role="log"
				aria-live="polite"
				aria-label={`Messages in ${channel.id}`}
				className="wv-chat-scroll h-full overflow-y-auto pb-3 pt-4"
			>
				{channel.id === "rules" && <RulesCard />}

				{hasOlder && (
					<div className="flex justify-center pb-2">
						<button
							type="button"
							onClick={loadOlder}
							disabled={loadingOlder}
							className="rounded-full border border-[var(--wv-purple)] px-4 py-1.5 font-sans text-xs text-[var(--wv-text-dim)] hover:border-[var(--wv-cyan-soft)] hover:text-white disabled:opacity-60"
						>
							{loadingOlder ? "Loading…" : "Load earlier messages"}
						</button>
					</div>
				)}

				{!loaded && <FeedSkeleton />}

				{loaded && !hasOlder && (
					<div className="px-4 pb-4 pt-2 md:px-5">
						<span className="flex size-14 items-center justify-center rounded-full bg-[var(--wv-section)] text-[var(--wv-cyan-soft)]">
							<HashIcon className="size-8" />
						</span>
						<h2 className="mt-3 font-sans text-2xl font-bold text-white">Welcome to #{channel.id}</h2>
						<p className="mt-1 max-w-[520px] font-sans text-sm text-[var(--wv-text-dim)]">
							{channel.topic}
							{messages.length === 0 && !channel.staffOnly
								? " Nothing has been said here yet, so you can go first."
								: ""}
						</p>
					</div>
				)}

				{rows.map(({ message, dayStart, showHeader }) => (
					<div key={message.id} className="wv-chat-pop">
						{dayStart && (
							<div className="my-3 flex items-center gap-3 px-4 font-sans text-[11px] font-semibold text-[var(--wv-muted)]">
								<span className="bg-[var(--wv-purple)]/50 h-px flex-1" />
								{dayLabel(dayStart, today, today && previousDayKey(today))}
								<span className="bg-[var(--wv-purple)]/50 h-px flex-1" />
							</div>
						)}
						<MessageRow
							message={message}
							showHeader={showHeader || dayStart !== null}
							actions={{ ...actions, onJump: jump }}
						/>
					</div>
				))}
			</div>

			{away && (
				<button
					type="button"
					onClick={jumpToLatest}
					className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--wv-cyan-soft)] px-4 py-2 font-sans text-xs font-bold text-[var(--wv-ink)] shadow-lg"
				>
					<ArrowDownIcon className="size-4" />
					{unseen ? "New messages" : "Jump to latest"}
				</button>
			)}
		</div>
	);
}

/** Grey rows shown while a channel's first page loads. */
function FeedSkeleton() {
	return (
		<div aria-hidden className="flex animate-pulse flex-col gap-5 px-4 py-2">
			{[72, 44, 90, 58].map((width, i) => (
				<div key={i} className="flex gap-3">
					<span className="size-10 shrink-0 rounded-full bg-[var(--wv-section)]" />
					<div className="flex flex-1 flex-col gap-2 pt-1">
						<span className="h-3 w-28 rounded bg-[var(--wv-section)]" />
						<span className="h-3 rounded bg-[var(--wv-section)]" style={{ width: `${width}%` }} />
					</div>
				</div>
			))}
		</div>
	);
}
