import { ChevronRight, Home, MessageCircleQuestion } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { whatsappHref } from "@/lib/whatsapp";
import { WvFooter, WvHeader } from "./wv-chrome";
import { FaqExperience, type Faq } from "./wv-faqs-client";
import "./wv-home.css";

/** Worldwide Vapor FAQs — Figma "6.14 - High Fidelity - Faqs" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const SUPPORT = "support@worldwidevapor.com";
const PENDING = `Details for this answer are coming soon. Contact ${SUPPORT} in the meantime.`;

const FAQS: Faq[] = [
	{
		q: "What payment methods do you accept?",
		a: "We accept Visa, Mastercard, American Express, and store gift cards. All transactions are securely processed with 256-bit encryption.",
	},
	{
		q: "How long does shipping take?",
		a: "Standard shipping takes 3-5 business days once processed by our fulfillment center. Orders received before 2PM EST Monday through Friday are processed the same business day.",
		link: { href: "/shipping", label: "Shipping details" },
	},
	{ q: "Can I change or cancel my order?", a: PENDING },
	{
		q: "Do you ship internationally?",
		a: "Yes, we ship to most major global destinations subject to local custom import regulations. The recipient is responsible for local import charges and duties.",
		link: { href: "/shipping", label: "Shipping details" },
	},
	{
		q: "How do I return a product?",
		a: "Returns are accepted within 15 days of delivery. Start a return, pack the item in its original packaging and ship it back with the label we provide. Refunds are issued within 3-5 business days of the package being scanned.",
		link: { href: "/returns", label: "Returns & refunds" },
	},
	{ q: "Are your products authentic?", a: PENDING },
	{
		q: "Where can I find my tracking number?",
		a: "You will receive a tracking link via email as soon as your order ships from our warehouse. If you can't find it, contact support with your order number.",
		link: { href: "/contact-us", label: "Contact support" },
	},
	{
		q: "Do you offer wholesale or distributor pricing?",
		a: "Yes. Pricing is tier-based with volume incentives for authorized retailers and regional and master distributors. See our distributor program to apply.",
		link: { href: "/distributor", label: "Distributor program" },
	},
];

const BADGES = [
	{ icon: "truck", title: "Fast Shipping", text: "Dispatched within 24 hours" },
	{ icon: "lock", title: "Secure Payments", text: "100% SSL protected" },
	{ icon: "support", title: "Dedicated Support", text: "We are always here to help" },
	{ icon: "award", title: "Quality Guarantee", text: "All products fully certified" },
];

export function WvFaqs() {
	const chat = whatsappHref();
	const primary = `${bungee} flex items-center justify-center gap-2 rounded-md bg-[var(--ct-cyan)] px-6 py-[14px] text-sm tracking-[1.5px] text-[var(--ct-ink)]`;
	const outline = `${bungee} flex items-center justify-center gap-2 rounded-md border-[1.5px] border-[var(--ct-cyan)] px-6 py-[14px] text-sm tracking-[1.5px] text-[var(--ct-cyan)]`;

	const supportCard = (
		<aside
			key="aside"
			className="border-[var(--ct-magenta)]/40 flex flex-col gap-6 rounded-2xl border bg-[var(--ct-card)] p-6 shadow-[0_0_12px_rgba(217,0,255,0.07)] md:p-8 xl:flex-1"
			aria-labelledby="still-help"
		>
			<div className="flex flex-col gap-2">
				<h2 id="still-help" className={`${bungee} text-base`}>
					STILL NEED HELP?
				</h2>
				<span aria-hidden className="h-[2px] w-12 bg-[var(--ct-magenta)]" />
			</div>
			<p className={`${orbitron} text-sm leading-[1.5] text-[var(--ct-text)]`}>
				Can&apos;t find the answer you&apos;re looking for? Our dedicated customer support team is here to
				assist you with any inquiries.
			</p>
			<div className="flex items-center gap-[10px] py-1">
				<span aria-hidden>🕒</span>
				<div className="flex flex-col gap-[2px]">
					<span className={`${bungee} text-xs`}>SUPPORT HOURS</span>
					<span className={`${orbitron} text-[11px] text-[var(--ct-text)]`}>
						Mon - Sun: 9:00 AM - 10:00 PM EST
					</span>
				</div>
			</div>
			<div className="flex flex-col gap-3">
				{chat && (
					<a key="chat" href={chat} target="_blank" rel="noopener noreferrer" className={primary}>
						💬 LIVE CHAT
					</a>
				)}
				<a key="email" href={`mailto:${SUPPORT}`} className={chat ? outline : primary}>
					✉️ EMAIL US
				</a>
			</div>
		</aside>
	);

	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--ct-bg)] text-white">
			<div
				aria-hidden
				className="bg-[var(--wv-purple)]/20 pointer-events-none absolute left-0 top-0 size-[350px] rounded-full blur-[100px] xl:size-[500px]"
			/>
			<div
				aria-hidden
				className="bg-[var(--ct-cyan)]/5 pointer-events-none absolute right-0 top-[500px] hidden size-[400px] rounded-full blur-[100px] md:block xl:size-[600px]"
			/>
			<div className="relative">
				<WvHeader />

				{/* The shop's breadcrumb: a glass strip under the header, Home glowing cyan, a pink chevron, and this page in a
				    neon pill (styles: `.wv-crumb*` in wv-home.css). */}
				<nav
					aria-label="Breadcrumb"
					className={`${heyComic} wv-crumbs flex items-center gap-2 px-4 py-2 text-xs tracking-[0.5px] md:px-8 xl:px-20 xl:py-3`}
				>
					<Link href="/home" className="wv-link wv-crumb-link">
						<Home aria-hidden className="size-3.5" strokeWidth={2.25} />
						Home
					</Link>
					<ChevronRight aria-hidden className="wv-crumb-sep size-3.5" strokeWidth={2.5} />
					<span aria-current="page" className="wv-crumb-current">
						Frequently Asked Questions
					</span>
				</nav>

				{/* The hero, in the neon style of the site's other heroes (`.wv-hero-*` in wv-home.css): a neon badge with
				    the real count of answers, a 3D two-tone title over a glowing pink-to-cyan bar, brighter copy with its key
				    phrases lit, and the hologram in a glowing frame with HUD corners (`.wv-art*`). FaqExperience adds the pink
				    and cyan glow behind it and the neon search bar. */}
				<div className="px-4 pb-10 md:px-8 xl:px-20 xl:pb-16">
					<FaqExperience
						faqs={FAQS}
						intro={
							<div key="intro" className="flex flex-col items-start gap-4 xl:gap-6">
								<span
									className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
								>
									<MessageCircleQuestion aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
									<span className="md:hidden">{FAQS.length} QUICK ANSWERS</span>
									<span className="hidden md:inline">
										{FAQS.length} QUICK ANSWERS · SUPPORT 7 DAYS A WEEK
									</span>
								</span>
								<div className="flex w-full flex-col gap-3">
									<h1
										className={`${heyComic} wv-title-glow wv-hero-title text-[28px] leading-[32px] md:text-[38px] md:leading-[44px] xl:text-[44px] xl:leading-[52px]`}
									>
										<span>FREQUENTLY ASKED</span>{" "}
										<span className="text-[var(--wv-cyan-soft)]">QUESTIONS</span>
									</h1>
									<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
								</div>
								<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6] xl:text-[15px]`}>
									Find quick answers to the most common questions about our{" "}
									<strong className="wv-hero-key">premium product offerings</strong>,{" "}
									<strong className="wv-hero-key wv-hero-key--pink">secure ordering system</strong>,{" "}
									<strong className="wv-hero-key">fast shipping</strong>, and{" "}
									<strong className="wv-hero-key wv-hero-key--pink">easy return policies</strong>.
								</p>
							</div>
						}
						visual={
							<div
								key="visual"
								className="wv-art relative h-44 w-full shrink-0 overflow-hidden rounded-2xl md:h-[300px] xl:h-[280px] xl:w-[420px]"
							>
								<Image
									src="/home/faqs/hero.png"
									alt="Neon question-mark hologram over a support console"
									fill
									priority
									sizes="(min-width: 1280px) 420px, 100vw"
									className="object-cover"
								/>
								<span aria-hidden className="wv-art-glass absolute inset-0" />
								<span aria-hidden className="wv-art-hud absolute inset-[10px] md:inset-[14px]" />
							</div>
						}
						aside={supportCard}
					/>
				</div>

				{/* Trust badges */}
				<ul className="grid grid-cols-2 gap-3 px-4 pb-10 md:gap-4 md:px-8 xl:grid-cols-4 xl:gap-6 xl:px-20 xl:pb-12">
					{BADGES.map((b) => (
						<li
							key={b.title}
							className="flex items-center gap-3 rounded-lg border border-[var(--ct-border)] bg-[var(--ct-card)] p-3 md:gap-4 md:p-4 xl:p-5"
						>
							<span aria-hidden className="h-8 w-[3px] shrink-0 rounded-[2px] bg-[var(--ct-cyan)]" />
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} flex items-center gap-[6px] text-xs md:text-[13px]`}>
									<Image src={`/home/contact/${b.icon}.svg`} alt="" width={14} height={14} />
									{b.title}
								</span>
								<span className={`${orbitron} text-[11px] text-[var(--ct-text)] md:text-xs`}>{b.text}</span>
							</span>
						</li>
					))}
				</ul>

				<WvFooter />
			</div>
		</div>
	);
}
