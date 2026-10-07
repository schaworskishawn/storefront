"use client";

import { useCallback, useEffect, useState } from "react";
import { channelById } from "@/lib/community/channels";
import type { ChatMessage } from "@/lib/community/model";
import { HashIcon, MenuIcon, UsersIcon } from "./community-icons";
import { Composer } from "./community-composer";
import { Feed } from "./community-feed";
import { MemberList } from "./community-members";
import { Sidebar } from "./community-sidebar";
import { useCommunity } from "./use-community";
import type { RowActions } from "./community-message";

type Drawer = "none" | "channels" | "members";

/** The community: channels on the left, the conversation in the middle, who's online on the right (drawers on small screens). */
export function CommunityApp() {
	const community = useCommunity();
	const { session, viewer, channelId } = community;
	const channel = channelById(channelId)!;

	const [drawer, setDrawer] = useState<Drawer>("none");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
	const [draft, setDraft] = useState("");
	const [sendTick, setSendTick] = useState(0);
	const [toast, setToast] = useState<string | null>(null);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(null), 4500);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const openChannel = useCallback(
		(id: string) => {
			community.selectChannel(id);
			setDrawer("none");
			setSelectedId(null);
			setReplyingTo(null);
		},
		[community],
	);

	const mention = useCallback((name: string) => {
		setDraft((text) => `${text}${text && !/\s$/.test(text) ? " " : ""}@${name} `);
		setDrawer("none");
	}, []);

	const named = session.status === "member" ? session.viewer : null;
	const actions: RowActions = {
		viewer: named,
		channelId,
		selectedId,
		onSelect: setSelectedId,
		onReply: setReplyingTo,
		onReact: (messageId, emoji) => void community.react(messageId, emoji),
		onModerate: community.moderate,
		onJump: () => undefined, // The feed supplies this: it owns the scrolling.
		notify: setToast,
	};

	return (
		<div
			data-no-reveal
			className="relative mx-auto grid h-[calc(100dvh-6.5rem)] max-h-[900px] min-h-[520px] w-full max-w-[1440px] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] md:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_248px]"
		>
			{drawer !== "none" && (
				<button
					type="button"
					aria-label="Close panel"
					onClick={() => setDrawer("none")}
					className="absolute inset-0 z-20 bg-black/60 md:hidden xl:hidden"
				/>
			)}

			<aside
				aria-label="Channels"
				className={`absolute inset-y-0 left-0 z-30 w-[84%] max-w-[300px] border-r border-[var(--wv-purple)] transition-transform duration-200 md:static md:z-auto md:w-auto md:max-w-none md:translate-x-0 ${
					drawer === "channels" ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<Sidebar
					session={session}
					channelId={channelId}
					unread={community.unread}
					onSelect={openChannel}
					onClose={() => setDrawer("none")}
					onChooseNickname={community.chooseNickname}
				/>
			</aside>

			<section aria-label={`#${channel.id}`} className="flex min-h-0 min-w-0 flex-col">
				<header className="flex items-center gap-2 border-b border-[var(--wv-purple)] px-3 py-2.5 md:px-4">
					<button
						type="button"
						onClick={() => setDrawer("channels")}
						aria-label="Open channels"
						className="rounded-md p-2 text-[var(--wv-text-dim)] hover:bg-white/10 md:hidden"
					>
						<MenuIcon className="size-5" />
					</button>
					<HashIcon className="size-5 shrink-0 text-[var(--wv-text-dim)]" />
					<h2 className="font-sans text-base font-bold text-white">{channel.id}</h2>
					<span aria-hidden className="mx-1 hidden h-5 w-px bg-[var(--wv-purple)] md:block" />
					<p className="hidden min-w-0 flex-1 truncate font-sans text-sm text-[var(--wv-text-dim)] md:block">
						{channel.topic}
					</p>
					<span className="flex-1 md:hidden" />
					{community.offline && (
						<span
							role="status"
							className="rounded-full bg-[var(--wv-purple)] px-3 py-1 font-sans text-xs text-white"
						>
							Reconnecting…
						</span>
					)}
					<button
						type="button"
						onClick={() => setDrawer("members")}
						aria-label={`Show who's online (${community.roster.online.length})`}
						className="flex items-center gap-1.5 rounded-md p-2 text-[var(--wv-text-dim)] hover:bg-white/10 xl:hidden"
					>
						<UsersIcon className="size-5" />
						<span className="font-sans text-xs font-semibold">{community.roster.online.length}</span>
					</button>
				</header>

				<Feed
					key={channelId}
					channel={channel}
					messages={community.messages}
					loaded={community.loaded}
					hasOlder={community.hasOlder}
					loadingOlder={community.loadingOlder}
					onLoadOlder={community.loadOlder}
					sendTick={sendTick}
					actions={actions}
				/>

				<Composer
					session={session}
					channel={channel}
					draft={draft}
					onDraft={setDraft}
					replyingTo={replyingTo}
					onCancelReply={() => setReplyingTo(null)}
					onSend={community.send}
					onSent={() => setSendTick((tick) => tick + 1)}
					onChooseNickname={community.chooseNickname}
					onShowRules={() => openChannel("rules")}
				/>
			</section>

			<aside
				aria-label="Members online"
				className={`absolute inset-y-0 right-0 z-30 w-[78%] max-w-[300px] border-l border-[var(--wv-purple)] transition-transform duration-200 xl:static xl:z-auto xl:w-auto xl:max-w-none xl:translate-x-0 ${
					drawer === "members" ? "translate-x-0" : "translate-x-full"
				}`}
			>
				<MemberList
					roster={community.roster}
					viewerId={viewer?.memberId ?? null}
					onMention={mention}
					onClose={() => setDrawer("none")}
				/>
			</aside>

			{toast && (
				<p
					role="status"
					className="absolute bottom-24 left-1/2 z-40 max-w-[90%] -translate-x-1/2 rounded-lg border border-[var(--wv-cyan-soft)] bg-[var(--wv-section)] px-4 py-2 font-sans text-sm text-white shadow-xl"
				>
					{toast}
				</p>
			)}
		</div>
	);
}
