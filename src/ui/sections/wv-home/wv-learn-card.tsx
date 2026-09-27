import { Calendar, Clock, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { LearnArticleSummary } from "@/lib/learn/articles";

const outfit = "font-[family-name:var(--font-outfit)]";

export function learnHref(slug: string) {
	return `/learn/${slug}`;
}

/** Article photo, or a neutral placeholder tile when the article has no `image:`. */
export function ArticleImage({
	article,
	className,
	sizes,
	priority,
}: {
	article: Pick<LearnArticleSummary, "image" | "imageAlt">;
	className: string;
	sizes: string;
	priority?: boolean;
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
	return (
		<div className={`flex items-center justify-center bg-[var(--wv-control)] ${className}`} aria-hidden>
			<ImageIcon className="size-8 text-[var(--wv-disabled)] md:size-10" strokeWidth={1.25} />
		</div>
	);
}

export function LearnCard({ article }: { article: LearnArticleSummary }) {
	return (
		<Link
			href={learnHref(article.slug)}
			className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--wv-disabled)] bg-[var(--wv-ink)] transition-colors hover:border-[var(--wv-cyan-soft)]"
		>
			<ArticleImage
				article={article}
				className="h-[140px] md:h-[150px] xl:h-[180px]"
				sizes="(min-width: 1280px) 300px, (min-width: 768px) 50vw, 100vw"
			/>
			<div className="flex flex-1 flex-col gap-3 p-4 md:gap-4 xl:p-5">
				<span className="w-fit text-[11px] font-bold uppercase text-[var(--wv-pink)]">
					{article.category}
				</span>
				<h3 className={`${outfit} text-base font-bold md:text-lg`}>{article.title}</h3>
				<div className="mt-auto flex items-center gap-3 text-xs">
					<span>{article.dateLabel}</span>
					<span aria-hidden className="size-1 rounded-sm bg-[var(--wv-disabled)]" />
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
		<div className="flex gap-4 text-[13px]">
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
