import Link from "next/link";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { BADGES, BADGE_HEIGHT, BADGE_WIDTH } from "./wv-badges";

/** The footer's row of small retro web badges: a site emblem, a theme badge, and links to other pages. */
export function WvBadges() {
	const rewardsOn = readRewardsConfig().enabled;
	const badges = BADGES.filter((badge) => !badge.rewards || rewardsOn);

	return (
		<ul
			aria-label="Site badges"
			className="mx-auto mt-6 flex w-full max-w-[1440px] flex-wrap items-center gap-2 md:gap-3 xl:mt-8"
		>
			{badges.map((badge) => {
				const image = (
					// The badges are tiny pixel-art SVGs drawn to be shown at exactly their own size, so they skip the image optimiser.
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={`/badges/${badge.file}`}
						alt={badge.alt}
						width={BADGE_WIDTH}
						height={BADGE_HEIGHT}
						style={{ imageRendering: "pixelated" }}
					/>
				);
				return (
					<li key={badge.file} className="shrink-0">
						{badge.href ? (
							<Link href={badge.href} className="wv-badge block">
								{image}
							</Link>
						) : (
							image
						)}
					</li>
				);
			})}
		</ul>
	);
}
