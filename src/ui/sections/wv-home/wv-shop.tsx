import { ChevronRight, Home } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { type HomeProduct, type WvCategoryTile } from "@/lib/catalog/get-home-products";
import { WvFooter, WvHeader } from "./wv-chrome";
import { PromoBundleArt } from "./wv-promo-art";
import { NewsletterForm } from "./wv-newsletter-client";
import { ShopCatalog } from "./wv-shop-catalog";
import "./wv-home.css";

/** Worldwide Vapor shop page — Figma "6.02 - High Fidelity - Shop" (desktop, 1440). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const TRUST = [
	{
		icon: "⚡",
		title: "24/7 SUPPORT",
		text: "Always active direct line",
	},
	{ icon: "🌎", title: "GLOBAL SHIPPING", text: "Express Options" },
	{
		icon: "🔞",
		title: "AGE VERIFIED CHECKOUT",
		text: "Must Be Of Legal Age",
	},
	{ icon: "📦", title: "SAFE PACKAGING", text: "We ship packages sealed" },
];

/** Static-shell placeholder for `<Suspense>` around `ShopCatalog` — see the usage site below. */
function ShopCatalogFallback() {
	return (
		<div className="flex flex-col gap-6 px-4 py-8 md:px-8 xl:px-20" aria-hidden="true">
			<div className="h-10 w-full max-w-xs animate-pulse rounded-lg bg-[var(--wv-surface)]" />
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 8 }, (_, i) => (
					<div
						key={i}
						className="h-64 rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] p-3"
					>
						<div className="h-40 w-full animate-pulse rounded-[10px] bg-[var(--wv-deep)]" />
					</div>
				))}
			</div>
		</div>
	);
}

export function WvShop({
	locale,
	channel,
	localeBcp47,
	products,
	categories,
}: {
	locale: string;
	channel: string;
	localeBcp47: string;
	products: HomeProduct[];
	categories: WvCategoryTile[];
}) {
	const ctx = { locale, channel, localeBcp47 };

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Breadcrumb: a glass strip under the header, Home glowing cyan, a pink chevron, and the page you're on in a neon
			    pill (styles: `.wv-crumb*` in wv-home.css). */}
			<nav
				aria-label="Breadcrumb"
				className={`${heyComic} wv-crumbs flex items-center gap-2 px-4 py-2 text-xs tracking-[0.5px] md:px-8 xl:px-20 xl:py-3`}
			>
				<Link href="/home" className="wv-link wv-crumb-link">
					<Home aria-hidden className="size-3.5" strokeWidth={2.25} />
					Home
				</Link>
				<ChevronRight aria-hidden className="wv-crumb-sep size-3.5" strokeWidth={2.5} />
				<span aria-current="page" className="wv-crumb-current">
					Shop All Products
				</span>
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
				{/* The hero's text has depth, as on the home hero (`.wv-hero-*`): a 3D title over a neon underline, a chrome
				    tagline with pink dividers, brighter copy with its key phrases lit; behind it a pink and cyan glow, a neon
				    edge along its foot, and the art in a glowing neon frame (`.wv-shop-hero*` in wv-home.css). */}
				<div className="wv-shop-hero relative flex items-center gap-6 px-4 py-6 md:px-8 xl:h-[220px] xl:gap-10 xl:px-20 xl:py-8">
					<div className="flex flex-1 flex-col gap-[10px]">
						<h1
							className={`${heyComic} wv-title-glow wv-hero-title wv-shop-hero-title text-[24px] leading-none tracking-[-1px] md:text-[30px] xl:text-[34px] xl:tracking-[-1.5px]`}
						>
							<span className="text-[var(--wv-pink)]">SHOP ALL</span>{" "}
							<span className="text-[var(--wv-cyan-soft)]">PRODUCTS</span>
						</h1>
						<p className={`${bungee} wv-hero-tagline text-[10px] tracking-[1px] md:text-xs xl:text-sm`}>
							PREMIUM VAPING HARDWARE <span className="wv-hero-sep">|</span> CERTIFIED COMPLIANCE{" "}
							<span className="wv-hero-sep">|</span> BULK TIER RATES
						</p>
						<p className={`${orbitron} wv-hero-copy max-w-[650px] text-[10px] leading-[1.6] md:text-[11px]`}>
							Direct access to the industry&apos;s <strong className="wv-hero-key">leading hardware</strong>,{" "}
							<strong className="wv-hero-key wv-hero-key--pink">premium disposables</strong>, and{" "}
							<strong className="wv-hero-key">grade-A distributions</strong>. Seamlessly browse through our
							complete selection of liquids, hardware kits, and high-quality accessories.
						</p>
					</div>
					<div className="wv-shop-hero-art relative hidden h-[120px] w-[180px] shrink-0 overflow-hidden rounded-xl md:block xl:h-40 xl:w-[240px]">
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

			{/* Catalog (incl. the "Browse Collections" category tiles) — `ShopCatalog` reads the
			    category filter via `useSearchParams()` (see that file), which this project's Cache
			    Components/PPR setup requires to sit behind a Suspense boundary or the whole route
			    fails to build (not just a dev-mode warning, unlike vanilla Next.js). The fallback
			    below is only ever seen for a moment during the initial static shell paint.
			    The category tiles live inside `ShopCatalog` (not here) so clicking one applies the
			    filter directly against its state — no page navigation. */}
			<Suspense fallback={<ShopCatalogFallback />}>
				<ShopCatalog products={products} ctx={ctx} categoryTiles={categories} />
			</Suspense>

			{/* Trust badges */}
			<section
				className={`${heyComic} flex grid grid-cols-1 items-center justify-between gap-4 border-y border-[var(--wv-cyan)] bg-[var(--wv-surface)] px-4 py-6 md:grid-cols-2 md:gap-6 md:px-8 xl:flex xl:items-center xl:justify-between xl:px-20 xl:py-8`}
			>
				{TRUST.map((t) => (
					<div key={t.title} className="wv-trust-item flex items-center gap-4">
						<span className="wv-trust-icon text-2xl">{t.icon}</span>
						<div className="flex flex-col gap-[2px]">
							<p className="wv-trust-title text-sm">{t.title}</p>
							<p className="wv-trust-text text-xs">{t.text}</p>
						</div>
					</div>
				))}
			</section>

			{/* Promo */}
			<section className="wv-promo-bg">
				<div className="flex flex-col gap-6 px-4 py-8 md:gap-8 md:p-12 xl:flex-row xl:items-center xl:gap-12 xl:p-16">
					<div className="flex flex-1 flex-col items-start gap-4 xl:gap-[18px]">
						<h2 className={`${heyComic} wv-heading-title text-[26px] md:text-[32px] xl:text-4xl`}>
							PROMOTIONAL BUNDLES
						</h2>
						<p className={`${orbitron} wv-hero-copy max-w-[540px] text-sm leading-[1.6] xl:w-[540px]`}>
							Sign up today and get{" "}
							<strong className="wv-hero-key wv-hero-key--pink">15% off your first checkout order</strong>.
							Save big with <strong className="wv-hero-key">curated bundle deals</strong>, wholesale hardware
							access, and <strong className="wv-hero-key">certified direct shipping</strong>.
						</p>
						<Link
							href="/shop"
							className={`${heyComic} wv-btn-neon flex h-[45px] items-center justify-center rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] px-6 text-sm text-[var(--wv-cyan-soft)]`}
						>
							<span className="wv-btn-label">SHOP NOW →</span>
						</Link>
					</div>
					<div className="relative aspect-[328/200] w-full shrink-0 overflow-hidden rounded-2xl border-[3px] border-[var(--wv-purple)] md:aspect-[672/320] xl:aspect-auto xl:h-[260px] xl:w-[480px]">
						<PromoBundleArt
							idPrefix="shop-promo"
							label="Promotional bundles: products rising from an open neon box over a synthwave sun"
						/>
					</div>
				</div>
			</section>
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />

			{/* Newsletter */}
			<section className="flex flex-col gap-6 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-4 py-8 md:px-8 xl:flex-row xl:items-center xl:justify-between xl:px-20 xl:py-12">
				<div className="flex w-full flex-col gap-2 xl:w-[500px]">
					<h2 className={`${orbitron} wv-heading-title text-[22px] font-black`}>STAY UPDATED</h2>
					<p className="wv-hero-copy font-sans text-sm">
						Receive <strong className="wv-hero-key">launch schedules</strong> and{" "}
						<strong className="wv-hero-key wv-hero-key--pink">vape hardware drops</strong> directly to your
						catalog inbox.
					</p>
				</div>
				<NewsletterForm compact />
			</section>

			<WvFooter />
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />
		</div>
	);
}
