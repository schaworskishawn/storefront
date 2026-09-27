import { Section, type SectionTone } from "@/ui/sections/section";

export interface TrustBadgeItem {
	/** Emoji or short glyph — not an image asset, matches the source design. */
	icon: string;
	title: string;
	subtitle: string;
}

export interface TrustBadgeStripProps {
	badges: readonly TrustBadgeItem[];
	tone?: SectionTone;
	className?: string;
}

/**
 * Compact horizontal strip of trust signals (support hours, shipping scope, age
 * verification, fulfillment speed). Distinct from `MulticolumnSection` — that's
 * stacked centered cards with optional images; this is a single-row icon+text
 * band, matching the source design's dense header/footer trust strip pattern.
 *
 * Server Component. Content comes from `content.surfaces.homepage.trustBadges`
 * (see `data-storefront-content`), not hardcoded — the page passes `badges` down.
 */
export function TrustBadgeStrip({ badges, tone = "muted", className }: TrustBadgeStripProps) {
	if (badges.length === 0) {
		return null;
	}

	return (
		<Section tone={tone} spacing="sm" className={className} aria-label="Store trust information">
			<ul className="flex list-none flex-col flex-wrap items-start gap-y-6 sm:flex-row sm:items-center sm:justify-between sm:gap-x-8">
				{badges.map((badge) => (
					<li key={badge.title} className="flex items-center gap-4">
						<span className="text-2xl" aria-hidden="true">
							{badge.icon}
						</span>
						<div className="flex flex-col">
							<span className="text-sm font-medium tracking-wide">{badge.title}</span>
							<span className="text-sm text-muted-foreground">{badge.subtitle}</span>
						</div>
					</li>
				))}
			</ul>
		</Section>
	);
}
