import { Search, ShoppingCart, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WishlistLink } from "./wv-wishlist-client";
import { NAV } from "./wv-data";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { FOOTER_COLUMNS, FOOTER_HREFS, LEGAL_LINKS, REWARDS_FOOTER_LABEL } from "./wv-footer-links";
import { MobileMenu } from "./wv-menu-client";
import "./wv-home.css";

/**
 * Shared Worldwide Vapor header + footer. Responsive: mobile (<768, Figma 360), tablet (md, 768),
 * desktop (xl, 1280+, Figma 1440).
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";

const SOCIALS = [
	{ name: "Instagram", src: "/home/imgInstagram.svg" },
	{ name: "Facebook", src: "/home/imgFacebook.svg" },
	{ name: "YouTube", src: "/home/imgYoutube.svg" },
];

export function WvHeader() {
	return (
		<header
			data-wv-header
			className="relative border-b border-[var(--wv-cyan)] bg-[var(--wv-header)] px-4 py-3 md:px-6 xl:px-[14px] xl:py-[7px]"
		>
			{/* The band above (border/background) stays full-bleed on ultra-wide monitors; only the
			    actual nav content is capped at the widest width we have a real design for (1440,
			    Figma desktop) so logo/links/icons don't stretch apart on a 1920+/4K screen. */}
			<div className="mx-auto flex w-full max-w-[1440px] items-center justify-between">
				<div className="flex items-center gap-4 xl:gap-[23px]">
					<Link
						href="/home"
						className="wv-glitch relative block h-[45px] w-[100px] md:h-14 md:w-28 xl:h-[71px] xl:w-[142px]"
					>
						<Image
							src="/home/imgBrand.png"
							alt="Worldwide Vapor"
							fill
							sizes="142px"
							className="object-contain"
							priority
						/>
					</Link>
					<nav
						aria-label="Primary"
						className={`${heyComic} hidden items-center gap-3 text-[13px] uppercase tracking-[1px] md:flex xl:gap-[21px]`}
					>
						{NAV.map((item) => (
							<Link key={item.label} href={item.href} className="wv-link">
								{item.label}
							</Link>
						))}
					</nav>
				</div>
				<div className="hidden items-center gap-3 md:flex xl:gap-[11px]">
					<Link
						href="/search"
						aria-label="Search"
						className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
					>
						<Search className="size-4" strokeWidth={2} />
					</Link>
					<WishlistLink />
					<Link
						href="/account"
						aria-label="Account"
						className="wv-icon-btn flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
					>
						<User className="size-4" strokeWidth={2} />
					</Link>
					<Link
						href="/cart"
						aria-label="Cart"
						className="wv-icon-btn relative flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
					>
						<ShoppingCart className="size-4" strokeWidth={2} />
						<span
							aria-hidden
							className="absolute right-[7px] top-[7px] size-2 rounded-full bg-[var(--wv-pink)]"
						/>
					</Link>
				</div>
				<MobileMenu />
			</div>
		</header>
	);
}

function FooterSocials({ className }: { className: string }) {
	return (
		<div className={className}>
			<p className={`${heyComic} text-xs tracking-[2px] text-[var(--wv-cyan)]`}>FOLLOW</p>
			<div className="flex items-center gap-3">
				{SOCIALS.map((s) => (
					<a
						key={s.name}
						href="#"
						aria-label={s.name}
						className="wv-icon-btn flex size-10 items-center justify-center rounded-full border border-[var(--wv-cyan)] bg-[var(--wv-bg)]"
					>
						<Image src={s.src} alt="" width={18} height={18} />
					</a>
				))}
			</div>
		</div>
	);
}

export function WvFooter() {
	const rewardsOn = readRewardsConfig().enabled;
	return (
		<footer className="bg-[var(--wv-footer)] px-3 py-5 md:px-8 md:py-12 xl:px-20 xl:pb-4 xl:pt-16">
			{/* Background band stays full-bleed on ultra-wide monitors; content is capped at 1440
			    (the widest width we have a real design for) so it doesn't stretch apart on 1920+/4K. */}
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 md:gap-8 xl:flex-row xl:items-start xl:gap-[50px]">
				{/* Brand art: the emblem, a 2:3 shield shown whole in a 2:3 box. Mobile centres it on its own row (the socials
				    sit at the bottom there); tablet pairs it with the socials side by side; desktop gives it a column. */}
				<div className="flex w-full items-center justify-between gap-4 xl:contents">
					<div className="wv-glitch relative mx-auto h-[300px] w-[200px] shrink-0 md:mx-0 md:h-[240px] md:w-[160px] xl:h-[192px] xl:w-[128px]">
						<Image
							src="/home/logo-worldwide-vapor.webp"
							alt="Worldwide Vapor"
							fill
							sizes="(min-width: 1280px) 128px, (min-width: 768px) 160px, 200px"
							className="object-contain"
						/>
					</div>
					<FooterSocials className="hidden flex-col items-end gap-3 md:flex xl:hidden" />
				</div>

				{/* Link columns: mobile stacks them; tablet is a two-column grid; desktop is a single row. */}
				<div className="grid grid-cols-1 gap-y-4 md:grid-cols-2 md:gap-x-[84px] md:gap-y-6 xl:flex xl:flex-1 xl:gap-8 xl:pl-6 xl:pt-6">
					{FOOTER_COLUMNS.map((col) => (
						<div key={col.title} className="flex flex-col gap-[10px] xl:gap-3">
							<p
								className={`${heyComic} wv-foot-heading text-xs tracking-[2px] text-[var(--wv-cyan)] xl:mb-2`}
							>
								{col.title}
							</p>
							{col.links
								.filter((l) => l !== REWARDS_FOOTER_LABEL || rewardsOn)
								.map((l) => (
									<a
										key={l}
										href={FOOTER_HREFS[l] ?? "#"}
										className={`${heyComic} wv-foot-link wv-foot-text whitespace-nowrap text-[13px]`}
									>
										{l}
									</a>
								))}
						</div>
					))}
				</div>

				<FooterSocials className="flex flex-col items-start gap-3 md:hidden xl:flex xl:w-[250px] xl:shrink-0 xl:items-end xl:gap-4" />
			</div>
			<div className="mx-auto mt-6 flex w-full max-w-[1440px] flex-col gap-2 border-t border-[var(--wv-cyan-soft)] pt-4 font-sans text-[10px] text-[var(--wv-footer-link)] md:flex-row md:items-center md:justify-between xl:mt-8 xl:border-0 xl:pt-0">
				<p>© 2026 Worldwide Vapor. All rights reserved.</p>
				<nav aria-label="Legal" className="flex flex-wrap items-center gap-x-2">
					{LEGAL_LINKS.map((link, i) => (
						<span key={link.href} className="flex items-center gap-x-2">
							{i > 0 && <span aria-hidden>·</span>}
							<a href={link.href} className="underline-offset-2 hover:underline">
								{link.label}
							</a>
						</span>
					))}
				</nav>
			</div>
		</footer>
	);
}
