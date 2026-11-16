"use client";

import { Search, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LearnArticleSummary } from "@/lib/learn/articles";
import {
	ArticleImage,
	ArticleMeta,
	ArticleTag,
	articleCardClass,
	CATEGORY_ICONS,
	LearnCard,
	learnHref,
} from "./wv-learn-card";
import { LearnHeroArt } from "./wv-learn-hero-art";

const outfit = "font-[family-name:var(--font-outfit)]";

const STANDARD_CATEGORIES = [
	{ slug: "guides", label: "GUIDES" },
	{ slug: "reviews", label: "REVIEWS" },
	{ slug: "news", label: "NEWS" },
	{ slug: "tips-and-tricks", label: "TIPS & TRICKS" },
	{ slug: "products", label: "PRODUCTS" },
	{ slug: "lifestyle", label: "LIFESTYLE" },
	{ slug: "beginners", label: "BEGINNERS" },
];

/** A section's title: chrome 3D lettering (`.wv-heading-title`) over a glowing bar. `status` announces it when it
 * changes (the results count). */
function SectionTitle({ children, status }: { children: string; status?: boolean }) {
	return (
		<div className="flex flex-col gap-2">
			<h2
				role={status ? "status" : undefined}
				className={`${outfit} wv-heading-title text-lg font-extrabold md:text-xl xl:text-2xl`}
			>
				{children}
			</h2>
			<div className="wv-hero-bar h-[3px] w-12 rounded-full md:w-16" />
		</div>
	);
}

export function LearnBrowser({ articles }: { articles: LearnArticleSummary[] }) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string | null>(null);

	const categories = useMemo(() => {
		const known = new Set(STANDARD_CATEGORIES.map((c) => c.slug));
		const extras = new Map<string, string>();
		for (const a of articles)
			if (!known.has(a.categorySlug)) extras.set(a.categorySlug, a.category.toUpperCase());
		return [...STANDARD_CATEGORIES, ...[...extras].map(([slug, label]) => ({ slug, label }))];
	}, [articles]);

	const q = query.trim().toLowerCase();
	const filtering = q !== "" || category !== null;

	const results = useMemo(
		() =>
			articles.filter(
				(a) =>
					(category === null || a.categorySlug === category) &&
					(q === "" || `${a.title} ${a.excerpt} ${a.category}`.toLowerCase().includes(q)),
			),
		[articles, category, q],
	);

	const featured = filtering ? null : (articles.find((a) => a.featured) ?? articles[0] ?? null);
	const latest = filtering ? results : articles.filter((a) => a !== featured);
	const clear = () => {
		setQuery("");
		setCategory(null);
	};

	return (
		<>
			{/* Hero, in the neon style of the site's other heroes: a pink and cyan glow behind it (`.wv-hero-backdrop`), a 3D
			    two-tone title over a glowing bar and brighter copy with its key words lit (`.wv-hero-*`), a neon library in a
			    glowing frame (wv-learn-hero-art.tsx, in place of the "vape tech mockup" placeholder), and a neon glass search
			    field (`.wv-search-field`). The frame keeps a set shape at each size (a wide banner up to the desktop layout,
			    then 3:2), so the art's middle band, the book and its cards, is always in view. */}
			<section className="wv-hero-backdrop grid gap-5 px-5 py-8 md:gap-6 md:px-8 md:py-10 xl:grid-cols-[680px_420px] xl:justify-between xl:gap-x-12 xl:gap-y-6 xl:px-20 xl:py-16">
				<div className="flex flex-col gap-4 xl:col-start-1 xl:row-start-1 xl:gap-6">
					<div className="flex flex-col gap-3">
						<h1
							className={`${outfit} wv-title-glow wv-hero-title text-[30px] font-extrabold leading-[1.1] md:text-[44px] xl:text-[56px]`}
						>
							<span>WORLDWIDE VAPOR</span> <span className="text-[var(--wv-cyan-soft)]">LEARN</span>
						</h1>
						<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
					</div>
					<p className="wv-hero-copy text-sm leading-[1.6] md:text-base xl:text-lg">
						<span className="xl:hidden">
							<strong className="wv-hero-key">Tips, guides</strong>, and{" "}
							<strong className="wv-hero-key wv-hero-key--pink">latest news</strong> to elevate your vape
							experience.
						</span>
						<span className="hidden xl:inline">
							<strong className="wv-hero-key">Tips, guides</strong>, and the{" "}
							<strong className="wv-hero-key wv-hero-key--pink">latest news</strong> from the vaping world.
							Stay informed and elevate your vape experience.
						</span>
					</p>
				</div>
				<div className="wv-art relative aspect-[12/5] overflow-hidden rounded-3xl md:aspect-[3/1] md:max-h-[300px] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:aspect-[3/2] xl:max-h-none xl:self-center">
					<LearnHeroArt idPrefix="learn-hero-art" />
				</div>
				<form
					role="search"
					onSubmit={(e) => e.preventDefault()}
					className="wv-search-field flex items-center gap-3 rounded-xl px-4 py-[10px] xl:col-start-1 xl:row-start-2 xl:py-[14px]"
				>
					<Search aria-hidden className="size-4 shrink-0 md:size-5" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Search articles"
						placeholder="Search articles, guides, reviews..."
						className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-white shadow-none ring-0 placeholder:text-[var(--wv-text-dim)] focus:outline-none focus:ring-0 md:text-base"
					/>
				</form>
			</section>

			{/* Categories, on a lit glass band (`.wv-band`) under a chrome 3D title (`.wv-heading-title`) and a glowing bar:
			    neon glass chips, alternating cyan and pink, that lift and glow under the pointer; the chosen one lights up,
			    filled with its colour (`.wv-cat-*` in wv-home.css). The strip scrolls sideways below the desktop layout,
			    with room above and below so the glow and the lift aren't clipped. */}
			<section className="wv-band flex flex-col gap-5 px-5 py-6 md:px-8 md:py-8 xl:gap-8 xl:px-20 xl:py-12">
				<div className="flex items-center justify-between">
					<SectionTitle>CATEGORIES</SectionTitle>
					{filtering && (
						<button
							type="button"
							onClick={clear}
							className="wv-cat-all font-sans text-sm font-bold uppercase"
						>
							View All →
						</button>
					)}
				</div>
				<ul className="wv-hide-scrollbar -mx-5 -my-3 flex gap-3 overflow-x-auto px-5 py-3 md:-mx-8 md:px-8 xl:mx-0 xl:justify-center xl:gap-6 xl:overflow-visible xl:px-0">
					{categories.map(({ slug, label }) => {
						const Icon = CATEGORY_ICONS[slug] ?? Tag;
						const active = category === slug;
						return (
							<li key={slug} className="shrink-0">
								<button
									type="button"
									aria-pressed={active}
									onClick={() => setCategory(active ? null : slug)}
									className="wv-cat-chip flex items-center gap-2 rounded-full px-4 py-2 xl:w-[156px] xl:flex-col xl:gap-3 xl:rounded-2xl xl:p-5"
								>
									<span className="wv-cat-icon flex items-center justify-center xl:size-14 xl:rounded-full">
										<Icon aria-hidden className="size-4 xl:size-6" />
									</span>
									<span
										className={`${outfit} wv-cat-label whitespace-nowrap text-xs font-bold xl:text-center`}
									>
										{label}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			{/* Featured: a big neon glass card in its category's colour (`.wv-neon-card`), which lifts and glows under the
			    pointer; its art, tag, meta and "Read More" glow in that colour, and the arrow nudges forward. */}
			{featured && (
				<section className="wv-hero-backdrop flex flex-col gap-5 px-5 py-8 md:px-8 md:py-10 xl:gap-8 xl:px-20 xl:py-16">
					<SectionTitle>FEATURED ARTICLE</SectionTitle>
					<Link
						href={learnHref(featured.slug)}
						className={`${articleCardClass(featured.categorySlug)} group overflow-hidden rounded-3xl xl:flex`}
					>
						<ArticleImage
							article={featured}
							className="h-40 w-full md:h-[200px] xl:h-[420px] xl:w-[640px] xl:shrink-0"
							sizes="(min-width: 1280px) 640px, 100vw"
							priority
							large
						/>
						<div className="flex flex-1 flex-col justify-center gap-4 p-5 md:p-8 xl:gap-5 xl:p-12">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<ArticleTag>{featured.category}</ArticleTag>
								<ArticleMeta article={featured} />
							</div>
							<h3
								className={`${outfit} wv-pc-name text-xl font-extrabold transition-colors group-hover:text-[var(--accent)] md:text-[28px] xl:text-4xl`}
							>
								{featured.title}
							</h3>
							<p className="wv-neon-card-text text-sm leading-[1.6] md:text-base">{featured.excerpt}</p>
							<span className="wv-neon-card-link flex w-fit items-center gap-1 text-base font-bold">
								Read More
								<span aria-hidden className="transition-transform group-hover:translate-x-1">
									→
								</span>
							</span>
						</div>
					</Link>
				</section>
			)}

			{/* Latest / results, on a lit glass band (`.wv-band`): neon cards in their categories' colours (wv-learn-card.tsx). */}
			<section className="wv-band flex flex-col gap-5 px-5 py-8 md:px-8 md:py-10 xl:gap-8 xl:px-20 xl:py-16">
				<SectionTitle status>{filtering ? `RESULTS (${results.length})` : "LATEST ARTICLES"}</SectionTitle>
				{latest.length > 0 ? (
					<div
						key={latest.map((a) => a.slug).join("|")}
						className="wv-fade grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4 xl:gap-6"
					>
						{latest.map((a) => (
							<LearnCard key={a.slug} article={a} />
						))}
					</div>
				) : (
					<p className="py-8 text-center text-[var(--wv-text-dim)]">
						{articles.length === 0
							? "No articles yet. Add a Markdown file to content/learn to publish one."
							: "No articles match your search."}
					</p>
				)}
			</section>
		</>
	);
}
