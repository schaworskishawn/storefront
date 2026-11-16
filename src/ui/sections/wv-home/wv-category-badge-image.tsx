import Image from "next/image";
import type { CategoryBadgeIcon } from "./wv-category-art";

/**
 * The category badges as shown on the site: production WebPs of the `CategoryBadge` drawing (wv-category-badge.tsx, the
 * source art). Each was exported as a standalone SVG and run through the local Graphics Production Pipeline: 800 × 880
 * (the badge's own 200:220 shape), WebP q92 with alpha and an sRGB ICC profile. Every one passed the pipeline's QA
 * (70/70 checks, silhouette IoU 1, mean ΔE 1.22–1.72 against the SVG). To change a badge, change the drawing and re-run
 * it through the pipeline.
 *
 * The name is baked into the art, so callers pass the category's name as screen-reader text beside it. `next/image`
 * serves each screen a copy sized for it, at quality 90 rather than the default 75 (allowed in next.config.js): the soft
 * glows lose visible detail at 75. The glow, and the lift under the pointer or while selected, are the `.wv-badge` rules
 * in wv-home.css; they follow the art's own outline through its alpha.
 */
export const BADGE_IMAGES: Record<CategoryBadgeIcon, string> = {
	disposables: "/home/badges/disposables.webp",
	eliquid: "/home/badges/eliquid.webp",
	hardware: "/home/badges/hardware.webp",
	coils: "/home/badges/coils.webp",
	accessories: "/home/badges/accessories.webp",
	"new-arrivals": "/home/badges/new-arrivals.webp",
};

/** Must be listed in `images.qualities` (next.config.js), or Next rounds it to the nearest listed value. */
const BADGE_IMAGE_QUALITY = 90;

export function CategoryBadgeImage({
	icon,
	sizes,
	active = false,
}: {
	icon: CategoryBadgeIcon;
	/** The `sizes` hint for the badge's box at each breakpoint. */
	sizes: string;
	/** Selected, as in the shop's category filter: the brighter glow. */
	active?: boolean;
}) {
	return (
		<span className="wv-badge relative block size-full" data-active={active ? "" : undefined}>
			<Image
				src={BADGE_IMAGES[icon]}
				alt=""
				fill
				sizes={sizes}
				quality={BADGE_IMAGE_QUALITY}
				className="object-contain"
			/>
		</span>
	);
}
