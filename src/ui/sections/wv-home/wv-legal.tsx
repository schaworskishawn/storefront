import {
	Award,
	CalendarCheck,
	ChevronRight,
	Home,
	Lock,
	MessageCircle,
	Truck,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { WvFooter, WvHeader } from "./wv-chrome";
import { LegalSections, type LegalSection } from "./wv-legal-client";
import "./wv-home.css";

/** Shared legal page layout — Figma "6.16 - High Fidelity - Terms and Conditions" (also used for Privacy). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const BADGES: { Icon: LucideIcon; title: string; text: string }[] = [
	{ Icon: Truck, title: "Fast Shipping", text: "Dispatched within 24 hours" },
	{ Icon: Lock, title: "Secure Payments", text: "100% SSL protected" },
	{ Icon: MessageCircle, title: "Dedicated Support", text: "We are always here to help" },
	{ Icon: Award, title: "Quality Guarantee", text: "All products fully certified" },
];

export type LegalHighlight = {
	Icon: LucideIcon;
	label: string;
	/** The section id it opens. */ section: string;
};

/** The intro with each key phrase lit (`.wv-hero-key`), in turn cyan and pink. A phrase not in the text is ignored. */
export function lightUp(text: string, keys: readonly string[]): ReactNode[] {
	const found = keys.filter((k) => k && text.includes(k));
	if (found.length === 0) return [text];
	const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${found.map(escape).join("|")})`));
	let lit = 0;
	return parts.map((part, i) =>
		found.includes(part) ? (
			<strong key={i} className={`wv-hero-key${lit++ % 2 ? " wv-hero-key--pink" : ""}`}>
				{part}
			</strong>
		) : (
			part
		),
	);
}

export function WvLegal({
	crumb,
	titleLead,
	titleAccent,
	updated,
	intro,
	sectionsHeading,
	supportText,
	sections,
	image,
	imageAlt = "",
	accent = "magenta",
	introKeys = [],
	highlights = [],
}: {
	crumb: string;
	titleLead: string;
	titleAccent: string;
	updated: string;
	intro: string;
	/** Phrases of the intro to light up, in turn cyan and pink, as the other heroes light their key phrases. */
	introKeys?: string[];
	/** Up to three things the page promises, each a chip that opens its section. */
	highlights?: LegalHighlight[];
	sectionsHeading: string;
	supportText: string;
	sections: LegalSection[];
	image: string;
	/** What the art shows, for screen readers; empty (decorative) when the art says nothing the page doesn't. */
	imageAlt?: string;
	accent?: "magenta" | "cyan";
}) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--ct-bg)] text-white">
			<div
				aria-hidden
				className="bg-[var(--wv-purple)]/20 pointer-events-none absolute -left-24 -top-24 size-[400px] rounded-full blur-[110px] xl:left-0 xl:top-0 xl:size-[500px]"
			/>
			<div
				aria-hidden
				className="bg-[var(--ct-cyan)]/5 pointer-events-none absolute right-0 top-[400px] hidden size-[450px] rounded-full blur-[110px] md:block xl:size-[600px]"
			/>
			<div className="relative">
				<WvHeader />

				{/* The shop's breadcrumb: a glass strip under the header, Home glowing cyan, a pink chevron, and this page in a
				    neon pill (styles: `.wv-crumb*` in wv-home.css). */}
				<nav
					aria-label="Breadcrumb"
					className={`${heyComic} wv-crumbs flex items-center gap-2 px-4 py-2 text-xs tracking-[0.5px] md:px-6 xl:px-20 xl:py-3`}
				>
					<Link href="/home" className="wv-link wv-crumb-link">
						<Home aria-hidden className="size-3.5" strokeWidth={2.25} />
						Home
					</Link>
					<ChevronRight aria-hidden className="wv-crumb-sep size-3.5" strokeWidth={2.5} />
					<span aria-current="page" className="wv-crumb-current">
						{crumb}
					</span>
				</nav>

				{/* The hero, in the neon style of the site's other heroes (`.wv-hero-*` in wv-home.css): a pink and cyan glow
				    behind it, the date it was last updated in a neon badge, a 3D two-tone title over a glowing pink-to-cyan bar,
				    brighter copy, and the art in a glowing frame with glass and HUD corners (`.wv-art*`). */}
				<section className="wv-hero-backdrop flex flex-col gap-6 px-4 pb-6 pt-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6 md:pt-8 xl:px-20 xl:pb-12 xl:pt-10">
					<div className="flex max-w-[750px] flex-col items-start gap-4 xl:gap-6">
						<p
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<CalendarCheck aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
							LAST UPDATED: {updated}
						</p>
						<div className="flex w-full flex-col gap-3">
							<h1
								className={`${heyComic} wv-title-glow wv-hero-title text-[28px] leading-[32px] md:text-[34px] md:leading-10 xl:text-[44px] xl:leading-[52px]`}
							>
								<span>{titleLead}</span>{" "}
								<span
									className={accent === "magenta" ? "text-[var(--wv-pink)]" : "text-[var(--wv-cyan-soft)]"}
								>
									{titleAccent}
								</span>
							</h1>
							<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
						</div>
						<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6] xl:text-[15px]`}>
							{lightUp(intro, introKeys)}
						</p>
						{highlights.length > 0 && (
							// What the page promises, as the payments strip's glowing chips (`.wv-pay-chip`, in turn cyan and
							// pink): each opens its section below (the accordion follows the URL hash).
							<nav aria-label="Highlights" className="flex flex-wrap gap-2">
								{highlights.map((h) => (
									<a
										key={h.section}
										href={`#${h.section}`}
										className={`${heyComic} wv-pay-chip flex items-center gap-2 rounded-full px-3 py-[6px] text-xs text-white`}
									>
										<h.Icon aria-hidden className="size-3.5 text-[var(--accent)]" strokeWidth={2.25} />
										{h.label}
									</a>
								))}
							</nav>
						)}
					</div>
					{/* 5:3 on phones and tablets, so a whole scene shows (the art is drawn 1200×720). */}
					<div className="wv-art relative aspect-[5/3] w-full shrink-0 overflow-hidden rounded-2xl md:aspect-auto md:h-[168px] md:w-[280px] xl:h-[260px] xl:w-[400px]">
						<Image
							src={image}
							alt={imageAlt}
							fill
							priority
							sizes="(min-width: 1280px) 400px, (min-width: 768px) 280px, 100vw"
							className="object-cover"
						/>
						<span aria-hidden className="wv-art-glass absolute inset-0" />
						<span aria-hidden className="wv-art-hud absolute inset-[10px] xl:inset-[14px]" />
					</div>
				</section>

				<LegalSections sections={sections} heading={sectionsHeading} supportText={supportText} />

				{/* Trust badges (phones and tablets): neon cards in turn cyan and pink (`.wv-neon-card`, `.wv-trust-item`), each
				    icon glowing in a neon ring of its colour, its title lifted and its line brighter (`.wv-trust-*`). They glow
				    brighter under the pointer but don't lift, as they aren't links (`.wv-legal-badge`). */}
				<ul className="grid gap-3 px-4 pb-10 md:grid-cols-2 md:gap-4 md:px-6 xl:hidden">
					{BADGES.map((b) => (
						<li
							key={b.title}
							className="wv-neon-card wv-trust-item wv-legal-badge flex items-center gap-4 rounded-xl p-4"
						>
							<span aria-hidden className="wv-trust-icon text-[22px]">
								<b.Icon className="size-[0.7em]" strokeWidth={2} />
							</span>
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} wv-trust-title text-[13px]`}>{b.title}</span>
								<span className={`${orbitron} wv-trust-text text-xs leading-[1.45]`}>{b.text}</span>
							</span>
						</li>
					))}
				</ul>

				<WvFooter />
			</div>
		</div>
	);
}
