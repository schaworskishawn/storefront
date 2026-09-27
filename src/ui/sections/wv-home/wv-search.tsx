import { Suspense } from "react";
import { type HomeProduct } from "@/lib/catalog/get-home-products";
import { WvFooter, WvHeader } from "./wv-chrome";
import { NewsletterForm } from "./wv-newsletter-client";
import { SearchExperience } from "./wv-search-client";
import "./wv-home.css";

/** Worldwide Vapor search — Figma "6.07 - High Fidelity - Search" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export function WvSearch({ products, localeBcp47 }: { products: HomeProduct[]; localeBcp47: string }) {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<Suspense fallback={<div className="min-h-[60dvh]" />}>
				<SearchExperience products={products} localeBcp47={localeBcp47} />
			</Suspense>

			<section className="flex flex-col gap-6 border-t border-[var(--wv-control)] bg-[var(--wv-surface)] px-4 py-10 md:px-6 xl:flex-row xl:items-center xl:justify-between xl:px-20 xl:py-20">
				<div className="flex flex-col gap-3 xl:w-[550px]">
					<p className={`${bungee} flex items-center gap-2 text-xs uppercase text-[var(--wv-cyan)]`}>
						<span className="size-[6px] rounded-[3px] bg-[var(--wv-cyan)]" />
						STAY CONNECTED
					</p>
					<h2 className={`${heyComic} text-2xl uppercase xl:text-[32px]`}>
						EXCLUSIVE DEALS &amp; NEW ARRIVALS
					</h2>
					<p className={`${orbitron} text-sm text-[var(--wv-text-dim)]`}>
						Drop your email to receive direct drop alerts for new collections and rare device kits. No spam —
						only hardware.
					</p>
				</div>
				<div className="xl:w-[520px]">
					<NewsletterForm compact />
				</div>
			</section>
			<WvFooter />
		</div>
	);
}
