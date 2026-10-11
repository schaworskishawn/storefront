import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { type WvCategoryTile } from "@/lib/catalog/get-home-products";
import { WvFooter, WvHeader } from "./wv-chrome";
import { CATEGORY_ART } from "./wv-category-art";
import { BrandCarousel } from "./wv-home-client";
import { type HomeMembership } from "@/lib/catalog/home-collections";
import { HomeCollections } from "./wv-home-collections";
import { OutlineButton, SectionHeading, type CardProduct, type CatalogContext } from "./wv-product-section";
import { WvBulletin } from "./wv-bulletin";
import { NewsletterForm } from "./wv-newsletter-client";
import "./wv-home.css";

/**
 * Worldwide Vapor home page — Figma "6.01 - High Fidelity - Home".
 * Responsive: mobile base (Figma 360), tablet from `md` (768), desktop from `xl` (1280+, Figma 1440).
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const retrochips = "font-[family-name:var(--font-retrochips)]";

const TRUST = [
	{
		icon: "⚡",
		title: "24/7 SUPPORT",
		text: "Always active direct line",
		accent: "text-[var(--wv-cyan-soft)]",
	},
	{ icon: "🍁", title: "GLOBAL SHIPPING", text: "Coming Soon, Canada Only", accent: "text-[var(--wv-pink)]" },
	{
		icon: "🔞",
		title: "AGE VERIFIED CHECKOUT",
		text: "Must Be Of Legal Age",
		accent: "text-[var(--wv-cyan-soft)]",
	},
	{
		icon: "📦",
		title: "WE SHIP PACKAGES ASAP",
		text: "No Delay standard logistics",
		accent: "text-[var(--wv-pink)]",
	},
];

const HERO_LAYERS = [
	"img01BackgroundBase1.png",
	"img02SmokePurple1.png",
	"img03SmokeBlue1.png",
	"img04WorldMapOverlay1.png",
	"img05Particles1.png",
	"img06HudLines1.png",
];

export function WvHome({
	locale,
	channel,
	localeBcp47,
	categories,
	products,
	membership,
}: CatalogContext & {
	categories: WvCategoryTile[];
	/** The whole catalog, slimmed down: the product collections are ordered from it in the browser. */
	products: CardProduct[];
	/** Which products are in the Saleor collections behind Staff Picks, Originals and Starter Kits. */
	membership: HomeMembership;
}) {
	const ctx = { locale, channel, localeBcp47 };
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			<section className="wv-nebula relative overflow-hidden border-y border-black">
				{HERO_LAYERS.map((file) => (
					<Image
						key={file}
						src={`/home/${file}`}
						alt=""
						fill
						sizes="100vw"
						className="object-cover"
						priority
					/>
				))}
				<div className="relative flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6 md:px-8 md:py-6 xl:min-h-[231px] xl:gap-10 xl:py-0 xl:pl-14 xl:pr-10">
					<div className="flex items-center gap-3 md:contents">
						<div className="wv-float relative h-[125px] w-[130px] shrink-0 overflow-hidden md:h-[173px] md:w-[180px] xl:h-[219px] xl:w-[227px]">
							{/* eslint-disable-next-line @next/next/no-img-element -- cropped artwork positioned by percentage */}
							<img
								src="/home/imgHeroLogo.png"
								alt=""
								className="absolute left-[-4.74%] top-[-37.03%] h-[178.45%] w-[109.36%] max-w-none"
							/>
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-[6px] md:gap-[11px] xl:max-w-[1083px]">
							<h1
								className={`${retrochips} wv-title-glow text-[22px] leading-none tracking-[-1px] md:text-[30px] xl:text-[34px] xl:tracking-[-1.5px]`}
							>
								<span className="text-[var(--wv-pink)]">WORLDWIDE</span>{" "}
								<span className="text-[var(--wv-cyan-soft)]">VAPOR</span>
							</h1>
							<p className={`${heyComic} text-[10px] tracking-[1px] md:text-sm`}>
								RETAIL | WHOLESALE | DISTRIBUTION PRICES
							</p>
							<p
								className={`${heyComic} max-w-[540px] text-[10px] leading-[1.6] text-[var(--wv-text-dim)] md:text-[11px]`}
							>
								Get direct access to leading hardware, premium disposables, and industry-grade distributions.
								Certified compliance, bulk tier rates, and global standard logistics.
							</p>
							<div className="mt-[11px] hidden gap-4 md:flex">
								<OutlineButton href="/shop" color="cyan">
									SHOP NOW
								</OutlineButton>
								<OutlineButton href="/distributor" color="pink">
									BECOME A DISTRIBUTOR
								</OutlineButton>
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-3 md:hidden">
						<OutlineButton href="/shop" color="cyan" className="w-full">
							SHOP NOW
						</OutlineButton>
						<OutlineButton href="/distributor" color="pink" className="w-full">
							BECOME A DISTRIBUTOR
						</OutlineButton>
					</div>
				</div>
			</section>

			{/* Categories */}
			{categories.length > 0 && (
				<section className="wv-nebula px-4 pb-6 pt-6 md:px-8 md:pb-8 xl:px-[70px] xl:pt-[17px]">
					<SectionHeading
						eyebrow="Browse Collections"
						title="CATEGORIES"
						size="small"
						bar="w-12 xl:w-[57px]"
					/>
					<div className="mx-auto mt-5 grid max-w-[704px] grid-cols-3 gap-3 md:gap-5 xl:flex xl:max-w-[1040px] xl:justify-center xl:gap-10">
						{categories.map((c) => {
							const href = `/shop?category=${encodeURIComponent(c.slug)}`;
							const art = CATEGORY_ART[c.slug];
							return (
								<Link
									key={c.slug}
									href={href}
									className="relative block aspect-[100/110] w-full md:aspect-square xl:h-[150px] xl:w-[140px] xl:shrink-0"
								>
									{art ? (
										<Image
											src={art}
											alt={c.name}
											fill
											sizes="(min-width: 768px) 196px, 100px"
											className="object-cover"
										/>
									) : (
										<span className="relative flex size-full items-end overflow-hidden rounded-xl border border-[var(--wv-cyan)] bg-[var(--wv-section)]">
											{c.image && (
												<Image
													src={c.image.url}
													alt=""
													fill
													sizes="(min-width: 768px) 196px, 100px"
													className="object-cover"
												/>
											)}
											<span className="absolute inset-0 bg-gradient-to-t from-[var(--wv-bg)] to-transparent" />
											<span
												className={`${bungee} relative w-full p-2 text-center text-[9px] uppercase text-white md:p-3 md:text-xs`}
											>
												{c.name}
											</span>
										</span>
									)}
								</Link>
							);
						})}
					</div>
				</section>
			)}

			<HomeCollections products={products} membership={membership} ctx={ctx} />

			{/* Trust badges */}
			<section className="grid grid-cols-1 gap-4 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-4 py-6 md:grid-cols-2 md:gap-6 md:px-8 xl:flex xl:items-center xl:justify-between xl:px-20 xl:py-4">
				{TRUST.map((t) => (
					<div key={t.title} className="flex items-center gap-4">
						<span className={`text-2xl ${t.accent}`}>{t.icon}</span>
						<div className="flex flex-col gap-[2px]">
							<p className={`${heyComic} text-sm`}>{t.title}</p>
							<p className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>{t.text}</p>
						</div>
					</div>
				))}
			</section>

			{/* The owner's note: only there once a bulletin page exists in Saleor */}
			<Suspense fallback={null}>
				<WvBulletin />
			</Suspense>

			{/* Brands */}
			<section className="flex flex-col items-center gap-6 border-b border-[var(--wv-purple)] bg-[var(--wv-deep)] px-4 pb-8 pt-7 md:px-8 xl:px-20">
				<SectionHeading eyebrow="OFFICIAL PARTNERS" title="OUR BRANDS" size="brands" bar="w-12 xl:w-[60px]" />
				<BrandCarousel />
			</section>

			{/* Promo */}
			<section className="wv-nebula">
				<div className="flex flex-col gap-6 p-4 py-8 md:gap-8 md:p-12 xl:flex-row xl:items-center xl:gap-12 xl:p-20">
					<div className="flex flex-1 flex-col items-start gap-4 xl:gap-6">
						<h2 className={`${heyComic} text-[28px] leading-tight md:text-[36px] xl:text-[44px]`}>
							PROMOTIONAL BUNDLES
						</h2>
						<p
							className={`${orbitron} max-w-[540px] text-sm leading-[1.6] text-[var(--wv-text-dim)] xl:w-[540px] xl:text-base`}
						>
							Save big with our curated bundle deals. Mix and match your favorite disposables, hardware kits,
							and accessories at exclusive wholesale pricing. Bundle more, save more.
						</p>
						<OutlineButton href="/shop?category=bundles" color="cyan">
							SHOP BUNDLES
						</OutlineButton>
					</div>
					<div className="relative aspect-[328/200] w-full shrink-0 overflow-hidden rounded-2xl border border-[var(--wv-purple)] md:aspect-[672/320] xl:aspect-auto xl:h-[360px] xl:w-[540px]">
						<Image
							src="/home/imgPromoRightMedia.png"
							alt="Promotional bundles"
							fill
							sizes="(min-width: 1280px) 540px, 100vw"
							className="object-cover"
						/>
					</div>
				</div>
			</section>

			{/* Newsletter */}
			<section className="flex flex-col items-center gap-6 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-4 py-8 md:gap-8 md:p-12 xl:p-20">
				<div className="flex flex-col items-center gap-3 text-center">
					<h2 className={`${orbitron} text-[22px] font-black md:text-[28px]`}>STAY UPDATED</h2>
					<p className="font-sans text-sm text-[var(--wv-text-dim)]">
						Get the latest deals, new products, and updates directly to your warehouse registry.
					</p>
				</div>
				<NewsletterForm />
			</section>

			<WvFooter />
		</div>
	);
}
