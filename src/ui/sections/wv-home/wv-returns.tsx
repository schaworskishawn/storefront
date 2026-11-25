import {
	BadgeCheck,
	CalendarDays,
	Headset,
	Lock,
	PackageSearch,
	RotateCcw,
	ShieldCheck,
	Truck,
	Undo2,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { whatsappHref } from "@/lib/whatsapp";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor returns page — Figma "6.12 - High Fidelity - Returns" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";
const START_HREF = `mailto:${SUPPORT}?subject=Start%20a%20return&body=Order%20number%3A%0AItem(s)%20to%20return%3A%0AReason%3A`;
const STATUS_HREF = `mailto:${SUPPORT}?subject=Return%20status&body=Order%20number%3A`;
const HELP_HREF = `mailto:${SUPPORT}?subject=Returns%20help`;

type BadgeData = { Icon: LucideIcon; title: string; text: string };

const TOP_BADGES: BadgeData[] = [
	{
		Icon: CalendarDays,
		title: "15-DAY RETURN WINDOW",
		text: "Returns accepted within 15 days of delivery date.",
	},
	{ Icon: ShieldCheck, title: "EASY & HASSLE-FREE", text: "Simple process with clear digital steps." },
	{ Icon: BadgeCheck, title: "QUALITY GUARANTEED", text: "Damaged or defective items are fully covered." },
];
const BOTTOM_BADGES: BadgeData[] = [
	{ Icon: Truck, title: "FAST SHIPPING", text: "Dispatched within 24 hours." },
	{ Icon: Lock, title: "SECURE PAYMENT", text: "100% SSL protected payments." },
	{ Icon: Headset, title: "EXPERT SUPPORT", text: "We are always here to help." },
];

const STEPS = [
	{ n: "01", title: "START RETURN", text: "Submit return request with your order details." },
	{ n: "02", title: "PACK YOUR ITEM", text: "Securely pack the items in original packaging." },
	{ n: "03", title: "SHIP YOUR RETURN", text: "Print the label and drop off at local carrier." },
	{ n: "04", title: "RECEIVE REFUND", text: "We process, inspect and credit your account." },
];

const FAQS = [
	{
		q: "HOW LONG DOES A REFUND TAKE TO PROCESS?",
		a: "Once your package is scanned at our facility, refunds are issued within 3-5 business days to your original payment method.",
	},
	{
		q: "ARE THERE FEES FOR RETURN SHIPPING?",
		a: "No hidden restocking fees. For standard returns within 15 days, we provide a prepaid label and deduct a flat $4.99 return postage fee.",
	},
	{
		q: "CAN I EXCHANGE AN ITEM INSTEAD OF A REFUND?",
		a: "Absolutely. Choose exchange when initiating your digital return to receive immediate store credit or reserve your replacement item.",
	},
	{
		q: "WHAT ITEMS ARE ELIGIBLE FOR RETURN?",
		a: "Unopened hardware, sealed coils, and unused accessories in original condition are fully eligible for return within 15 days.",
	},
];

const NOT_ELIGIBLE = [
	"E-liquids that have been opened or unsealed",
	"Disposable pods/devices once unboxed or unpackaged",
	"Clearance, final sale, or promotional mystery items",
];

/**
 * A badge in the page's two trust strips, lit like the home page's (`.wv-trust-*` in wv-home.css): items in turn cyan
 * and pink, each icon glowing in a neon ring of its colour, the title lifted and the line brighter.
 */
function Badge({ b }: { b: BadgeData }) {
	return (
		<li className="wv-trust-item flex items-center gap-4 p-2 md:p-3">
			<span aria-hidden className="wv-trust-icon text-[26px] xl:text-[30px]">
				<b.Icon
					className="size-[0.6em] text-[var(--accent)] drop-shadow-[0_0_4px_var(--accent)]"
					strokeWidth={2}
				/>
			</span>
			<span className="flex min-w-0 flex-col gap-1">
				<span className={`${heyComic} wv-trust-title text-[13px] md:text-sm`}>{b.title}</span>
				<span className={`${orbitron} wv-trust-text text-xs leading-[1.45] md:text-[13px]`}>{b.text}</span>
			</span>
		</li>
	);
}

// The hero's buttons: the site's glossy cyan button (`.wv-pc-cta`) and its neon outline one (`.wv-btn-neon`).
const primary = `${heyComic} wv-pc-cta flex h-[49px] items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-7 text-[13px] text-[var(--wv-ink)]`;
const secondary = `${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-[49px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-7 text-[13px] text-[var(--wv-cyan-soft)]`;

export function WvReturns() {
	const chat = whatsappHref("Hi Worldwide Vapor, I need help with a return.");
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--rt-bg)] text-white">
			<WvHeader />

			{/* Hero, in the neon style of the site's other heroes (`.wv-hero-*` in wv-home.css): a pink and cyan glow
			    behind it, the return window in a neon badge, a 3D two-tone title over a glowing pink-to-cyan bar, brighter
			    copy with its key phrases lit, a glossy cyan button and the neon outline one, and the art in a glowing frame
			    with glass and HUD corners (`.wv-art*`). */}
			<section className="wv-hero-backdrop flex flex-col gap-8 px-4 py-8 md:px-10 md:py-12 xl:flex-row-reverse xl:items-center xl:gap-20 xl:p-20">
				{/* 5:3 on phones, so the whole scene shows (the art is drawn 1200×720). */}
				<div className="wv-art relative aspect-[5/3] w-full shrink-0 overflow-hidden rounded-3xl md:aspect-auto md:h-[260px] xl:h-[400px] xl:w-[560px]">
					<Image
						src="/home/returns/hero.svg"
						alt="A parcel with a prepaid return label on a glowing conveyor inside a neon return loop, the four steps of a return on it (start a return, pack it, label and drop it off, get your refund), with a 15-day calendar and a shield with a tick either side"
						fill
						priority
						sizes="(min-width: 1280px) 560px, 100vw"
						className="object-cover"
					/>
					<span aria-hidden className="wv-art-glass absolute inset-0" />
					<span aria-hidden className="wv-art-hud absolute inset-[10px] md:inset-[14px]" />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-8">
					<div className="flex flex-col items-start gap-4 md:items-center md:text-center xl:items-start xl:text-left">
						<p
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<RotateCcw aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
							<span className="md:hidden">15-DAY RETURN WINDOW</span>
							<span className="hidden md:inline">15-DAY RETURN WINDOW · PREPAID LABEL</span>
						</p>
						<div className="flex w-full flex-col gap-3 md:items-center xl:items-start">
							<h1
								className={`${heyComic} wv-title-glow wv-hero-title text-[30px] leading-[1.1] md:text-[44px] xl:text-[56px]`}
							>
								<span>RETURNS &amp;</span> <span className="text-[var(--wv-pink)]">REFUNDS</span>
							</h1>
							<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
						</div>
					</div>
					<p
						className={`${orbitron} wv-hero-copy text-sm leading-[1.6] md:text-center md:text-base xl:text-left`}
					>
						We want you to be <strong className="wv-hero-key">100% satisfied</strong> with your purchase.{" "}
						{/* A string, not JSX text: the compiler drops a leading space from JSX text that has an apostrophe. */}
						{"If something isn't right, we are here to help you get it "}
						<strong className="wv-hero-key wv-hero-key--pink">sorted immediately</strong> with{" "}
						<strong className="wv-hero-key">zero stress</strong>.
					</p>
					<div className="flex flex-col gap-3 md:flex-row md:justify-center xl:justify-start xl:gap-4">
						<a href={START_HREF} className={`${primary} hidden md:flex`}>
							<Undo2 aria-hidden className="size-4" strokeWidth={2.5} />
							<span className="wv-pc-cta-label">START A RETURN</span>
						</a>
						<a href={STATUS_HREF} className={`${secondary} w-full md:w-auto`}>
							<PackageSearch aria-hidden className="size-4" strokeWidth={2.5} />
							<span className="wv-btn-label">VIEW STATUS</span>
						</a>
					</div>
				</div>
			</section>

			{/* Top badges: a lit glass band (`.wv-band`, neon edges top and bottom), as on the home page */}
			<ul className="wv-band grid gap-4 px-4 py-8 md:grid-cols-3 md:gap-4 md:px-10 xl:gap-10 xl:px-20">
				{TOP_BADGES.map((b) => (
					<Badge key={b.title} b={b} />
				))}
			</ul>

			{/* How it works */}
			<section className="flex flex-col items-center gap-8 px-4 py-12 md:px-10 md:py-16 xl:gap-14 xl:px-20 xl:py-24">
				<div className="flex flex-col items-center gap-3 text-center xl:gap-4">
					<p className={`${bungee} text-xs text-[var(--rt-magenta)]`}>WORLDWIDE VAPOR</p>
					<h2 className={`${heyComic} text-2xl md:text-3xl xl:text-4xl`}>HOW RETURNS WORK</h2>
				</div>
				<ol className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
					{STEPS.map((s) => (
						<li
							key={s.n}
							className="border-[var(--rt-cyan)]/20 flex flex-col gap-5 rounded-xl border bg-[var(--rt-card)] p-6 shadow-[inset_0_1px_8px_rgba(0,255,224,0.06)]"
						>
							<div className="flex items-center justify-between">
								<span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-r from-[var(--rt-magenta)] to-[var(--rt-purple)] text-sm font-extrabold">
									{s.n}
								</span>
								<span aria-hidden className="bg-[var(--rt-cyan)]/25 h-px w-10" />
							</div>
							<div className="flex flex-col gap-2">
								<h3 className={`${heyComic} text-sm`}>{s.title}</h3>
								<p className={`${orbitron} text-[13px] leading-[1.5] text-[var(--rt-text)]`}>{s.text}</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* FAQ + eligibility */}
			<section className="flex flex-col gap-10 border-y border-[var(--rt-border)] bg-[var(--rt-band)] px-4 py-12 md:px-10 md:py-16 xl:flex-row xl:gap-20 xl:p-20">
				<div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-8">
					<h2 className="font-[family-name:var(--font-bungee)] text-xl md:text-2xl">RETURN POLICY FAQ</h2>
					<div className="flex flex-col gap-4">
						{FAQS.map((f, i) => (
							<details
								key={f.q}
								open={i === 0}
								className="group rounded-lg border border-[var(--rt-border)] bg-[var(--rt-card)] p-5"
							>
								<summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
									<span className={`${heyComic} text-xs`}>{f.q}</span>
									<Image
										src="/home/returns/chevron.svg"
										alt=""
										width={16}
										height={16}
										className="shrink-0 transition-transform group-open:rotate-180"
									/>
								</summary>
								<p className={`${orbitron} mt-3 text-sm leading-[1.5] text-[var(--rt-text)]`}>{f.a}</p>
							</details>
						))}
					</div>
				</div>
				<aside
					className="border-[var(--rt-magenta)]/20 flex flex-col gap-8 rounded-2xl border-[1.5px] bg-[var(--rt-card)] p-6 shadow-[0_0_8px_rgba(255,0,160,0.07)] md:p-10 xl:flex-1 xl:self-start"
					aria-labelledby="not-eligible"
				>
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-[10px]">
							<Image src="/home/returns/alert.svg" alt="" width={20} height={20} />
							<h2 id="not-eligible" className={`${bungee} text-base`}>
								NOT ELIGIBLE FOR RETURN
							</h2>
						</div>
						<hr className="border-[var(--rt-magenta)]/20" />
					</div>
					<ul className="flex flex-col gap-5">
						{NOT_ELIGIBLE.map((t) => (
							<li
								key={t}
								className={`${orbitron} flex items-center gap-3 text-sm leading-[1.4] text-[var(--rt-text)]`}
							>
								<span aria-hidden className="size-[6px] shrink-0 rounded-[3px] bg-[var(--rt-magenta)]" />
								{t}
							</li>
						))}
					</ul>
					<p className={`${heyComic} text-xs leading-[1.5] text-[var(--rt-muted)]`}>
						Due to strict sanitation, safety, and health regulations, the items specified above cannot be
						returned once unsealed. Please double check model compatibility before unboxing.
					</p>
				</aside>
			</section>

			{/* Need help */}
			<section className="flex justify-center px-4 py-12 md:px-10 md:py-16 xl:px-20 xl:py-24">
				<div className="border-[var(--rt-cyan)]/20 flex w-full max-w-[800px] flex-col items-center gap-6 rounded-2xl border bg-[var(--rt-card)] p-6 text-center shadow-[0_0_16px_rgba(0,255,224,0.07)] md:p-10 xl:gap-9 xl:p-12">
					<div className="flex flex-col gap-3">
						<h2 className={`${bungee} text-xl xl:text-2xl`}>NEED HELP?</h2>
						<p className={`${orbitron} text-sm text-[var(--rt-text)]`}>
							Contact our support team and we will guide you step by step.
						</p>
					</div>
					<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:gap-4">
						<a href={HELP_HREF} className={secondary}>
							EMAIL US
						</a>
						{chat ? (
							<a href={chat} target="_blank" rel="noopener noreferrer" className={primary}>
								LIVE CHAT
							</a>
						) : (
							<a href={START_HREF} className={`${primary} hidden md:flex`}>
								START A RETURN
							</a>
						)}
					</div>
				</div>
			</section>

			{/* Bottom badges: the same lit band */}
			<ul className="wv-band grid gap-4 px-4 py-8 md:grid-cols-3 md:gap-4 md:px-10 xl:gap-10 xl:px-20 xl:py-10">
				{BOTTOM_BADGES.map((b) => (
					<Badge key={b.title} b={b} />
				))}
			</ul>

			<WvFooter />
		</div>
	);
}
