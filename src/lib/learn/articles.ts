import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * File-based Learn articles. Every `content/learn/*.md` file (not starting with `_`) is an article.
 * See `content/learn/_HOW-TO-ADD-ARTICLES.md`.
 */

const CONTENT_DIR = join(process.cwd(), "content", "learn");

export type LearnArticleSummary = {
	slug: string;
	title: string;
	category: string;
	categorySlug: string;
	/** ISO date `YYYY-MM-DD`. */
	date: string;
	dateLabel: string;
	readMinutes: number;
	excerpt: string;
	image: string | null;
	imageAlt: string;
	featured: boolean;
};

export type LearnArticle = LearnArticleSummary & { body: string };

export function slugifyCategory(category: string): string {
	return category
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function formatDate(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(d);
}

function stripMarkdown(md: string): string {
	return md
		.replace(/^>.*$/gm, "")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[#>*_`-]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function firstParagraph(md: string): string {
	const blocks = md.split(/\n\s*\n/);
	for (const block of blocks) {
		const t = block.trim();
		if (
			!t ||
			t.startsWith("#") ||
			t.startsWith(">") ||
			t.startsWith("-") ||
			t.startsWith("!") ||
			/^\d+\./.test(t)
		)
			continue;
		return stripMarkdown(t);
	}
	return "";
}

function parseFile(fileName: string): LearnArticle | null {
	const slug = fileName.replace(/\.md$/, "");
	const raw = readFileSync(join(CONTENT_DIR, fileName), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return null;

	let meta: Record<string, unknown>;
	try {
		meta = (parseYaml(match[1]) as Record<string, unknown>) ?? {};
	} catch {
		console.warn(`[learn] Could not read the top block of ${fileName}`);
		return null;
	}
	if (meta.draft === true) return null;

	const title = typeof meta.title === "string" ? meta.title.trim() : "";
	const category = typeof meta.category === "string" ? meta.category.trim() : "";
	// `date: 2025-05-20` is parsed by YAML as a Date; accept either form.
	const dateRaw = meta.date instanceof Date ? meta.date.toISOString().slice(0, 10) : String(meta.date ?? "");
	if (!title || !category || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
		console.warn(`[learn] ${fileName} needs a title, category and date (YYYY-MM-DD) — skipped.`);
		return null;
	}

	const body = match[2].trim();
	const words = stripMarkdown(body).split(" ").filter(Boolean).length;

	return {
		slug,
		title,
		category,
		categorySlug: slugifyCategory(category),
		date: dateRaw,
		dateLabel: formatDate(dateRaw),
		readMinutes: Math.max(1, Math.round(words / 200)),
		excerpt:
			typeof meta.excerpt === "string" && meta.excerpt.trim() ? meta.excerpt.trim() : firstParagraph(body),
		image: typeof meta.image === "string" && meta.image.trim() ? meta.image.trim() : null,
		imageAlt: typeof meta.imageAlt === "string" ? meta.imageAlt.trim() : title,
		featured: meta.featured === true,
		body,
	};
}

/** All published articles, newest first. */
export function getAllArticles(): LearnArticle[] {
	let files: string[];
	try {
		files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
	} catch {
		return [];
	}
	return files
		.map(parseFile)
		.filter((a): a is LearnArticle => a !== null)
		.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function toSummary(article: LearnArticle): LearnArticleSummary {
	const { body: _body, ...summary } = article;
	return summary;
}

export function getArticle(slug: string): LearnArticle | null {
	return getAllArticles().find((a) => a.slug === slug) ?? null;
}

/** Same-category articles first (newest first), then the newest others, excluding the article itself. */
export function getSimilarArticles(article: LearnArticle, count = 3): LearnArticleSummary[] {
	const others = getAllArticles().filter((a) => a.slug !== article.slug);
	const same = others.filter((a) => a.categorySlug === article.categorySlug);
	const rest = others.filter((a) => a.categorySlug !== article.categorySlug);
	return [...same, ...rest].slice(0, count).map(toSummary);
}
