import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { type HomeProduct, type WvCategoryTile } from "@/lib/catalog/get-home-products";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { formatPrice } from "@/ui/components/plp/utils";
import { WvFooter, WvHeader } from "./wv-chrome";
import { CATEGORY_ART } from "./wv-category-art";
import { BRAND_LOGOS } from "./wv-data";
import { BrandCarousel } from "./wv-home-client";
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
const marker = "font-[family-name:var(--font-permanent-marker)]";

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

const HEADING_SIZE = {
	section: "text-[20px] md:text-[26px] xl:text-[32px]",
	small: "text-[18px] md:text-[20px] xl:text-[23px]",
	brands: "text-[18px] md:text-[22px] xl:text-[24px]",
} as const;

function SectionHeading({
	eyebrow,
	title,
	size = "section",
	bar = "w-12 xl:w-20",
}: {
	eyebrow: string;
	title: string;
	size?: keyof typeof HEADING_SIZE;
	bar?: string;
}) {
	return (
		<div className="flex flex-col items-center gap-2 text-center">
			<p className={`${marker} uppercase tracking-[2px] text-[var(--wv-pink)] ${HEADING_SIZE[size]}`}>
				{eyebrow}
			</p>
			<h2 className={`${bungee} tracking-[1px] text-white ${HEADING_SIZE[size]}`}>{title}</h2>
			<div className={`h-[3px] rounded-full bg-[var(--wv-cyan-soft)] ${bar}`} />
		</div>
	);
}

function OutlineButton({
	children,
	href,
	color,
	className = "",
}: {
	children: ReactNode;
	href: string;
	color: "cyan" | "pink";
	className?: string;
}) {
	const c =
		color === "cyan"
			? "border-[var(--wv-cyan-soft)] text-[var(--wv-cyan-soft)]"
			: "border-[var(--wv-pink)] text-[var(--wv-pink)]";
	return (
		<Link
			href={href}
			className={`${heyComic} flex h-9 items-center justify-center rounded-xl border-[1.5px] px-6 text-sm tracking-[1px] md:h-[45px] ${c} ${className}`}
		>
			{children}
		</Link>
	);
}

type CatalogContext = { locale: string; channel: string; localeBcp47: string };

function ProductCard({ product, ctx }: { product: HomeProduct; ctx: CatalogContext }) {
	const money = (n: number) => formatPrice(n, product.currency, ctx.localeBcp47);
	const href = `/product/${product.slug}`;
	const badge = product.isBestseller
		? "BEST SELLER"
		: product.discountPercent
			? `-${product.discountPercent}%`
			: null;

	return (
		<article className="flex flex-col overflow-hidden rounded-[13px] border border-[var(--wv-cyan)] bg-[var(--wv-section)]">
			<Link href={href} className="relative block h-[130px] w-full bg-[var(--wv-deep)] md:h-[194px]">
				{product.image && (
					<Image
						src={product.image.url}
						alt={product.image.alt}
						fill
						sizes="(min-width: 1280px) 302px, 50vw"
						className="object-cover"
					/>
				)}
				{badge && (
					<span className="absolute left-2 top-2 rounded-full bg-[var(--wv-pink)] px-2 py-1 font-sans text-[9px] font-extrabold text-[var(--wv-bg)] md:left-3 md:top-3 md:px-[10px] md:py-[6px] md:text-[10px]">
						{badge}
					</span>
				)}
			</Link>
			<div className="flex flex-1 flex-col gap-[6px] p-3 md:p-[15px]">
				{product.brand && (
					<p className={`${bungee} text-[9px] uppercase text-[var(--wv-cyan)] md:text-[10px]`}>
						{product.brand}
					</p>
				)}
				<h3 className={`${heyComic} text-sm text-white md:text-[15px]`}>
					<Link href={href}>{product.name}</Link>
				</h3>
				<div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-[6px]">
					<div className={`${bungee} flex flex-col gap-[2px]`}>
						<span className="text-sm text-white md:text-[17px]">
							{money(product.price)}
							{product.priceStop !== null && ` - ${money(product.priceStop)}`}
						</span>
						{product.undiscountedPrice !== null && (
							<span className="text-[10px] text-[var(--wv-muted)] line-through md:text-[11px]">
								{money(product.undiscountedPrice)}
							</span>
						)}
					</div>
					<Link
						href={href}
						className={`${heyComic} rounded-lg border border-[var(--wv-cyan)] bg-[var(--wv-cyan)] p-2 text-[9px] text-[var(--wv-bg)] md:p-[11px] md:text-[10px]`}
					>
						VIEW PRODUCT
					</Link>
				</div>
			</div>
		</article>
	);
}

function ProductSection({
	eyebrow,
	title,
	products,
	ctx,
	cta,
}: {
	eyebrow: string;
	title: string;
	products: HomeProduct[];
	ctx: CatalogContext;
	cta?: boolean;
}) {
	if (products.length === 0) return null;
	return (
		<>
			<section className="wv-nebula px-4 pb-8 pt-6 md:px-8 md:pb-10 md:pt-10 xl:px-20 xl:pb-12">
				<SectionHeading eyebrow={eyebrow} title={title} />
				<div className="mx-auto mt-8 grid max-w-[1287px] grid-cols-2 gap-3 md:mt-10 md:gap-5 xl:mt-12 xl:grid-cols-4 xl:gap-x-[26px] xl:gap-y-[35px]">
					{products.map((p) => (
						<ProductCard key={p.id} product={p} ctx={ctx} />
					))}
				</div>
				{cta && (
					<div className="mt-8 flex justify-center xl:mt-10">
						<OutlineButton href={buildStorefrontPath(ctx.locale, ctx.channel, "/products")} color="cyan">
							VIEW ALL PRODUCTS
						</OutlineButton>
					</div>
				)}
			</section>
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />
		</>
	);
}

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
	featured,
	bestSellers,
	newArrivals,
}: CatalogContext & {
	categories: WvCategoryTile[];
	featured: HomeProduct[];
	bestSellers: HomeProduct[];
	newArrivals: HomeProduct[];
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
						<div className="relative h-[125px] w-[130px] shrink-0 overflow-hidden md:h-[173px] md:w-[180px] xl:h-[219px] xl:w-[227px]">
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
								<OutlineButton href="#" color="pink">
									BECOME A DISTRIBUTOR
								</OutlineButton>
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-3 md:hidden">
						<OutlineButton href="/shop" color="cyan" className="w-full">
							SHOP NOW
						</OutlineButton>
						<OutlineButton href="#" color="pink" className="w-full">
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
							const href = buildStorefrontPath(ctx.locale, ctx.channel, `/categories/${c.slug}`);
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

			<ProductSection eyebrow="COLLECTION" title="FEATURED PRODUCTS" products={featured} ctx={ctx} cta />
			<ProductSection eyebrow="TOP PICKS" title="BEST SELLERS" products={bestSellers} ctx={ctx} />
			<ProductSection eyebrow="LATEST" title="NEW ARRIVALS" products={newArrivals} ctx={ctx} />

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

			{/* Brands */}
			<section className="flex flex-col items-center gap-6 border-b border-[var(--wv-purple)] bg-[var(--wv-deep)] px-4 pb-8 pt-7 md:px-8 xl:px-20">
				<SectionHeading eyebrow="OFFICIAL PARTNERS" title="OUR BRANDS" size="brands" bar="w-12 xl:w-[60px]" />
				<BrandCarousel />
				<div className="grid w-full grid-cols-2 gap-[10px] md:grid-cols-3 md:gap-4 xl:hidden">
					{BRAND_LOGOS.map((b) => (
						<div
							key={b.name}
							className="relative h-[70px] overflow-hidden rounded-xl border border-[var(--wv-cyan)] md:h-[85px]"
						>
							<Image
								src={b.src}
								alt={b.name}
								fill
								sizes="(min-width: 768px) 216px, 159px"
								className="object-cover"
							/>
						</div>
					))}
				</div>
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
