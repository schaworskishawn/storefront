import {
	ArrowRight,
	ArrowUpRight,
	Award,
	BookOpen,
	ChevronRight,
	CircleHelp,
	Clock,
	Globe,
	Headset,
	Home,
	Lock,
	type LucideIcon,
	Mail,
	MapPin,
	MessageSquare,
	MessageSquareText,
	PackageSearch,
	RotateCcw,
	Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { whatsappHref } from "@/lib/whatsapp";
import { ContactForm } from "./wv-contact-form";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor contact page — Figma "6.13 - High Fidelity - Contact Us" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";

const HELP_LINKS: { Icon: LucideIcon; title: string; text: string; href: string }[] = [
	{ Icon: CircleHelp, title: "FAQs", text: "Find answers to common questions", href: "/faqs" },
	{ Icon: Truck, title: "Shipping Information", text: "Delivery times and policies", href: "/shipping" },
	{ Icon: RotateCcw, title: "Returns & Refunds", text: "Return policy and process", href: "/returns" },
	{
		Icon: PackageSearch,
		title: "Track Your Order",
		text: "Check the status of your order",
		href: `mailto:${SUPPORT}?subject=Track%20my%20order&body=Order%20number%3A`,
	},
];

const BADGES: { Icon: LucideIcon; title: string; text: string }[] = [
	{ Icon: Truck, title: "Fast Shipping", text: "Dispatched within 24 hours" },
	{ Icon: Lock, title: "Secure Payments", text: "100% SSL protected" },
	{ Icon: Headset, title: "Dedicated Support", text: "We are always here to help" },
	{ Icon: Award, title: "Quality Guarantee", text: "All products fully certified" },
];

/**
 * One way to reach us, in the style of the account summaries: a neon card (`.wv-neon-card`, pink for the middle one,
 * with `.wv-acct-card*` in wv-home.css). Its icon glows in a lit tile and its label sits in a glowing glass pill; the
 * way in glows in the card's colour, with the key words of its note lit; a neon line runs under it; then, for a link,
 * a neon pill whose arrow slides on under the pointer, or for the address, the country in a glass pill. The address
 * isn't a link, so it doesn't lift or brighten under the pointer.
 */
function MethodCard({
	pink = false,
	Icon,
	label,
	headline,
	note,
	action,
	tag,
	href,
	external,
}: {
	pink?: boolean;
	Icon: LucideIcon;
	label: string;
	headline: string;
	note?: ReactNode;
	/** The link's call to action ("SEND AN EMAIL"), shown when there's a link. */
	action?: string;
	/** A fact shown in a glass pill at the foot instead of an action ("UNITED STATES"). */
	tag?: string;
	href?: string;
	external?: boolean;
}) {
	const Arrow = external ? ArrowUpRight : ArrowRight;
	const at = headline.indexOf("@");
	const inner = (
		<>
			<div className="flex items-start justify-between gap-3">
				<span
					aria-hidden
					className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
				>
					<Icon className="size-5" strokeWidth={2.25} />
				</span>
				<span className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-1 text-[10px] tracking-[1px]`}>
					{label}
				</span>
			</div>
			<div className="flex flex-col gap-1.5">
				<p className={`${heyComic} wv-neon-card-link break-words text-[15px] md:text-sm xl:text-base`}>
					{/* An email may wrap after its "@" rather than mid-word. */}
					{at < 0 ? (
						headline
					) : (
						<>
							{headline.slice(0, at + 1)}
							<wbr />
							{headline.slice(at + 1)}
						</>
					)}
				</p>
				{note && <p className={`${orbitron} wv-neon-card-text text-xs leading-[1.6]`}>{note}</p>}
			</div>
			<div className="flex-1" />
			<span aria-hidden className="wv-acct-card-rule h-px w-full" />
			{href && action ? (
				<span
					className={`${orbitron} wv-acct-card-action flex items-center gap-2 self-end rounded-full px-3.5 py-1.5 text-[11px] tracking-[0.5px]`}
				>
					{action}
					<Arrow
						aria-hidden
						className={`size-3.5 transition-transform ${external ? "group-hover:-translate-y-0.5 group-hover:translate-x-0.5" : "group-hover:translate-x-1"}`}
						strokeWidth={2.5}
					/>
				</span>
			) : tag ? (
				<span
					className={`${orbitron} wv-acct-card-tag flex items-center gap-1.5 self-end rounded-full px-2.5 py-1 text-[10px] tracking-[1px]`}
				>
					<Globe aria-hidden className="size-3" strokeWidth={2.5} />
					{tag}
				</span>
			) : null}
		</>
	);
	const cls = `wv-neon-card wv-acct-card ${pink ? "wv-neon-card--pink" : ""} group flex flex-col gap-3 rounded-xl p-[18px] md:p-4 xl:p-6`;
	if (!href) return <div className={cls}>{inner}</div>;
	return (
		<a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cls}>
			{inner}
		</a>
	);
}

export function WvContact() {
	const chat = whatsappHref();
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--ct-bg)] text-white">
			<div
				aria-hidden
				className="bg-[var(--wv-purple)]/20 pointer-events-none absolute left-0 top-0 size-[400px] rounded-full blur-[100px]"
			/>
			<div className="relative">
				<WvHeader />

				{/* The hero, in the neon style of the site's other heroes (`.wv-hero-*` in wv-home.css): a pink and cyan glow
				    behind it, the breadcrumb lit (Home glowing cyan, a pink chevron, this page in a neon pill), what we promise
				    in a neon badge, a 3D two-tone title over a glowing pink-to-cyan bar, brighter copy with its key words lit,
				    and the art in a glowing frame with glass and HUD corners (`.wv-art*`). */}
				<section className="wv-hero-backdrop flex flex-col gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-8 md:py-16 xl:px-20 xl:py-[105px]">
					<div className="flex max-w-[640px] flex-col items-start gap-5 xl:gap-6">
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
								Contact Us
							</span>
						</nav>
						<p
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<Clock aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
							<span className="md:hidden">WE REPLY WITHIN 24 HOURS</span>
							<span className="hidden md:inline">WE REPLY WITHIN 24 HOURS · 7 DAYS A WEEK</span>
						</p>
						<div className="flex w-full flex-col gap-3">
							<h1
								className={`${heyComic} wv-title-glow wv-hero-title text-[30px] leading-[1.1] md:text-4xl xl:text-5xl`}
							>
								<span>CONTACT</span> <span className="text-[var(--wv-cyan-soft)]">US</span>
							</h1>
							<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
						</div>
						<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6] xl:text-base`}>
							{/* A string, not JSX text: the compiler drops a leading space from JSX text that has an apostrophe. */}
							{"We're "}
							<strong className="wv-hero-key">here to help</strong>! Reach out to us with any questions about
							our <strong className="wv-hero-key wv-hero-key--pink">products</strong>,{" "}
							<strong className="wv-hero-key">orders</strong>, or anything vaping related.
						</p>
					</div>
					{/* 5:3 on phones and tablets, so the whole scene shows (the art is drawn 1200×720). */}
					<div className="wv-art relative aspect-[5/3] w-full shrink-0 overflow-hidden rounded-2xl md:aspect-auto md:h-[176px] md:w-[294px] xl:h-[260px] xl:w-[420px]">
						<Image
							src="/home/contact/hero.svg"
							alt="A glowing envelope with its letter rising out inside a 24-hour reply ring, wired to neon seals for live chat, the support team, the FAQs and order tracking"
							fill
							priority
							sizes="(min-width: 1280px) 420px, (min-width: 768px) 294px, 100vw"
							className="object-cover"
						/>
						<span aria-hidden className="wv-art-glass absolute inset-0" />
						<span aria-hidden className="wv-art-hud absolute inset-[10px] md:inset-[14px]" />
					</div>
				</section>

				{/* The ways to reach us: neon cards, cyan, pink, cyan (see MethodCard). */}
				<section className="grid gap-4 px-4 py-2 md:grid-cols-3 md:gap-5 md:px-8 md:py-4 xl:gap-6 xl:px-20 xl:py-6">
					<MethodCard
						Icon={Mail}
						label="EMAIL US"
						headline={SUPPORT}
						note={
							<>
								We typically reply within <strong className="wv-neon-key">24 hours</strong>
							</>
						}
						action="SEND AN EMAIL"
						href={`mailto:${SUPPORT}`}
					/>
					<MethodCard
						pink
						Icon={MessageSquare}
						label="LIVE CHAT"
						headline="Chat with our support team"
						note={<strong className="wv-neon-key">Monday–Sunday</strong>}
						action="START A CHAT"
						href={chat ?? undefined}
						external
					/>
					<MethodCard
						Icon={MapPin}
						label="OUR LOCATION"
						headline="123 Vapor Way, Vapecrest, NY 10001"
						tag="UNITED STATES"
					/>
				</section>

				{/* Form + help */}
				<section className="flex flex-col gap-8 px-4 py-6 md:px-8 md:py-8 xl:flex-row xl:gap-12 xl:px-20 xl:py-12">
					{/* The form is lit glass like the affiliate application (`.wv-auth-card`, with `.wv-af-form` for its fields'
					    pink "needs fixing" state): its title is chrome beside a lit icon tile over a glowing bar, and a neon rule
					    runs cyan into pink above the fields. */}
					<div className="wv-auth-card wv-af-form flex flex-col gap-6 rounded-[20px] p-5 md:p-6 xl:w-[740px] xl:shrink-0 xl:gap-7 xl:p-8">
						<div className="flex items-center gap-3">
							<span
								aria-hidden
								className="wv-acct-icon flex size-10 shrink-0 items-center justify-center rounded-xl"
							>
								<MessageSquareText className="size-[18px]" strokeWidth={2.25} />
							</span>
							<div className="flex flex-col gap-1.5">
								<h2 className={`${bungee} wv-heading-title text-base text-white md:text-lg`}>
									SEND US A MESSAGE
								</h2>
								<span aria-hidden className="wv-hero-bar h-[3px] w-16 rounded-full" />
							</div>
						</div>
						<div aria-hidden className="wv-af-rule h-px w-full" />
						<ContactForm whatsapp={chat} />
					</div>
					{/* Before you contact us: the title chrome over a glowing bar, the copy brighter with its key words lit; each
					    help link a neon card in turn cyan and pink (`.wv-neon-card`, with `.wv-acct-card` for its glowing icon
					    and focus ring) that lifts under the pointer, its title lifted and its arrow glowing and sliding on; and
					    the Help Center the site's neon outline button (`.wv-btn-neon`). */}
					<div className="flex min-w-0 flex-1 flex-col gap-6">
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-2">
								<h2 className={`${bungee} wv-heading-title text-base text-white md:text-lg`}>
									BEFORE YOU CONTACT US
								</h2>
								<span aria-hidden className="wv-hero-bar h-[3px] w-16 rounded-full" />
							</div>
							<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6]`}>
								You may find your answer <strong className="wv-hero-key">faster</strong> in our{" "}
								<strong className="wv-hero-key wv-hero-key--pink">Help Center</strong>.
							</p>
						</div>
						<ul className="flex flex-col gap-3">
							{HELP_LINKS.map((h, i) => (
								<li key={h.title}>
									<a
										href={h.href}
										className={`wv-neon-card wv-acct-card ${i % 2 ? "wv-neon-card--pink" : ""} group flex items-center gap-4 rounded-xl p-4`}
									>
										<span
											aria-hidden
											className="wv-neon-card-icon flex size-10 shrink-0 items-center justify-center rounded-xl"
										>
											<h.Icon className="size-[18px]" strokeWidth={2.25} />
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-1">
											<span className={`${heyComic} wv-trust-title text-sm`}>{h.title}</span>
											<span className={`${orbitron} wv-neon-card-text text-xs`}>{h.text}</span>
										</span>
										<ArrowRight
											aria-hidden
											className="wv-af-inline-icon size-4 shrink-0 transition-transform group-hover:translate-x-1"
											strokeWidth={2.5}
										/>
									</a>
								</li>
							))}
						</ul>
						<Link
							href="/learn"
							className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-7 text-[13px] uppercase text-[var(--wv-cyan-soft)]`}
						>
							<BookOpen aria-hidden className="size-4" strokeWidth={2.25} />
							<span className="wv-btn-label">Visit Help Center</span>
						</Link>
					</div>
				</section>

				{/* Trust badges, as on the returns page: a lit glass band (`.wv-band`, neon edges top and bottom) holding
				    neon cards in turn cyan and pink (`.wv-trust-item`) that glow but don't lift, as they aren't links
				    (`.wv-dist-step`); each icon glows in a neon ring of its colour, the title lifted and the line brighter. */}
				<ul className="wv-band grid gap-4 px-4 py-8 md:grid-cols-2 md:px-8 xl:grid-cols-4 xl:gap-6 xl:px-20 xl:py-10">
					{BADGES.map((b) => (
						<li
							key={b.title}
							className="wv-neon-card wv-trust-item wv-dist-step flex items-center gap-4 rounded-2xl p-4 xl:p-5"
						>
							<span aria-hidden className="wv-trust-icon text-[26px] xl:text-[30px]">
								<b.Icon
									className="size-[0.68em] text-[var(--accent)] drop-shadow-[0_0_4px_var(--accent)]"
									strokeWidth={2}
								/>
							</span>
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} wv-trust-title text-[13px] md:text-sm`}>{b.title}</span>
								<span className={`${orbitron} wv-trust-text text-xs leading-[1.45] md:text-[13px]`}>
									{b.text}
								</span>
							</span>
						</li>
					))}
				</ul>

				<WvFooter />
			</div>
		</div>
	);
}
