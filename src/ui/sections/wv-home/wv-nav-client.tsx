"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { NAV } from "./wv-data";

const heyComic = "font-[family-name:var(--font-hey-comic)]";

const onBackForward = (change: () => void) => {
	window.addEventListener("popstate", change);
	return () => window.removeEventListener("popstate", change);
};

/**
 * The header's nav (tablet and desktop): neon links, the page you're on lit pink and underlined in neon (styles:
 * `.wv-nav-link` in wv-home.css). The path is read in the browser and is empty on the server, so the HTML lights nothing
 * and hydration matches; it is read again on every render, and the header is part of each page, so it follows every
 * navigation. (Not `usePathname`, which under Cache Components can need a Suspense boundary on dynamic routes.)
 */
export function PrimaryNav() {
	const path = useSyncExternalStore(
		onBackForward,
		() => window.location.pathname,
		() => "",
	);
	return (
		<nav
			aria-label="Primary"
			className={`${heyComic} hidden items-center gap-3 text-[13px] uppercase tracking-[1px] md:flex xl:gap-[21px] xl:text-[14px]`}
		>
			{NAV.map((item) => {
				const current = path === item.href || path.startsWith(`${item.href}/`);
				return (
					<Link
						key={item.label}
						href={item.href}
						aria-current={current ? "page" : undefined}
						className="wv-link wv-nav-link"
					>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
