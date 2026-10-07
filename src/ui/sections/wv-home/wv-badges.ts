/**
 * The little 88 x 31 badges in the footer, in the order they appear. Plain data, so it can be tested (see wv-badges.test.ts).
 * The artwork lives in public/badges and is drawn by scripts/generate-badges.mjs: add a badge there first, then list it here.
 */

export type Badge = {
	/** A file in public/badges. */
	file: string;
	/** What the badge says, for people who can't see it. */
	alt: string;
	/** Where it goes. A badge with no `href` is just a decoration. */
	href?: string;
	/** Belongs to the rewards program, so it is left out while that is switched off. */
	rewards?: boolean;
};

export const BADGE_WIDTH = 88;
export const BADGE_HEIGHT = 31;

export const BADGES: Badge[] = [
	{ file: "worldwide-vapor.svg", alt: "Worldwide Vapor: back to the home page", href: "/home" },
	{ file: "neon-theme.svg", alt: "Best viewed in neon" },
	{ file: "vapor-tokens.svg", alt: "Vapor Tokens: earn and save", href: "/rewards", rewards: true },
	{ file: "quit-plan.svg", alt: "Quit plan builder", href: "/quit" },
	{ file: "learn.svg", alt: "Vape guides and how-tos", href: "/learn" },
	{ file: "my-desk.svg", alt: "My Desk: make your own corner of the site", href: "/desk" },
];
