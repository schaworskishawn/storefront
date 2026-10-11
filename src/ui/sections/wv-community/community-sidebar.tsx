"use client";

import { useState } from "react";
import { CHANNELS, type Channel } from "@/lib/community/channels";
import type { SessionState } from "@/lib/community/client";
import { Avatar, RoleBadge } from "./community-bits";
import { CloseIcon, HashIcon, LockIcon } from "./community-icons";
import { NicknameForm } from "./community-nickname";
import type { Outcome } from "./use-community";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";

const GROUPS = ["Start here", "Talk"] as const;

type Props = {
	session: SessionState;
	channelId: string;
	unread: Set<string>;
	onSelect: (id: string) => void;
	onClose: () => void;
	onChooseNickname: (name: string) => Promise<Outcome>;
};

function ChannelButton({
	channel,
	active,
	unread,
	onSelect,
}: {
	channel: Channel;
	active: boolean;
	unread: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active ? "page" : undefined}
			className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-[15px] ${
				active
					? "bg-[var(--wv-section)] font-semibold text-white"
					: unread
						? "font-semibold text-white hover:bg-white/5"
						: "text-[var(--wv-text-dim)] hover:bg-white/5 hover:text-white"
			}`}
		>
			<HashIcon className="size-[18px] shrink-0 opacity-70" />
			<span className="min-w-0 flex-1 truncate">{channel.id}</span>
			{channel.staffOnly && <LockIcon className="size-3.5 shrink-0 opacity-50" />}
			{unread && (
				<span
					role="img"
					aria-label="Unread messages"
					className="size-2.5 shrink-0 rounded-full bg-[var(--wv-pink)] shadow-[0_0_8px_var(--wv-pink)]"
				/>
			)}
		</button>
	);
}

/** The channel list and the visitor's own nickname. On a phone it slides in over the feed. */
export function Sidebar({ session, channelId, unread, onSelect, onClose, onChooseNickname }: Props) {
	const [editing, setEditing] = useState(false);
	const viewer = session.status === "member" ? session.viewer : null;

	return (
		<div className="flex h-full min-h-0 flex-col bg-[var(--wv-deep)]">
			<div className="flex items-center justify-between border-b border-[var(--wv-purple)] px-4 py-3">
				<div>
					<p className={`${heyComic} text-[11px] uppercase tracking-[2px] text-[var(--wv-pink)]`}>
						Worldwide vapor
					</p>
					<p className={`${bungee} text-lg leading-6 text-[var(--wv-cyan-soft)]`}>COMMUNITY</p>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close channels"
					className="rounded-md p-2 text-[var(--wv-text-dim)] hover:bg-white/10 md:hidden"
				>
					<CloseIcon className="size-5" />
				</button>
			</div>

			<nav aria-label="Channels" className="wv-chat-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
				{GROUPS.map((group) => (
					<div key={group} className="mb-4">
						<p
							className={`${heyComic} px-2.5 pb-1 text-[11px] uppercase tracking-[2px] text-[var(--wv-muted)]`}
						>
							{group}
						</p>
						{CHANNELS.filter((channel) => channel.group === group).map((channel) => (
							<ChannelButton
								key={channel.id}
								channel={channel}
								active={channel.id === channelId}
								unread={unread.has(channel.id)}
								onSelect={() => onSelect(channel.id)}
							/>
						))}
					</div>
				))}
			</nav>

			<div className="bg-[var(--wv-section)]/60 border-t border-[var(--wv-purple)]">
				{editing && viewer ? (
					<div className="relative">
						<NicknameForm
							variant="edit"
							current={viewer.name ?? ""}
							onSubmit={onChooseNickname}
							onDone={() => setEditing(false)}
						/>
						<button
							type="button"
							onClick={() => setEditing(false)}
							className="absolute right-2 top-2 rounded p-1 text-[var(--wv-text-dim)] hover:bg-white/10"
							aria-label="Cancel"
						>
							<CloseIcon className="size-4" />
						</button>
					</div>
				) : viewer ? (
					<div className="flex items-center gap-2.5 px-3 py-3">
						<Avatar memberId={viewer.memberId} name={viewer.name ?? "?"} className="size-9 text-sm" />
						<div className="min-w-0 flex-1">
							<p className="truncate font-sans text-sm font-semibold text-white">{viewer.name}</p>
							<div className="flex items-center gap-1.5">
								<span className="size-2 rounded-full bg-[var(--wv-cyan)]" />
								<span className="font-sans text-xs text-[var(--wv-text-dim)]">Online</span>
								<RoleBadge role={viewer.role} />
							</div>
						</div>
						<button
							type="button"
							onClick={() => setEditing(true)}
							className="rounded-md px-2 py-1.5 font-sans text-xs text-[var(--wv-text-dim)] hover:bg-white/10 hover:text-white"
						>
							Edit
						</button>
					</div>
				) : (
					<p className="px-4 py-3 font-sans text-xs leading-[1.45] text-[var(--wv-muted)]">
						{session.status === "loading" ? " " : "You are reading as a guest."}
					</p>
				)}
			</div>
		</div>
	);
}
