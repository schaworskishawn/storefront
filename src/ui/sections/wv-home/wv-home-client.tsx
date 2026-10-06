"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { BRAND_LOGOS } from "./wv-data";

// Overlaid on the edges on phones, outside the cards (the track is padded to make room) from tablet up.
const navButtonClass =
	"absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--wv-cyan)] bg-[var(--wv-deep)]/90 md:size-9";

/** How often the strip moves by one card on its own, and how long it stays still after someone uses it. */
const AUTO_ADVANCE_MS = 3500;
const RESUME_AFTER_MS = 7000;

/**
 * The brand row: one horizontally scrolling strip at every screen size. It works every way a visitor might try it: swipe on a
 * touch screen, drag with a mouse, the arrows (shown at every size), the keyboard, or just wait, because it also moves one
 * card at a time by itself. The self-moving stops while the pointer is over it or focus is in it, for a few seconds after
 * anyone touches it, when it is off screen, and for people who ask their device for reduced motion. The cards are 2.5:1 (the
 * shape of the 800 x 320 logo files), so a logo is never cropped.
 */
export function BrandCarousel() {
	const rootRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const pausedUntil = useRef(0);
	const hovering = useRef(false);
	const focused = useRef(false);
	const inView = useRef(false);
	const drag = useRef<{ x: number; left: number } | null>(null);

	const pause = useCallback(() => {
		pausedUntil.current = Date.now() + RESUME_AFTER_MS;
	}, []);

	// Arrows move most of a screenful so the next set of brands lines up rather than jumping a fixed distance.
	const scroll = useCallback(
		(dir: -1 | 1) => {
			const track = trackRef.current;
			if (!track) return;
			pause();
			track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
		},
		[pause],
	);

	// Self-advance: one card at a time, back to the start after the last.
	useEffect(() => {
		const track = trackRef.current;
		const root = rootRef.current;
		if (!track || !root) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const observer = new IntersectionObserver(([entry]) => {
			inView.current = Boolean(entry?.isIntersecting);
		});
		observer.observe(root);

		const timer = window.setInterval(() => {
			if (document.hidden || !inView.current || hovering.current || focused.current) return;
			if (Date.now() < pausedUntil.current || drag.current) return;
			const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
			if (atEnd) {
				track.scrollTo({ left: 0, behavior: "smooth" });
				return;
			}
			const card = track.children[0] as HTMLElement | undefined;
			const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
			track.scrollBy({ left: (card?.offsetWidth ?? track.clientWidth / 2) + gap, behavior: "smooth" });
		}, AUTO_ADVANCE_MS);

		return () => {
			window.clearInterval(timer);
			observer.disconnect();
		};
	}, []);

	// Dragging with a mouse. Touch screens scroll the strip natively, so only the mouse needs this.
	const startDrag = (event: PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		if (!track || event.pointerType !== "mouse" || event.button !== 0) return;
		drag.current = { x: event.clientX, left: track.scrollLeft };
		track.setPointerCapture(event.pointerId);
		// No smoothing or snapping while the strip is under the pointer, or it would fight the drag.
		track.style.scrollBehavior = "auto";
		track.style.scrollSnapType = "none";
		pause();
	};
	const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		if (track && drag.current) track.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
	};
	const endDrag = (event: PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		if (!track || !drag.current) return;
		drag.current = null;
		track.style.scrollBehavior = "";
		track.style.scrollSnapType = "";
		if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
	};

	return (
		<div
			ref={rootRef}
			className="relative w-full"
			role="region"
			aria-roledescription="carousel"
			aria-label="Our brands"
			onPointerEnter={(event) => {
				if (event.pointerType === "mouse") hovering.current = true;
			}}
			onPointerLeave={() => {
				hovering.current = false;
			}}
			onFocus={() => {
				focused.current = true;
			}}
			onBlur={() => {
				focused.current = false;
			}}
			onTouchStart={pause}
			onWheel={pause}
		>
			<button
				type="button"
				aria-label="Previous brands"
				className={`${navButtonClass} left-1 md:left-0`}
				onClick={() => scroll(-1)}
			>
				<Image src="/home/imgChevronLeft.svg" alt="" width={20} height={20} />
			</button>
			<div
				ref={trackRef}
				className="wv-hide-scrollbar flex cursor-grab touch-pan-x select-none snap-x snap-proximity gap-3 overflow-x-auto scroll-smooth active:cursor-grabbing md:scroll-px-12 md:gap-4 md:px-12 xl:gap-5"
				onPointerDown={startDrag}
				onPointerMove={moveDrag}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
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
							draggable={false}
							sizes="(min-width: 1280px) 160px, (min-width: 768px) 200px, 150px"
							className="object-cover"
						/>
					</div>
				))}
			</div>
			<button
				type="button"
				aria-label="Next brands"
				className={`${navButtonClass} right-1 md:right-0`}
				onClick={() => scroll(1)}
			>
				<Image src="/home/imgChevronRight.svg" alt="" width={20} height={20} />
			</button>
		</div>
	);
}
