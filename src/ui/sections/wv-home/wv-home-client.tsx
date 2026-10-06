"use client";

import Image from "next/image";
import { useRef } from "react";
import { BRAND_LOGOS } from "./wv-data";

// Arrows only from tablet up: on a phone the row is swiped. They sit outside the cards (the track is padded to make room).
const navButtonClass =
	"absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--wv-cyan)] bg-[var(--wv-deep)] md:flex";

/**
 * The brand row, one horizontally scrolling strip at every screen size: swipe on phones, arrows from tablet up. The cards are
 * 2.5:1 (the same shape as the 800 x 320 logo files), so a logo is never cropped. A peek of the next tile at the edge shows
 * there is more to see.
 */
export function BrandCarousel() {
	const trackRef = useRef<HTMLDivElement>(null);
	// Move by most of a screenful, so the next set of brands lines up rather than jumping a fixed distance.
	const scroll = (dir: -1 | 1) => {
		const track = trackRef.current;
		if (track) track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
	};

	return (
		<div className="relative w-full" role="region" aria-roledescription="carousel" aria-label="Our brands">
			<button
				type="button"
				aria-label="Previous brands"
				className={`${navButtonClass} left-0`}
				onClick={() => scroll(-1)}
			>
				<Image src="/home/imgChevronLeft.svg" alt="" width={20} height={20} />
			</button>
			<div
				ref={trackRef}
				className="wv-hide-scrollbar flex snap-x snap-proximity gap-3 overflow-x-auto scroll-smooth md:scroll-px-12 md:gap-4 md:px-12 xl:gap-5"
			>
				{BRAND_LOGOS.map((brand) => (
					<div
						key={brand.name}
						className="relative h-[60px] w-[150px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--wv-cyan)] bg-[var(--wv-control)] md:h-20 md:w-[200px] xl:h-16 xl:w-40"
					>
						<Image
							src={brand.src}
							alt={brand.name}
							fill
							sizes="(min-width: 1280px) 160px, (min-width: 768px) 200px, 150px"
							className="object-cover"
						/>
					</div>
				))}
			</div>
			<button
				type="button"
				aria-label="Next brands"
				className={`${navButtonClass} right-0`}
				onClick={() => scroll(1)}
			>
				<Image src="/home/imgChevronRight.svg" alt="" width={20} height={20} />
			</button>
		</div>
	);
}
