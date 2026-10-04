"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { HomeProduct, WvCategoryTile } from "@/lib/catalog/get-home-products";
import { NEW_ARRIVALS_NAME, NEW_ARRIVALS_SLUG, newArrivalSlugs } from "@/lib/catalog/new-arrivals";
import { categoryRank } from "@/lib/catalog/category-order";
import { byShuffle } from "@/lib/catalog/shuffle";
import type { FacetKey } from "@/lib/catalog/product-facets";
import {
	CATEGORY_FILTER_GROUPS,
	CATEGORY_SUBCATEGORIES,
	type CategoryFacetSelection,
	type FilterOptionCount,
	categoryOfType,
	filterGroupsFor,
	groupOptions,
	matchesCategoryFacets,
	matchesSubcategories,
	subcategoryOptions,
} from "@/lib/catalog/shop-filters";
import { FilterSection } from "./wv-filter-section";
import { WishlistHeart } from "./wv-wishlist-client";
import { CATEGORY_ART } from "./wv-category-art";
import { formatPrice } from "@/ui/components/plp/utils";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

const PER_PAGE = 8;

type Sort = "featured" | "best-selling" | "newest" | "name" | "price-asc" | "price-desc";

const SORTS: { value: Sort; label: string }[] = [
	{ value: "featured", label: "Featured" },
	{ value: "best-selling", label: "Best Sellers" },
	{ value: "newest", label: "New Arrivals" },
	{ value: "name", label: "Name A–Z" },
	{ value: "price-asc", label: "Price: Low to High" },
	{ value: "price-desc", label: "Price: High to Low" },
];

/** Alphabetical, ignoring case, with numbers in natural order ("2 mg" before "10 mg"). Only Name A–Z uses it. */
const byName = (a: HomeProduct, b: HomeProduct) =>
	a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

// Featured, Best Sellers, New Arrivals (and equal prices) show a random order. The server render uses a fixed seed so
// hydration matches; in the browser each page load picks its own seed, so every visit gets a fresh order, while
// filtering and paging keep the order steady (see src/lib/catalog/shuffle.ts).
let pageSeed: number | undefined;
const subscribeNever = () => () => {};
const getPageSeed = () => {
	if (pageSeed === undefined) pageSeed = 1 + Math.floor(Math.random() * 0x7fffffff);
	return pageSeed;
};
const getServerSeed = () => 0;

type Ctx = { locale: string; channel: string; localeBcp47: string };

/** One collapsible group under a category heading: attribute values ("facet") or sub-categories ("type"). */
type SidebarGroup = {
	id: string;
	/** Heading of the collapsible group; without one the options are listed directly under the category. */
	label?: string;
	kind: "facet" | "type" | "category";
	key?: FacetKey;
	options: FilterOptionCount[];
};

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

/** One ticked-or-not option row in the filter sidebar: "✓ Label (count)". */
function OptionButton({
	label,
	count,
	ticked,
	onClick,
}: {
	label: string;
	count: number;
	ticked: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={ticked}
			onClick={onClick}
			className={`${heyComic} flex items-center justify-between gap-2 text-left text-xs ${ticked ? "text-[var(--wv-cyan-soft)]" : "text-white"}`}
		>
			<span>
				{ticked ? "✓ " : ""}
				{label}
			</span>
			<span className={`${orbitron} text-[var(--wv-text-dim)]`}>({count})</span>
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

	// Whole-dollar bounds of the catalog's prices: the extremes of the price slider.
	const bounds = useMemo(() => {
		const prices = products.map((p) => p.price);
		return prices.length
			? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
			: { min: 0, max: 0 };
	}, [products]);

	const categories = useMemo(() => {
		const map = new Map<string, { slug: string; name: string; count: number }>();
		for (const p of products) {
			if (!p.categorySlug || p.categorySlug === NEW_ARRIVALS_SLUG) continue;
			const entry = map.get(p.categorySlug) ?? { slug: p.categorySlug, name: p.brand, count: 0 };
			entry.count += 1;
			map.set(p.categorySlug, entry);
		}
		const list = [...map.values()];
		if (newest.size > 0) list.push({ slug: NEW_ARRIVALS_SLUG, name: NEW_ARRIVALS_NAME, count: newest.size });
		// Same order as the tiles above (Disposables, E-Liquid, Hardware, Coils, Accessories, New Arrivals).
		return list.sort((a, b) => categoryRank(a.slug) - categoryRank(b.slug));
	}, [products, newest]);

	// Draft state (sidebar controls) vs applied state (what the grid shows).
	// `initialCategorySlug` pre-applies a category filter from the URL, e.g. /shop?category=bundles.
	const initialCats = useMemo(
		() => (initialCategorySlug ? [initialCategorySlug] : []),
		[initialCategorySlug],
	);
	const [draftCats, setDraftCats] = useState<string[]>(initialCats);
	const [draftRange, setDraftRange] = useState<[number, number]>([bounds.min, bounds.max]);
	// `range` is null while the slider spans the whole catalog, so a catalog that grows or shrinks never
	// leaves a stale price filter behind.
	// Ticked attribute values per category (Disposables > Puff Count > 20K, …).
	const [draftFacets, setDraftFacets] = useState<CategoryFacetSelection>({});
	// Category headings the shopper has opened or closed by hand (otherwise a heading is open while its category is ticked).
	const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
	// Ticked sub-categories (product types) from the categories tree, e.g. "Pod Mod", "Charger".
	const [draftTypes, setDraftTypes] = useState<string[]>([]);
	const [applied, setApplied] = useState<{
		cats: string[];
		range: [number, number] | null;
		facets: CategoryFacetSelection;
		types: string[];
	}>({
		cats: initialCats,
		range: null,
		facets: {},
		types: [],
	});
	const [sort, setSort] = useState<Sort>(initialCategorySlug === NEW_ARRIVALS_SLUG ? "newest" : "featured");
	const pageSeedNow = useSyncExternalStore(subscribeNever, getPageSeed, getServerSeed);
	// Picking a sort in the dropdown deals a fresh shuffle.
	const [reshuffles, setReshuffles] = useState(0);
	const shuffleSeed = (pageSeedNow + reshuffles * 7919) | 0;
	const [page, setPage] = useState(1);

	// Top "Browse Collections" tiles are a one-click jump, unlike the sidebar's draft-then-apply
	// multi-select — set both draft *and* applied together so there's no separate "Apply" step,
	// and the sidebar reflects the same selection if the shopper opens it afterward.
	const selectCategory = (slug: string | null) => {
		const cats = slug ? [slug] : [];
		setDraftCats(cats);
		// Other categories offer other filters, so a jump to a new category starts from a clean slate.
		setDraftFacets({});
		setDraftTypes([]);
		setApplied((cur) => ({ ...cur, cats, facets: {}, types: [] }));
		if (slug === NEW_ARRIVALS_SLUG) setSort("newest");
		setPage(1);
	};

	const toggleDraftCategory = (slug: string) => {
		// Unticking a category also unticks what was ticked under it.
		if (draftCats.includes(slug)) {
			setDraftTypes((cur) => cur.filter((value) => categoryOfType(value) !== slug));
			setDraftFacets((cur) =>
				Object.fromEntries(Object.entries(cur).filter(([category]) => category !== slug)),
			);
		}
		setDraftCats((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
	};

	// Under New Arrivals the items are categories: ticking one narrows New Arrivals to it (and ticks New Arrivals).
	const toggleUnderNewArrivals = (slug: string) => {
		toggleDraftCategory(slug);
		setDraftCats((cur) => (cur.includes(NEW_ARRIVALS_SLUG) ? cur : [...cur, NEW_ARRIVALS_SLUG]));
	};

	// Ticking a sub-category ticks the category it sits under.
	const toggleType = (value: string) => {
		const owner = categoryOfType(value);
		if (owner) setDraftCats((cur) => (cur.includes(owner) ? cur : [...cur, owner]));
		setDraftTypes((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));
	};

	// Ticking a value under a category ticks that category too.
	const toggleFacet = (category: string, key: FacetKey, value: string) => {
		setDraftCats((cur) => (cur.includes(category) ? cur : [...cur, category]));
		setDraftFacets((cur) => {
			const mine = cur[category] ?? {};
			const have = mine[key] ?? [];
			const next = have.includes(value) ? have.filter((v) => v !== value) : [...have, value];
			return { ...cur, [category]: { ...mine, [key]: next } };
		});
	};

	const clearAll = () => {
		setDraftCats([]);
		setDraftFacets({});
		setDraftTypes([]);
		setDraftRange([bounds.min, bounds.max]);
		setApplied({ cats: [], range: null, facets: {}, types: [] });
		setPage(1);
	};

	const visible = useMemo(() => {
		// Real categories combine with "or"; New Arrivals then narrows whatever they select to its newest products
		// (so "Hardware + New Arrivals" is the newest hardware, and New Arrivals alone spans every category).
		const realCats = applied.cats.filter((slug) => slug !== NEW_ARRIVALS_SLUG);
		const inCategories =
			realCats.length === 0
				? products
				: products.filter((p) => p.categorySlug !== null && realCats.includes(p.categorySlug));
		const newestHere = applied.cats.includes(NEW_ARRIVALS_SLUG) ? newArrivalSlugs(inCategories) : null;
		const filtered = inCategories.filter(
			(p) =>
				(newestHere === null || newestHere.has(p.slug)) &&
				matchesCategoryFacets(p, applied.facets) &&
				matchesSubcategories(p, applied.types) &&
				(applied.range === null || (p.price >= applied.range[0] && p.price <= applied.range[1])),
		);
		// Only Name A–Z is alphabetical. Featured is fully shuffled; Best Sellers puts flagged bestsellers first and
		// New Arrivals the newest day first (products are added in batches, so exact timestamps would be arbitrary);
		// inside those groups, and among equal prices, the order is the seeded shuffle.
		const shuffled = byShuffle<HomeProduct>(shuffleSeed, (p) => p.slug);
		const sorted = [...filtered];
		if (sort === "best-selling")
			sorted.sort((x, y) => Number(y.isBestseller) - Number(x.isBestseller) || shuffled(x, y));
		else if (sort === "newest")
			sorted.sort((x, y) => y.created.slice(0, 10).localeCompare(x.created.slice(0, 10)) || shuffled(x, y));
		else if (sort === "price-asc") sorted.sort((x, y) => x.price - y.price || shuffled(x, y));
		else if (sort === "price-desc") sorted.sort((x, y) => y.price - x.price || shuffled(x, y));
		else if (sort === "name") sorted.sort(byName);
		else sorted.sort(shuffled);
		return sorted;
	}, [products, applied, sort, shuffleSeed]);

	const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
	const current = Math.min(page, pageCount);
	const pageItems = visible.slice((current - 1) * PER_PAGE, current * PER_PAGE);

	const currency = products[0]?.currency ?? "USD";
	const money = (n: number) => formatPrice(n, currency, ctx.localeBcp47);
	// Thumbs are clamped to the current bounds in case the catalog changed since they were dragged.
	const lo = Math.min(Math.max(draftRange[0], bounds.min), bounds.max);
	const hi = Math.min(Math.max(draftRange[1], lo), bounds.max);
	const span = Math.max(1, bounds.max - bounds.min);
	const left = ((lo - bounds.min) / span) * 100;
	const right = ((hi - bounds.min) / span) * 100;

	// Attribute values only count while their category is still ticked.
	const facetsNow = useMemo(
		() =>
			Object.fromEntries(Object.entries(draftFacets).filter(([category]) => draftCats.includes(category))),
		[draftFacets, draftCats],
	);

	// A sub-category only counts while its category is still ticked.
	const typesNow = useMemo(
		() => draftTypes.filter((value) => draftCats.includes(categoryOfType(value) ?? "")),
		[draftTypes, draftCats],
	);

	// Everything listed under each category heading as collapsible groups: its attribute groups (Battery Capacity,
	// Brand, …) and its sub-categories (Mods, Atomizers, Type), each with how many products have each value.
	const categoryGroups = useMemo(() => {
		const result: Record<string, SidebarGroup[]> = {};
		for (const slug of new Set([
			...Object.keys(CATEGORY_FILTER_GROUPS),
			...Object.keys(CATEGORY_SUBCATEGORIES),
		])) {
			if (slug === NEW_ARRIVALS_SLUG) continue;
			const here = products.filter((p) => p.categorySlug === slug);
			const attributeGroups: SidebarGroup[] = filterGroupsFor(slug).map((group) => ({
				id: `${slug}-${group.id}`,
				label: group.label,
				kind: "facet",
				key: group.key,
				options: groupOptions(group, here),
			}));
			const typeGroups: SidebarGroup[] = subcategoryOptions(CATEGORY_SUBCATEGORIES[slug] ?? [], here).map(
				(group, i) => ({
					id: `${slug}-types-${i}`,
					label: group.label,
					kind: "type",
					options: group.options,
				}),
			);
			result[slug] = [...attributeGroups, ...typeGroups].filter((g) => g.options.length > 0);
		}
		const fresh = newArrivalSlugs(products);
		const byCategory = new Map<string, { label: string; count: number }>();
		for (const p of products) {
			if (!fresh.has(p.slug) || !p.categorySlug) continue;
			const entry = byCategory.get(p.categorySlug) ?? { label: p.brand, count: 0 };
			entry.count += 1;
			byCategory.set(p.categorySlug, entry);
		}
		result[NEW_ARRIVALS_SLUG] =
			byCategory.size > 0
				? [
						{
							id: "new-arrivals-categories",
							kind: "category",
							options: [...byCategory]
								.sort(([a], [b]) => categoryRank(a) - categoryRank(b))
								.map(([value, { label, count }]) => ({ label, value, count })),
						},
					]
				: [];
		return result;
	}, [products]);

	const hasAnyFilter =
		applied.cats.length > 0 ||
		applied.range !== null ||
		Object.values(applied.facets).some((groups) =>
			Object.values(groups).some((values) => values.length > 0),
		) ||
		draftCats.length > 0 ||
		Object.values(facetsNow).some((groups) => Object.values(groups).some((values) => values.length > 0)) ||
		applied.types.length > 0 ||
		typesNow.length > 0 ||
		lo !== bounds.min ||
		hi !== bounds.max;

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
				<aside className="flex w-full shrink-0 flex-col gap-4 rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] p-5 md:w-[216px] xl:w-[280px]">
					<div className="flex flex-col gap-[6px]">
						<div className="flex items-center justify-between gap-2">
							<h2 className={`${bungee} text-base text-white`}>FILTERS</h2>
							{hasAnyFilter && (
								<button
									type="button"
									onClick={clearAll}
									className={`${heyComic} text-[11px] text-[var(--wv-cyan-soft)] underline`}
								>
									Clear all
								</button>
							)}
						</div>
						<div className="h-px bg-[var(--wv-purple)]" />
					</div>

					<FilterSection title="CATEGORIES" defaultOpen>
						<div className="flex flex-col gap-2">
							{categories.map((c) => {
								const on = draftCats.includes(c.slug);
								const groupsHere = categoryGroups[c.slug] ?? [];
								const expandable = groupsHere.length > 0;
								// Open while ticked (e.g. after picking its tile) unless the shopper has opened or closed it themselves.
								const open = openOverride[c.slug] ?? on;
								return (
									<div key={c.slug} className="flex flex-col gap-2">
										<div className="flex items-center gap-2">
											<button
												type="button"
												aria-pressed={on}
												aria-label={`Select ${c.name}`}
												onClick={() => toggleDraftCategory(c.slug)}
												className={`flex size-4 shrink-0 items-center justify-center text-base leading-none ${
													on ? "text-[var(--wv-cyan-soft)]" : "text-[var(--wv-purple)]"
												}`}
											>
												•
											</button>
											{/* The heading opens and closes what is under it (or ticks the category when nothing is). */}
											<button
												type="button"
												aria-expanded={expandable ? open : undefined}
												onClick={() =>
													expandable
														? setOpenOverride((cur) => ({ ...cur, [c.slug]: !open }))
														: toggleDraftCategory(c.slug)
												}
												className={`${heyComic} flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs ${on ? "text-[var(--wv-cyan-soft)]" : "text-white"}`}
											>
												<span>{c.name}</span>
												<span className="flex items-center gap-2">
													<span className={`${orbitron} text-[var(--wv-text-dim)]`}>({c.count})</span>
													{expandable && (
														<span
															aria-hidden
															className={`text-[var(--wv-cyan-soft)] transition-transform ${open ? "rotate-180" : ""}`}
														>
															▾
														</span>
													)}
												</span>
											</button>
										</div>
										{/* Under the heading: collapsible groups (Battery Capacity, Mods, …), or the items directly. */}
										{expandable && (
											<div
												className={
													open ? "ml-1 flex flex-col gap-3 border-l border-[var(--wv-purple)] pl-3" : "hidden"
												}
											>
												{groupsHere.map((group) => {
													const tickedValues =
														group.kind === "type"
															? typesNow
															: group.kind === "category"
																? draftCats
																: ((group.key && facetsNow[c.slug]?.[group.key]) ?? []);
													const options = group.options.map((o) => (
														<OptionButton
															key={o.value}
															label={o.label}
															count={o.count}
															ticked={tickedValues.includes(o.value)}
															onClick={() =>
																group.kind === "category"
																	? toggleUnderNewArrivals(o.value)
																	: group.kind === "type" || !group.key
																		? toggleType(o.value)
																		: toggleFacet(c.slug, group.key, o.value)
															}
														/>
													));
													if (!group.label) {
														return (
															<div key={group.id} className="flex flex-col gap-2">
																{options}
															</div>
														);
													}
													const tickedHere = group.options.filter((o) =>
														tickedValues.includes(o.value),
													).length;
													return (
														<FilterSection
															key={group.id}
															nested
															title={group.label}
															defaultOpen={tickedHere > 0}
															badge={tickedHere > 0 ? `(${tickedHere})` : undefined}
														>
															<div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
																{options}
															</div>
														</FilterSection>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</FilterSection>

					<FilterSection title="PRICE RANGE" defaultOpen>
						<div className="flex flex-col gap-3">
							<div className="relative h-1 rounded-sm bg-[var(--wv-purple)]">
								<div
									className="absolute inset-y-0 bg-[var(--wv-cyan-soft)]"
									style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
								/>
								<input
									type="range"
									aria-label="Minimum price"
									className="wv-range"
									min={bounds.min}
									max={bounds.max}
									value={lo}
									onChange={(e) => setDraftRange([Math.min(Number(e.target.value), hi), hi])}
								/>
								<input
									type="range"
									aria-label="Maximum price"
									className="wv-range"
									min={bounds.min}
									max={bounds.max}
									value={hi}
									onChange={(e) => setDraftRange([lo, Math.max(Number(e.target.value), lo)])}
								/>
							</div>
							<div className={`${orbitron} flex justify-between text-[11px]`}>
								<span className="text-[var(--wv-text-dim)]">{money(bounds.min)}</span>
								<span className="text-white">
									{money(lo)} - {money(hi)}
								</span>
								<span className="text-[var(--wv-text-dim)]">{money(bounds.max)}</span>
							</div>
						</div>
					</FilterSection>

					<button
						type="button"
						onClick={() => {
							setApplied({
								cats: draftCats,
								range: lo === bounds.min && hi === bounds.max ? null : [lo, hi],
								facets: facetsNow,
								types: typesNow,
							});
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
									setReshuffles((n) => n + 1);
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
