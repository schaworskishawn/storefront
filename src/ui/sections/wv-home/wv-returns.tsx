import {
	BadgeCheck,
	CalendarDays,
	ClipboardList,
	Clock,
	Headset,
	Lock,
	Mail,
	MessageCircle,
	PackageCheck,
	PackageSearch,
	RotateCcw,
	Tag,
	TriangleAlert,
	Truck,
	Undo2,
	Wallet,
	X,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { whatsappHref } from "@/lib/whatsapp";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor returns page — Figma "6.12 - High Fidelity - Returns" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

const SUPPORT = "support@worldwidevapor.com";
const START_HREF = `mailto:${SUPPORT}?subject=Start%20a%20return&body=Order%20number%3A%0AItem(s)%20to%20return%3A%0AReason%3A`;
const STATUS_HREF = `mailto:${SUPPORT}?subject=Return%20status&body=Order%20number%3A`;
const HELP_HREF = `mailto:${SUPPORT}?subject=Returns%20help`;

type BadgeData = { Icon: LucideIcon; title: string; text: string };

const TOP_BADGES: BadgeData[] = [
	{
		Icon: CalendarDays,
		title: "15-DAY RETURN WINDOW",
		text: "Unopened items can come back within 15 days of delivery.",
	},
	{
		Icon: Tag,
		title: "PREPAID RETURN LABEL",
		text: "Email us and we send the label; $4.99 postage is deducted.",
	},
	{ Icon: BadgeCheck, title: "QUALITY GUARANTEED", text: "Damaged or defective items are fully covered." },
];
const BOTTOM_BADGES: BadgeData[] = [
	{ Icon: Truck, title: "FAST SHIPPING", text: "Dispatched within 24 hours." },
	{ Icon: Lock, title: "SECURE PAYMENT", text: "100% SSL protected payments." },
	{ Icon: Headset, title: "EXPERT SUPPORT", text: "We are always here to help." },
];

const STEPS: { n: string; Icon: LucideIcon; title: string; text: string }[] = [
	{
		n: "01",
		Icon: ClipboardList,
		title: "START YOUR RETURN",
		text: "Email us within 15 days of delivery with your order number, the items and why.",
	},
	{
		n: "02",
		Icon: PackageCheck,
		title: "PACK YOUR ITEMS",
		text: "Pack them unopened, in their original packaging.",
	},
	{
		n: "03",
		Icon: Tag,
		title: "SHIP IT BACK",
		text: "Print the prepaid label we email you and drop the parcel at the carrier.",
	},
	{
		n: "04",
		Icon: Wallet,
		title: "GET YOUR REFUND",
		text: "Within 3-5 business days of the parcel being scanned, to your original payment method or as store credit.",
	},
];

/**
 * The page's questions, worded from the returns policy the rest of the site states (the terms and the FAQ page). Returns
 * start by email; the Vapor Tokens answer is how the rewards program treats a refunded order (lib/rewards/engine.ts) and
 * only shows while the program is on.
 */
function returnFaqs(tokens: boolean): { q: string; a: string }[] {
	return [
		{
			q: "HOW DO I START A RETURN?",
			a: `Email ${SUPPORT} within 15 days of delivery with your order number, the items you are returning and why. The Start a Return button fills that in for you. We reply with a prepaid return label.`,
		},
		{
			q: "HOW LONG DOES A REFUND TAKE TO PROCESS?",
			a: "Once your parcel is scanned at our facility, your refund is issued within 3-5 business days to your original payment method.",
		},
		{
			q: "ARE THERE FEES FOR RETURN SHIPPING?",
			a: "No restocking fees. Standard returns use our prepaid label, and a flat $4.99 return postage fee is deducted from your refund. Damaged or defective items are fully covered.",
		},
		{
			q: "CAN I EXCHANGE AN ITEM INSTEAD OF A REFUND?",
			a: "Yes. Ask for an exchange when you email us to start your return, and we will give you store credit or set aside a replacement for you.",
		},
		{
			q: "WHAT ITEMS ARE ELIGIBLE FOR RETURN?",
			a: "Unopened hardware, sealed coils and unused accessories in their original condition and packaging, within 15 days of delivery. The list beside these answers shows what cannot be returned.",
		},
		{
			q: "WHAT IF MY ORDER ARRIVED DAMAGED OR DEFECTIVE?",
			a: "Email us with your order number and what is wrong. Damaged or defective items are fully covered, so we will put it right with a replacement or a refund.",
		},
		...(tokens
			? [
					{
						q: "WHAT HAPPENS TO MY VAPOR TOKENS?",
						a: "If an order is refunded in full, the Vapor Tokens it earned are taken back, and any tokens you spent on it are returned to your account.",
					},
				]
			: []),
	];
}

const NOT_ELIGIBLE = [
	"E-liquids that have been opened or unsealed",
	"Disposable pods/devices once unboxed or unpackaged",
	"Clearance, final sale, or promotional mystery items",
];

/**
 * A badge in the page's two trust strips: a neon card (`.wv-neon-card`) set into the lit band, in turn cyan and pink
 * (`.wv-trust-item`), that glows but doesn't lift as it isn't a link (`.wv-dist-step`); its icon glows in a neon ring of
 * its colour, the title lifted and the line brighter (`.wv-trust-*`).
 */
function Badge({ b }: { b: BadgeData }) {
	return (
		<li className="wv-neon-card wv-trust-item wv-dist-step flex items-center gap-4 rounded-2xl p-4 xl:p-5">
			<span aria-hidden className="wv-trust-icon text-[26px] xl:text-[30px]">
				<b.Icon
					className="size-[0.68em] text-[var(--accent)] drop-shadow-[0_0_4px_var(--accent)]"
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
	const faqs = returnFaqs(readRewardsConfig().enabled);
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
						We want you to be <strong className="wv-hero-key">100% satisfied</strong>. Unopened items can come
						back within <strong className="wv-hero-key wv-hero-key--pink">15 days of delivery</strong> with a{" "}
						<strong className="wv-hero-key">prepaid label</strong>, and your refund lands within{" "}
						<strong className="wv-hero-key wv-hero-key--pink">3-5 business days</strong> of the parcel being
						scanned.
					</p>
					<div className="flex flex-col gap-3 md:flex-row md:justify-center xl:justify-start xl:gap-4">
						<a href={START_HREF} className={primary}>
							<Undo2 aria-hidden className="size-4" strokeWidth={2.5} />
							<span className="wv-pc-cta-label">START A RETURN</span>
						</a>
						<a href={STATUS_HREF} className={`${secondary} w-full md:w-auto`}>
							<PackageSearch aria-hidden className="size-4" strokeWidth={2.5} />
							<span className="wv-btn-label">CHECK RETURN STATUS</span>
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

			{/* How it works, over a soft pink and cyan glow (`.wv-faq-glow`): the site's chrome 3D heading under its pink eyebrow
			    and over a glowing bar (`.wv-heading-*`), and each step a neon card in turn cyan and pink that glows but doesn't
			    lift, its number lit in a tile and its icon glowing (the distributor checklist's `.wv-dist-step*`). */}
			<section className="wv-faq-glow flex flex-col items-center gap-8 px-4 py-12 md:px-10 md:py-16 xl:gap-14 xl:px-20 xl:py-24">
				<div className="flex flex-col items-center gap-2 text-center">
					<p className={`${marker} wv-heading-eyebrow text-lg text-[var(--wv-pink)] md:text-xl`}>
						WORLDWIDE VAPOR
					</p>
					<h2 className={`${bungee} wv-heading-title text-2xl text-white md:text-[28px] xl:text-[32px]`}>
						HOW RETURNS WORK
					</h2>
					<span aria-hidden className="wv-hero-bar mt-1 h-1 w-20 rounded-full md:w-[120px]" />
				</div>
				<ol className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
					{STEPS.map((s, i) => (
						<li
							key={s.n}
							className={`wv-neon-card wv-dist-step ${i % 2 ? "wv-neon-card--pink" : ""} flex flex-col gap-5 rounded-2xl p-5 xl:p-6`}
						>
							<div className="flex items-center justify-between">
								<span
									aria-hidden
									className={`${bungee} wv-neon-card-icon wv-dist-step-num flex size-11 items-center justify-center rounded-xl text-sm`}
								>
									{s.n}
								</span>
								<s.Icon aria-hidden className="wv-dist-step-icon size-6" strokeWidth={2} />
							</div>
							<div className="flex flex-col gap-2">
								<h3 className={`${heyComic} wv-trust-title text-sm md:text-[15px]`}>
									<span className="sr-only">Step {i + 1}: </span>
									{s.title}
								</h3>
								<p className={`${orbitron} wv-trust-text text-[13px] leading-[1.5]`}>{s.text}</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* FAQ + eligibility, over a soft pink and cyan glow (`.wv-faq-glow`). Each answer is the shipping page's glassy
			    neon panel (`.wv-info-*`): pink while closed and glowing cyan once open, its title lifted and its +/− in a neon
			    ring. What can't be returned sits on a pink neon card (`.wv-neon-card--pink`) whose warning and crosses glow. */}
			<section className="wv-faq-glow flex flex-col gap-10 px-4 py-12 md:px-10 md:py-16 xl:flex-row xl:gap-20 xl:p-20">
				<div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-8">
					<div className="flex flex-col gap-2">
						<p className={`${marker} wv-heading-eyebrow text-lg text-[var(--wv-pink)] md:text-xl`}>
							Good to know
						</p>
						<h2 className={`${bungee} wv-heading-title text-2xl text-white md:text-[28px]`}>
							RETURN POLICY FAQ
						</h2>
						<span aria-hidden className="wv-hero-bar mt-1 h-1 w-20 rounded-full md:w-[120px]" />
					</div>
					<div className="flex flex-col gap-3 xl:gap-4">
						{faqs.map((f, i) => (
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
				</div>
				<aside
					className="wv-neon-card wv-neon-card--pink wv-dist-step flex flex-col gap-6 rounded-2xl p-6 md:p-10 xl:flex-1 xl:self-start"
					aria-labelledby="not-eligible"
				>
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-3">
							<span
								aria-hidden
								className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
							>
								<TriangleAlert className="wv-dist-step-icon size-5" strokeWidth={2.25} />
							</span>
							<h2 id="not-eligible" className={`${bungee} wv-heading-title text-base text-white md:text-lg`}>
								NOT ELIGIBLE FOR RETURN
							</h2>
						</div>
						<span aria-hidden className="wv-hero-bar h-1 w-16 rounded-full" />
					</div>
					<ul className="flex flex-col gap-4">
						{NOT_ELIGIBLE.map((t) => (
							<li
								key={t}
								className={`${orbitron} wv-trust-text flex items-start gap-3 text-sm leading-[1.5]`}
							>
								<span
									aria-hidden
									className="wv-info-toggle mt-[-2px] size-[22px] text-[var(--wv-pink)] [&_svg]:size-3"
								>
									<X strokeWidth={3} />
								</span>
								{t}
							</li>
						))}
					</ul>
					<p className={`${orbitron} text-xs leading-[1.6] text-[var(--wv-text-dim)]`}>
						Due to strict sanitation, safety, and health regulations, the items specified above cannot be
						returned once unsealed. Please double check model compatibility before unboxing.
					</p>
				</aside>
			</section>

			{/* Need help, over a soft glow: the site's lit glass card (`.wv-news-card`, a cyan-through-purple-to-pink edge that
			    glows), a glowing headset in a lit tile, the chrome 3D heading over a glowing bar, brighter copy with its promise lit,
			    the support hours as a neon chip, and the neon outline and glossy buttons with their icons. */}
			<section className="wv-faq-glow flex justify-center px-4 py-12 md:px-10 md:py-16 xl:px-20 xl:py-24">
				<div className="wv-news-card flex w-full max-w-[800px] flex-col items-center gap-6 rounded-[20px] p-6 text-center md:p-10 xl:gap-8 xl:p-12">
					<span aria-hidden className="wv-acct-icon flex size-14 items-center justify-center rounded-2xl">
						<Headset className="size-6" strokeWidth={2.25} />
					</span>
					<div className="flex flex-col items-center gap-3">
						<h2 className={`${bungee} wv-heading-title text-2xl text-white xl:text-[28px]`}>NEED HELP?</h2>
						<span aria-hidden className="wv-hero-bar h-1 w-16 rounded-full md:w-20" />
						<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6] md:text-[15px]`}>
							Contact our support team and we will{" "}
							<strong className="wv-hero-key">guide you step by step</strong>.
						</p>
						<p
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.2px] md:text-[11px]`}
						>
							<Clock aria-hidden className="size-3.5" strokeWidth={2.25} />
							MON – SUN · 9:00 AM – 10:00 PM EST
						</p>
					</div>
					<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:gap-4">
						<a href={HELP_HREF} className={secondary}>
							<Mail aria-hidden className="size-4" strokeWidth={2.5} />
							<span className="wv-btn-label">EMAIL US</span>
						</a>
						{chat ? (
							<a href={chat} target="_blank" rel="noopener noreferrer" className={primary}>
								<MessageCircle aria-hidden className="size-4" strokeWidth={2.5} />
								<span className="wv-pc-cta-label">LIVE CHAT</span>
							</a>
						) : (
							<a href={START_HREF} className={`${primary} hidden md:flex`}>
								<Undo2 aria-hidden className="size-4" strokeWidth={2.5} />
								<span className="wv-pc-cta-label">START A RETURN</span>
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
