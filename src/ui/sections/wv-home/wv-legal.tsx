import { CalendarCheck, ChevronRight, Home } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WvFooter, WvHeader } from "./wv-chrome";
import { LegalSections, type LegalSection } from "./wv-legal-client";
import "./wv-home.css";

/** Shared legal page layout — Figma "6.16 - High Fidelity - Terms and Conditions" (also used for Privacy). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const BADGES = [
	{ icon: "truck", title: "Fast Shipping", text: "Dispatched within 24 hours" },
	{ icon: "lock", title: "Secure Payments", text: "100% SSL protected" },
	{ icon: "support", title: "Dedicated Support", text: "We are always here to help" },
	{ icon: "award", title: "Quality Guarantee", text: "All products fully certified" },
];

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
	accent = "magenta",
}: {
	crumb: string;
	titleLead: string;
	titleAccent: string;
	updated: string;
	intro: string;
	sectionsHeading: string;
	supportText: string;
	sections: LegalSection[];
	image: string;
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
						<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6] xl:text-[15px]`}>{intro}</p>
					</div>
					<div className="wv-art relative h-[150px] w-full shrink-0 overflow-hidden rounded-2xl md:h-[180px] md:w-[220px] xl:h-[260px] xl:w-[400px]">
						<Image
							src={image}
							alt=""
							fill
							priority
							sizes="(min-width: 1280px) 400px, (min-width: 768px) 220px, 100vw"
							className="object-cover"
						/>
						<span aria-hidden className="wv-art-glass absolute inset-0" />
						<span aria-hidden className="wv-art-hud absolute inset-[10px] xl:inset-[14px]" />
					</div>
				</section>

				<LegalSections sections={sections} heading={sectionsHeading} supportText={supportText} />

				<ul className="grid gap-3 px-4 pb-10 md:grid-cols-2 md:gap-3 md:px-6 xl:hidden">
					{BADGES.map((b) => (
						<li
							key={b.title}
							className="flex items-center gap-4 rounded-lg border border-[var(--ct-border)] bg-[var(--ct-card)] p-4"
						>
							<span aria-hidden className="h-8 w-[3px] shrink-0 rounded-[2px] bg-[var(--ct-cyan)]" />
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} flex items-center gap-[6px] text-[13px]`}>
									<Image src={`/home/contact/${b.icon}.svg`} alt="" width={14} height={14} />
									{b.title}
								</span>
								<span className={`${orbitron} text-xs text-[var(--ct-text)]`}>{b.text}</span>
							</span>
						</li>
					))}
				</ul>

				<WvFooter />
			</div>
		</div>
	);
}
