import { Mail } from "lucide-react";
import { Suspense } from "react";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { WvFooter, WvHeader } from "./wv-chrome";
import { NewsletterForm } from "./wv-newsletter-client";
import { SearchExperience } from "./wv-search-client";
import "./wv-home.css";

/** Worldwide Vapor search — Figma "6.07 - High Fidelity - Search" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export function WvSearch({ products, localeBcp47 }: { products: HomeProduct[]; localeBcp47: string }) {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<Suspense fallback={<div className="min-h-[60dvh]" />}>
				<SearchExperience products={products} localeBcp47={localeBcp47} />
			</Suspense>

			{/* Newsletter, under a neon divider: the shipping and payments pages' lit glass card (`.wv-news-card`: a
			    glowing cyan-through-purple-to-pink edge, its email field set into it and a glossy button) over the heroes'
			    soft pink and cyan glows. A neon badge with a glowing envelope, a chrome 3D title and brighter copy with its
			    key phrases lit. The full form, so the subscribe button shows (the compact one hides it). */}
			<div className="wv-glow-line mx-auto !h-[2px] w-[calc(100%-32px)] max-w-[1280px] md:w-[calc(100%-48px)]" />
			<section className="wv-hero-backdrop px-4 py-10 md:px-6 md:py-14 xl:px-20 xl:py-20">
				<div className="wv-news-card mx-auto flex w-full max-w-[1280px] flex-col gap-6 rounded-[20px] p-6 md:gap-8 md:p-10 xl:flex-row xl:items-center xl:justify-between xl:gap-12">
					<div className="flex flex-col items-start gap-3 xl:max-w-[560px]">
						<span
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<Mail aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
							STAY CONNECTED
						</span>
						<h2
							className={`${heyComic} wv-heading-title text-2xl uppercase leading-tight md:text-[28px] xl:text-[32px]`}
						>
							EXCLUSIVE DEALS &amp; NEW ARRIVALS
						</h2>
						<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6]`}>
							Drop your email to receive <strong className="wv-hero-key">direct drop alerts</strong> for new
							collections and <strong className="wv-hero-key wv-hero-key--pink">rare device kits</strong>. No
							spam — only hardware.
						</p>
					</div>
					<div className="w-full xl:w-auto xl:shrink-0">
						<NewsletterForm />
					</div>
				</div>
			</section>
			<WvFooter />
		</div>
	);
}
