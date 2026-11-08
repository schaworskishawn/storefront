import {
	BookOpen,
	Box,
	CodeXml,
	Database,
	Layers,
	LifeBuoy,
	Megaphone,
	Orbit,
	PenLine,
	Scale,
	Users,
	type LucideIcon,
} from "lucide-react";

/**
 * The look Worldwide AI OS gives the workspace, shared by the desktop and the pages it opens: the W mark, and each agent's
 * avatar. An agent's avatar is its area's icon in that area's colour; Nexus, the coordinator, is the orb. Decoration only:
 * every avatar sits beside the agent's name, so it is hidden from screen readers.
 */

export type AreaLook = { icon: LucideIcon; pink: boolean };

export const AREA_LOOK: Record<string, AreaLook> = {
	operations: { icon: Orbit, pink: false },
	support: { icon: LifeBuoy, pink: false },
	finance: { icon: Database, pink: true },
	knowledge: { icon: BookOpen, pink: false },
	commerce: { icon: Megaphone, pink: true },
	content: { icon: PenLine, pink: true },
	people: { icon: Users, pink: true },
	engineering: { icon: CodeXml, pink: false },
	inventory: { icon: Box, pink: false },
	manufacturing: { icon: Layers, pink: true },
	compliance: { icon: Scale, pink: true },
};

export function lookOf(area: string): AreaLook {
	return AREA_LOOK[area] ?? { icon: Orbit, pink: false };
}

/** The coordinator is drawn as the orb, like the Nexus window on the desktop. */
export const COORDINATOR_ID = "nexus";

/** The W of Worldwide AI OS. */
export function Mark({ className }: { className?: string }) {
	return (
		<svg width="30" height="24" viewBox="0 0 30 24" aria-hidden className={className}>
			<path
				d="M2 3 L8.5 21 L15 7 L21.5 21 L28 3"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

const AVATAR_ICON = { sm: 20, md: 24, lg: 36 } as const;

export function AgentAvatar({
	id,
	area,
	size = "md",
}: {
	id: string;
	area: string;
	size?: keyof typeof AVATAR_ICON;
}) {
	if (id === COORDINATOR_ID) {
		return <span className={`wai-avatar wai-avatar--${size} wai-avatar--orb`} aria-hidden />;
	}
	const { icon: Icon, pink } = lookOf(area);
	return (
		<span className={`wai-avatar wai-avatar--${size}`} data-tone={pink ? "pink" : "cyan"} aria-hidden>
			<Icon size={AVATAR_ICON[size]} strokeWidth={1.5} />
		</span>
	);
}
