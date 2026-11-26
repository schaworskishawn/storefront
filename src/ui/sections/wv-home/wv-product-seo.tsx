import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { type ProductDetails, type ProductVariantOption } from "@/lib/catalog/get-product-details";
import { type ProductFaq } from "@/lib/catalog/product-faq";
import { type ProductGuide } from "@/lib/catalog/product-guide";
import {
	buildBreadcrumbJsonLd,
	buildFaqJsonLd,
	buildProductJsonLd,
	jsonLdScriptProps,
	truncateText,
} from "@/lib/seo";

const bungee = "font-[family-name:var(--font-bungee)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

/**
 * The product page's structured data, for search engines and AI answers: the Product (its offer, SKU, category and
 * specs as properties), its breadcrumb, and its questions and answers when it has any. Everything here is also visible
 * on the page.
 */
export function ProductStructuredData({
	product,
	details,
	variants,
	images,
}: {
	product: HomeProduct;
	details: ProductDetails | null;
	variants: ProductVariantOption[];
	images: { url: string }[];
}) {
	const url = `/product/${product.slug}`;
	const prices = variants.map((v) => v.price);
	const currency = variants[0]?.currency ?? product.currency;
	const description = details?.paragraphs.length
		? truncateText(details.paragraphs.join(" "), 1000)
		: (details?.seoDescription ?? undefined);
	const category = details?.category?.name || product.brand || null;
	const productLd = buildProductJsonLd({
		name: product.name,
		description,
		images: images.map((i) => i.url),
		sku: details?.sku,
		url,
		inStock: variants.some((v) => v.inStock),
		...(variants.length > 1
			? {
					priceRange: { lowPrice: Math.min(...prices), highPrice: Math.max(...prices), currency },
					variantCount: variants.length,
				}
			: { price: { amount: prices[0] ?? product.price, currency } }),
		category,
		properties: details?.specs.map((s) => ({ name: s.label, value: s.value })),
	});
	const breadcrumbLd = buildBreadcrumbJsonLd([
		{ name: "Home", url: "/home" },
		...(category ? [{ name: category, url: "/shop" }] : []),
		{ name: product.name, url },
	]);
	const faqLd = buildFaqJsonLd(details?.faq ?? []);
	return (
		<>
			{productLd && <script {...jsonLdScriptProps(productLd)} />}
			{breadcrumbLd && <script {...jsonLdScriptProps(breadcrumbLd)} />}
			{faqLd && <script {...jsonLdScriptProps(faqLd)} />}
		</>
	);
}

/**
 * The product's questions and answers (from its `faq` metadata in Saleor), over a soft glow, as on the returns page:
 * the title chrome over a glowing bar; each answer a lit panel (`.wv-info-*`), pink while closed and cyan once open,
 * the first one open; then, when the product has a companion guide (its `guide` metadata), a neon outline button to
 * it. Nothing renders when the product has neither.
 */
export function ProductFaqSection({ faq, guide }: { faq: ProductFaq[]; guide: ProductGuide | null }) {
	if (faq.length === 0 && !guide) return null;
	return (
		<section
			aria-labelledby="product-faq"
			className="wv-faq-glow flex flex-col gap-6 px-4 py-8 md:px-8 md:py-10 xl:px-20 xl:py-12"
		>
			<div className="flex flex-col gap-2">
				<p className={`${marker} wv-heading-eyebrow text-lg text-[var(--wv-pink)]`}>Good to know</p>
				<h2 id="product-faq" className={`${bungee} wv-heading-title text-xl text-white md:text-2xl`}>
					QUESTIONS &amp; ANSWERS
				</h2>
				<span aria-hidden className="wv-hero-bar mt-1 h-1 w-20 rounded-full md:w-[120px]" />
			</div>
			<div className="flex flex-col gap-3 xl:gap-4">
				{faq.map((f, i) => (
					<details key={f.q} open={i === 0} className="wv-info-item group rounded-xl p-4 md:p-5">
						<summary
							className={`${heyComic} wv-trust-title flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] md:text-sm [&::-webkit-details-marker]:hidden`}
						>
							{f.q}
							<span aria-hidden className="wv-info-toggle font-mono text-base">
								<span className="group-open:hidden">+</span>
								<span className="hidden group-open:inline">−</span>
							</span>
						</summary>
						<p className={`${orbitron} wv-trust-text mt-3 text-sm leading-[1.6]`}>{f.a}</p>
					</details>
				))}
			</div>
			{guide && (
				<Link
					href={guide.url}
					className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex w-fit max-w-full items-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-5 py-3 text-xs text-[var(--wv-cyan-soft)] md:text-[13px]`}
				>
					<BookOpen aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
					<span className="wv-btn-label">Read the guide: {guide.title}</span>
					<ArrowRight aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
				</Link>
			)}
		</section>
	);
}
