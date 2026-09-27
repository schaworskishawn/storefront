import Image from "next/image";
import Link from "next/link";
import { WvFooter, WvHeader } from "./wv-chrome";
import { NewsletterForm } from "./wv-newsletter-client";
import "./wv-home.css";

/** Worldwide Vapor distributor page — Figma "6.11 - High Fidelity - Distributor" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const CATEGORIES = ["Disposables", "E-Liquids", "Hardware", "Coils", "Accessories", "New Arrivals"];

const REQUIREMENTS = [
	"Valid Business License & Tobacco Permits",
	"Minimum Order Commitments (based on tier)",
	"Territory & Exclusivity Agreements",
	"Age Verification Compliance (18+)",
	"Insurance & Liability Documentation",
];

const FAQS = [
	{
		q: "How do I apply to become a distributor?",
		a: "Submit an application via our digital portal with valid business registration and tobacco tax license. Our team reviews submissions within 48 business hours.",
	},
	{
		q: "What are the minimum order quantities?",
		a: "Minimum orders vary by tier: Authorized Retailers start at $500, Regional Distributors at $2,500, and Master Distributors at $10,000 per order.",
	},
	{
		q: "Do you offer territory exclusivity?",
		a: "Yes, territory exclusivity is available for Regional and Master Distributor tiers. We evaluate market size and existing coverage to ensure fair allocation.",
	},
	{
		q: "What marketing materials are included?",
		a: "All partners receive digital assets, product photography, and POS materials. Regional+ tiers get co-branded campaigns and custom display units.",
	},
	{
		q: "How is wholesale pricing structured?",
		a: "Pricing is tier-based with volume incentives. Higher partnership levels unlock deeper discounts, seasonal promotions, and early access to new releases.",
	},
	{
		q: "What is the onboarding timeline?",
		a: "Onboarding takes 5–7 business days from license verification to first logistics delivery dispatch, depending on localized regulatory mandates.",
	},
];

const APPLY_HREF = "mailto:support@worldwidevapor.com?subject=Distributor%20application";

export function WvDistributor() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			<section className="relative flex flex-col gap-6 overflow-hidden bg-[var(--wv-bg)] px-4 pb-10 pt-6 md:gap-10 md:px-10 md:pb-14 md:pt-12 xl:flex-row-reverse xl:items-center xl:gap-10 xl:px-[100px] xl:py-20">
				<Image
					src="/home/distributor/dot.svg"
					alt=""
					width={600}
					height={600}
					aria-hidden
					className="pointer-events-none absolute -right-[200px] -top-[200px] hidden size-[600px] xl:block"
				/>
				<div className="relative h-[200px] w-full shrink-0 overflow-hidden rounded-[20px] border-2 border-[var(--wv-purple)] bg-[var(--wv-control)] shadow-[0_10px_30px_rgba(105,235,255,0.12)] md:h-[320px] xl:h-[400px] xl:w-[500px]">
					<Image
						src="/home/distributor/hero.png"
						alt="Global distribution warehouse network"
						fill
						priority
						sizes="(min-width: 1280px) 500px, 100vw"
						className="object-cover"
					/>
					<span
						className={`${orbitron} bg-[var(--wv-bg)]/75 absolute left-3 top-3 rounded border border-[var(--wv-cyan-soft)] px-2 py-1 text-[10px] text-[var(--wv-cyan-soft)] xl:left-[18px] xl:top-[18px]`}
					>
						WV-SYS: CONNECTED
					</span>
				</div>
				<div className="relative flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
					<p className={`${bungee} text-xs tracking-[2px] text-[var(--wv-cyan-soft)]`}>
						WHOLESALE &amp; DISTRIBUTION NETWORK
					</p>
					<h1
						className={`${heyComic} text-[28px] leading-[32px] md:text-[40px] md:leading-[44px] xl:text-[48px] xl:leading-[56px]`}
					>
						BECOME A <span className="text-[var(--wv-cyan-soft)]">WORLDWIDE VAPOR</span> DISTRIBUTOR
					</h1>
					<p
						className={`${orbitron} text-[13px] leading-[22px] text-[var(--q-text-nav)] md:text-[15px] md:leading-6`}
					>
						Join the premier global vaping distribution network. Unlock direct access to high-capacity
						hardware, next-generation e-liquids, and class-leading margins backed by 24/7 dedicated support.
					</p>
					<div className="flex flex-col gap-3 md:flex-row md:gap-4">
						<a
							href={APPLY_HREF}
							className={`${heyComic} flex items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-cyan-soft)] px-5 py-[14px] text-base tracking-[0.04em] text-[var(--wv-ink)]`}
						>
							Apply Now
						</a>
						<a
							href="#tiers"
							className={`${heyComic} flex items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] px-5 py-[14px] text-base tracking-[0.04em] text-[var(--wv-cyan-soft)]`}
						>
							Learn More
						</a>
					</div>
				</div>
			</section>

			{/* Categories strip */}
			<section className="flex flex-col gap-4 border-y border-[var(--wv-purple)] bg-[var(--wv-control)] px-4 py-6 md:gap-6 md:px-10 md:py-8 xl:px-[100px] xl:py-10">
				<h2 className={`${bungee} text-center text-sm tracking-[1px] md:text-base`}>
					AVAILABLE PRODUCT CATEGORIES FOR WHOLESALE
				</h2>
				<ul className="mx-auto grid grid-cols-3 gap-4 md:flex md:flex-wrap md:justify-center md:gap-4 xl:gap-10">
					{CATEGORIES.map((c, i) => (
						<li key={c} className="relative mx-auto size-24 md:size-20 xl:size-[108px]">
							<Image
								src={`/home/distributor/cat${i + 1}.png`}
								alt={c}
								fill
								sizes="108px"
								className="object-contain"
							/>
						</li>
					))}
				</ul>
			</section>

			{/* Tiers */}
			<section
				id="tiers"
				className="flex scroll-mt-6 flex-col items-center gap-6 px-4 py-10 md:gap-8 md:px-10 md:py-12 xl:gap-12 xl:px-[100px] xl:py-20"
			>
				<h2 className={`${bungee} text-2xl md:text-3xl xl:text-4xl`}>PARTNERSHIP TIERS</h2>
				<div className="w-full overflow-x-auto rounded-2xl">
					<div className="relative aspect-[1774/887] min-w-[680px] xl:min-w-0">
						<Image
							src="/home/distributor/tiers.png"
							alt="Distribution partner levels: Small Wholesale, Wholesale Partner, Master Distributor, Regional Distributor and Authorized Distributor"
							fill
							sizes="(min-width: 1280px) 1240px, 100vw"
							className="object-cover"
						/>
					</div>
				</div>
			</section>

			{/* Requirements + newsletter */}
			<section className="flex flex-col gap-8 bg-[var(--wv-bg)] px-4 py-10 md:px-10 md:py-16 xl:flex-row xl:gap-10 xl:px-[100px] xl:py-20">
				<div className="flex min-w-0 flex-1 flex-col gap-6">
					<div className="flex flex-col gap-2">
						<p className={`${bungee} text-xs tracking-[3px] text-[var(--wv-cyan-soft)]`}>LOGISTICS DETAIL</p>
						<h2 className={`${heyComic} text-[22px] leading-tight md:text-[28px] xl:text-[32px]`}>
							DISTRIBUTOR REQUIREMENTS
						</h2>
					</div>
					<ol className="flex flex-col gap-3">
						{REQUIREMENTS.map((r, i) => (
							<li
								key={r}
								className={`${orbitron} flex items-start gap-3 rounded-lg border border-[var(--q-border-strong)] bg-[var(--wv-control)] p-4 text-[13px] xl:items-center xl:text-sm`}
							>
								<span className="shrink-0 text-[var(--wv-cyan-soft)]">
									[{String(i + 1).padStart(2, "0")}]
								</span>
								<span className="font-semibold">{r}</span>
							</li>
						))}
					</ol>
				</div>
				<div className="flex flex-col gap-5 rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-ink)] p-5 md:p-6 xl:w-[460px] xl:shrink-0 xl:self-start xl:p-8">
					<h2 className={`${heyComic} text-lg xl:text-xl`}>STAY CONNECTED</h2>
					<p className={`${orbitron} text-xs leading-[18px] text-[var(--q-text-nav)]`}>
						Sign up for the connected core network. Get instant alerts regarding exclusive deals, bulk stock
						availability, and quarterly hardware releases.
					</p>
					<NewsletterForm compact />
				</div>
			</section>

			{/* FAQ */}
			<section className="flex flex-col gap-8 px-4 py-10 md:gap-10 md:px-10 md:py-16 xl:gap-12 xl:px-[100px] xl:py-20">
				<div className="flex flex-col gap-2 md:items-center">
					<p className={`${bungee} text-xs tracking-[4px] text-[var(--wv-pink)]`}>QUESTIONS</p>
					<h2 className={`${heyComic} text-2xl md:text-3xl xl:text-4xl`}>DISTRIBUTOR FAQS</h2>
				</div>
				<ul className="grid gap-4 xl:grid-cols-2">
					{FAQS.map((f) => (
						<li
							key={f.q}
							className="flex flex-col gap-[10px] rounded-xl border border-[var(--wv-control)] bg-[var(--wv-ink)] p-5"
						>
							<h3 className={`${heyComic} text-sm text-[var(--wv-cyan-soft)]`}>{f.q}</h3>
							<p className={`${orbitron} text-xs leading-[18px] text-[var(--wv-disabled)]`}>{f.a}</p>
						</li>
					))}
				</ul>
				<p className={`${orbitron} text-center text-xs text-[var(--wv-disabled)]`}>
					Still have questions?{" "}
					<Link href="mailto:support@worldwidevapor.com" className="text-[var(--wv-cyan-soft)] underline">
						Contact our partnerships team
					</Link>
					.
				</p>
			</section>

			<div className="h-px w-full bg-[var(--wv-pink)]" />
			<WvFooter />
		</div>
	);
}
