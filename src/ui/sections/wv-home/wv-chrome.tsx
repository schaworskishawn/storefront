import { Search, ShoppingCart, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { whatsappHref } from "@/lib/whatsapp";
import { WishlistLink } from "./wv-wishlist-client";
import { NAV } from "./wv-data";
import { MobileMenu } from "./wv-menu-client";
import "./wv-home.css";

/**
 * Shared Worldwide Vapor header + footer. Responsive: mobile (<768, Figma 360), tablet (md, 768),
 * desktop (xl, 1280+, Figma 1440).
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";

const FOOTER_COLUMNS = [
	{ title: "SHOP", links: ["All Products", "Disposables", "E-Liquids", "Devices", "Coils", "Accessories"] },
	{
		title: "COMPANY",
		links: ["About Us", "Shipping Info", "Payments", "Blog", "Affiliate Program"],
	},
	{
		title: "HELP",
		links: ["FAQs", "Age Verification", "Terms & Conditions", "Privacy Policy", "Returns", "Contact Us"],
	},
	{ title: "CONTACT", links: ["support@worldwidevapor.com", "Worldwide Shipping"] },
];

const SOCIALS = [
	{ name: "Instagram", src: "/home/imgInstagram.svg" },
	{ name: "Facebook", src: "/home/imgFacebook.svg" },
	{ name: "YouTube", src: "/home/imgYoutube.svg" },
];

export function WvHeader() {
	return (
		<header className="relative flex items-center justify-between border-b border-[var(--wv-cyan)] bg-[var(--wv-header)] px-4 py-3 md:px-6 xl:px-[14px] xl:py-[7px]">
			<div className="flex items-center gap-4 xl:gap-[23px]">
				<Link
					href="/home"
					className="relative block h-[45px] w-[100px] md:h-14 md:w-28 xl:h-[71px] xl:w-[142px]"
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
						<Link key={item.label} href={item.href}>
							{item.label}
						</Link>
					))}
				</nav>
			</div>
			<div className="hidden items-center gap-3 md:flex xl:gap-[11px]">
				<Link
					href="/search"
					aria-label="Search"
					className="flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
				>
					<Search className="size-4" strokeWidth={2} />
				</Link>
				<WishlistLink />
				<Link
					href="/account"
					aria-label="Account"
					className="flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
				>
					<User className="size-4" strokeWidth={2} />
				</Link>
				<Link
					href="/cart"
					aria-label="Cart"
					className="relative flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
				>
					<ShoppingCart className="size-4" strokeWidth={2} />
					<span
						aria-hidden
						className="absolute right-[7px] top-[7px] size-2 rounded-full bg-[var(--wv-pink)]"
					/>
				</Link>
			</div>
			<MobileMenu />
		</header>
	);
}

const FOOTER_HREFS: Record<string, string> = {
	"All Products": "/shop",
	"Shipping Info": "/shipping",
	Payments: "/payments",
	Blog: "/learn",
	FAQs: "/faqs",
	"Age Verification": "/age-verification",
	"Terms & Conditions": "/terms-and-conditions",
	"Privacy Policy": "/privacy-policy",
	"Affiliate Program": "/affiliate-program",
	Returns: "/returns",
	"Contact Us": "/contact-us",
	"Become a Distributor": "/distributor",
};

export function WvFooter() {
	return (
		<footer className="bg-[var(--wv-footer)] px-3 py-5 md:px-8 md:py-12 xl:px-20 xl:pb-4 xl:pt-16">
			<div className="flex flex-col gap-4 md:gap-8 xl:flex-row xl:items-start xl:gap-[50px]">
				{/* Brand art: full-width crop on mobile/tablet, tight crop on desktop.
				    Fixed aspect ratio (not a fixed height) keeps the same crop of the logo at every
				    width — a fixed height would show more empty padding on narrow phones and crop
				    into the logo on wider tablets as width grows independently of height. */}
				<div className="relative aspect-[1024/818] w-full shrink-0 xl:hidden">
					<Image
						src="/home/imgHeroLogo.png"
						alt="Worldwide Vapor"
						fill
						sizes="(min-width: 768px) 704px, 336px"
						className="object-cover"
					/>
				</div>
				<div className="relative hidden h-[232px] w-[240px] shrink-0 overflow-hidden xl:block">
					{/* eslint-disable-next-line @next/next/no-img-element -- cropped artwork positioned by percentage */}
					<img
						src="/home/imgHeroLogo.png"
						alt="Worldwide Vapor"
						className="absolute left-[-4.74%] top-[-37.03%] h-[178.45%] w-[109.36%] max-w-none"
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:gap-8 xl:flex xl:flex-1 xl:gap-10 xl:pl-10 xl:pt-6">
					{FOOTER_COLUMNS.map((col) => (
						<div key={col.title} className="flex flex-col gap-[10px] xl:gap-3">
							<p className={`${heyComic} text-xs tracking-[2px] text-[var(--wv-cyan)] xl:mb-2`}>
								{col.title}
							</p>
							{col.links.map((l) => (
								<a
									key={l}
									href={FOOTER_HREFS[l] ?? "#"}
									className={`${heyComic} whitespace-nowrap text-[13px] text-[var(--wv-footer-link)]`}
								>
									{l}
								</a>
							))}
						</div>
					))}
				</div>
				<div className="flex flex-col items-start gap-3 xl:w-[250px] xl:shrink-0 xl:items-end xl:gap-4">
					<p className={`${heyComic} text-xs tracking-[2px] text-[var(--wv-cyan)]`}>FOLLOW</p>
					<div className="flex items-center gap-3">
						{SOCIALS.map((s) => (
							<a
								key={s.name}
								href="#"
								aria-label={s.name}
								className="flex size-10 items-center justify-center rounded-full border border-[var(--wv-cyan)] bg-[var(--wv-bg)]"
							>
								<Image src={s.src} alt="" width={18} height={18} />
							</a>
						))}
						<a
							href={whatsappHref() ?? "#"}
							target={whatsappHref() ? "_blank" : undefined}
							rel="noopener noreferrer"
							aria-label="WhatsApp"
							className="relative block size-10"
						>
							<Image src="/home/imgSocialWhatsapp.svg" alt="" fill sizes="40px" />
						</a>
					</div>
				</div>
			</div>
			<div className="mt-6 flex flex-col gap-2 border-t border-[var(--wv-cyan-soft)] pt-4 font-sans text-[10px] text-[var(--wv-footer-link)] md:flex-row md:items-center md:justify-between xl:mt-8 xl:border-0 xl:pt-0">
				<p>© 2026 Worldwide Vapor. All rights reserved.</p>
				<p>Privacy · Terms · Accessibility</p>
			</div>
		</footer>
	);
}
