"use client";

import Image from "next/image";
import { useRef } from "react";
import { BRAND_LOGOS } from "./wv-data";

const navButtonClass =
	"absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--wv-cyan)] bg-[var(--wv-deep)]";

export function BrandCarousel() {
	const trackRef = useRef<HTMLDivElement>(null);
	const scroll = (dir: -1 | 1) => trackRef.current?.scrollBy({ left: dir * 360, behavior: "smooth" });

	return (
		<div className="relative hidden w-full xl:block">
			<button
				type="button"
				aria-label="Previous brands"
				className={`${navButtonClass} left-0`}
				onClick={() => scroll(-1)}
			>
				<Image src="/home/imgChevronLeft.svg" alt="" width={20} height={20} />
			</button>
			<div ref={trackRef} className="wv-hide-scrollbar flex gap-5 overflow-x-auto scroll-smooth">
				{[...BRAND_LOGOS, ...BRAND_LOGOS].map((brand, i) => (
					<div
						key={`${brand.name}-${i}`}
						className="relative h-16 w-40 shrink-0 overflow-hidden rounded-xl border border-[var(--wv-cyan)]"
					>
						<Image src={brand.src} alt={brand.name} fill sizes="160px" className="object-cover" />
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
