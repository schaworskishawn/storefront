"use client";

import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { HomeProduct } from "@/lib/catalog/get-home-products";
import { useWishlist } from "@/lib/wv-wishlist";
import { addProductToCartBySlug } from "@/lib/wv-cart-actions";
import { formatPrice } from "@/ui/components/plp/utils";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

type Sort = "added" | "price-asc" | "price-desc" | "name";
const SORTS: { value: Sort; label: string }[] = [
	{ value: "added", label: "Recently added" },
	{ value: "price-asc", label: "Price: Low to High" },
	{ value: "price-desc", label: "Price: High to Low" },
	{ value: "name", label: "Name A–Z" },
];

/** Header link: wishlist icon with a dot when something is saved. */
export function WishlistLink() {
	const { count } = useWishlist();
	return (
		<Link
			href="/wishlist"
			aria-label={count ? `Wishlist (${count} saved)` : "Wishlist"}
			className="relative flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan)] text-[var(--wv-cyan)]"
		>
			<Heart className="size-4" strokeWidth={2} />
			{count > 0 && (
				<span
					aria-hidden
					className="absolute right-[6px] top-[6px] size-2 rounded-full bg-[var(--wv-pink)]"
				/>
			)}
		</Link>
	);
}

/** Small heart toggle used on product cards elsewhere on the site. */
export function WishlistHeart({ slug, className = "" }: { slug: string; className?: string }) {
	const { has, toggle } = useWishlist();
	const on = has(slug);
	return (
		<button
			type="button"
			aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
			aria-pressed={on}
			onClick={() => toggle(slug)}
			className={`flex items-center justify-center rounded-full border border-[var(--wv-purple)] ${on ? "bg-[var(--wv-pink)] text-[var(--wv-ink)]" : "bg-[var(--wv-control)]"} ${className}`}
		>
			{on ? "♥" : "♡"}
		</button>
	);
}

function Card({
	p,
	money,
	list,
	channel,
	locale,
	shared,
	onRemove,
}: {
	p: HomeProduct;
	money: (n: number) => string;
	list: boolean;
	channel: string;
	locale: string;
	shared: boolean;
	onRemove: () => void;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const href = `/product/${p.slug}`;
	const badge = p.isBestseller
		? "BEST SELLER"
		: p.isOnSale && p.discountPercent
			? `-${p.discountPercent}%`
			: null;

	const addToCart = () => {
		setMsg(null);
		start(async () => {
			const r = await addProductToCartBySlug(channel, locale, p.slug);
			if (r.ok) setMsg({ ok: true, text: "Added to cart" });
			else if (r.needsOptions) router.push(href);
			else setMsg({ ok: false, text: r.error });
		});
	};

	return (
		<article
			className={`relative flex overflow-hidden rounded-[14px] border border-[var(--wv-purple)] bg-[var(--wv-control)] ${list ? "flex-row" : "h-full flex-col"}`}
		>
			<Link
				href={href}
				className={`from-[var(--wv-cyan-soft)]/10 via-[var(--wv-purple)]/20 to-[var(--wv-pink)]/10 relative block shrink-0 bg-gradient-to-br ${list ? "w-32 md:w-44" : "h-[170px] w-full md:h-[150px]"}`}
			>
				{p.image && (
					<Image
						src={p.image.url}
						alt={p.image.alt}
						fill
						sizes="(min-width: 1280px) 242px, (min-width: 768px) 344px, 328px"
						className="object-contain p-4"
					/>
				)}
			</Link>
			{badge && (
				<span className="absolute left-[11px] top-[11px] rounded-full bg-[var(--wv-pink)] px-[9px] py-[6px] text-[9px] font-bold text-[var(--wv-bg)]">
					{badge}
				</span>
			)}
			{!shared && (
				<button
					type="button"
					aria-label={`Remove ${p.name} from wishlist`}
					onClick={onRemove}
					className={`bg-[var(--wv-bg)]/60 absolute flex size-8 items-center justify-center rounded-lg border border-[var(--wv-pink)] text-sm text-[var(--wv-pink)] ${list ? "left-2 top-2 md:hidden" : "right-3 top-3"}`}
				>
					♥
				</button>
			)}
			<div className="flex flex-1 flex-col gap-2 p-3">
				{p.brand && (
					<p className={`${heyComic} text-[10px] tracking-[1px] text-[var(--wv-cyan-soft)]`}>
						{p.brand.toUpperCase()}
					</p>
				)}
				<h3 className={`${bungee} text-sm leading-tight`}>
					<Link href={href}>{p.name}</Link>
				</h3>
				<div className="flex flex-col">
					<span className={`${bungee} text-base text-[var(--wv-cyan-soft)]`}>{money(p.price)}</span>
					{p.undiscountedPrice !== null && (
						<span className="text-[11px] text-[var(--q-text-dim)] line-through">
							{money(p.undiscountedPrice)}
						</span>
					)}
				</div>
				<div className="mt-auto flex items-center gap-2 pt-1">
					<button
						type="button"
						aria-label={`Add ${p.name} to cart`}
						disabled={pending}
						onClick={addToCart}
						className="flex h-[34px] w-10 shrink-0 items-center justify-center rounded-md bg-[var(--wv-cyan)] text-sm text-[var(--wv-ink)] disabled:opacity-60"
					>
						{pending ? "…" : "🛒"}
					</button>
					<Link
						href={href}
						className={`${bungee} flex h-[34px] flex-1 items-center justify-center rounded-md border border-[var(--wv-cyan-soft)] text-[10px] tracking-[1px] text-[var(--wv-cyan-soft)]`}
					>
						QUICK VIEW
					</Link>
				</div>
				<p
					role="status"
					aria-live="polite"
					className={`min-h-4 text-[11px] ${msg?.ok ? "text-[var(--q-green)]" : "text-[var(--q-red)]"}`}
				>
					{msg?.text}
					{msg?.ok && (
						<>
							{" "}
							<Link href="/cart" className="underline">
								View cart
							</Link>
						</>
					)}
				</p>
			</div>
		</article>
	);
}

export function WishlistExperience({
	products,
	localeBcp47,
	channel,
	locale,
}: {
	products: HomeProduct[];
	localeBcp47: string;
	channel: string;
	locale: string;
}) {
	const router = useRouter();
	const params = useSearchParams();
	const { slugs, add, remove, clear } = useWishlist();
	const sharedParam = params?.get("items");
	const shared = sharedParam !== null && sharedParam !== undefined;
	const sharedSlugs = useMemo(
		() => (sharedParam ? sharedParam.split(",").filter(Boolean) : []),
		[sharedParam],
	);
	const activeSlugs = shared ? sharedSlugs : slugs;

	const [sort, setSort] = useState<Sort>("added");
	const [cats, setCats] = useState<string[]>([]);
	const [maxPrice, setMaxPrice] = useState<number | null>(null);
	const [view, setView] = useState<"grid" | "list">("grid");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [moving, startMove] = useTransition();

	const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);
	const saved = useMemo(
		() => activeSlugs.flatMap((s) => (bySlug.get(s) ? [bySlug.get(s)!] : [])),
		[activeSlugs, bySlug],
	);

	const currency = products[0]?.currency ?? "USD";
	const money = (n: number) => formatPrice(n, currency, localeBcp47);
	const maxBound = Math.max(1, Math.ceil(Math.max(0, ...saved.map((p) => p.price))));
	const priceCap = maxPrice === null || maxPrice > maxBound ? maxBound : maxPrice;

	const categories = useMemo(() => {
		const m = new Map<string, { slug: string; name: string; count: number }>();
		for (const p of saved) {
			if (!p.categorySlug) continue;
			const e = m.get(p.categorySlug) ?? { slug: p.categorySlug, name: p.brand, count: 0 };
			e.count += 1;
			m.set(p.categorySlug, e);
		}
		return [...m.values()].sort((a, b) => b.count - a.count);
	}, [saved]);

	const visible = useMemo(() => {
		const out = saved.filter(
			(p) =>
				(cats.length === 0 || (p.categorySlug !== null && cats.includes(p.categorySlug))) &&
				p.price <= priceCap,
		);
		if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
		else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
		else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
		return out;
	}, [saved, cats, priceCap, sort]);

	const share = async () => {
		const url = `${window.location.origin}/wishlist?items=${encodeURIComponent(slugs.join(","))}`;
		try {
			if (navigator.share) await navigator.share({ title: "My Worldwide Vapor wishlist", url });
			else {
				await navigator.clipboard.writeText(url);
				setNotice("Link copied. Anyone with it can view your list.");
			}
		} catch {
			setNotice(`Copy this link to share: ${url}`);
		}
	};

	const moveAll = () =>
		startMove(async () => {
			let added = 0;
			const needOptions: string[] = [];
			const failed: string[] = [];
			for (const p of visible) {
				const r = await addProductToCartBySlug(channel, locale, p.slug);
				if (r.ok) {
					added += 1;
					if (!shared) remove([p.slug]);
				} else if (r.needsOptions) needOptions.push(p.name);
				else failed.push(p.name);
			}
			if (added > 0 && needOptions.length === 0 && failed.length === 0) {
				router.push("/cart");
				return;
			}
			setNotice(
				`${added} item${added === 1 ? "" : "s"} moved to your cart.` +
					(needOptions.length ? ` Pick an option first for: ${needOptions.join(", ")}.` : "") +
					(failed.length ? ` Couldn't add: ${failed.join(", ")}.` : ""),
			);
		});

	const pill = "rounded-lg border px-4 py-[10px] text-xs";
	const filters = (
		<div className="flex flex-col gap-6">
			<p className={`${bungee} text-sm text-[var(--wv-cyan-soft)]`}>FILTERS</p>
			<div className="flex flex-col gap-3">
				<p className={`${heyComic} text-xs`}>CATEGORIES</p>
				{categories.length === 0 && (
					<p className="text-xs text-[var(--q-text-dim)]">Nothing to filter yet.</p>
				)}
				{categories.map((c) => {
					const on = cats.includes(c.slug);
					return (
						<button
							key={c.slug}
							type="button"
							role="checkbox"
							aria-checked={on}
							onClick={() => setCats((x) => (on ? x.filter((s) => s !== c.slug) : [...x, c.slug]))}
							className={`${heyComic} w-fit text-left text-xs ${on ? "text-white" : "text-[var(--q-text-dim)]"}`}
						>
							[{on ? "x" : " "}] {c.name} ({c.count})
						</button>
					);
				})}
			</div>
			<hr className="border-[var(--wv-control)]" />
			<div className="flex flex-col gap-3">
				<p className={`${heyComic} text-xs`}>PRICE RANGE</p>
				<p className={`${bungee} text-[11px] text-[var(--wv-cyan-soft)]`}>
					{money(0)} – {money(priceCap)}
				</p>
				<input
					type="range"
					aria-label="Maximum price"
					min={0}
					max={maxBound}
					value={priceCap}
					onChange={(e) => setMaxPrice(Number(e.target.value))}
					className="wv-range"
				/>
			</div>
		</div>
	);

	return (
		<>
			<section className="flex flex-col gap-4 px-4 pb-5 pt-6 md:px-8 md:pt-8 xl:px-20 xl:pt-8">
				<nav aria-label="Breadcrumb" className={`${orbitron} text-xs text-[var(--q-text-dim)]`}>
					<Link href="/home">Home</Link> &gt; <span aria-current="page">Wishlist</span>
				</nav>
				<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex flex-col gap-2">
						<h1 className={`${heyComic} text-2xl uppercase xl:text-[32px] xl:leading-10`}>
							{shared ? "SHARED WISHLIST" : "MY WISHLIST"}{" "}
							<span className="text-[var(--wv-cyan-soft)]">
								({saved.length} {saved.length === 1 ? "ITEM" : "ITEMS"})
							</span>
						</h1>
						<p className={`${orbitron} text-sm text-[var(--q-text-dim)]`}>
							{shared
								? "Someone shared these favourites with you."
								: "Save your favorite products and shop them anytime."}
						</p>
					</div>
					{saved.length > 0 && (
						<div className="grid grid-cols-2 gap-3 xl:flex">
							{shared ? (
								<button
									type="button"
									onClick={() => add(sharedSlugs)}
									className={`${bungee} rounded-md border border-[var(--wv-cyan-soft)] px-4 py-3 text-[11px] tracking-[1px] text-[var(--wv-cyan-soft)]`}
								>
									SAVE TO MY WISHLIST
								</button>
							) : (
								<button
									type="button"
									onClick={share}
									className={`${bungee} rounded-md border border-[var(--wv-cyan-soft)] px-4 py-3 text-[11px] tracking-[1px] text-[var(--wv-cyan-soft)]`}
								>
									SHARE WISHLIST
								</button>
							)}
							<button
								type="button"
								disabled={moving || visible.length === 0}
								onClick={moveAll}
								className={`${bungee} rounded-md bg-[var(--wv-cyan)] px-4 py-3 text-[11px] tracking-[1px] text-[var(--wv-ink)] disabled:opacity-60`}
							>
								{moving ? "MOVING…" : "MOVE ALL TO CART"}
							</button>
						</div>
					)}
				</div>
				{notice && (
					<p
						role="status"
						className="border-[var(--wv-cyan-soft)]/40 rounded-lg border bg-[var(--wv-deep)] px-4 py-3 text-sm"
					>
						{notice}
					</p>
				)}
				<hr className="border-[var(--wv-control)]" />
			</section>

			{saved.length === 0 ? (
				<section className="flex flex-col items-center gap-5 px-4 py-20 text-center">
					<p aria-hidden className="text-5xl text-[var(--wv-pink)]">
						♡
					</p>
					<h2 className={`${heyComic} text-2xl`}>YOUR WISHLIST IS EMPTY</h2>
					<p className={`${orbitron} max-w-md text-sm text-[var(--q-text-dim)]`}>
						Tap the heart on any product to save it here for later.
					</p>
					<Link
						href="/shop"
						className="flex min-h-12 items-center rounded-md bg-[var(--wv-cyan-soft)] px-8 font-[family-name:var(--font-inter)] text-[13px] font-bold tracking-[1.5px] text-[var(--wv-ink)]"
					>
						BROWSE PRODUCTS
					</Link>
				</section>
			) : (
				<>
					<div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8 xl:px-20">
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => setFiltersOpen((v) => !v)}
								aria-expanded={filtersOpen}
								className={`${heyComic} ${pill} border-[var(--wv-purple)] xl:hidden`}
							>
								FILTERS{cats.length || priceCap < maxBound ? " (active)" : ""}
							</button>
							<label className={`${orbitron} flex items-center gap-2 text-xs text-[var(--q-text-dim)]`}>
								Sort by
								<select
									value={sort}
									onChange={(e) => setSort(e.target.value as Sort)}
									className="rounded-md border border-[var(--wv-control)] bg-[var(--wv-surface)] px-2 py-1 text-[var(--wv-cyan-soft)]"
								>
									{SORTS.map((s) => (
										<option key={s.value} value={s.value}>
											{s.label}
										</option>
									))}
								</select>
							</label>
						</div>
						<div className="flex items-center gap-3 text-sm">
							{!shared && (
								<button type="button" onClick={clear} className={`${heyComic} text-xs text-[var(--wv-pink)]`}>
									Clear all
								</button>
							)}
							<div role="group" aria-label="View" className="hidden gap-3 md:flex">
								{(["grid", "list"] as const).map((v) => (
									<button
										key={v}
										type="button"
										aria-pressed={view === v}
										onClick={() => setView(v)}
										className={`${heyComic} text-sm ${view === v ? "text-[var(--wv-cyan-soft)]" : "text-[var(--q-text-dim)]"}`}
									>
										{v === "grid" ? "▦ Grid view" : "☰ List view"}
									</button>
								))}
							</div>
						</div>
					</div>

					<section className="flex flex-col gap-6 px-4 pb-10 md:px-8 xl:flex-row xl:gap-6 xl:px-20 xl:pb-16">
						<aside
							aria-label="Filters"
							className={`${filtersOpen ? "block" : "hidden"} rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-deep)] p-5 xl:block xl:w-[240px] xl:shrink-0 xl:self-start`}
						>
							{filters}
						</aside>
						<div className="min-w-0 flex-1">
							{visible.length === 0 ? (
								<p className="rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-deep)] p-8 text-center text-sm text-[var(--q-text-dim)]">
									No saved items match these filters.
								</p>
							) : (
								<ul
									className={
										view === "list"
											? "flex flex-col gap-4"
											: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
									}
								>
									{visible.map((p) => (
										<li key={p.id}>
											<Card
												p={p}
												money={money}
												list={view === "list"}
												channel={channel}
												locale={locale}
												shared={shared}
												onRemove={() => remove([p.slug])}
											/>
										</li>
									))}
								</ul>
							)}
						</div>
					</section>
				</>
			)}
		</>
	);
}
