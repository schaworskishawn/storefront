import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllArticles, getArticle, getSimilarArticles } from "@/lib/learn/articles";
import { WvLearnArticle } from "@/ui/sections/wv-home/wv-learn";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
	return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const article = getArticle(slug);
	if (!article) return { title: "Article not found — Worldwide Vapor" };
	return {
		title: `${article.title} — Worldwide Vapor Learn`,
		description: article.excerpt,
		...(article.image ? { openGraph: { images: [article.image] } } : {}),
	};
}

export default async function LearnArticlePage({ params }: Props) {
	const { slug } = await params;
	const article = getArticle(slug);
	if (!article) notFound();
	return <WvLearnArticle article={article} similar={getSimilarArticles(article, 3)} />;
}
