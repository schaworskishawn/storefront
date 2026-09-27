import Image from "next/image";
import Link from "next/link";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { type ProductDetails } from "@/lib/catalog/get-product-details";
import { formatPrice } from "@/ui/components/plp/utils";
import { WvFooter, WvHeader } from "./wv-chrome";
import { ProductGallery, ProductPurchase } from "./wv-product-client";
import "./wv-home.css";

/** Worldwide Vapor product page — Figma "6.06 - High Fidelity - Product" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const TRUST = [
	{ icon: "/home/imgHeadset.svg", title: "24/7 SUPPORT", text: "Always on, never closed" },
	{ icon: "/home/imgTruck.svg", title: "GLOBAL SHIPPING", text: "Coming Soon: Canada Only" },
	{ icon: "/home/imgShieldCheck.svg", title: "AGE VERIFIED CHECKOUT", text: "Must Be 18+ Legal Age" },
	{ icon: "/home/imgPackage.svg", title: "WE SHIP FIRE PACKAGES ASAP", text: "We ship packages sealed" },
];

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
	const quickSpecs = specs.slice(0, 4).map((x) => x.value);
	const dashboard = specs
		.filter((x) => x.value.length <= 10 && !/^\d{4}-\d{2}-\d{2}$/.test(x.value))
		.slice(0, 5);
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
				},
			];

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Breadcrumbs */}
			<nav
				aria-label="Breadcrumb"
				className={`${orbitron} flex flex-wrap items-center gap-2 px-4 py-4 text-xs text-[var(--wv-disabled)] md:px-8 md:py-5 xl:px-20 xl:py-8`}
			>
				<Link href="/home">Home</Link>
				<span aria-hidden>/</span>
				<Link href="/shop">{product.brand || "Shop"}</Link>
				<span aria-hidden>/</span>
				<span aria-current="page" className="text-[var(--wv-cyan-soft)]">
					{product.name}
				</span>
			</nav>

			{/* Hero */}
			<section className="flex flex-col gap-6 px-4 pb-10 md:gap-8 md:px-8 md:pb-14 xl:flex-row xl:gap-16 xl:px-20 xl:pb-20">
				<div className="xl:w-[620px] xl:shrink-0">
					<ProductGallery images={images} name={product.name} />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-[10px]">
					{product.isBestseller && (
						<span
							className={`${heyComic} w-fit rounded bg-[var(--wv-cyan-soft)] px-[14px] py-[5px] text-[10px] tracking-[1.5px] text-[var(--wv-ink)]`}
						>
							BESTSELLER
						</span>
					)}
					<h1 className={`${heyComic} text-[22px] uppercase leading-tight md:text-[26px] xl:text-[28px]`}>
						{product.name}
					</h1>
					<ProductPurchase
						variants={variants}
						optionLabel={details?.optionLabel ?? "OPTION"}
						localeBcp47={localeBcp47}
						channel={channel}
						locale={locale}
						name={product.name}
						slug={product.slug}
					>
						{quickSpecs.length > 0 && (
							<div className="flex flex-col gap-2">
								<p className={`${heyComic} text-[11px] tracking-[1px] text-[var(--wv-disabled)]`}>
									QUICK SPECS
								</p>
								<ul className="grid grid-cols-2 gap-2">
									{quickSpecs.map((q) => (
										<li
											key={q}
											className={`${bungee} truncate rounded-full border border-[var(--wv-control)] bg-[var(--wv-bg)] px-[10px] py-[6px] text-[11px]`}
										>
											{q}
										</li>
									))}
								</ul>
							</div>
						)}
					</ProductPurchase>
				</div>
			</section>

			{/* Spec dashboard */}
			{dashboard.length >= 3 && (
				<section className="grid grid-cols-2 gap-x-4 gap-y-8 border-y border-[var(--wv-control)] px-4 py-8 md:grid-cols-3 md:px-8 md:py-10 xl:grid-cols-5 xl:gap-6 xl:px-20 xl:py-12">
					{dashboard.map((c) => (
						<div key={c.label} className="flex flex-col items-center gap-[6px] text-center">
							<p className={`${bungee} text-[22px] uppercase text-[var(--wv-cyan-soft)] md:text-[28px]`}>
								{c.value}
							</p>
							<p className={`${orbitron} text-xs font-bold uppercase tracking-[1px]`}>{c.label}</p>
						</div>
					))}
				</section>
			)}

			{/* Trust */}
			<section className="grid grid-cols-1 gap-3 px-4 py-8 md:grid-cols-2 md:gap-4 md:px-8 md:py-10 xl:grid-cols-4 xl:px-20">
				{TRUST.map((t) => (
					<div
						key={t.title}
						className="flex flex-col gap-3 rounded-xl border border-[var(--wv-control)] bg-[var(--wv-bg)] p-6"
					>
						<span className="flex size-8 items-center justify-center rounded-lg bg-[var(--wv-cyan-soft)]">
							<Image src={t.icon} alt="" width={16} height={16} />
						</span>
						<p className={`${heyComic} text-xs uppercase tracking-[1px]`}>{t.title}</p>
						<p className={`${orbitron} text-[11px] text-[var(--wv-disabled)]`}>{t.text}</p>
					</div>
				))}
			</section>

			{/* Description + tech specs */}
			<section className="flex flex-col gap-8 px-4 py-8 md:px-8 md:py-10 xl:flex-row xl:gap-16 xl:px-20 xl:pb-16 xl:pt-12">
				<div className="flex flex-1 flex-col gap-6">
					<h2 className={`${bungee} text-lg uppercase md:text-[22px]`}>ABOUT {product.name}</h2>
					{paragraphs.map((t) => (
						<p key={t} className={`${orbitron} text-sm leading-[22px] text-[var(--wv-disabled)]`}>
							{t}
						</p>
					))}
				</div>
				{specs.length > 0 && (
					<div className="flex flex-col gap-4 rounded-xl border border-[var(--wv-control)] bg-[var(--wv-bg)] p-6 xl:w-[480px] xl:shrink-0">
						<h2 className={`${bungee} text-base text-[var(--wv-cyan-soft)]`}>TECH SPECS</h2>
						<dl className="flex flex-col gap-4">
							{specs.map((x) => (
								<div
									key={x.label}
									className={`${orbitron} flex justify-between gap-4 border-b border-[var(--wv-control)] pb-3 text-xs`}
								>
									<dt className="text-[var(--wv-disabled)]">{x.label}</dt>
									<dd className="text-right font-bold">{x.value}</dd>
								</div>
							))}
						</dl>
					</div>
				)}
			</section>

			{/* Features + promo */}
			<section className="flex flex-col gap-8 px-4 py-8 md:px-8 md:py-10 xl:flex-row xl:items-center xl:gap-10 xl:px-20 xl:py-12">
				{features.length > 0 && (
					<div className="flex flex-1 flex-col gap-6">
						<h2 className={`${heyComic} text-xl`}>KEY FEATURES</h2>
						<ul className={`${orbitron} flex flex-col gap-4`}>
							{features.map((f) => (
								<li key={f} className="flex items-center gap-3">
									<span className="text-sm text-[var(--wv-cyan-soft)]">✓</span>
									<span className="flex-1 text-[13px] text-[var(--wv-disabled)]">{f}</span>
								</li>
							))}
						</ul>
					</div>
				)}
				<div className="flex flex-col gap-5 rounded-[14px] border border-[var(--wv-purple)] bg-[var(--wv-bg)] p-6 md:p-8 xl:w-[540px] xl:shrink-0">
					<p className={`${heyComic} text-lg leading-7`}>
						PREMIUM FLAVOR. MASSIVE PUFFS. UNBEATABLE EXPERIENCE.
					</p>
					<p className={`${orbitron} text-xs leading-[18px] text-[var(--wv-disabled)]`}>
						Join the Worldwide Vapor movement. Our custom formulas are engineered specifically for
						high-capacity systems. Get satisfaction that lasts.
					</p>
				</div>
			</section>

			{/* Recommendations */}
			{related.length > 0 && (
				<section className="flex flex-col gap-6 px-4 py-8 md:px-8 md:py-10 xl:px-20 xl:py-12">
					<h2 className={`${heyComic} text-2xl`}>YOU MAY ALSO LIKE</h2>
					<ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
						{related.map((p) => (
							<li key={p.id}>
								<Link
									href={`/product/${p.slug}`}
									className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--wv-control)] bg-[var(--wv-ink)]"
								>
									<span className="relative block h-[140px] bg-[var(--wv-bg)] md:h-[180px]">
										{p.image && (
											<Image
												src={p.image.url}
												alt={p.image.alt}
												fill
												sizes="(min-width: 1280px) 200px, 33vw"
												className="object-contain p-3"
											/>
										)}
									</span>
									<span className="flex flex-1 flex-col gap-3 p-4 md:gap-4 md:p-5">
										<span className={`${orbitron} text-sm font-bold`}>{p.name}</span>
										<span className={`${orbitron} mt-auto text-lg font-extrabold text-[var(--wv-cyan-soft)]`}>
											{formatPrice(p.price, p.currency, localeBcp47)}
										</span>
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			<WvFooter />
		</div>
	);
}
