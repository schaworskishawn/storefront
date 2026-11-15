import type { ReactNode } from "react";

/** The few icons the community page uses, drawn in the current text colour. */

function Icon({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
			className={className}
		>
			{children}
		</svg>
	);
}

type P = { className?: string };

export const HashIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" />
	</Icon>
);
export const UsersIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
	</Icon>
);
export const MenuIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="M4 6h16M4 12h16M4 18h16" />
	</Icon>
);
export const CloseIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="M18 6 6 18M6 6l12 12" />
	</Icon>
);
export const ReplyIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="M9 14 4 9l5-5" />
		<path d="M4 9h10a6 6 0 0 1 6 6v3" />
	</Icon>
);
export const SmileIcon = ({ className }: P) => (
	<Icon className={className}>
		<circle cx="12" cy="12" r="10" />
		<path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
	</Icon>
);
export const MoreIcon = ({ className }: P) => (
	<Icon className={className}>
		<circle cx="5" cy="12" r="1" />
		<circle cx="12" cy="12" r="1" />
		<circle cx="19" cy="12" r="1" />
	</Icon>
);
export const ArrowDownIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="M12 5v14M19 12l-7 7-7-7" />
	</Icon>
);
export const LockIcon = ({ className }: P) => (
	<Icon className={className}>
		<rect x="4" y="11" width="16" height="10" rx="2" />
		<path d="M8 11V7a4 4 0 0 1 8 0v4" />
	</Icon>
);
export const SendIcon = ({ className }: P) => (
	<Icon className={className}>
		<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />
	</Icon>
);
