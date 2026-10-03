"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { HomeProduct, WvCategoryTile } from "@/lib/catalog/get-home-products";
import { NEW_ARRIVALS_NAME, NEW_ARRIVALS_SLUG, newArrivalSlugs } from "@/lib/catalog/new-arrivals";
import { WishlistHeart } from "./wv-wishlist-client";
import { CATEGORY_ART } from "./wv-category-art";
import { formatPrice } from "@/ui/components/plp/utils";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

const PER_PAGE = 8;

type Sort = "featured" | "best-selling" | "price-asc" | "price-desc" | "newest" | "name";

const SORTS: { value: Sort; label: string }[] = [
	{ value: "featured", label: "Featured" },
	{ value: "newest", label: "Newest" },
	{ value: "best-selling", label: "Best Selling" },
	{ value: "price-asc", label: "Price: Low to High" },
	{ value: "price-desc", label: "Price: High to Low" },
	{ value: "name", label: "Name A–Z" },
];

/** Fixed price buckets (not a min/max slider) — matches the requested filter spec exactly. */
type PriceBucket = { id: string; label: string; min: number; max: number };
const PRICE_BUCKETS: PriceBucket[] = [
	{ id: "under-20", label: "Under $20", min: 0, max: 20 },
	{ id: "20-30", label: "$20 – $29.99", min: 20, max: 30 },
	{ id: "30-40", label: "$30 – $39.99", min: 30, max: 40 },
	{ id: "40-50", label: "$40 – $49.99", min: 40, max: 50 },
	{ id: "50-plus", label: "$50+", min: 50, max: Infinity },
];
const PRICE_BUCKET_BY_ID = new Map(PRICE_BUCKETS.map((b) => [b.id, b]));
function priceInBucket(price: number, bucketId: string): boolean {
	const bucket = PRICE_BUCKET_BY_ID.get(bucketId);
	return bucket ? price >= bucket.min && price < bucket.max : false;
}

type Ctx = { locale: string; channel: string; localeBcp47: string };

function ShopProductCard({ product, ctx }: { product: HomeProduct; ctx: Ctx }) {
	const money = (n: number) => formatPrice(n, product.currency, ctx.localeBcp47);
	const href = `/product/${product.slug}`;

	return (
		<article className="flex flex-col gap-[10px] rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] p-3">
			<Link
				href={href}
				className="relative block h-40 w-full overflow-hidden rounded-[10px] bg-[var(--wv-deep)]"
			>
				{product.image && (
					<Image
						src={product.image.url}
						alt={product.image.alt}
						fill
						sizes="230px"
						className="object-cover"
					/>
				)}
				<span className="to-[var(--wv-bg)]/80 absolute inset-0 bg-gradient-to-b from-transparent" />
			</Link>
			<div className="flex flex-1 flex-col gap-[6px]">
				<h3 className={`${heyComic} text-sm uppercase text-white`}>
					<Link href={href}>{product.name}</Link>
				</h3>
				{product.brand && (
					<p className={`${orbitron} text-[11px] leading-[1.4] text-[var(--wv-text-dim)]`}>{product.brand}</p>
				)}
				<p className={`${bungee} mt-auto flex items-baseline gap-2 text-sm text-[var(--wv-cyan-soft)]`}>
					<span>
						{money(product.price)}
						{product.priceStop !== null && ` - ${money(product.priceStop)}`}
					</span>
					{product.undiscountedPrice !== null && (
						<span className="text-[10px] text-[var(--wv-muted)] line-through">
							{money(product.undiscountedPrice)}
						</span>
					)}
				</p>
			</div>
			<div className="flex items-center justify-between">
				<WishlistHeart slug={product.slug} className="size-7 text-sm" />
				<Link
					href={href}
					aria-label={`View ${product.name}`}
					className="flex size-7 items-center justify-center rounded-full border border-[var(--wv-purple)] bg-[var(--wv-control)]"
				>
					<Image src="/home/imgShoppingCart.svg" alt="" width={16} height={16} />
				</Link>
			</div>
		</article>
	);
}

function PageButton({
	children,
	active,
	disabled,
	onClick,
}: {
	children: React.ReactNode;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			aria-current={active ? "page" : undefined}
			onClick={onClick}
			className={`${heyComic} rounded-lg px-[14px] py-2 text-xs disabled:opacity-40 ${
				active
					? "bg-[var(--wv-cyan-soft)] text-[var(--wv-bg)]"
					: "border border-[var(--wv-purple)] bg-[var(--wv-surface)] text-[var(--wv-text-dim)]"
			}`}
		>
			{children}
		</button>
	);
}

export function ShopCatalog({
	products,
	ctx,
	categoryTiles,
}: {
	products: HomeProduct[];
	ctx: Ctx;
	/** Rich "Browse Collections" tiles (art/Saleor category image) — separate from the
	 *  product-count-derived `categories` below, which powers the filter sidebar checkboxes. */
	categoryTiles: WvCategoryTile[];
}) {
	// Read client-side rather than the page awaiting `searchParams` server-side: this is a pure
	// display concern (which category tab starts selected), not data-fetching — `products` already
	// has every category, filtered here. Awaiting `searchParams` in the page shell instead would
	// collapse the whole route into a PPR dynamic hole (see `data-caching.md`); `useSearchParams()`
	// in this already-client component avoids that entirely.
	const searchParams = useSearchParams();
	const initialCategorySlug = searchParams?.get("category") ?? undefined;

	// New Arrivals is virtual (see new-arrivals.ts): the newest products, wherever their real category is.
	const newest = useMemo(() => newArrivalSlugs(products), [products]);

	const categories = useMemo(() => {
		const map = new Map<string, { slug: string; name: string; count: number }>();
		for (const p of products) {
			if (!p.categorySlug || p.categorySlug === NEW_ARRIVALS_SLUG) continue;
			const entry = map.get(p.categorySlug) ?? { slug: p.categorySlug, name: p.brand, count: 0 };
			entry.count += 1;
			map.set(p.categorySlug, entry);
		}
		const list = [...map.values()].sort((a, b) => b.count - a.count);
		if (newest.size > 0) list.push({ slug: NEW_ARRIVALS_SLUG, name: NEW_ARRIVALS_NAME, count: newest.size });
		return list;
	}, [products, newest]);

	// Draft state (sidebar controls) vs applied state (what the grid shows).
	// `initialCategorySlug` pre-applies a category filter from the URL, e.g. /shop?category=bundles.
	const initialCats = useMemo(
		() => (initialCategorySlug ? [initialCategorySlug] : []),
		[initialCategorySlug],
	);
	const [draftCats, setDraftCats] = useState<string[]>(initialCats);
	const [draftPriceBuckets, setDraftPriceBuckets] = useState<string[]>([]);
	const [applied, setApplied] = useState<{ cats: string[]; priceBucketIds: string[] }>({
		cats: initialCats,
		priceBucketIds: [],
	});
	const [sort, setSort] = useState<Sort>(initialCategorySlug === NEW_ARRIVALS_SLUG ? "newest" : "featured");
	const [page, setPage] = useState(1);

	// Top "Browse Collections" tiles are a one-click jump, unlike the sidebar's draft-then-apply
	// multi-select — set both draft *and* applied together so there's no separate "Apply" step,
	// and the sidebar reflects the same selection if the shopper opens it afterward.
	const selectCategory = (slug: string | null) => {
		const cats = slug ? [slug] : [];
		setDraftCats(cats);
		setApplied((cur) => ({ ...cur, cats }));
		if (slug === NEW_ARRIVALS_SLUG) setSort("newest");
		setPage(1);
	};

	const visible = useMemo(() => {
		const filtered = products.filter(
			(p) =>
				(applied.cats.length === 0 ||
					applied.cats.some(
						(slug) => p.categorySlug === slug || (slug === NEW_ARRIVALS_SLUG && newest.has(p.slug)),
					)) &&
				(applied.priceBucketIds.length === 0 ||
					applied.priceBucketIds.some((id) => priceInBucket(p.price, id))),
		);
		const sorted = [...filtered];
		if (sort === "best-selling") sorted.sort((a, b) => Number(b.isBestseller) - Number(a.isBestseller));
		else if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
		else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
		else if (sort === "newest") sorted.sort((a, b) => b.created.localeCompare(a.created));
		else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
		return sorted;
	}, [products, applied, sort, newest]);

	const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
	const current = Math.min(page, pageCount);
	const pageItems = visible.slice((current - 1) * PER_PAGE, current * PER_PAGE);

	return (
		<>
			{/* Categories — one-click filter via `selectCategory`, not a navigation (see that
			    function's comment). Moved here from the page shell so clicking a tile doesn't need a
			    page transition to reach this component's filter state. */}
			{categoryTiles.length > 0 && (
				<section className="flex flex-col items-center gap-5 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-4 py-6 md:px-8 xl:px-20 xl:py-8">
					<div className="flex flex-col items-center gap-[6px]">
						<p className={`${marker} text-xl uppercase tracking-[2px] text-[var(--wv-pink)]`}>
							Browse Collections
						</p>
						<h2 className={`${bungee} text-2xl tracking-[1px] text-white`}>CATEGORIES</h2>
						<div className="h-[3px] w-[60px] rounded-full bg-[var(--wv-cyan-soft)]" />
					</div>
					<div className="flex w-full justify-end">
						<button
							type="button"
							onClick={() => selectCategory(null)}
							className="text-[13px] text-[var(--wv-cyan-soft)]"
						>
							VIEW ALL →
						</button>
					</div>
					<div className="grid w-full max-w-[420px] grid-cols-3 justify-items-center gap-3 md:max-w-[560px] xl:flex xl:max-w-none xl:justify-center xl:gap-[26px]">
						{categoryTiles.map((c) => {
							const art = CATEGORY_ART[c.slug];
							const on = applied.cats.includes(c.slug);
							return (
								<button
									key={c.slug}
									type="button"
									aria-pressed={on}
									onClick={() => selectCategory(on ? null : c.slug)}
									className={`relative block size-[100px] shrink-0 rounded-xl md:size-[90px] xl:size-[175px] ${
										on ? "ring-2 ring-[var(--wv-cyan-soft)]" : ""
									}`}
								>
									{art ? (
										<Image src={art} alt={c.name} fill sizes="175px" className="rounded-xl object-cover" />
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
								</button>
							);
						})}
					</div>
				</section>
			)}

			<div className="flex flex-col gap-6 px-4 pb-10 pt-6 md:flex-row md:items-start md:gap-6 md:px-8 xl:gap-10 xl:px-20 xl:pb-[72px] xl:pt-[22px]">
				{/* Filter sidebar */}
				<aside className="flex w-full shrink-0 flex-col gap-6 rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] p-5 md:w-[216px] xl:w-[280px]">
					<div className="flex flex-col gap-[6px]">
						<h2 className={`${bungee} text-base text-white`}>FILTERS</h2>
						<div className="h-px bg-[var(--wv-purple)]" />
					</div>

					<div className="flex flex-col gap-3">
						<h3 className={`${bungee} text-xs text-[var(--wv-cyan-soft)]`}>CATEGORIES</h3>
						<div className="flex flex-col gap-2">
							{categories.map((c) => {
								const on = draftCats.includes(c.slug);
								return (
									<button
										key={c.slug}
										type="button"
										aria-pressed={on}
										onClick={() =>
											setDraftCats((cur) => (on ? cur.filter((s) => s !== c.slug) : [...cur, c.slug]))
										}
										className={`${heyComic} flex items-center justify-between text-xs ${on ? "text-[var(--wv-cyan-soft)]" : "text-white"}`}
									>
										<span>
											{on ? "✓ " : ""}
											{c.name}
										</span>
										<span className={`${orbitron} text-[var(--wv-text-dim)]`}>({c.count})</span>
									</button>
								);
							})}
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<h3 className={`${bungee} text-xs text-[var(--wv-cyan-soft)]`}>PRICE</h3>
						<div className="flex flex-col gap-2">
							{PRICE_BUCKETS.map((b) => {
								const on = draftPriceBuckets.includes(b.id);
								return (
									<button
										key={b.id}
										type="button"
										aria-pressed={on}
										onClick={() =>
											setDraftPriceBuckets((cur) => (on ? cur.filter((id) => id !== b.id) : [...cur, b.id]))
										}
										className={`${heyComic} flex items-center gap-2 text-left text-xs ${on ? "text-[var(--wv-cyan-soft)]" : "text-white"}`}
									>
										{on ? "✓ " : ""}
										{b.label}
									</button>
								);
							})}
						</div>
					</div>

					<button
						type="button"
						onClick={() => {
							setApplied({ cats: draftCats, priceBucketIds: draftPriceBuckets });
							setPage(1);
						}}
						className={`${heyComic} h-[45px] w-full rounded-xl bg-[var(--wv-cyan-soft)] text-sm text-[var(--wv-bg)]`}
					>
						APPLY FILTERS
					</button>
				</aside>

				{/* Catalog */}
				<div className="flex min-w-0 flex-1 flex-col gap-8">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className={`${heyComic} text-sm text-[var(--wv-text-dim)]`} role="status">
							Showing {visible.length} {visible.length === 1 ? "product" : "products"} found
						</p>
						<label className={`${heyComic} flex items-center gap-2 text-xs text-[var(--wv-disabled)]`}>
							Sort by:
							<select
								value={sort}
								onChange={(e) => {
									setSort(e.target.value as Sort);
									setPage(1);
								}}
								className={`${heyComic} rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-surface)] px-2 py-1 text-xs text-white`}
							>
								{SORTS.map((s) => (
									<option key={s.value} value={s.value}>
										{s.label}
									</option>
								))}
							</select>
						</label>
					</div>

					{pageItems.length > 0 ? (
						<div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
							{pageItems.map((p) => (
								<ShopProductCard key={p.id} product={p} ctx={ctx} />
							))}
						</div>
					) : (
						<p className={`${heyComic} py-16 text-center text-[var(--wv-text-dim)]`}>
							No products match these filters.
						</p>
					)}

					{pageCount > 1 && (
						<nav aria-label="Pagination" className="flex flex-wrap justify-center gap-2 pt-5">
							<PageButton disabled={current === 1} onClick={() => setPage(current - 1)}>
								← Previous
							</PageButton>
							{Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
								<PageButton key={n} active={n === current} onClick={() => setPage(n)}>
									{n}
								</PageButton>
							))}
							<PageButton disabled={current === pageCount} onClick={() => setPage(current + 1)}>
								Next →
							</PageButton>
						</nav>
					)}
				</div>
			</div>
		</>
	);
}
