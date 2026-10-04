import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { formatPrice } from "@/ui/components/plp/utils";

/**
 * Pieces of the home page that are shared between the server-rendered page and the client component that orders the
 * product collections: section headings, buttons, product cards and a collection section.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

/** What a product card (and the sorting behind a collection) needs. The home page sends these, not the whole product. */
export type CardProduct = Pick<
	HomeProduct,
	| "id"
	| "slug"
	| "name"
	| "brand"
	| "price"
	| "priceStop"
	| "undiscountedPrice"
	| "discountPercent"
	| "currency"
	| "image"
	| "isBestseller"
	| "created"
>;

export function toCardProduct(p: HomeProduct): CardProduct {
	return {
		id: p.id,
		slug: p.slug,
		name: p.name,
		brand: p.brand,
		price: p.price,
		priceStop: p.priceStop,
		undiscountedPrice: p.undiscountedPrice,
		discountPercent: p.discountPercent,
		currency: p.currency,
		image: p.image,
		isBestseller: p.isBestseller,
		created: p.created,
	};
}

const HEADING_SIZE = {
	section: "text-[20px] md:text-[26px] xl:text-[32px]",
	small: "text-[18px] md:text-[20px] xl:text-[23px]",
	brands: "text-[18px] md:text-[22px] xl:text-[24px]",
} as const;

export function SectionHeading({
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

export function OutlineButton({
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

export type CatalogContext = { locale: string; channel: string; localeBcp47: string };

function ProductCard({ product, ctx }: { product: CardProduct; ctx: CatalogContext }) {
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

export function ProductSection({
	eyebrow,
	title,
	products,
	ctx,
	cta,
}: {
	eyebrow: string;
	title: string;
	products: CardProduct[];
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
						<OutlineButton href="/shop" color="cyan">
							VIEW ALL PRODUCTS
						</OutlineButton>
					</div>
				)}
			</section>
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />
		</>
	);
}
