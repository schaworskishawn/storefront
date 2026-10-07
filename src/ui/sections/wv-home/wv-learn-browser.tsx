"use client";

import {
	Award,
	BookOpen,
	FileText,
	Heart,
	Package,
	Search,
	Star,
	Tag,
	Wind,
	Zap,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LearnArticleSummary } from "@/lib/learn/articles";
import { ArticleImage, ArticleMeta, LearnCard, learnHref } from "./wv-learn-card";

const outfit = "font-[family-name:var(--font-outfit)]";

/** Icons for the design's standard categories; any other category you invent gets a tag icon. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
	guides: BookOpen,
	reviews: Star,
	news: FileText,
	"tips-and-tricks": Zap,
	products: Package,
	lifestyle: Heart,
	beginners: Award,
};

const STANDARD_CATEGORIES = [
	{ slug: "guides", label: "GUIDES" },
	{ slug: "reviews", label: "REVIEWS" },
	{ slug: "news", label: "NEWS" },
	{ slug: "tips-and-tricks", label: "TIPS & TRICKS" },
	{ slug: "products", label: "PRODUCTS" },
	{ slug: "lifestyle", label: "LIFESTYLE" },
	{ slug: "beginners", label: "BEGINNERS" },
];

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
			{/* Hero */}
			<section className="grid gap-5 px-5 py-8 md:gap-6 md:px-8 md:py-10 xl:grid-cols-[680px_420px] xl:justify-between xl:gap-x-12 xl:gap-y-6 xl:px-20 xl:py-16">
				<div className="flex flex-col gap-4 xl:col-start-1 xl:row-start-1 xl:gap-6">
					<h1 className={`${outfit} text-[30px] font-extrabold leading-[1.1] md:text-[44px] xl:text-[56px]`}>
						WORLDWIDE VAPOR LEARN
					</h1>
					<p className="text-sm leading-[1.6] md:text-base xl:text-lg">
						<span className="xl:hidden">Tips, guides, and latest news to elevate your vape experience.</span>
						<span className="hidden xl:inline">
							Tips, guides, and the latest news from the vaping world. Stay informed and elevate your vape
							experience.
						</span>
					</p>
				</div>
				<div className="flex h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] md:h-[264px] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:h-[320px]">
					<Wind
						aria-hidden
						className="size-8 text-[var(--wv-cyan-soft)] md:size-14 xl:size-16"
						strokeWidth={1.25}
					/>
					<p className={`${outfit} text-sm font-bold md:text-lg xl:text-xl`}>
						<span className="xl:hidden">VAPE TECH MOCKUP</span>
						<span className="hidden xl:inline">WORLDWIDE VAPE TECH</span>
					</p>
					<p className="hidden text-xs xl:block">E-Cigarette illustration mockup</p>
				</div>
				<form
					role="search"
					onSubmit={(e) => e.preventDefault()}
					className="flex items-center gap-3 rounded-xl border border-[var(--wv-disabled)] bg-[var(--wv-ink)] px-4 py-[10px] xl:col-start-1 xl:row-start-2 xl:py-[14px]"
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

			{/* Categories */}
			<section className="flex flex-col gap-5 bg-[var(--wv-control)] px-5 py-6 md:px-8 md:py-8 xl:gap-8 xl:px-20 xl:py-12">
				<div className="flex items-center justify-between">
					<h2 className={`${outfit} text-lg font-extrabold md:text-xl xl:text-2xl`}>CATEGORIES</h2>
					{filtering && (
						<button
							type="button"
							onClick={clear}
							className="font-sans text-sm font-bold uppercase text-[var(--wv-cyan-soft)]"
						>
							View All →
						</button>
					)}
				</div>
				<ul className="wv-hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 md:-mx-8 md:px-8 xl:mx-0 xl:justify-center xl:gap-6 xl:overflow-visible xl:px-0">
					{categories.map(({ slug, label }) => {
						const Icon = CATEGORY_ICONS[slug] ?? Tag;
						const active = category === slug;
						return (
							<li key={slug} className="shrink-0">
								<button
									type="button"
									aria-pressed={active}
									onClick={() => setCategory(active ? null : slug)}
									className={`flex items-center gap-2 rounded-full border px-4 py-2 xl:w-[156px] xl:flex-col xl:gap-3 xl:rounded-2xl xl:p-5 ${
										active
											? "border-[var(--wv-cyan-soft)] bg-[var(--wv-cyan-soft)] text-[var(--wv-bg)]"
											: "border-[var(--wv-disabled)] bg-[var(--wv-ink)]"
									}`}
								>
									<span
										className={`flex items-center justify-center xl:size-14 xl:rounded-full ${active ? "xl:bg-[var(--wv-bg)]/15" : "xl:bg-[var(--wv-control)]"}`}
									>
										<Icon aria-hidden className="size-4 xl:size-6" />
									</span>
									<span className={`${outfit} whitespace-nowrap text-xs font-bold xl:text-center`}>
										{label}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			{/* Featured */}
			{featured && (
				<section className="flex flex-col gap-5 px-5 py-8 md:px-8 md:py-10 xl:gap-8 xl:px-20 xl:py-16">
					<h2 className={`${outfit} text-lg font-extrabold md:text-xl xl:text-2xl`}>FEATURED ARTICLE</h2>
					<Link
						href={learnHref(featured.slug)}
						className="group overflow-hidden rounded-3xl border border-[var(--wv-disabled)] bg-[var(--wv-ink)] transition-colors hover:border-[var(--wv-cyan-soft)] xl:flex"
					>
						<ArticleImage
							article={featured}
							className="h-40 w-full md:h-[200px] xl:h-[420px] xl:w-[640px] xl:shrink-0"
							sizes="(min-width: 1280px) 640px, 100vw"
							priority
						/>
						<div className="flex flex-1 flex-col justify-center gap-4 p-5 md:p-8 xl:gap-5 xl:p-12">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<span className="rounded-md bg-[var(--wv-cyan-soft)] px-[10px] py-1 text-[11px] font-bold uppercase text-[var(--wv-bg)]">
									{featured.category}
								</span>
								<ArticleMeta article={featured} />
							</div>
							<h3 className={`${outfit} text-xl font-extrabold md:text-[28px] xl:text-4xl`}>
								{featured.title}
							</h3>
							<p className="text-sm leading-[1.6] md:text-base">{featured.excerpt}</p>
							<span className="w-fit text-base font-bold text-[var(--wv-cyan-soft)]">Read More →</span>
						</div>
					</Link>
				</section>
			)}

			{/* Latest / results */}
			<section className="flex flex-col gap-5 bg-[var(--wv-control)] px-5 py-8 md:px-8 md:py-10 xl:gap-8 xl:px-20 xl:py-16">
				<h2 className={`${outfit} text-lg font-extrabold md:text-xl xl:text-2xl`} role="status">
					{filtering ? `RESULTS (${results.length})` : "LATEST ARTICLES"}
				</h2>
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
