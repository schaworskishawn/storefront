"use client";

import { Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { NAV } from "./wv-data";
import { WishlistLink } from "./wv-wishlist-client";

const heyComic = "font-[family-name:var(--font-hey-comic)]";

/** Mobile hamburger + slide-down nav panel (visible below the `md` breakpoint). */
export function MobileMenu() {
	const [open, setOpen] = useState(false);

	return (
		<div className="md:hidden">
			<button
				type="button"
				aria-label={open ? "Close menu" : "Open menu"}
				aria-expanded={open}
				aria-controls="wv-mobile-nav"
				onClick={() => setOpen((v) => !v)}
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
					className={`${heyComic} wv-menu-panel absolute inset-x-0 top-full z-30 flex flex-col gap-4 border-b border-[var(--wv-cyan)] bg-[var(--wv-header)] px-4 py-5 text-sm uppercase tracking-[1px]`}
				>
					{NAV.map((item, i) => (
						<Link
							key={item.label}
							href={item.href}
							onClick={() => setOpen(false)}
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
							onClick={() => setOpen(false)}
							className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
						>
							<Search className="size-4" strokeWidth={2} />
						</Link>
						<WishlistLink />
						<Link
							href="/account"
							aria-label="Account"
							onClick={() => setOpen(false)}
							className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
						>
							<User className="size-4" strokeWidth={2} />
						</Link>
						<Link
							href="/cart"
							aria-label="Cart"
							onClick={() => setOpen(false)}
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
