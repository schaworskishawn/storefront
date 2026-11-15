import { parseMessage } from "@/lib/community/format";
import { avatarColor, initialOf, type Role } from "@/lib/community/model";

/** Small pieces shared across the community page: an avatar, a role badge, and a message's text. */

export function Avatar({
	memberId,
	name,
	className = "size-10 text-base",
}: {
	memberId: string;
	name: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={`flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ${className}`}
			style={{ backgroundColor: avatarColor(memberId) }}
		>
			{initialOf(name)}
		</span>
	);
}

export function RoleBadge({ role }: { role: Role }) {
	if (role === "member") return null;
	return (
		<span
			className={`rounded px-1.5 py-px font-sans text-[10px] font-bold uppercase leading-4 tracking-wide text-[var(--wv-ink)] ${
				role === "staff" ? "bg-[var(--wv-pink)]" : "bg-[var(--wv-cyan-soft)]"
			}`}
		>
			{role === "staff" ? "Staff" : "Mod"}
		</span>
	);
}

export const nameColor = (role: Role) =>
	role === "staff" ? "text-[var(--wv-pink)]" : role === "mod" ? "text-[var(--wv-cyan-soft)]" : "text-white";

const mentionChip =
	"rounded bg-[color-mix(in_srgb,var(--wv-cyan)_22%,transparent)] px-1 font-medium text-[var(--wv-cyan-soft)]";

/** A message's text with its bold, italic, code, links and @mentions, built from pieces so nothing typed can become markup. */
export function MessageText({ text }: { text: string }) {
	return (
		<>
			{parseMessage(text).map((piece, i) => {
				switch (piece.kind) {
					case "bold":
						return <strong key={i}>{piece.text}</strong>;
					case "italic":
						return <em key={i}>{piece.text}</em>;
					case "code":
						return (
							<code key={i} className="rounded bg-black/40 px-1 py-px font-mono text-[0.9em]">
								{piece.text}
							</code>
						);
					case "mention":
						return (
							<span key={i} className={mentionChip}>
								{piece.text}
							</span>
						);
					case "link":
						return (
							<a
								key={i}
								href={piece.href}
								target="_blank"
								rel="noopener noreferrer nofollow ugc"
								className="text-[var(--wv-cyan-soft)] underline underline-offset-2 [overflow-wrap:anywhere]"
							>
								{piece.text}
							</a>
						);
					default:
						return <span key={i}>{piece.text}</span>;
				}
			})}
		</>
	);
}
