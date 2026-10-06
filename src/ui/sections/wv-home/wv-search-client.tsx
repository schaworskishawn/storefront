"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { HomeProduct } from "@/lib/catalog/get-home-products";
import { type SearchSort, sortSearchResults } from "@/lib/catalog/search-sort";
import { activeFilterChips, categoryNames } from "@/lib/catalog/shop-filter-options";
import { useShopFilters } from "@/lib/catalog/use-shop-filters";
import { useShuffleSeed } from "@/lib/catalog/use-shuffle-seed";
import { ShopFilterSidebar } from "./wv-shop-filter-sidebar";
import { WishlistHeart } from "./wv-wishlist-client";
import { formatPrice } from "@/ui/components/plp/utils";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const PER_PAGE = 9;

const SORTS: { value: SearchSort; label: string }[] = [
	{ value: "relevance", label: "Relevance" },
	{ value: "newest", label: "Newest" },
	{ value: "price-asc", label: "Price: Low to High" },
	{ value: "price-desc", label: "Price: High to Low" },
	{ value: "name", label: "Name A–Z" },
];

/** Higher = better match. 0 = no match. Every whitespace-separated term must match the name or category. */
function score(p: HomeProduct, terms: string[]): number {
	if (!terms.length) return 1;
	const name = p.name.toLowerCase();
	const cat = p.brand.toLowerCase();
	let total = 0;
	for (const t of terms) {
		if (name.startsWith(t)) total += 4;
		else if (name.includes(` ${t}`)) total += 3;
		else if (name.includes(t)) total += 2;
		else if (cat.includes(t)) total += 1;
		else return 0;
	}
	return total;
}

function ResultCard({ p, money }: { p: HomeProduct; money: (n: number) => string }) {
	const href = `/product/${p.slug}`;
	return (
		<article className="flex flex-col overflow-hidden rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-surface)]">
			<Link href={href} className="relative block h-[200px] bg-[var(--wv-deep)] md:h-[220px]">
				{p.image && (
					<Image
						src={p.image.url}
						alt={p.image.alt}
						fill
						sizes="(min-width: 1280px) 315px, (min-width: 768px) 352px, 328px"
						className="object-contain p-4"
					/>
				)}
				{p.isOnSale && p.discountPercent ? (
					<span
						className={`${heyComic} absolute left-3 top-3 rounded bg-[var(--wv-pink)] px-2 py-1 text-[10px] text-[var(--wv-ink)]`}
					>
						-{p.discountPercent}%
					</span>
				) : null}
			</Link>
			<div className="flex flex-1 flex-col gap-2 p-4">
				{p.brand && <p className={`${orbitron} text-[11px] text-[var(--wv-text-dim)]`}>{p.brand}</p>}
				<h3 className={`${heyComic} text-[15px] uppercase`}>
					<Link href={href}>{p.name}</Link>
				</h3>
				<div className="mt-auto flex items-center justify-between gap-3 pt-2">
					<p className={`${bungee} flex items-baseline gap-2 text-base text-[var(--wv-cyan-soft)]`}>
						{money(p.price)}
						{p.undiscountedPrice !== null && (
							<span className="text-[10px] text-[var(--wv-muted)] line-through">
								{money(p.undiscountedPrice)}
							</span>
						)}
					</p>
					<WishlistHeart slug={p.slug} className="size-8" />
				</div>
			</div>
		</article>
	);
}

export function SearchExperience({
	products,
	localeBcp47,
}: {
	products: HomeProduct[];
	localeBcp47: string;
}) {
	const params = useSearchParams();
	const [query, setQuery] = useState(params?.get("q") ?? "");
	const [sort, setSort] = useState<SearchSort>("relevance");
	const pageSeed = useShuffleSeed();
	// Picking a sort in the dropdown deals a fresh shuffle, as in the shop.
	const [reshuffles, setReshuffles] = useState(0);
	const shuffleSeed = (pageSeed + reshuffles * 7919) | 0;
	const [page, setPage] = useState(1);
	const [filtersOpen, setFiltersOpen] = useState(false);

	const currency = products[0]?.currency ?? "USD";
	const money = (n: number) => formatPrice(n, currency, localeBcp47);

	const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);

	// The products matching the search words, with how well. The filters work on these only, so the sidebar's
	// counts, sub-filters and price extremes follow what is being searched for.
	const matches = useMemo(
		() =>
			products.flatMap((p) => {
				const s = score(p, terms);
				return s > 0 ? [{ p, s }] : [];
			}),
		[products, terms],
	);
	const matching = useMemo(() => matches.map((m) => m.p), [matches]);
	const relevance = useMemo(() => new Map(matches.map((m) => [m.p.id, m.s])), [matches]);

	// Draft-then-apply filter state, shared with the shop (see use-shop-filters.ts).
	const filters = useShopFilters(matching, { onApplied: () => setPage(1) });

	const popular = useMemo(() => {
		const map = new Map<string, number>();
		for (const p of products) if (p.brand) map.set(p.brand, (map.get(p.brand) ?? 0) + 1);
		return [...map.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([n]) => n);
	}, [products]);

	// Best matches first; products that match equally well are shuffled, so with no search words the page is random like
	// the shop's Featured sort (see search-sort.ts).
	const results = useMemo(
		() => sortSearchResults(filters.filtered, sort, (p) => relevance.get(p.id) ?? 0, shuffleSeed),
		[filters.filtered, relevance, sort, shuffleSeed],
	);

	const pageCount = Math.max(1, Math.ceil(results.length / PER_PAGE));
	const current = Math.min(page, pageCount);
	const pageItems = results.slice((current - 1) * PER_PAGE, current * PER_PAGE);

	// Named from the whole catalog, so a ticked category stays named when the search words stop matching it.
	const names = useMemo(() => categoryNames(products), [products]);
	const chips = activeFilterChips(filters.applied, {
		categoryName: (slug) => names.get(slug) ?? slug,
		money,
	});

	const updateQuery = (v: string) => {
		setQuery(v);
		setPage(1);
		const url = new URL(window.location.href);
		if (v.trim()) url.searchParams.set("q", v.trim());
		else url.searchParams.delete("q");
		window.history.replaceState(null, "", url);
	};

	const pill = `${heyComic} flex items-center gap-[6px] rounded-lg border border-[var(--wv-cyan)] bg-[var(--wv-cyan)]/10 px-[14px] py-2 text-xs text-[var(--wv-cyan)]`;

	return (
		<>
			{/* Hero */}
			<section className="flex flex-col items-center gap-6 bg-[var(--wv-surface)] px-4 pb-8 pt-8 md:px-6 md:pt-12 xl:px-16 xl:pb-12 xl:pt-16">
				<div className="flex flex-col items-center gap-3 text-center">
					<p className={`${bungee} flex items-center gap-2 text-xs uppercase text-[var(--wv-cyan)]`}>
						<span className="size-[6px] rounded-[3px] bg-[var(--wv-cyan)] shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
						SEARCH WORLDWIDE VAPOR
					</p>
					<h1 className={`${heyComic} text-[24px] uppercase md:text-[30px] xl:text-[36px]`}>
						FIND YOUR PERFECT PRODUCT
					</h1>
					<p className={`${orbitron} hidden max-w-[600px] text-base text-[var(--wv-text-dim)] md:block`}>
						Access high-performance mods, premium pods, and intense disposable vapes with secure
						military-grade shipping.
					</p>
				</div>
				<div className="flex w-full max-w-[800px] flex-col gap-4">
					<form
						role="search"
						onSubmit={(e) => e.preventDefault()}
						className="flex h-12 items-center gap-3 rounded-xl bg-[var(--wv-section)] px-4 md:h-14 md:px-5"
					>
						<span aria-hidden className="text-lg text-[var(--wv-cyan)]">
							⌕
						</span>
						<label htmlFor="site-search" className="sr-only">
							Search products
						</label>
						<input
							id="site-search"
							type="search"
							autoFocus
							value={query}
							onChange={(e) => updateQuery(e.target.value)}
							placeholder="Search products, flavours, categories…"
							className={`${heyComic} min-w-0 flex-1 appearance-none border-0 bg-transparent text-base text-white shadow-none ring-0 placeholder:text-[var(--wv-muted)] focus:outline-none focus:ring-0`}
						/>
						{query && (
							<button
								type="button"
								aria-label="Clear search"
								onClick={() => updateQuery("")}
								className="flex size-[26px] items-center justify-center rounded-full text-[var(--wv-text-dim)]"
							>
								✕
							</button>
						)}
					</form>
					<div className="flex flex-wrap items-center gap-2">
						<span className={`${heyComic} text-xs text-[var(--wv-muted)]`}>POPULAR:</span>
						{popular.map((t) => {
							const on = query.toLowerCase() === t.toLowerCase();
							return (
								<button
									key={t}
									type="button"
									onClick={() => updateQuery(on ? "" : t)}
									className={`${heyComic} rounded-md border px-3 py-[6px] text-xs ${on ? "bg-[var(--wv-pink)]/10 border-[var(--wv-pink)] text-[var(--wv-pink)]" : "border-[var(--wv-section)] bg-[var(--wv-section)] text-[var(--wv-text-dim)]"}`}
								>
									{t}
								</button>
							);
						})}
					</div>
				</div>
			</section>

			{/* Status bar */}
			<section className="flex flex-col gap-4 px-4 py-6 md:px-6 xl:px-16">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p
						role="status"
						aria-live="polite"
						className={`${heyComic} flex flex-wrap items-center gap-2 text-base xl:text-lg`}
					>
						<span>
							{results.length === 0
								? "No results"
								: `Showing ${results.length} result${results.length === 1 ? "" : "s"}`}
							{terms.length ? " for" : ""}
						</span>
						{terms.length > 0 && (
							<span className={`${bungee} text-[var(--wv-cyan)]`}>&ldquo;{query.trim()}&rdquo;</span>
						)}
					</p>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => setFiltersOpen((v) => !v)}
							aria-expanded={filtersOpen}
							className={`${heyComic} rounded-lg border border-[var(--wv-section)] bg-[var(--wv-surface)] px-4 py-[10px] text-xs xl:hidden`}
						>
							FILTERS{chips.length > 0 ? ` (${chips.length})` : ""}
						</button>
						<label className="flex items-center gap-2 rounded-lg border border-[var(--wv-section)] bg-[var(--wv-surface)] px-4 py-[10px] font-mono text-[13px] text-[var(--wv-text-dim)]">
							Sort by:
							<select
								value={sort}
								onChange={(e) => {
									setSort(e.target.value as SearchSort);
									setReshuffles((n) => n + 1);
									setPage(1);
								}}
								className="bg-transparent font-bold text-[var(--wv-cyan)] focus:outline-none"
							>
								{SORTS.map((s) => (
									<option key={s.value} value={s.value} className="bg-[var(--wv-surface)]">
										{s.label}
									</option>
								))}
							</select>
						</label>
					</div>
				</div>
				{chips.length > 0 && (
					<div className="flex flex-wrap items-center gap-3">
						<span className={`${orbitron} text-[11px] font-bold text-[var(--wv-muted)]`}>
							ACTIVE FILTERS:
						</span>
						{chips.map((chip) => (
							<button
								key={chip.id}
								type="button"
								onClick={() => filters.remove(chip.filter)}
								className={pill}
								aria-label={`Remove filter ${chip.label}`}
							>
								{chip.label} <span aria-hidden>⊗</span>
							</button>
						))}
						<button
							type="button"
							onClick={filters.clearAll}
							className={`${heyComic} text-xs text-[var(--wv-pink)]`}
						>
							Clear All
						</button>
					</div>
				)}
			</section>

			{/* Grid */}
			<section className="flex flex-col gap-6 px-4 pb-8 md:px-6 xl:flex-row xl:gap-10 xl:px-16">
				{/* Under xl the panel opens and closes with the FILTERS button; from xl it sits beside the results. */}
				<ShopFilterSidebar
					filters={filters}
					money={money}
					className={`${filtersOpen ? "flex" : "hidden"} w-full xl:flex xl:w-[280px] xl:shrink-0 xl:self-start`}
				/>
				<div className="min-w-0 flex-1">
					{pageItems.length === 0 ? (
						<div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] px-6 py-16 text-center">
							<p className={`${heyComic} text-xl`}>NOTHING FOUND</p>
							<p className={`${orbitron} text-sm text-[var(--wv-text-dim)]`}>
								Try a different word, or clear your filters.
							</p>
							<button
								type="button"
								onClick={() => {
									updateQuery("");
									filters.clearAll();
								}}
								className={`${heyComic} rounded-lg bg-[var(--wv-cyan-soft)] px-6 py-3 text-sm text-[var(--wv-ink)]`}
							>
								RESET SEARCH
							</button>
						</div>
					) : (
						<ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
							{pageItems.map((p) => (
								<li key={p.id}>
									<ResultCard p={p} money={money} />
								</li>
							))}
						</ul>
					)}
				</div>
			</section>

			{/* Pagination */}
			{pageCount > 1 && (
				<nav aria-label="Pagination" className="flex items-center justify-center gap-2 px-4 py-10 xl:py-12">
					<button
						type="button"
						aria-label="Previous page"
						disabled={current === 1}
						onClick={() => setPage(current - 1)}
						className="flex size-9 items-center justify-center rounded-lg border border-[var(--wv-section)] disabled:opacity-40 xl:size-10"
					>
						‹
					</button>
					{Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
						<button
							key={n}
							type="button"
							aria-current={n === current ? "page" : undefined}
							onClick={() => setPage(n)}
							className={`${heyComic} flex size-9 items-center justify-center rounded-lg text-sm xl:size-10 ${n === current ? "bg-[var(--wv-cyan)] text-[var(--wv-ink)]" : "border border-[var(--wv-section)] text-[var(--wv-text-dim)]"}`}
						>
							{n}
						</button>
					))}
					<button
						type="button"
						aria-label="Next page"
						disabled={current === pageCount}
						onClick={() => setPage(current + 1)}
						className="flex size-9 items-center justify-center rounded-lg border border-[var(--wv-section)] disabled:opacity-40 xl:size-10"
					>
						›
					</button>
				</nav>
			)}
		</>
	);
}
