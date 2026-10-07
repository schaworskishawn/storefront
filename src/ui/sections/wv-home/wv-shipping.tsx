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

const OPTIONS = [
	{
		icon: "📦",
		title: "Standard Shipping",
		timing: "3 - 5 Business Days",
		text: "Reliable delivery for everyday restocking. FREE on all orders over $115, or a low $4.99 flat rate for smaller orders.",
		featured: false,
	},
	{
		icon: "⚡",
		title: "Express Shipping",
		timing: "1 - 2 Business Days",
		text: "Expedited priority handling. Slashed times to ensure your inventory stays stacked. Flat rate of $9.99 for all orders.",
		featured: true,
	},
	{
		icon: "🚀",
		title: "Overnight Delivery",
		timing: "Next Business Day",
		text: "Order by 2PM EST for same-day dispatch. Next-day arrival guaranteed for urgent bulk shipments. Flat rate of $24.99.",
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
		a: "Orders received before 2PM EST Monday through Friday are processed and handed over to our verified carriers on the same business day. Delivery tracking triggers automatically.",
	},
	{ q: "Address Limitations & PO Boxes" },
	{ q: "International Customs & Compliance" },
	{ q: "Damaged, Stolen or Lost Packages" },
];

const PENDING_ANSWER =
	"Details for this answer are coming soon. Contact support@worldwidevapor.com in the meantime.";

const FAQS = [
	{
		q: "How long does standard shipping take?",
		a: "Standard shipping takes 3-5 business days once processed by our fulfillment center.",
	},
	{
		q: "What happens if my package is delayed?",
		a: "Please contact our customer support with your tracking number, and we will immediately open a trace with the carrier.",
	},
	{
		q: "Can I track my order?",
		a: "Yes, you will receive a tracking link via email as soon as your order ships from our warehouse.",
	},
	{
		q: "Will my package be discreet?",
		a: "Absolutely. All packages ship in plain brown boxes or envelopes with completely neutral labeling.",
	},
	{
		q: "Do you ship internationally?",
		a: "Yes, we ship to most major global destinations subject to local custom import regulations.",
	},
	{
		q: "Who pays for custom duties or import taxes?",
		a: "The recipient is responsible for all local import charges and VAT duties assessed by customs.",
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
	return (
		<div className="flex flex-col items-center gap-2 text-center">
			<p
				className={`${marker} text-lg uppercase tracking-[2px] text-[var(--wv-pink)] md:text-xl xl:text-2xl`}
			>
				{eyebrow}
			</p>
			<h2 className={`${bungee} text-[22px] tracking-[1px] md:text-[26px] xl:text-[32px]`}>{title}</h2>
			<div className={`wv-bar h-[3px] rounded-full bg-[var(--wv-cyan-soft)] ${bar}`} />
		</div>
	);
}

export function WvShipping() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			<section className="relative overflow-hidden">
				<span className="absolute left-[120px] top-[90px] hidden size-[5px] rounded-full bg-[var(--wv-cyan-soft)] xl:block" />
				<span className="absolute left-[450px] top-[320px] hidden size-[3px] rounded-full bg-[var(--wv-pink)] xl:block" />
				<span className="absolute left-[600px] top-20 hidden size-1 rounded-full bg-[var(--wv-cyan-soft)] xl:block" />
				<div className="relative flex flex-col gap-6 px-5 py-8 md:gap-6 md:px-10 md:py-10 xl:flex-row xl:items-center xl:gap-12 xl:px-20 xl:py-12">
					<div className="flex min-w-0 flex-1 flex-col items-start gap-4 xl:gap-6">
						<span
							className={`${heyComic} rounded-full border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] px-3 py-1 text-[10px] tracking-[1.5px] text-[var(--wv-cyan-soft)] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<span className="md:hidden">DISPATCHED IN 24H</span>
							<span className="hidden md:inline">DISCREET &amp; DISPATCHED WITHIN 24 HOURS</span>
						</span>
						<div className="flex w-full flex-col gap-3">
							<h1
								className={`${heyComic} text-[30px] leading-[34px] md:text-[44px] md:leading-[44px] xl:text-[54px] xl:leading-[60px]`}
							>
								FAST &amp; RELIABLE SHIPPING
							</h1>
							<div className="h-1 w-20 rounded-full bg-[var(--wv-pink)] md:w-[120px]" />
						</div>
						<p
							className={`${orbitron} max-w-[692px] text-sm leading-[1.6] text-[var(--wv-text-dim)] xl:text-base`}
						>
							We deliver your favorite vaping products safely, swiftly, and discreetly right to your doorstep.
							Explore our flexible delivery speeds and reliable carriers.
						</p>
						<Link
							href="#faqs"
							className={`${heyComic} flex h-[41px] w-full items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)] md:h-9 md:w-auto xl:h-[49px]`}
						>
							View Shipping FAQs
						</Link>
					</div>
					<div className="relative aspect-[320/200] w-full shrink-0 overflow-hidden rounded-[20px] shadow-[0_0_32px_4px_rgba(0,229,255,0.12)] md:aspect-[688/320] xl:aspect-auto xl:h-[444px] xl:w-[540px]">
						<Image
							src="/home/imgShippingHero.png"
							alt="Shipping box orbited by a glowing network"
							fill
							sizes="(min-width: 1280px) 540px, 100vw"
							className="object-cover"
							priority
						/>
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
					{OPTIONS.map((o) => (
						<article
							key={o.title}
							className={`flex flex-col gap-4 rounded-2xl border bg-[var(--wv-ink)] p-5 md:flex-row md:items-start md:gap-5 md:p-6 xl:flex-col xl:p-7 ${
								o.featured
									? "border-[var(--wv-pink)] shadow-[0_8px_8px_rgba(241,121,251,0.08)]"
									: "border-[var(--wv-purple)] shadow-[0_8px_8px_rgba(0,0,0,0.53)]"
							}`}
						>
							<div className="flex items-center justify-between md:block xl:flex">
								<span
									className={`flex size-11 shrink-0 items-center justify-center rounded-xl border bg-[var(--wv-bg)] text-[22px] ${
										o.featured ? "border-[var(--wv-pink)]" : "border-[var(--wv-cyan-soft)]"
									}`}
								>
									{o.icon}
								</span>
								{o.featured && (
									<span className="rounded-full border border-[var(--wv-pink)] bg-[var(--wv-control)] px-[10px] py-1 font-sans text-[9px] font-extrabold text-[var(--wv-pink)] md:hidden xl:inline">
										POPULAR
									</span>
								)}
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-4 xl:gap-4">
								<div className="flex flex-col gap-[6px]">
									<div className="flex items-start justify-between gap-3">
										<h3 className={`${heyComic} text-lg`}>{o.title}</h3>
										{o.featured && (
											<span className="hidden shrink-0 rounded-full border border-[var(--wv-pink)] bg-[var(--wv-control)] px-[10px] py-1 font-sans text-[9px] font-extrabold text-[var(--wv-pink)] md:inline xl:hidden">
												POPULAR
											</span>
										)}
									</div>
									<p
										className={`${bungee} text-sm ${o.featured ? "text-[var(--wv-pink)]" : "text-[var(--wv-cyan-soft)]"}`}
									>
										{o.timing}
									</p>
								</div>
								<p className={`${orbitron} text-[13px] leading-[1.5] text-[var(--wv-muted)]`}>{o.text}</p>
							</div>
						</article>
					))}
				</div>
			</section>
			<Divider />

			{/* Perks */}
			<section className="flex flex-col items-center gap-5 border-y border-[var(--wv-cyan-soft)] bg-[var(--wv-ink)] px-5 py-8 md:gap-6 md:px-10 xl:px-20 xl:py-10">
				<p
					className={`${heyComic} text-center text-xs uppercase tracking-[2px] text-[var(--wv-text-dim)] md:text-sm`}
				>
					EXPERIENCE PREMIUM WORLDWIDE LOGISTICS
				</p>
				<div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-4 md:gap-y-4 xl:flex xl:flex-wrap xl:justify-center xl:gap-6">
					{PERKS.map((p) => (
						<div key={p.title} className="flex items-center gap-4 xl:w-[280px]">
							<span className="text-2xl md:text-[32px]">{p.icon}</span>
							<div className="flex min-w-0 flex-1 flex-col gap-[2px]">
								<p className={`${heyComic} text-sm`}>{p.title}</p>
								<p className={`${orbitron} text-[11px] text-[var(--wv-text-dim)]`}>{p.text}</p>
							</div>
						</div>
					))}
				</div>
			</section>
			<Divider />

			{/* Info + newsletter */}
			<section className="flex flex-col gap-8 px-5 py-8 md:px-10 md:py-10 xl:flex-row xl:items-start xl:gap-12 xl:p-20">
				<div className="flex min-w-0 flex-1 flex-col gap-4 xl:gap-6">
					<div className="flex flex-col gap-2">
						<p className={`${marker} text-lg text-[var(--wv-pink)] md:text-xl`}>LOGISTICS DETAIL</p>
						<h2 className={`${bungee} text-2xl md:text-[28px] xl:text-[32px]`}>SHIPPING INFORMATION</h2>
					</div>
					<div className="flex flex-col gap-3 xl:gap-4">
						{INFO.map((f, i) => (
							<details
								key={f.q}
								open={i === 0}
								className="group rounded-xl border border-[var(--wv-pink)] bg-[var(--wv-control)] p-4 open:border-[var(--wv-cyan-soft)]"
							>
								<summary
									className={`${heyComic} flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] [&::-webkit-details-marker]:hidden`}
								>
									{f.q}
									<span
										aria-hidden
										className="font-mono text-base text-[var(--wv-pink)] group-open:text-[var(--wv-cyan-soft)]"
									>
										<span className="group-open:hidden">+</span>
										<span className="hidden group-open:inline">−</span>
									</span>
								</summary>
								<p className={`${orbitron} mt-3 text-[13px] leading-[1.5] text-[var(--wv-text-dim)]`}>
									{f.a ?? PENDING_ANSWER}
								</p>
							</details>
						))}
					</div>
				</div>
				<div className="flex w-full shrink-0 flex-col gap-6 rounded-[20px] border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-6 shadow-[0_0_12px_rgba(241,121,251,0.06)] md:gap-8 md:p-10 xl:w-[480px]">
					<div className="flex flex-col gap-3">
						<p
							className={`${marker} text-sm uppercase tracking-[1px] text-[var(--wv-pink)] md:text-base xl:text-lg`}
						>
							EXCLUSIVE DEALS &amp; NEW ARRIVALS
						</p>
						<h2 className={`${heyComic} text-xl leading-tight md:text-2xl xl:text-[28px] xl:leading-[34px]`}>
							STAY CONNECTED
						</h2>
						<p className={`${orbitron} text-[13px] leading-[1.5] text-[var(--wv-text-dim)]`}>
							Register your warehouse directly and secure alerts on fresh tier discounts, regulatory
							announcements, and active inventory.
						</p>
					</div>
					<CardNewsletterForm />
				</div>
			</section>
			<Divider />

			{/* FAQ */}
			<section
				id="faqs"
				className="flex flex-col items-center gap-8 px-5 py-12 md:px-16 md:py-16 xl:gap-12 xl:p-20"
			>
				<Heading eyebrow="QUESTIONS" title="SHIPPING FAQS" />
				<div className="grid w-full max-w-[1280px] grid-cols-1 gap-3 md:gap-4 xl:grid-cols-2 xl:gap-x-5">
					{FAQS.map((f) => (
						<details
							key={f.q}
							open
							className="group h-fit rounded-xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-4 md:p-5"
						>
							<summary
								className={`${heyComic} flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] [&::-webkit-details-marker]:hidden`}
							>
								{f.q}
								<span aria-hidden className="font-mono text-base text-[var(--wv-cyan-soft)]">
									<span className="group-open:hidden">+</span>
									<span className="hidden group-open:inline">−</span>
								</span>
							</summary>
							<p className={`${orbitron} mt-[10px] text-[13px] leading-[1.5] text-[var(--wv-text-dim)]`}>
								{f.a}
							</p>
						</details>
					))}
				</div>
			</section>
			<Divider />

			<WvFooter />
		</div>
	);
}
