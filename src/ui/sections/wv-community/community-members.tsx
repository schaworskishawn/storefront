"use client";

import type { Roster } from "@/lib/community/client";
import { Avatar, RoleBadge, nameColor } from "./community-bits";
import { CloseIcon } from "./community-icons";

const heyComic = "font-[family-name:var(--font-hey-comic)]";

type Props = {
	roster: Roster;
	viewerId: string | null;
	onMention: (name: string) => void;
	onClose: () => void;
};

/** Who is online right now (team first), and how many people have joined. Clicking a name starts an @mention. */
export function MemberList({ roster, viewerId, onMention, onClose }: Props) {
	return (
		<div className="flex h-full min-h-0 flex-col bg-[var(--wv-deep)]">
			<div className="flex items-center justify-between border-b border-[var(--wv-purple)] px-4 py-3.5">
				<p className={`${heyComic} text-[11px] uppercase tracking-[2px] text-[var(--wv-muted)]`}>
					Online · {roster.online.length}
				</p>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close member list"
					className="rounded-md p-1.5 text-[var(--wv-text-dim)] hover:bg-white/10 xl:hidden"
				>
					<CloseIcon className="size-5" />
				</button>
			</div>
			<ul className="wv-chat-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{roster.online.length === 0 && (
					<li className="px-2.5 py-3 font-sans text-sm text-[var(--wv-muted)]">
						No one is here right now. Say hello and they will see it.
					</li>
				)}
				{roster.online.map((member) => (
					<li key={member.memberId}>
						<button
							type="button"
							onClick={() => onMention(member.name)}
							disabled={member.memberId === viewerId}
							title={member.memberId === viewerId ? "That's you" : `Mention ${member.name}`}
							className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
						>
							<span className="relative">
								<Avatar memberId={member.memberId} name={member.name} className="size-8 text-sm" />
								<span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--wv-deep)] bg-[var(--wv-cyan)]" />
							</span>
							<span
								className={`min-w-0 flex-1 truncate font-sans text-sm font-medium ${nameColor(member.role)}`}
							>
								{member.name}
							</span>
							<RoleBadge role={member.role} />
						</button>
					</li>
				))}
			</ul>
			<p className="border-t border-[var(--wv-purple)] px-4 py-3 font-sans text-xs text-[var(--wv-muted)]">
				{roster.total.toLocaleString()} {roster.total === 1 ? "member has" : "members have"} joined
			</p>
		</div>
	);
}
