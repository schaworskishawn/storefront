"use client";

import { Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NAV } from "./wv-data";
import { WishlistLink } from "./wv-wishlist-client";

const heyComic = "font-[family-name:var(--font-hey-comic)]";

/** Mobile hamburger + slide-down nav panel (visible below the `md` breakpoint). */
export function MobileMenu() {
	const [open, setOpen] = useState(false);
	// Closing plays the panel folding away for 160ms before it is removed (instantly for reduced motion).
	const [leaving, setLeaving] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	const closeNow = () => {
		window.clearTimeout(timer.current);
		setLeaving(false);
		setOpen(false);
	};
	const toggle = () => {
		if (!open) return setOpen(true);
		if (leaving) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return closeNow();
		setLeaving(true);
		timer.current = window.setTimeout(closeNow, 170);
	};
	const expanded = open && !leaving;

	return (
		<div className="md:hidden">
			<button
				type="button"
				aria-label={expanded ? "Close menu" : "Open menu"}
				aria-expanded={expanded}
				aria-controls="wv-mobile-nav"
				onClick={toggle}
				className="wv-burger flex w-6 flex-col gap-1 p-1"
			>
				<span className="h-0.5 w-[18px] bg-white" />
				<span className="h-0.5 w-[18px] bg-white" />
				<span className="h-0.5 w-[18px] bg-white" />
			</button>
			{open && (
				<nav
					id="wv-mobile-nav"
					aria-label="Mobile"
					className={`${heyComic} wv-menu-panel ${leaving ? "wv-menu-leave" : ""} absolute inset-x-0 top-full z-30 flex flex-col gap-4 border-b border-[var(--wv-cyan)] bg-[var(--wv-header)] px-4 py-5 text-sm uppercase tracking-[1px]`}
				>
					{NAV.map((item, i) => (
						<Link
							key={item.label}
							href={item.href}
							onClick={closeNow}
							className="wv-menu-item"
							style={{ "--i": i } as CSSProperties}
						>
							{item.label}
						</Link>
					))}
					<div className="flex gap-3 pt-2 normal-case">
						<Link
							href="/search"
							aria-label="Search"
							onClick={closeNow}
							className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
						>
							<Search className="size-4" strokeWidth={2} />
						</Link>
						<WishlistLink />
						<Link
							href="/account"
							aria-label="Account"
							onClick={closeNow}
							className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
						>
							<User className="size-4" strokeWidth={2} />
						</Link>
						<Link
							href="/cart"
							aria-label="Cart"
							onClick={closeNow}
							className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
						>
							<ShoppingCart className="size-4" strokeWidth={2} />
						</Link>
					</div>
				</nav>
			)}
		</div>
	);
}
