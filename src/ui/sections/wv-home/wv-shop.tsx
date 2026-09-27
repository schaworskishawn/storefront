import Image from "next/image";
import Link from "next/link";
import { type HomeProduct, type WvCategoryTile } from "@/lib/catalog/get-home-products";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { WvFooter, WvHeader } from "./wv-chrome";
import { CATEGORY_ART } from "./wv-category-art";
import { NewsletterForm } from "./wv-newsletter-client";
import { ShopCatalog } from "./wv-shop-catalog";
import "./wv-home.css";

/** Worldwide Vapor shop page — Figma "6.02 - High Fidelity - Shop" (desktop, 1440). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
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
	{ icon: "📦", title: "SAFE PACKAGING", text: "We ship packages sealed", accent: "text-[var(--wv-pink)]" },
];

export function WvShop({
	locale,
	channel,
	localeBcp47,
	products,
	categories,
	initialCategorySlug,
}: {
	locale: string;
	channel: string;
	localeBcp47: string;
	products: HomeProduct[];
	categories: WvCategoryTile[];
	initialCategorySlug?: string;
}) {
	const ctx = { locale, channel, localeBcp47 };

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Breadcrumb */}
			<nav
				aria-label="Breadcrumb"
				className={`${heyComic} border-b border-[var(--wv-cyan)] bg-[var(--wv-header)] px-4 py-3 text-xs tracking-[0.5px] text-[var(--wv-text-dim)] md:px-8 xl:px-20 xl:py-4`}
			>
				<Link href="/home">Home</Link> {">"} <span aria-current="page">Shop All Products</span>
			</nav>

			{/* Hero */}
			<section className="wv-nebula relative overflow-hidden border-y border-black">
				<Image
					src="/home/img01BackgroundBase1.png"
					alt=""
					fill
					sizes="100vw"
					className="object-cover opacity-30"
					priority
				/>
				<Image
					src="/home/img02SmokePurple1.png"
					alt=""
					fill
					sizes="100vw"
					className="object-cover opacity-40"
					priority
				/>
				<Image
					src="/home/img06HudLines1.png"
					alt=""
					fill
					sizes="100vw"
					className="object-cover opacity-60"
					priority
				/>
				<div className="relative flex items-center gap-6 px-4 py-6 md:px-8 xl:h-[220px] xl:gap-10 xl:px-20 xl:py-8">
					<div className="flex flex-1 flex-col gap-[10px]">
						<h1
							className={`${heyComic} wv-title-glow text-[24px] leading-none tracking-[-1px] md:text-[30px] xl:text-[34px] xl:tracking-[-1.5px]`}
						>
							<span className="text-[var(--wv-pink)]">SHOP ALL</span>{" "}
							<span className="text-[var(--wv-cyan-soft)]">PRODUCTS</span>
						</h1>
						<p className={`${bungee} text-[10px] tracking-[1px] md:text-xs xl:text-sm`}>
							PREMIUM VAPING HARDWARE | CERTIFIED COMPLIANCE | BULK TIER RATES
						</p>
						<p
							className={`${orbitron} max-w-[650px] text-[10px] leading-[1.6] text-[var(--wv-text-dim)] md:text-[11px]`}
						>
							Direct access to the industry&apos;s leading hardware, premium disposables, and grade-A
							distributions. Seamlessly browse through our complete selection of liquids, hardware kits, and
							high-quality accessories.
						</p>
					</div>
					<div className="relative hidden h-[120px] w-[180px] shrink-0 overflow-hidden rounded-xl shadow-[0_0_16px_0_rgba(105,235,255,0.2)] md:block xl:h-40 xl:w-[240px]">
						<Image
							src="/home/imgShopPromoGraphic.png"
							alt=""
							fill
							sizes="240px"
							className="object-cover"
							priority
						/>
						<span className="to-[var(--wv-bg)]/80 absolute inset-0 bg-gradient-to-b from-transparent" />
					</div>
				</div>
			</section>

			{/* Categories */}
			{categories.length > 0 && (
				<section className="flex flex-col items-center gap-5 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-4 py-6 md:px-8 xl:px-20 xl:py-8">
					<div className="flex flex-col items-center gap-[6px]">
						<p className={`${marker} text-xl uppercase tracking-[2px] text-[var(--wv-pink)]`}>
							Browse Collections
						</p>
						<h2 className={`${bungee} text-2xl tracking-[1px]`}>CATEGORIES</h2>
						<div className="h-[3px] w-[60px] rounded-full bg-[var(--wv-cyan-soft)]" />
					</div>
					<div className="flex w-full justify-end">
						<Link
							href={buildStorefrontPath(locale, channel, "/products")}
							className="text-[13px] text-[var(--wv-cyan-soft)]"
						>
							VIEW ALL →
						</Link>
					</div>
					<div className="grid w-full max-w-[420px] grid-cols-3 justify-items-center gap-3 md:max-w-[560px] xl:flex xl:max-w-none xl:justify-center xl:gap-[26px]">
						{categories.map((c) => {
							const art = CATEGORY_ART[c.slug];
							return (
								<Link
									key={c.slug}
									href={buildStorefrontPath(locale, channel, `/categories/${c.slug}`)}
									className="relative block size-[100px] shrink-0 md:size-[90px] xl:size-[175px]"
								>
									{art ? (
										<Image src={art} alt={c.name} fill sizes="175px" className="object-cover" />
									) : (
										<span className="relative flex size-full items-end overflow-hidden rounded-xl border border-[var(--wv-cyan)] bg-[var(--wv-section)]">
											{c.image && (
												<Image src={c.image.url} alt="" fill sizes="175px" className="object-cover" />
											)}
											<span className="absolute inset-0 bg-gradient-to-t from-[var(--wv-bg)] to-transparent" />
											<span
												className={`${bungee} relative w-full break-words p-2 text-center text-[9px] uppercase text-white xl:p-3 xl:text-xs`}
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

			{/* Catalog */}
			<ShopCatalog products={products} ctx={ctx} initialCategorySlug={initialCategorySlug} />

			{/* Trust badges */}
			<section
				className={`${heyComic} flex grid grid-cols-1 items-center justify-between gap-4 border-y border-[var(--wv-cyan)] bg-[var(--wv-surface)] px-4 py-6 md:grid-cols-2 md:gap-6 md:px-8 xl:flex xl:items-center xl:justify-between xl:px-20 xl:py-8`}
			>
				{TRUST.map((t) => (
					<div key={t.title} className="flex items-center gap-4">
						<span className={`text-2xl ${t.accent}`}>{t.icon}</span>
						<div className="flex flex-col gap-[2px]">
							<p className="text-sm">{t.title}</p>
							<p className="text-xs text-[var(--wv-text-dim)]">{t.text}</p>
						</div>
					</div>
				))}
			</section>

			{/* Promo */}
			<section className="wv-promo-bg">
				<div className="flex flex-col gap-6 px-4 py-8 md:gap-8 md:p-12 xl:flex-row xl:items-center xl:gap-12 xl:p-16">
					<div className="flex flex-1 flex-col items-start gap-4 xl:gap-[18px]">
						<h2 className={`${heyComic} text-[26px] md:text-[32px] xl:text-4xl`}>PROMOTIONAL BUNDLES</h2>
						<p
							className={`${orbitron} max-w-[540px] text-sm leading-[1.6] text-[var(--wv-text-dim)] xl:w-[540px]`}
						>
							Sign up today and get 15% off your first checkout order. Save big with curated bundle deals,
							wholesale hardware access, and certified direct shipping.
						</p>
						<Link
							href={buildStorefrontPath(locale, channel, "/products")}
							className={`${heyComic} flex h-[45px] items-center justify-center rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] px-6 text-sm text-[var(--wv-cyan-soft)]`}
						>
							SHOP NOW →
						</Link>
					</div>
					<div className="relative aspect-[328/200] w-full shrink-0 overflow-hidden rounded-2xl border-[3px] border-[var(--wv-purple)] md:aspect-[672/320] xl:aspect-auto xl:h-[260px] xl:w-[480px]">
						<Image
							src="/home/imgPromoRightMedia.png"
							alt="Promotional bundles"
							fill
							sizes="480px"
							className="object-cover"
						/>
					</div>
				</div>
			</section>
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />

			{/* Newsletter */}
			<section className="flex flex-col gap-6 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-4 py-8 md:px-8 xl:flex-row xl:items-center xl:justify-between xl:px-20 xl:py-12">
				<div className="flex w-full flex-col gap-2 xl:w-[500px]">
					<h2 className={`${orbitron} text-[22px] font-black`}>STAY UPDATED</h2>
					<p className="font-sans text-sm text-[var(--wv-text-dim)]">
						Receive launch schedules and vape hardware drops directly to your catalog inbox.
					</p>
				</div>
				<NewsletterForm compact />
			</section>

			<WvFooter />
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />
		</div>
	);
}
