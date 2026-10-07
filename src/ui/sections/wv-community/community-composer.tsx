"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/community/channels";
import type { SessionState } from "@/lib/community/client";
import { MESSAGE_MAX, canPostIn, type ChatMessage } from "@/lib/community/model";
import { CloseIcon, LockIcon, SendIcon } from "./community-icons";
import { NicknameForm } from "./community-nickname";
import type { Outcome } from "./use-community";

const heyComic = "font-[family-name:var(--font-hey-comic)]";

type Props = {
	session: SessionState;
	channel: Channel;
	draft: string;
	onDraft: (text: string) => void;
	replyingTo: ChatMessage | null;
	onCancelReply: () => void;
	onSend: (text: string, replyTo: string | null) => Promise<Outcome>;
	onSent: () => void;
	onChooseNickname: (name: string) => Promise<Outcome>;
	onShowRules: () => void;
};

const bar = "border-t border-[var(--wv-purple)] bg-[var(--wv-deep)]";

function Notice({ children }: { children: React.ReactNode }) {
	return (
		<div className={`${bar} flex items-center gap-2 px-4 py-4 font-sans text-sm text-[var(--wv-text-dim)]`}>
			{children}
		</div>
	);
}

/** The box at the bottom of a channel. What it shows depends on who is looking and whether they may post here. */
export function Composer(props: Props) {
	const { session, channel } = props;

	if (session.status === "loading") return <div aria-hidden className={`${bar} h-[68px]`} />;

	if (session.status === "guest")
		return (
			<div className={`${bar} flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}>
				<p className="font-sans text-sm text-[var(--wv-text-dim)]">
					Anyone can read along. <strong className="text-white">Sign in with your store account</strong> to
					join the conversation.
				</p>
				<div className="flex gap-2">
					<Link
						href="/login?next=/community"
						className={`${heyComic} rounded-lg bg-[var(--wv-cyan-soft)] px-5 py-2.5 text-sm text-[var(--wv-ink)]`}
					>
						SIGN IN
					</Link>
					<Link
						href="/register"
						className={`${heyComic} rounded-lg border border-[var(--wv-cyan-soft)] px-5 py-2.5 text-sm text-[var(--wv-cyan-soft)]`}
					>
						CREATE ACCOUNT
					</Link>
				</div>
			</div>
		);

	if (session.status === "unavailable")
		return <Notice>We couldn&apos;t check your sign-in just now. Refresh the page in a moment.</Notice>;

	if (session.status === "needs-name")
		return (
			<div className={bar}>
				<NicknameForm variant="welcome" onSubmit={props.onChooseNickname} onShowRules={props.onShowRules} />
			</div>
		);

	if (!canPostIn(channel, session.viewer.role))
		return (
			<Notice>
				<LockIcon className="size-4 shrink-0" />
				Only the team can post in #{channel.id}. Everyone can read it.
			</Notice>
		);

	return <MessageBox {...props} />;
}

function MessageBox({ channel, draft, onDraft, replyingTo, onCancelReply, onSend, onSent }: Props) {
	const field = useRef<HTMLTextAreaElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Grow with the text, up to about six lines.
	useEffect(() => {
		const el = field.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
		// No scrollbar until the text outgrows the box.
		el.style.overflowY = el.scrollHeight > 150 ? "auto" : "hidden";
	}, [draft]);

	// Starting a reply puts the cursor in the box.
	useEffect(() => {
		if (replyingTo) field.current?.focus();
	}, [replyingTo]);

	const send = async () => {
		const text = draft.trim();
		if (!text || busy) return;
		setBusy(true);
		setError(null);
		const result = await onSend(text, replyingTo?.id ?? null);
		setBusy(false);
		if (result.ok) {
			onDraft("");
			onCancelReply();
			onSent();
			field.current?.focus();
		} else setError(result.message);
	};

	const left = MESSAGE_MAX - draft.length;
	return (
		<form
			className={bar}
			onSubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			{replyingTo && (
				<div className="border-[var(--wv-purple)]/50 flex items-center gap-2 border-b px-4 py-1.5 font-sans text-xs text-[var(--wv-text-dim)]">
					<span className="min-w-0 flex-1 truncate">
						Replying to <strong className="text-white">{replyingTo.name}</strong>: {replyingTo.text}
					</span>
					<button
						type="button"
						onClick={onCancelReply}
						aria-label="Cancel reply"
						className="rounded p-1 hover:bg-white/10"
					>
						<CloseIcon className="size-4" />
					</button>
				</div>
			)}
			{error && (
				<p role="alert" className="px-4 pt-2 font-sans text-sm text-[var(--wv-pink)]">
					{error}
				</p>
			)}
			<div className="flex items-end gap-2 px-3 py-3 md:px-4">
				<textarea
					ref={field}
					value={draft}
					onChange={(event) => onDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
						// On a phone the Enter key is for a new line; the send button sends.
						if (window.matchMedia("(pointer: coarse)").matches) return;
						event.preventDefault();
						void send();
					}}
					rows={1}
					maxLength={MESSAGE_MAX}
					enterKeyHint="send"
					aria-label={`Message #${channel.id}`}
					placeholder={`Message #${channel.id}`}
					className="max-h-[150px] min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-control)] px-4 py-[11px] font-sans text-[15px] leading-[1.4] text-white placeholder:text-[var(--wv-muted)] focus:border-[var(--wv-cyan)] focus:outline-none"
				/>
				<button
					type="submit"
					disabled={busy || !draft.trim()}
					aria-label="Send message"
					className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--wv-cyan-soft)] text-[var(--wv-ink)] disabled:opacity-40"
				>
					<SendIcon className="size-5" />
				</button>
			</div>
			{left <= 80 && (
				<p
					className={`px-4 pb-2 text-right font-sans text-[11px] ${left <= 20 ? "text-[var(--wv-pink)]" : "text-[var(--wv-muted)]"}`}
				>
					{left} characters left
				</p>
			)}
		</form>
	);
}
