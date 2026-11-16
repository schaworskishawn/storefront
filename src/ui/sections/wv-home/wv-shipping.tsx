import { Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WvFooter, WvHeader } from "./wv-chrome";
import { CardNewsletterForm } from "./wv-newsletter-client";
import "./wv-home.css";

/**
 * Worldwide Vapor shipping page — Figma "6.04 - High Fidelity - Shipping".
 * Responsive: mobile base (Figma 360), tablet from `md` (768), desktop from `xl` (1280+, Figma 1440).
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

/** A price or cut-off in an option's copy, lit in the card's colour (`.wv-neon-key`). */
function Key({ children }: { children: React.ReactNode }) {
	return <strong className="wv-neon-key">{children}</strong>;
}

const OPTIONS = [
	{
		icon: "📦",
		title: "Standard Shipping",
		timing: "3 - 5 Business Days",
		text: (
			<>
				Reliable delivery for everyday restocking. <Key>FREE</Key> on all orders over <Key>$115</Key>, or a
				low <Key>$4.99</Key> flat rate for smaller orders.
			</>
		),
		featured: false,
	},
	{
		icon: "⚡",
		title: "Express Shipping",
		timing: "1 - 2 Business Days",
		text: (
			<>
				Expedited priority handling. Slashed times to ensure your inventory stays stacked. Flat rate of{" "}
				<Key>$9.99</Key> for all orders.
			</>
		),
		featured: true,
	},
	{
		icon: "🚀",
		title: "Overnight Delivery",
		timing: "Next Business Day",
		text: (
			<>
				Order by <Key>2PM EST</Key> for same-day dispatch. Next-day arrival guaranteed for urgent bulk
				shipments. Flat rate of <Key>$24.99</Key>.
			</>
		),
		featured: false,
	},
];

const PERKS = [
	{ icon: "🔒", title: "Discreet Packaging", text: "No brand identifiers on outer boxes." },
	{ icon: "📡", title: "Order Tracking", text: "Track real-time courier progress via SMS." },
	{ icon: "🌐", title: "Worldwide Shipping", text: "Full compliance with custom clearances." },
	{ icon: "🛡️", title: "Secured Delivery", text: "Transit insurance options at checkout." },
];

const INFO = [
	{
		q: "Processing Times & Order Cut-offs",
		a: (
			<>
				Orders received before <strong className="wv-hero-key">2PM EST</strong> Monday through Friday are
				processed and handed over to our verified carriers on the{" "}
				<strong className="wv-hero-key wv-hero-key--pink">same business day</strong>. Delivery tracking
				triggers automatically.
			</>
		),
	},
	{ q: "Address Limitations & PO Boxes" },
	{ q: "International Customs & Compliance" },
	{ q: "Damaged, Stolen or Lost Packages" },
];

const PENDING_ANSWER =
	"Details for this answer are coming soon. Contact support@worldwidevapor.com in the meantime.";

// Each answer's key phrase is lit (`.wv-hero-key`, cyan or pink), as in the shipping information above.
const FAQS = [
	{
		q: "How long does standard shipping take?",
		a: (
			<>
				Standard shipping takes <strong className="wv-hero-key">3-5 business days</strong> once processed by
				our fulfillment center.
			</>
		),
	},
	{
		q: "What happens if my package is delayed?",
		a: (
			<>
				Please contact our customer support with your <strong className="wv-hero-key">tracking number</strong>
				, and we will immediately{" "}
				<strong className="wv-hero-key wv-hero-key--pink">open a trace with the carrier</strong>.
			</>
		),
	},
	{
		q: "Can I track my order?",
		a: (
			<>
				Yes, you will receive a <strong className="wv-hero-key">tracking link</strong> via email as soon as
				your order ships from our warehouse.
			</>
		),
	},
	{
		q: "Will my package be discreet?",
		a: (
			<>
				Absolutely. All packages ship in plain brown boxes or envelopes with{" "}
				<strong className="wv-hero-key wv-hero-key--pink">completely neutral labeling</strong>.
			</>
		),
	},
	{
		q: "Do you ship internationally?",
		a: (
			<>
				Yes, we ship to <strong className="wv-hero-key">most major global destinations</strong> subject to
				local custom import regulations.
			</>
		),
	},
	{
		q: "Who pays for custom duties or import taxes?",
		a: (
			<>
				The <strong className="wv-hero-key wv-hero-key--pink">recipient</strong> is responsible for all local
				import charges and VAT duties assessed by customs.
			</>
		),
	},
];

function Divider() {
	return (
		<div className="wv-glow-line mx-auto !h-[2px] w-[calc(100%-40px)] max-w-[1280px] md:w-[calc(100%-80px)]" />
	);
}

function Heading({
	eyebrow,
	title,
	bar = "w-[60px]",
}: {
	eyebrow: React.ReactNode;
	title: string;
	bar?: string;
}) {
	// Solid 3D lettering, as on the site's other section headings (SectionHeading): a shaded pink eyebrow (its cyan word
	// stays solid cyan), a chrome title with an edge beneath, and a glowing bar (`.wv-heading-*` in wv-home.css).
	return (
		<div className="flex flex-col items-center gap-2 text-center">
			<p
				className={`${marker} wv-heading-eyebrow text-lg uppercase tracking-[2px] text-[var(--wv-pink)] md:text-xl xl:text-2xl`}
			>
				{eyebrow}
			</p>
			<h2
				className={`${bungee} wv-heading-title text-[22px] tracking-[1px] text-white md:text-[26px] xl:text-[32px]`}
			>
				{title}
			</h2>
			<div className={`wv-bar wv-heading-bar h-[3px] rounded-full bg-[var(--wv-cyan-soft)] ${bar}`} />
		</div>
	);
}

export function WvShipping() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			{/* The hero's text has depth, as on the home hero (`.wv-hero-*`): a neon badge with a glowing truck, a 3D title
			    over a glowing pink-to-cyan bar, brighter copy with its key phrases lit, and the neon outline button; behind
			    it a pink and cyan glow (`.wv-hero-backdrop`, `.wv-hero-badge` and `.wv-hero-bar` in wv-home.css). */}
			<section className="wv-hero-backdrop relative overflow-hidden">
				<span className="absolute left-[120px] top-[90px] hidden size-[5px] rounded-full bg-[var(--wv-cyan-soft)] xl:block" />
				<span className="absolute left-[450px] top-[320px] hidden size-[3px] rounded-full bg-[var(--wv-pink)] xl:block" />
				<span className="absolute left-[600px] top-20 hidden size-1 rounded-full bg-[var(--wv-cyan-soft)] xl:block" />
				<div className="relative flex flex-col gap-6 px-5 py-8 md:gap-6 md:px-10 md:py-10 xl:flex-row xl:items-center xl:gap-12 xl:px-20 xl:py-12">
					<div className="flex min-w-0 flex-1 flex-col items-start gap-4 xl:gap-6">
						<span
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<Truck aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
							<span className="md:hidden">DISPATCHED IN 24H</span>
							<span className="hidden md:inline">DISCREET &amp; DISPATCHED WITHIN 24 HOURS</span>
						</span>
						<div className="flex w-full flex-col gap-3">
							<h1
								className={`${heyComic} wv-title-glow wv-hero-title text-[30px] leading-[34px] md:text-[44px] md:leading-[44px] xl:text-[54px] xl:leading-[60px]`}
							>
								<span>FAST &amp; RELIABLE</span> <span className="text-[var(--wv-cyan-soft)]">SHIPPING</span>
							</h1>
							<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
						</div>
						<p className={`${orbitron} wv-hero-copy max-w-[692px] text-sm leading-[1.6] xl:text-base`}>
							We deliver your favorite vaping products{" "}
							<strong className="wv-hero-key">safely, swiftly, and discreetly</strong> right to your doorstep.
							Explore our <strong className="wv-hero-key wv-hero-key--pink">flexible delivery speeds</strong>{" "}
							and <strong className="wv-hero-key">reliable carriers</strong>.
						</p>
						<Link
							href="#faqs"
							className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-[41px] w-full items-center justify-center rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)] md:h-9 md:w-auto xl:h-[49px]`}
						>
							<span className="wv-btn-label">View Shipping FAQs</span>
						</Link>
					</div>
					{/* The art as a lit neon screen, like the page's other neon pieces: a cyan-to-pink edge that glows, its
					    colours lifted, glass over it (a sheen, an inner glow, edges falling into the page) and HUD corner
					    brackets. On the wide tablet crop it sits a little low so the whole parcel stays in view. */}
					<div className="wv-ship-art relative aspect-[320/200] w-full shrink-0 overflow-hidden rounded-[20px] md:aspect-[688/320] xl:aspect-auto xl:h-[444px] xl:w-[540px]">
						<Image
							src="/home/imgShippingHero.png"
							alt="Shipping box orbited by a glowing network"
							fill
							sizes="(min-width: 1280px) 540px, 100vw"
							className="wv-ship-art-img object-cover object-[50%_62%]"
							priority
						/>
						<span aria-hidden className="wv-ship-art-glass absolute inset-0" />
						<span aria-hidden className="wv-ship-art-hud absolute inset-[10px] md:inset-[14px]" />
					</div>
				</div>
			</section>
			<Divider />

			{/* Shipping options */}
			<section className="flex flex-col items-center gap-8 px-5 py-12 md:px-10 md:py-16 xl:gap-12 xl:p-20">
				<Heading
					eyebrow={
						<>
							WORLDWIDE <span className="text-[var(--wv-cyan)]">VAPOR</span>
						</>
					}
					title="SHIPPING OPTIONS"
					bar="w-20"
				/>
				<div className="grid w-full max-w-[1280px] grid-cols-1 gap-4 md:gap-5 xl:grid-cols-3 xl:gap-6">
					{/* Each option is a glassy neon card in its own colour (cyan, or pink for the popular one): a glowing
					    gradient edge, a lit icon tile, a glowing pill on the popular one, lifted lettering and its prices
					    lit; under the pointer it lifts and glows brighter (`.wv-neon-card*` in wv-home.css). */}
					{OPTIONS.map((o) => (
						<article
							key={o.title}
							className={`wv-neon-card ${o.featured ? "wv-neon-card--featured" : ""} flex flex-col gap-4 rounded-2xl p-5 md:flex-row md:items-start md:gap-5 md:p-6 xl:flex-col xl:p-7`}
						>
							<div className="flex items-center justify-between md:block xl:flex">
								<span
									aria-hidden
									className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl text-[22px]"
								>
									{o.icon}
								</span>
								{o.featured && (
									<span className="wv-ship-popular rounded-full px-[10px] py-1 font-sans text-[9px] font-extrabold md:hidden xl:inline">
										POPULAR
									</span>
								)}
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-4 xl:gap-4">
								<div className="flex flex-col gap-[6px]">
									<div className="flex items-start justify-between gap-3">
										<h3 className={`${heyComic} wv-pc-name text-lg`}>{o.title}</h3>
										{o.featured && (
											<span className="wv-ship-popular hidden shrink-0 rounded-full px-[10px] py-1 font-sans text-[9px] font-extrabold md:inline xl:hidden">
												POPULAR
											</span>
										)}
									</div>
									<p className={`${bungee} wv-neon-card-timing text-sm`}>{o.timing}</p>
								</div>
								<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.5]`}>{o.text}</p>
							</div>
						</article>
					))}
				</div>
			</section>
			<Divider />

			{/* Perks: a lit glass band (`.wv-band*` in wv-home.css) with a chrome title between neon dashes, and the items
			    styled like the home page's trust strip (`.wv-trust-*`): each icon in a glowing neon ring, alternating cyan
			    and pink, its title lifted and its text brighter. */}
			<section className="wv-band flex flex-col items-center gap-5 px-5 py-8 md:gap-6 md:px-10 xl:px-20 xl:py-10">
				<p className="flex items-center gap-3 text-center">
					<span aria-hidden className="wv-band-dash hidden md:block" />
					<span className={`${heyComic} wv-hero-tagline text-xs uppercase tracking-[2px] md:text-sm`}>
						EXPERIENCE PREMIUM WORLDWIDE LOGISTICS
					</span>
					<span aria-hidden className="wv-band-dash wv-band-dash--end hidden md:block" />
				</p>
				<div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-4 md:gap-y-4 xl:flex xl:flex-wrap xl:justify-center xl:gap-6">
					{PERKS.map((p) => (
						<div key={p.title} className="wv-trust-item flex items-center gap-4 xl:w-[280px]">
							<span aria-hidden className="wv-trust-icon text-xl md:text-2xl">
								{p.icon}
							</span>
							<div className="flex min-w-0 flex-1 flex-col gap-[2px]">
								<p className={`${heyComic} wv-trust-title text-sm`}>{p.title}</p>
								<p className={`${orbitron} wv-trust-text text-[11px]`}>{p.text}</p>
							</div>
						</div>
					))}
				</div>
			</section>
			<Divider />

			{/* Info + newsletter. The heading is solid 3D lettering over a glowing bar, like the site's other section
			    headings (`.wv-heading-*`); each answer is a glassy neon panel, pink while closed and glowing cyan when open,
			    with its +/− in a neon ring and its title lifted; the newsletter is a lit glass card with a glowing input and
			    a glossy button (`.wv-info-*` and `.wv-news-card` in wv-home.css). */}
			<section className="flex flex-col gap-8 px-5 py-8 md:px-10 md:py-10 xl:flex-row xl:items-start xl:gap-12 xl:p-20">
				<div className="flex min-w-0 flex-1 flex-col gap-4 xl:gap-6">
					<div className="flex flex-col gap-2">
						<p className={`${marker} wv-heading-eyebrow text-lg text-[var(--wv-pink)] md:text-xl`}>
							LOGISTICS DETAIL
						</p>
						<h2 className={`${bungee} wv-heading-title text-2xl text-white md:text-[28px] xl:text-[32px]`}>
							SHIPPING INFORMATION
						</h2>
						<div className="wv-heading-bar mt-1 h-[3px] w-20 rounded-full bg-[var(--wv-cyan-soft)]" />
					</div>
					<div className="flex flex-col gap-3 xl:gap-4">
						{INFO.map((f, i) => (
							<details key={f.q} open={i === 0} className="wv-info-item group rounded-xl p-4">
								<summary
									className={`${heyComic} wv-trust-title flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] [&::-webkit-details-marker]:hidden`}
								>
									{f.q}
									<span aria-hidden className="wv-info-toggle font-mono text-base">
										<span className="group-open:hidden">+</span>
										<span className="hidden group-open:inline">−</span>
									</span>
								</summary>
								<p className={`${orbitron} wv-trust-text mt-3 text-[13px] leading-[1.5]`}>
									{f.a ?? PENDING_ANSWER}
								</p>
							</details>
						))}
					</div>
				</div>
				<div className="wv-news-card flex w-full shrink-0 flex-col gap-6 rounded-[20px] p-6 md:gap-8 md:p-10 xl:w-[480px]">
					<div className="flex flex-col gap-3">
						<p
							className={`${marker} wv-heading-eyebrow text-sm uppercase tracking-[1px] text-[var(--wv-pink)] md:text-base xl:text-lg`}
						>
							EXCLUSIVE DEALS &amp; NEW ARRIVALS
						</p>
						<h2
							className={`${heyComic} wv-heading-title text-xl leading-tight text-white md:text-2xl xl:text-[28px] xl:leading-[34px]`}
						>
							STAY CONNECTED
						</h2>
						<p className={`${orbitron} wv-hero-copy text-[13px] leading-[1.5]`}>
							Register your warehouse directly and secure alerts on fresh tier discounts, regulatory
							announcements, and active inventory.
						</p>
					</div>
					<CardNewsletterForm />
				</div>
			</section>
			<Divider />

			{/* FAQ: the same glassy neon answer panels as the shipping information (`.wv-info-*`: cyan while open, pink
			    once closed, the +/− in a neon ring, the title lifted), over a soft pink and cyan glow (`.wv-faq-glow`). */}
			<section
				id="faqs"
				className="wv-faq-glow flex flex-col items-center gap-8 px-5 py-12 md:px-16 md:py-16 xl:gap-12 xl:p-20"
			>
				<Heading eyebrow="QUESTIONS" title="SHIPPING FAQS" />
				<div className="grid w-full max-w-[1280px] grid-cols-1 gap-3 md:gap-4 xl:grid-cols-2 xl:gap-x-5">
					{FAQS.map((f) => (
						<details key={f.q} open className="wv-info-item group h-fit rounded-xl p-4 md:p-5">
							<summary
								className={`${heyComic} wv-trust-title flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] [&::-webkit-details-marker]:hidden`}
							>
								{f.q}
								<span aria-hidden className="wv-info-toggle font-mono text-base">
									<span className="group-open:hidden">+</span>
									<span className="hidden group-open:inline">−</span>
								</span>
							</summary>
							<p className={`${orbitron} wv-trust-text mt-[10px] text-[13px] leading-[1.5]`}>{f.a}</p>
						</details>
					))}
				</div>
			</section>
			<Divider />

			<WvFooter />
		</div>
	);
}
