import {
	Award,
	BookOpen,
	Calendar,
	Clock,
	FileText,
	Heart,
	Package,
	Star,
	Tag,
	Zap,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { LearnArticleSummary } from "@/lib/learn/articles";

const outfit = "font-[family-name:var(--font-outfit)]";

export function learnHref(slug: string) {
	return `/learn/${slug}`;
}

/** Icons for the design's standard categories; any other category you invent gets a tag icon. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
	guides: BookOpen,
	reviews: Star,
	news: FileText,
	"tips-and-tricks": Zap,
	products: Package,
	lifestyle: Heart,
	beginners: Award,
};

/** Categories whose cards glow pink; the rest glow cyan, so a row of cards alternates. */
const PINK_CATEGORIES = new Set(["reviews", "tips-and-tricks", "lifestyle"]);

/**
 * An article's card in the site's neon style (`.wv-neon-card`, wv-home.css), in its category's colour: cyan, or pink for
 * the categories above. Its children (the art, the tag, the meta's icons, the link) take that colour from `--accent`.
 */
export function articleCardClass(categorySlug: string) {
	return PINK_CATEGORIES.has(categorySlug) ? "wv-neon-card wv-neon-card--pink" : "wv-neon-card";
}

/**
 * Article photo, or, when the article has no `image:`, neon art in its place: the category's icon glowing in a neon ring
 * over a nebula with a faint neon grid (`.wv-article-art`), in the card's colour. `large` sizes the icon up for a big
 * panel (the featured article's).
 */
export function ArticleImage({
	article,
	className,
	sizes,
	priority,
	large = false,
}: {
	article: Pick<LearnArticleSummary, "image" | "imageAlt" | "categorySlug">;
	className: string;
	sizes: string;
	priority?: boolean;
	large?: boolean;
}) {
	if (article.image) {
		return (
			<div className={`relative overflow-hidden bg-[var(--wv-control)] ${className}`}>
				<Image
					src={article.image}
					alt={article.imageAlt}
					fill
					sizes={sizes}
					className="object-cover"
					priority={priority}
				/>
			</div>
		);
	}
	const Icon = CATEGORY_ICONS[article.categorySlug] ?? Tag;
	return (
		<div
			className={`wv-article-art relative flex items-center justify-center overflow-hidden ${className}`}
			aria-hidden
		>
			<span
				className={`wv-article-art-icon relative flex items-center justify-center rounded-full ${
					large ? "size-16 md:size-24 xl:size-36" : "size-16 md:size-20"
				}`}
			>
				<Icon className={large ? "size-7 md:size-11 xl:size-16" : "size-7 md:size-9"} strokeWidth={1.75} />
			</span>
		</div>
	);
}

/** The category as a glowing glass tag in the card's colour. */
export function ArticleTag({ children }: { children: string }) {
	return (
		<span className="wv-article-tag w-fit rounded-md px-[10px] py-1 text-[11px] font-bold uppercase tracking-[0.5px]">
			{children}
		</span>
	);
}

export function LearnCard({ article }: { article: LearnArticleSummary }) {
	return (
		<Link
			href={learnHref(article.slug)}
			className={`${articleCardClass(article.categorySlug)} group flex h-full flex-col overflow-hidden rounded-2xl`}
		>
			<ArticleImage
				article={article}
				className="h-[140px] md:h-[150px] xl:h-[180px]"
				sizes="(min-width: 1280px) 300px, (min-width: 768px) 50vw, 100vw"
			/>
			<div className="flex flex-1 flex-col gap-3 p-4 md:gap-4 xl:p-5">
				<ArticleTag>{article.category}</ArticleTag>
				<h3
					className={`${outfit} wv-pc-name text-base font-bold transition-colors group-hover:text-[var(--accent)] md:text-lg`}
				>
					{article.title}
				</h3>
				<div className="wv-article-meta mt-auto flex items-center gap-3 text-xs">
					<span>{article.dateLabel}</span>
					<span aria-hidden className="wv-article-meta-dot size-1 rounded-sm" />
					<span>{article.readMinutes} min read</span>
				</div>
			</div>
		</Link>
	);
}

export function ArticleMeta({
	article,
}: {
	article: Pick<LearnArticleSummary, "dateLabel" | "readMinutes" | "date">;
}) {
	return (
		<div className="wv-article-meta flex gap-4 text-[13px]">
			<span className="flex items-center gap-[6px]">
				<Calendar aria-hidden className="size-[14px]" />
				<time dateTime={article.date}>{article.dateLabel}</time>
			</span>
			<span className="flex items-center gap-[6px]">
				<Clock aria-hidden className="size-[14px]" />
				{article.readMinutes} min read
			</span>
		</div>
	);
}
