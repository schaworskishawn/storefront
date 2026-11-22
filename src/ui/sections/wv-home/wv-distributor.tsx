import {
	ArrowDown,
	BellRing,
	ChevronRight,
	Crown,
	FileBadge,
	FileCheck,
	Globe,
	Handshake,
	Home,
	Mail,
	MapPinned,
	PackageCheck,
	ShieldCheck,
	ShoppingCart,
	Store,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { discountLabel, minimumLabel, tierById, type DistributorTierId } from "@/lib/distributors/tiers";
import type { CategoryBadgeIcon } from "./wv-category-art";
import { CategoryBadgeImage } from "./wv-category-badge-image";
import { WvFooter, WvHeader } from "./wv-chrome";
import { DistributorApply, DistributorApplySkeleton } from "./wv-distributor-apply";
import { SectionHeading } from "./wv-product-section";
import { CardNewsletterForm } from "./wv-newsletter-client";
import "./wv-home.css";

/** Worldwide Vapor distributor page — Figma "6.11 - High Fidelity - Distributor" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

/** The wholesale range, as the home page's category badges, each opening that category in the shop. */
const CATEGORIES: { name: string; slug: string; badge: CategoryBadgeIcon }[] = [
	{ name: "Disposables", slug: "disposables", badge: "disposables" },
	{ name: "E-Liquids", slug: "ejuice", badge: "eliquid" },
	{ name: "Hardware", slug: "hardware", badge: "hardware" },
	{ name: "Coils", slug: "coils", badge: "coils" },
	{ name: "Accessories", slug: "accessories", badge: "accessories" },
	{ name: "New Arrivals", slug: "new-arrivals", badge: "new-arrivals" },
];

/**
 * The partnership levels, as live neon cards (they used to be one wide picture with the words baked in, which scrolled
 * sideways on phones and couldn't be read aloud). The Master Distributor is the featured card, raised over the podium
 * of the globe the cards stand on (tiers-stage.svg).
 */
const TIERS: {
	id: DistributorTierId;
	name: string;
	text: string;
	Icon: LucideIcon;
	tone: "cyan" | "pink" | "violet";
	featured?: boolean;
}[] = [
	{
		id: "small",
		name: "SMALL WHOLESALE",
		text: "An entry-level option for smaller or newer businesses that want to test demand before scaling.",
		Icon: ShoppingCart,
		tone: "cyan",
	},
	{
		id: "partner",
		name: "WHOLESALE PARTNER",
		text: "A licensed retailer or business purchasing inventory directly for resale to its own customers.",
		Icon: Store,
		tone: "pink",
	},
	{
		id: "master",
		name: "MASTER DISTRIBUTOR",
		text: "Our highest-level partner. Manages major-volume purchasing and supplies regional distributors and wholesale accounts.",
		Icon: Crown,
		tone: "pink",
		featured: true,
	},
	{
		id: "regional",
		name: "REGIONAL DISTRIBUTOR",
		text: "Serves an assigned city, province or territory while supporting retailers and local product fulfillment.",
		Icon: Globe,
		tone: "cyan",
	},
	{
		id: "authorized",
		name: "AUTHORIZED DISTRIBUTOR",
		text: "An approved, non-exclusive partner that purchases wholesale inventory and supplies independent retail stores.",
		Icon: Handshake,
		tone: "violet",
	},
];

/** What a distributor needs, as a numbered checklist of neon cards joined by a glowing line. */
const REQUIREMENTS: { text: string; Icon: LucideIcon }[] = [
	{ text: "Valid Business License & Tobacco Permits", Icon: FileBadge },
	{ text: "Minimum Order Commitments (based on tier)", Icon: PackageCheck },
	{ text: "Territory & Exclusivity Agreements", Icon: MapPinned },
	{ text: "Age Verification Compliance (18+)", Icon: ShieldCheck },
	{ text: "Insurance & Liability Documentation", Icon: FileCheck },
];

/** What the "Stay connected" alerts cover, as neon chips. */
const ALERTS = ["EXCLUSIVE DEALS", "BULK STOCK", "HARDWARE DROPS"];

const FAQS = [
	{
		q: "How do I apply to become a distributor?",
		a: "Sign in to your business's Worldwide Vapor account and fill in the application below with your business licence and any tobacco or vapour permits. We verify every business by hand and set your tier, usually within 48 business hours.",
	},
	{
		q: "What are the minimum order quantities?",
		a: "Each tier has a minimum order, counted at list price: Small Wholesale $250, Wholesale Partner $500, Authorized Distributor $1,000, Regional Distributor $2,500 and Master Distributor $10,000. Below your minimum you can still order, at retail prices.",
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
		a: "Every tier takes a set discount off list price on every product: 5%, 10%, 15%, 20% and 25%, from Small Wholesale up to Master Distributor. Signed in, you see your wholesale price on each product, and checkout charges it automatically once your cart reaches your minimum. Sale prices still apply on top.",
	},
	{
		q: "What is the onboarding timeline?",
		a: "Onboarding takes 5–7 business days from license verification to first logistics delivery dispatch, depending on localized regulatory mandates.",
	},
];

const APPLY_HREF = "#apply";

export function WvDistributor() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero, lit like the other heroes (`.wv-hero-*`): the neon breadcrumb, a chrome eyebrow, a 3D title over a glowing
			    pink-to-cyan bar, brighter copy with its key phrases lit, the glossy button and the neon outline one; the art in the
			    heroes' lit neon frame (`.wv-art`, glass, HUD corners) with its "connected" status as a live neon pill; behind it
			    all a pink and cyan glow. */}
			<section className="wv-hero-backdrop relative flex flex-col gap-6 overflow-hidden px-4 pb-10 pt-6 md:gap-10 md:px-10 md:pb-14 md:pt-12 xl:flex-row-reverse xl:items-center xl:gap-10 xl:px-[100px] xl:py-20">
				<Image
					src="/home/distributor/dot.svg"
					alt=""
					width={600}
					height={600}
					aria-hidden
					className="pointer-events-none absolute -right-[200px] -top-[200px] hidden size-[600px] xl:block"
				/>
				<div className="wv-art relative h-[200px] w-full shrink-0 overflow-hidden rounded-[20px] md:h-[320px] xl:h-[400px] xl:w-[500px]">
					<Image
						src="/home/distributor/hero.svg"
						alt="A distribution warehouse with lit loading bays, a truck heading out, a pallet of product cases and e-liquid cartons, shipping containers, and a globe wrapped in glowing shipping routes"
						fill
						priority
						sizes="(min-width: 1280px) 500px, 100vw"
						className="object-cover"
					/>
					<span aria-hidden className="wv-art-glass absolute inset-0" />
					<span aria-hidden className="wv-art-hud absolute inset-[10px] md:inset-[14px]" />
					<span
						className={`${orbitron} wv-af-live-pill absolute left-6 top-6 flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1px] backdrop-blur-sm md:left-8 md:top-8`}
					>
						<span aria-hidden className="wv-af-live-dot size-2 rounded-full" />
						WV-SYS: CONNECTED
					</span>
				</div>
				<div className="relative flex min-w-0 flex-1 flex-col gap-5 xl:gap-6">
					<nav
						aria-label="Breadcrumb"
						className={`${heyComic} flex items-center gap-2 text-xs tracking-[0.5px]`}
					>
						<Link href="/home" className="wv-link wv-crumb-link">
							<Home aria-hidden className="size-3.5" strokeWidth={2.25} />
							Home
						</Link>
						<ChevronRight aria-hidden className="wv-crumb-sep size-3.5" strokeWidth={2.5} />
						<span aria-current="page" className="wv-crumb-current">
							Distributor
						</span>
					</nav>
					<p className={`${heyComic} wv-hero-tagline text-xs uppercase tracking-[2px] md:text-sm`}>
						Wholesale <span className="wv-hero-sep">&amp;</span> distribution network
					</p>
					<div className="flex flex-col gap-3">
						<h1 className={`${heyComic} wv-title-glow wv-hero-title leading-none`}>
							<span className="block text-[32px] tracking-[-0.5px] md:text-[40px] xl:text-[50px] xl:leading-[56px]">
								BECOME A <span className="text-[var(--wv-cyan-soft)]">WORLDWIDE VAPOR</span>
							</span>
							<span className="mt-3 block text-[30px] leading-tight tracking-[-0.3px] text-[var(--wv-pink)] md:text-[36px] xl:text-[46px] xl:leading-[52px]">
								DISTRIBUTOR
							</span>
						</h1>
						<span aria-hidden className="wv-hero-bar h-1 w-[120px] rounded-full xl:w-40" />
					</div>
					<p className={`${orbitron} wv-hero-copy text-sm leading-[1.7] xl:text-base xl:leading-[26px]`}>
						Join the <strong className="wv-hero-key">premier global vaping distribution network</strong>.
						Unlock direct access to high-capacity hardware, next-generation e-liquids, and{" "}
						<strong className="wv-hero-key wv-hero-key--pink">class-leading margins</strong> backed by{" "}
						<strong className="wv-hero-key">24/7 dedicated support</strong>.
					</p>
					<div className="flex flex-col gap-3 md:flex-row md:gap-4">
						<a
							href={APPLY_HREF}
							className={`${heyComic} wv-pc-cta flex h-[49px] items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-6 text-base tracking-[0.04em] text-[var(--wv-ink)] xl:px-8`}
						>
							<Handshake aria-hidden className="size-[18px]" strokeWidth={2.25} />
							<span className="wv-pc-cta-label">Apply Now</span>
						</a>
						<a
							href="#tiers"
							className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-[49px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-6 text-base tracking-[0.04em] text-[var(--wv-cyan-soft)] xl:px-8`}
						>
							<span className="wv-btn-label">Learn More</span>
							<ArrowDown aria-hidden className="size-4" strokeWidth={2.5} />
						</a>
					</div>
				</div>
			</section>

			{/* Categories: the home page's badges (production art that glows along its own outline and lifts under the
			    pointer, `.wv-badge`), each opening its category in the shop, under the shared neon heading, over the nebula. */}
			<section className="wv-nebula px-4 py-8 md:px-10 md:py-10 xl:px-[100px] xl:py-12">
				<SectionHeading
					eyebrow="Wholesale Catalog"
					title="PRODUCT CATEGORIES"
					size="small"
					bar="w-12 xl:w-[57px]"
				/>
				<ul className="mx-auto mt-6 grid max-w-[704px] grid-cols-3 gap-3 md:gap-5 xl:flex xl:max-w-[1040px] xl:justify-center xl:gap-10">
					{CATEGORIES.map((c) => (
						<li key={c.slug} className="xl:shrink-0">
							<Link
								href={`/shop?category=${encodeURIComponent(c.slug)}`}
								className="relative block aspect-[100/110] w-full md:aspect-square xl:h-[150px] xl:w-[140px]"
							>
								<CategoryBadgeImage
									icon={c.badge}
									sizes="(min-width: 1280px) 140px, (min-width: 768px) 230px, 33vw"
								/>
								<span className="sr-only">{c.name}</span>
							</Link>
						</li>
					))}
				</ul>
				<p
					className={`${orbitron} wv-hero-copy mx-auto mt-6 max-w-[560px] text-center text-xs leading-[1.7] md:text-sm`}
				>
					Every category is available at <strong className="wv-hero-key">wholesale pricing</strong>, with{" "}
					<strong className="wv-hero-key wv-hero-key--pink">volume tiers</strong> that deepen as your orders
					grow.
				</p>
			</section>

			{/* Tiers */}
			{/* Partnership tiers: live neon cards in their tier's colour, the Master Distributor featured and raised over the
			    podium of a glowing globe they stand on (tiers-stage.svg), under the shared neon heading. */}
			<section
				id="tiers"
				className="wv-faq-glow relative flex scroll-mt-6 flex-col items-center gap-8 overflow-hidden px-4 pb-28 pt-10 md:gap-10 md:px-10 md:pb-36 md:pt-12 xl:gap-12 xl:px-[100px] xl:pb-56 xl:pt-20"
			>
				<div className="flex flex-col items-center gap-4">
					<SectionHeading eyebrow="Distribution Partner Levels" title="PARTNERSHIP TIERS" />
					<p className={`${orbitron} wv-hero-copy max-w-[620px] text-center text-sm leading-[1.7]`}>
						Choose the partnership level that matches your{" "}
						<strong className="wv-hero-key">business reach</strong> and capabilities.
					</p>
				</div>
				<div className="relative w-full">
					<span
						aria-hidden
						className="wv-dist-stage pointer-events-none absolute left-1/2 top-full h-[210px] w-[800px] -translate-x-1/2 -translate-y-[55px] md:h-[315px] md:w-[1200px] md:-translate-y-[83px] xl:h-[420px] xl:w-[1600px] xl:-translate-y-[110px]"
					/>
					<ul className="relative grid w-full gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-5 xl:gap-5">
						{TIERS.map(({ id, name, text, Icon, tone, featured }) => (
							<li
								key={name}
								data-tone={tone}
								className={`wv-neon-card wv-dist-tier flex flex-col items-center gap-4 rounded-2xl p-6 text-center ${featured ? "wv-neon-card--featured md:col-span-2 xl:col-span-1 xl:-mt-8" : ""}`}
							>
								{featured && (
									<span
										className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-[3px] text-[10px] tracking-[1px]`}
									>
										TOP TIER
									</span>
								)}
								<span
									aria-hidden
									className={`wv-neon-card-icon flex items-center justify-center rounded-2xl ${featured ? "size-16" : "size-14"}`}
								>
									<Icon className={featured ? "size-8" : "size-7"} strokeWidth={2} />
								</span>
								<h3
									className={`${heyComic} wv-pc-name text-lg leading-tight xl:flex xl:min-h-[2.5em] xl:items-center`}
								>
									{name}
								</h3>
								<span aria-hidden className="wv-dist-rule h-0.5 w-10 rounded-full" />
								<p className={`${bungee} wv-dist-tier-terms flex flex-col items-center gap-0.5`}>
									<span className="wv-stat-value text-xl">{discountLabel(tierById(id))} OFF</span>
									<span className={`${orbitron} wv-neon-card-text text-[11px] tracking-[1px]`}>
										ON ORDERS OF {minimumLabel(tierById(id))}+
									</span>
								</p>
								<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>{text}</p>
							</li>
						))}
					</ul>
				</div>
				<p
					className={`${orbitron} relative flex items-center gap-2 text-center text-xs text-[var(--wv-text-dim)] xl:-mt-4`}
				>
					<ShieldCheck
						aria-hidden
						className="size-4 shrink-0 text-[var(--wv-cyan-soft)]"
						strokeWidth={2.25}
					/>
					Partnership approval and business verification required.
				</p>
			</section>

			{/* Requirements + newsletter. The requirements are a numbered checklist of neon cards (in turn cyan and pink, each
			    number glowing in its tile beside the item's icon) joined by a glowing line; "Stay connected" is the lit glass
			    newsletter card (`.wv-news-card`), as on the payments page, with chips for what the alerts cover. */}
			<section className="wv-dist-reqs-glow flex flex-col gap-8 px-4 py-10 md:px-10 md:py-16 xl:flex-row xl:gap-10 xl:px-[100px] xl:py-20">
				<div className="flex min-w-0 flex-1 flex-col gap-6">
					<div className="flex flex-col gap-3">
						<p className={`${heyComic} wv-hero-tagline text-xs uppercase tracking-[3px] md:text-sm`}>
							Logistics detail
						</p>
						<h2
							className={`${heyComic} wv-heading-title text-[24px] leading-tight text-white md:text-[28px] xl:text-[32px]`}
						>
							DISTRIBUTOR <span className="text-[var(--wv-cyan-soft)]">REQUIREMENTS</span>
						</h2>
						<span aria-hidden className="wv-hero-bar h-1 w-[100px] rounded-full xl:w-[120px]" />
					</div>
					<ol className="wv-dist-steps relative flex flex-col gap-3">
						{REQUIREMENTS.map(({ text, Icon }, i) => (
							<li
								key={text}
								className="wv-neon-card wv-dist-step relative flex items-center gap-4 rounded-2xl p-3 pr-4 md:p-4"
							>
								<span
									aria-hidden
									className={`${bungee} wv-neon-card-icon wv-dist-step-num relative z-10 flex size-11 shrink-0 items-center justify-center rounded-xl text-sm`}
								>
									{String(i + 1).padStart(2, "0")}
								</span>
								<span
									className={`${orbitron} min-w-0 flex-1 text-[13px] font-semibold text-white xl:text-sm`}
								>
									{text}
								</span>
								<Icon aria-hidden className="wv-dist-step-icon size-5 shrink-0" strokeWidth={2.25} />
							</li>
						))}
					</ol>
				</div>
				<div className="wv-news-card flex w-full shrink-0 flex-col gap-6 rounded-[20px] p-5 md:p-8 xl:w-[460px] xl:self-start">
					<div className="flex items-center gap-3">
						<span
							aria-hidden
							className="wv-acct-icon flex size-12 shrink-0 items-center justify-center rounded-xl"
						>
							<BellRing className="size-5" strokeWidth={2.25} />
						</span>
						<div className="flex flex-col gap-1">
							<p
								className={`${marker} wv-heading-eyebrow text-sm uppercase tracking-[1px] text-[var(--wv-pink)]`}
							>
								Connected core network
							</p>
							<h2 className={`${heyComic} wv-heading-title text-xl leading-tight text-white xl:text-2xl`}>
								STAY CONNECTED
							</h2>
						</div>
					</div>
					<p className={`${orbitron} wv-hero-copy text-[13px] leading-[1.6]`}>
						Get <strong className="wv-hero-key">instant alerts</strong> on exclusive deals, bulk stock
						availability and{" "}
						<strong className="wv-hero-key wv-hero-key--pink">quarterly hardware releases</strong>.
					</p>
					<ul className="flex flex-wrap gap-2">
						{ALERTS.map((a) => (
							<li
								key={a}
								className={`${orbitron} wv-af-chip rounded-full px-3 py-1 text-[10px] tracking-[1px]`}
							>
								{a}
							</li>
						))}
					</ul>
					<CardNewsletterForm />
				</div>
			</section>

			{/* Apply: who's looking decides what shows (sign in, the form, under review, or your tier); it reads the session, so
			    it renders inside Suspense and the rest of the page never waits for it. */}
			<section
				id="apply"
				className="wv-faq-glow flex scroll-mt-6 flex-col items-center gap-8 px-4 py-12 md:px-10 md:py-14 xl:px-[100px] xl:py-20"
			>
				<div className="flex flex-col items-center gap-4">
					<SectionHeading eyebrow="Join the network" title="APPLY TO DISTRIBUTE" />
					<p className={`${orbitron} wv-hero-copy max-w-[620px] text-center text-sm leading-[1.7]`}>
						Tell us about your business. We verify your licence by hand, set your tier, and your{" "}
						<strong className="wv-hero-key">wholesale prices</strong> switch on in your account.
					</p>
				</div>
				<div className="w-full max-w-[860px]">
					<Suspense fallback={<DistributorApplySkeleton />}>
						<DistributorApply />
					</Suspense>
				</div>
			</section>

			{/* FAQ: the glassy neon answer panels used on the rewards and shipping pages (`.wv-info-*`: pink while closed, cyan
			    once open, the +/- in a neon ring, the question lifted), in two columns on desktop, under the shared neon heading
			    and over a soft pink and cyan glow (`.wv-faq-glow`); the partnerships team as a glowing link at the end. */}
			<section
				id="faqs"
				className="wv-faq-glow flex scroll-mt-6 flex-col items-center gap-8 px-4 py-10 md:gap-10 md:px-10 md:py-16 xl:gap-12 xl:px-[100px] xl:py-20"
			>
				<SectionHeading eyebrow="Questions" title="DISTRIBUTOR FAQS" />
				<div className="grid w-full items-start gap-3 xl:grid-cols-2 xl:gap-4">
					{FAQS.map((f, i) => (
						<details key={f.q} open={i === 0} className="wv-info-item group rounded-xl p-4 md:p-5">
							<summary
								className={`${heyComic} wv-trust-title flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] [&::-webkit-details-marker]:hidden`}
							>
								{f.q}
								<span aria-hidden className="wv-info-toggle font-mono text-base">
									<span className="group-open:hidden">+</span>
									<span className="hidden group-open:inline">−</span>
								</span>
							</summary>
							<p className={`${orbitron} wv-trust-text wv-unfold mt-3 text-[13px] leading-[1.6]`}>{f.a}</p>
						</details>
					))}
				</div>
				<p
					className={`${orbitron} wv-hero-copy flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm`}
				>
					<span>Still have questions?</span>
					<Link
						href="mailto:support@worldwidevapor.com"
						className="wv-auth-link inline-flex items-center gap-1.5 underline"
					>
						<Mail aria-hidden className="size-4" strokeWidth={2.25} />
						Contact our partnerships team
					</Link>
				</p>
			</section>

			<div className="h-px w-full bg-[var(--wv-pink)]" />
			<WvFooter />
		</div>
	);
}
