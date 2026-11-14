"use client";

import { useState } from "react";
import type { ViewerInfo } from "@/lib/community/client";
import { reactionChips } from "@/lib/community/feed-state";
import { REACTION_EMOJIS, canModerate, isModerator, mentions, type ChatMessage } from "@/lib/community/model";
import { Avatar, MessageText, RoleBadge, nameColor } from "./community-bits";
import { MoreIcon, ReplyIcon, SmileIcon } from "./community-icons";
import type { ModerationRequest, Outcome } from "./use-community";

const shortTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const fullTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export type RowActions = {
	viewer: ViewerInfo | null;
	channelId: string;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onReply: (message: ChatMessage) => void;
	onReact: (messageId: string, emoji: string) => void;
	onModerate: (request: ModerationRequest) => Promise<Outcome>;
	onJump: (messageId: string) => void;
	notify: (text: string) => void;
};

const toolButton =
	"flex size-8 items-center justify-center rounded-md text-[var(--wv-text-dim)] hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wv-cyan)]";

export function MessageRow({
	message,
	showHeader,
	actions,
}: {
	message: ChatMessage;
	showHeader: boolean;
	actions: RowActions;
}) {
	const { viewer, selectedId, onSelect } = actions;
	const [picker, setPicker] = useState(false);
	const [menu, setMenu] = useState(false);
	const selected = selectedId === message.id;
	const mine = viewer?.memberId === message.authorId;
	const mentioned = !!viewer && !mine && mentions(message.text, viewer.name ?? "");
	const chips = reactionChips(message.reactions, viewer?.memberId ?? null);
	const canAct = !!viewer && viewer.name !== null;
	const staffTarget =
		!!viewer && (canModerate(viewer.role, message.role) || (mine && isModerator(viewer.role)));
	const canTimeOut = !!viewer && !mine && canModerate(viewer.role, message.role);
	const toolbarOpen = selected || picker || menu;

	const run = async (request: ModerationRequest, done: string) => {
		setMenu(false);
		const result = await actions.onModerate(request);
		actions.notify(result.ok ? done : result.message);
	};

	return (
		<div
			id={`msg-${message.id}`}
			role="article"
			tabIndex={0}
			onClick={(event) => {
				if ((event.target as HTMLElement).closest("a,button")) return;
				onSelect(selected ? null : message.id);
			}}
			className={`group relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 px-3 py-0.5 outline-none hover:bg-white/[0.03] focus-visible:bg-white/[0.05] md:px-4 ${
				showHeader ? "mt-3" : ""
			} ${
				mentioned
					? "border-l-2 border-[var(--wv-cyan)] bg-[color-mix(in_srgb,var(--wv-cyan)_8%,transparent)]"
					: "border-l-2 border-transparent"
			}`}
		>
			{showHeader ? (
				<Avatar memberId={message.authorId} name={message.name} className="mt-0.5 size-10 text-base" />
			) : (
				<time
					dateTime={new Date(message.at).toISOString()}
					className="hidden pt-1 text-right text-[10px] leading-5 text-[var(--wv-muted)] group-hover:block"
				>
					{shortTime.format(message.at)}
				</time>
			)}
			<div className={`min-w-0 ${showHeader ? "" : "col-start-2 row-start-1"}`}>
				{message.reply && (
					<button
						type="button"
						onClick={() => actions.onJump(message.reply!.id)}
						className="mb-0.5 flex max-w-full items-center gap-1.5 text-left text-xs text-[var(--wv-text-dim)] hover:text-white"
					>
						<ReplyIcon className="size-3.5 shrink-0 -scale-x-100" />
						<span className="shrink-0 font-semibold text-white/80">@{message.reply.name}</span>
						<span className="truncate">{message.reply.text}</span>
					</button>
				)}
				{showHeader && (
					<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
						<span className={`font-sans text-[15px] font-semibold ${nameColor(message.role)}`}>
							{message.name}
						</span>
						<RoleBadge role={message.role} />
						<time
							dateTime={new Date(message.at).toISOString()}
							title={fullTime.format(message.at)}
							className="text-[11px] text-[var(--wv-muted)]"
						>
							{shortTime.format(message.at)}
						</time>
					</div>
				)}
				<p className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.45] text-white/90">
					<MessageText text={message.text} />
				</p>
				{chips.length > 0 && (
					<div className="mt-1 flex flex-wrap gap-1.5">
						{chips.map((chip) => (
							<button
								key={chip.emoji}
								type="button"
								disabled={!canAct}
								onClick={() => actions.onReact(message.id, chip.emoji)}
								aria-pressed={chip.mine}
								aria-label={`${chip.emoji} ${chip.count}${chip.mine ? ", you reacted" : ""}`}
								className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${
									chip.mine
										? "border-[var(--wv-cyan)] bg-[color-mix(in_srgb,var(--wv-cyan)_18%,transparent)] text-white"
										: "border-[var(--wv-purple)] bg-[var(--wv-control)] text-[var(--wv-text-dim)] hover:border-[var(--wv-cyan-soft)]"
								} disabled:cursor-default`}
							>
								<span>{chip.emoji}</span>
								<span className="font-sans text-xs font-semibold">{chip.count}</span>
							</button>
						))}
					</div>
				)}
			</div>

			{canAct && (
				<div
					className={`absolute -top-4 right-3 z-10 items-center gap-0.5 rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-section)] p-0.5 shadow-lg ${
						toolbarOpen ? "flex" : "hidden group-focus-within:flex group-hover:flex"
					}`}
				>
					{picker ? (
						REACTION_EMOJIS.map((emoji) => (
							<button
								key={emoji}
								type="button"
								aria-label={`React with ${emoji}`}
								onClick={() => {
									actions.onReact(message.id, emoji);
									setPicker(false);
									onSelect(null);
								}}
								className={`${toolButton} text-lg`}
							>
								{emoji}
							</button>
						))
					) : (
						<>
							<button
								type="button"
								aria-label="Add reaction"
								title="React"
								onClick={() => setPicker(true)}
								className={toolButton}
							>
								<SmileIcon className="size-[18px]" />
							</button>
							<button
								type="button"
								aria-label={`Reply to ${message.name}`}
								title="Reply"
								onClick={() => {
									actions.onReply(message);
									onSelect(null);
								}}
								className={toolButton}
							>
								<ReplyIcon className="size-[18px]" />
							</button>
							{staffTarget && (
								<div className="relative">
									<button
										type="button"
										aria-label="Moderation"
										aria-haspopup="menu"
										aria-expanded={menu}
										title="Moderate"
										onClick={() => setMenu((open) => !open)}
										className={toolButton}
									>
										<MoreIcon className="size-[18px]" />
									</button>
									{menu && (
										<div
											role="menu"
											className="absolute right-0 top-full z-20 mt-1 flex w-52 flex-col rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-section)] p-1 font-sans text-sm shadow-xl"
										>
											<button
												type="button"
												role="menuitem"
												className="rounded-md px-3 py-2 text-left text-[var(--wv-pink)] hover:bg-white/10"
												onClick={() =>
													run(
														{ action: "delete", channel: actions.channelId, messageId: message.id },
														"Message removed.",
													)
												}
											>
												Delete message
											</button>
											{canTimeOut && (
												<>
													<button
														type="button"
														role="menuitem"
														className="rounded-md px-3 py-2 text-left hover:bg-white/10"
														onClick={() =>
															run(
																{ action: "timeout", memberId: message.authorId, minutes: 60 },
																`${message.name} is timed out for an hour.`,
															)
														}
													>
														Time out for 1 hour
													</button>
													<button
														type="button"
														role="menuitem"
														className="rounded-md px-3 py-2 text-left hover:bg-white/10"
														onClick={() =>
															run(
																{ action: "timeout", memberId: message.authorId, minutes: 1440 },
																`${message.name} is timed out for a day.`,
															)
														}
													>
														Time out for 24 hours
													</button>
													<button
														type="button"
														role="menuitem"
														className="rounded-md px-3 py-2 text-left text-[var(--wv-pink)] hover:bg-white/10"
														onClick={() => {
															if (
																!window.confirm(
																	`Remove ${message.name} from the community? They won't be able to post.`,
																)
															)
																return;
															void run(
																{ action: "ban", memberId: message.authorId },
																`${message.name} was removed.`,
															);
														}}
													>
														Remove from community
													</button>
												</>
											)}
										</div>
									)}
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
