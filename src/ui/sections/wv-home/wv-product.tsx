import { Check, ChevronRight, ClipboardList, Flame, Home, Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { type ProductDetails } from "@/lib/catalog/get-product-details";
import { formatPrice } from "@/ui/components/plp/utils";
import { WholesalePrice } from "./wv-wholesale-price";
import { WvFooter, WvHeader } from "./wv-chrome";
import { ProductGallery, ProductPurchase } from "./wv-product-client";
import { ProductFaqSection, ProductStructuredData } from "./wv-product-seo";
import "./wv-home.css";

/** Worldwide Vapor product page — Figma "6.06 - High Fidelity - Product" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

/** A paragraph whose short lead-in label ("Safety: …", "How to re-wrap: …") is lit, so the description scans. */
function LeadIn({ text }: { text: string }) {
	const m = /^([^.:!?]{2,28}):\s+/.exec(text);
	if (!m) return text;
	return (
		<>
			<strong className="wv-hero-key">{m[1]}:</strong> {text.slice(m[0].length)}
		</>
	);
}

export function WvProduct({
	locale,
	channel,
	localeBcp47,
	product,
	details,
	related,
}: {
	locale: string;
	channel: string;
	localeBcp47: string;
	product: HomeProduct;
	details: ProductDetails | null;
	related: HomeProduct[];
}) {
	const images = details?.images.length ? details.images : product.image ? [product.image] : [];
	const specs = details?.specs ?? [];
	const paragraphs = details?.paragraphs.length
		? details.paragraphs
		: [`${product.name} from Worldwide Vapor — shipped sealed and age-verified at checkout.`];
	const features = details?.features ?? [];
	const variants = details?.variants.length
		? details.variants
		: [
				{
					id: product.id,
					name: product.name,
					price: product.price,
					undiscountedPrice: product.undiscountedPrice,
					currency: product.currency,
					inStock: true,
					options: [],
				},
			];

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Breadcrumb, as on the shop page: a glass strip under the header, Home glowing cyan behind a house icon, pink
			    chevrons, and this product in a neon pill (styles: `.wv-crumb*` in wv-home.css). It wraps on narrow screens,
			    and a long name is cut short with an ellipsis rather than breaking out of its pill. */}
			<nav
				aria-label="Breadcrumb"
				className={`${heyComic} wv-crumbs flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2 text-xs tracking-[0.5px] md:px-8 xl:px-20 xl:py-3`}
			>
				<Link href="/home" className="wv-link wv-crumb-link">
					<Home aria-hidden className="size-3.5" strokeWidth={2.25} />
					Home
				</Link>
				<ChevronRight aria-hidden className="wv-crumb-sep size-3.5" strokeWidth={2.5} />
				<Link href="/shop" className="wv-link wv-crumb-link">
					{product.brand || "Shop"}
				</Link>
				<ChevronRight aria-hidden className="wv-crumb-sep size-3.5" strokeWidth={2.5} />
				<span aria-current="page" className="wv-crumb-current min-w-0 max-w-full truncate">
					{product.name}
				</span>
			</nav>

			{/* Hero */}
			<section className="flex flex-col gap-6 px-4 pb-10 pt-5 md:gap-8 md:px-8 md:pb-14 md:pt-6 xl:grid xl:grid-cols-[620px_minmax(0,1fr)] xl:items-start xl:gap-x-16 xl:gap-y-5 xl:px-20 xl:pb-20 xl:pt-8">
				<div>
					<ProductGallery images={images} name={product.name} />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-[10px]">
					{/* The buy panel is lit: a bestseller flag in the heroes' neon badge (`.wv-hero-badge`), the name lifted
					    off the page with a cyan glow over a glowing bar (`.wv-pdp-title`, `.wv-hero-bar`); the price,
					    options, quantity and buttons follow in ProductPurchase. */}
					{product.isBestseller && (
						<span
							className={`${heyComic} wv-hero-badge flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[10px] tracking-[1.5px]`}
						>
							<Flame aria-hidden className="size-3.5" strokeWidth={2.25} />
							BESTSELLER
						</span>
					)}
					<h1
						className={`${heyComic} wv-pdp-title text-[22px] uppercase leading-tight md:text-[26px] xl:text-[28px]`}
					>
						{product.name}
					</h1>
					<span aria-hidden className="wv-hero-bar mb-1 h-[3px] w-16 rounded-full" />
					<ProductPurchase
						variants={variants}
						optionLabel={details?.optionLabel ?? "OPTION"}
						localeBcp47={localeBcp47}
						channel={channel}
						locale={locale}
						name={product.name}
						slug={product.slug}
					/>
				</div>
				{/* Description sits right under the buy buttons; spans the full width on desktop to match Tech Specs. A cyan
				    neon card that glows but doesn't lift (`.wv-neon-card`, `.wv-dist-step`): the name lifted over a glowing
				    bar, the copy brighter, and a paragraph's lead-in ("Safety:", "How to re-wrap:") lit. */}
				<div className="wv-neon-card wv-dist-step -mt-3 flex flex-col gap-4 rounded-2xl p-6 md:-mt-5 xl:col-span-2 xl:mt-0">
					<div className="flex flex-col gap-2">
						<h2 className={`${bungee} wv-pdp-title text-lg uppercase md:text-[22px]`}>{product.name}</h2>
						<span aria-hidden className="wv-hero-bar h-[3px] w-16 rounded-full" />
					</div>
					{paragraphs.map((x) => (
						<p key={x} className={`${orbitron} wv-neon-card-text text-sm leading-[1.7]`}>
							<LeadIn text={x} />
						</p>
					))}
				</div>
			</section>

			{/* Tech specs — pulled up by the hero's bottom padding (pb-10 / md:pb-14 / xl:pb-20) so only pt-5 separates it from the description. */}
			{specs.length > 0 && (
				<section className="-mt-10 px-4 pt-5 md:-mt-14 md:px-8 xl:-mt-20 xl:px-20">
					{/* A pink neon card: its title chrome beside a lit icon tile, each row over a glowing rule, two columns on
					    wider screens (`.wv-pdp-spec*`). */}
					<div className="wv-neon-card wv-neon-card--pink wv-dist-step wv-pdp-panel flex flex-col gap-4 rounded-2xl p-6">
						<div className="flex items-center gap-3">
							<span
								aria-hidden
								className="wv-neon-card-icon flex size-10 shrink-0 items-center justify-center rounded-xl"
							>
								<ClipboardList className="size-[18px]" strokeWidth={2.25} />
							</span>
							<h2 className={`${bungee} wv-heading-title text-base text-white md:text-lg`}>TECH SPECS</h2>
						</div>
						<dl className="grid gap-x-10 md:grid-cols-2">
							{specs.map((x) => (
								<div
									key={x.label}
									className={`${orbitron} wv-pdp-spec flex justify-between gap-4 py-3 text-xs`}
								>
									<dt className="wv-pdp-spec-label">{x.label}</dt>
									<dd className="text-right font-bold text-white">{x.value}</dd>
								</div>
							))}
						</dl>
					</div>
				</section>
			)}

			{/* Key features */}
			{features.length > 0 && (
				// The title chrome over a glowing bar; each feature a small neon tile, in turn cyan and pink, its check lit.
				<section className="flex flex-col gap-6 px-4 py-8 md:px-8 md:py-10 xl:px-20 xl:py-12">
					<div className="flex flex-col gap-2">
						<h2 className={`${bungee} wv-heading-title text-xl text-white md:text-2xl`}>KEY FEATURES</h2>
						<span aria-hidden className="wv-hero-bar mt-1 h-1 w-20 rounded-full md:w-[120px]" />
					</div>
					<ul className={`${orbitron} grid gap-3 md:grid-cols-2 xl:grid-cols-3 xl:gap-4`}>
						{features.map((f, i) => (
							<li
								key={f}
								className={`wv-neon-card wv-dist-step wv-pdp-panel ${i % 2 ? "wv-neon-card--pink" : ""} flex items-center gap-3 rounded-xl p-4`}
							>
								<span
									aria-hidden
									className="wv-neon-card-icon flex size-8 shrink-0 items-center justify-center rounded-lg"
								>
									<Check className="size-4" strokeWidth={3} />
								</span>
								<span className="wv-neon-card-text flex-1 text-[13px] leading-[1.5]">{f}</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Questions and answers, and a companion guide, from the product's `faq` and `guide` metadata in Saleor */}
			<ProductFaqSection faq={details?.faq ?? []} guide={details?.guide ?? null} />

			{/* Recommendations */}
			{related.length > 0 && (
				// The title chrome under a pink eyebrow, over a glowing bar; each product a neon card, in turn cyan and pink,
				// that lifts and glows under the pointer. Its image sits on a lit stage, or a glowing package stands in when
				// it has no photo; the name is lifted and the price chrome, as on the shop's cards.
				<section className="flex flex-col gap-6 px-4 pb-8 pt-5 md:px-8 md:pb-10 xl:px-20 xl:pb-12">
					<div className="flex flex-col gap-2">
						<p className={`${marker} wv-heading-eyebrow text-lg text-[var(--wv-pink)]`}>Keep exploring</p>
						<h2 className={`${bungee} wv-heading-title text-xl text-white md:text-2xl`}>YOU MAY ALSO LIKE</h2>
						<span aria-hidden className="wv-hero-bar mt-1 h-1 w-20 rounded-full md:w-[120px]" />
					</div>
					<ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
						{related.map((p, i) => (
							<li key={p.id}>
								<Link
									href={`/product/${p.slug}`}
									className={`wv-neon-card wv-pdp-panel ${i % 2 ? "wv-neon-card--pink" : ""} flex h-full flex-col overflow-hidden rounded-2xl`}
								>
									<span className="wv-pdp-related-art relative block h-[140px] md:h-[180px]">
										{p.image ? (
											<Image
												src={p.image.url}
												alt={p.image.alt}
												fill
												sizes="(min-width: 1280px) 200px, 33vw"
												className="object-contain p-3"
											/>
										) : (
											<span aria-hidden className="absolute inset-0 flex items-center justify-center">
												<span className="wv-neon-card-icon flex size-14 items-center justify-center rounded-2xl">
													<Package className="size-6" strokeWidth={2} />
												</span>
											</span>
										)}
									</span>
									<span className="flex flex-1 flex-col gap-3 p-4 md:gap-4 md:p-5">
										<span className={`${orbitron} wv-pc-name text-sm font-bold text-white`}>{p.name}</span>
										<span
											className={`${orbitron} wv-pc-price mt-auto w-fit text-lg font-extrabold text-[var(--wv-cyan-soft)]`}
										>
											{formatPrice(p.price, p.currency, localeBcp47)}
										</span>
										<WholesalePrice price={p.price} currency={p.currency} localeBcp47={localeBcp47} />
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			<ProductStructuredData product={product} details={details} variants={variants} images={images} />
			<WvFooter />
		</div>
	);
}
