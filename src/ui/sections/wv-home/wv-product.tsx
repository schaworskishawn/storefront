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
			<section className="flex flex-col gap-6 px-4 pb-10 md:gap-8 md:px-8 md:pb-14 xl:grid xl:grid-cols-[620px_minmax(0,1fr)] xl:items-start xl:gap-x-16 xl:gap-y-5 xl:px-20 xl:pb-20">
				<div>
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
					/>
				</div>
				{/* Description sits right under the buy buttons; spans the full width on desktop to match Tech Specs */}
				<div className="-mt-3 flex flex-col gap-4 rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-bg)] p-6 md:-mt-5 xl:col-span-2 xl:mt-0">
					<h2 className={`${bungee} text-lg uppercase md:text-[22px]`}>{product.name}</h2>
					{paragraphs.map((x) => (
						<p key={x} className={`${orbitron} text-sm leading-[22px] text-[var(--wv-disabled)]`}>
							{x}
						</p>
					))}
				</div>
			</section>

			{/* Tech specs — pulled up by the hero's bottom padding (pb-10 / md:pb-14 / xl:pb-20) so only pt-5 separates it from the description. */}
			{specs.length > 0 && (
				<section className="-mt-10 px-4 pt-5 md:-mt-14 md:px-8 xl:-mt-20 xl:px-20">
					<div className="flex flex-col gap-4 rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-bg)] p-6">
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
				</section>
			)}

			{/* Key features */}
			{features.length > 0 && (
				<section className="flex flex-col gap-6 px-4 py-8 md:px-8 md:py-10 xl:px-20 xl:py-12">
					<h2 className={`${heyComic} text-xl`}>KEY FEATURES</h2>
					<ul className={`${orbitron} flex flex-col gap-4`}>
						{features.map((f) => (
							<li key={f} className="flex items-center gap-3">
								<span className="text-sm text-[var(--wv-cyan-soft)]">✓</span>
								<span className="flex-1 text-[13px] text-[var(--wv-disabled)]">{f}</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Recommendations */}
			{related.length > 0 && (
				<section className="flex flex-col gap-6 px-4 pb-8 pt-5 md:px-8 md:pb-10 xl:px-20 xl:pb-12">
					<h2 className={`${heyComic} text-2xl`}>YOU MAY ALSO LIKE</h2>
					<ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
						{related.map((p) => (
							<li key={p.id}>
								<Link
									href={`/product/${p.slug}`}
									className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--wv-purple)] bg-[var(--wv-ink)]"
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
