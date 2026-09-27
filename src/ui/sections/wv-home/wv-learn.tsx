import Link from "next/link";
import type { LearnArticle, LearnArticleSummary } from "@/lib/learn/articles";
import { WvFooter, WvHeader } from "./wv-chrome";
import { LearnBrowser } from "./wv-learn-browser";
import { ArticleImage, ArticleMeta, LearnCard } from "./wv-learn-card";
import { Markdown } from "./wv-markdown";
import { LearnNewsletterForm } from "./wv-newsletter-client";
import "./wv-home.css";

/**
 * Worldwide Vapor learn (blog) — Figma "6.05 - High Fidelity - Learn".
 * Articles come from Markdown files in `content/learn` (see `_HOW-TO-ADD-ARTICLES.md`).
 * Responsive: mobile base (Figma 375), tablet from `md` (768), desktop from `xl` (1280+, Figma 1440).
 */

const outfit = "font-[family-name:var(--font-outfit)]";

function Breadcrumb({ trail }: { trail: { label: string; href?: string }[] }) {
	return (
		<nav
			aria-label="Breadcrumb"
			className="border-b border-[var(--wv-disabled)] bg-[var(--wv-control)] px-5 py-3 text-xs md:px-8 md:py-4 md:text-sm xl:px-20 xl:py-5"
		>
			{trail.map((t, i) => (
				<span key={t.label}>
					{i > 0 && <span className="mx-1">&gt;</span>}
					{t.href ? <Link href={t.href}>{t.label}</Link> : <span aria-current="page">{t.label}</span>}
				</span>
			))}
		</nav>
	);
}

function Newsletter() {
	return (
		<section className="flex flex-col gap-5 bg-[var(--wv-ink)] px-5 py-8 md:flex-row md:items-center md:justify-between md:gap-10 md:px-8 md:py-10 xl:flex-col xl:justify-center xl:gap-6 xl:p-16">
			<div className="flex flex-col gap-3 md:max-w-[364px] xl:max-w-[560px] xl:items-center xl:text-center">
				<h2
					className={`${outfit} text-xl font-extrabold text-[var(--wv-cyan-soft)] md:text-2xl xl:text-[32px]`}
				>
					STAY UPDATED
				</h2>
				<p className="text-sm xl:text-base">
					Get the latest vaping tips, product drops, and exclusive deals straight to your inbox.
				</p>
			</div>
			<div className="w-full md:w-[300px] xl:w-[480px]">
				<LearnNewsletterForm />
			</div>
		</section>
	);
}

/** /learn — article list with search and category filters. */
export function WvLearn({ articles }: { articles: LearnArticleSummary[] }) {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] font-sans text-white">
			<WvHeader />
			<Breadcrumb trail={[{ label: "Home", href: "/home" }, { label: "Learn" }]} />
			<LearnBrowser articles={articles} />
			<Newsletter />
			<WvFooter />
		</div>
	);
}

/** /learn/[slug] — a single article with similar articles underneath. */
export function WvLearnArticle({
	article,
	similar,
}: {
	article: LearnArticle;
	similar: LearnArticleSummary[];
}) {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] font-sans text-white">
			<WvHeader />
			<Breadcrumb
				trail={[
					{ label: "Home", href: "/home" },
					{ label: "Learn", href: "/learn" },
					{ label: article.title },
				]}
			/>

			<article className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-5 py-8 md:px-8 md:py-12 xl:gap-8 xl:py-16">
				<header className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="rounded-md bg-[var(--wv-cyan-soft)] px-[10px] py-1 text-[11px] font-bold uppercase text-[var(--wv-bg)]">
							{article.category}
						</span>
						<ArticleMeta article={article} />
					</div>
					<h1 className={`${outfit} text-[30px] font-extrabold leading-[1.1] md:text-[44px] xl:text-5xl`}>
						{article.title}
					</h1>
					{article.excerpt && (
						<p className="text-base leading-[1.6] text-[var(--wv-text-dim)] md:text-lg">{article.excerpt}</p>
					)}
				</header>
				{article.image && (
					<ArticleImage
						article={article}
						className="h-[200px] w-full rounded-3xl border border-[var(--wv-disabled)] md:h-[340px] xl:h-[420px]"
						sizes="(min-width: 900px) 860px, 100vw"
						priority
					/>
				)}
				<Markdown source={article.body} />
				<Link href="/learn" className="mt-4 w-fit font-bold text-[var(--wv-cyan-soft)]">
					← Back to Learn
				</Link>
			</article>

			{similar.length > 0 && (
				<section className="flex flex-col gap-5 bg-[var(--wv-control)] px-5 py-8 md:px-8 md:py-10 xl:gap-8 xl:px-20 xl:py-16">
					<h2 className={`${outfit} text-lg font-extrabold md:text-xl xl:text-2xl`}>SIMILAR ARTICLES</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6">
						{similar.map((a) => (
							<LearnCard key={a.slug} article={a} />
						))}
					</div>
				</section>
			)}

			<Newsletter />
			<WvFooter />
		</div>
	);
}
