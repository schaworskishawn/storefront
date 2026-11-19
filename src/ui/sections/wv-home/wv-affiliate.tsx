import {
	ArrowDown,
	CalendarClock,
	Check,
	ChevronRight,
	Cloud,
	Gem,
	Globe,
	Handshake,
	Home,
	Layers,
	TrendingUp,
	Wallet,
	Wind,
	Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AFFILIATE_TIERS, TOKEN_BONUS_BPS, rangeLabel, rateLabel, tierTitle } from "@/lib/affiliates/tiers";
import { AffiliateApply, AffiliateApplySkeleton } from "./wv-affiliate-apply";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor affiliate program — Figma "6.18 - High Fidelity - Affiliate Program" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const HIGHLIGHTS = [
	{
		Icon: Gem,
		title: "15% COMMISSION",
		text: "Earn top-tier industry commissions on every single referral",
		mobile: true,
	},
	{
		Icon: Zap,
		title: "REAL-TIME TRACKING",
		text: "Live cookie tracking & instant conversions on your dashboard",
		mobile: true,
	},
	{
		Icon: CalendarClock,
		title: "30-DAY COOKIE",
		text: "Generous window to maximize your referral conversions",
		mobile: true,
	},
	{
		Icon: Wallet,
		title: "AUTOMATIC PAYOUTS",
		text: `Paid in Vapor Tokens with a +${TOKEN_BONUS_BPS / 100}% bonus, or in USDT or USDC`,
		mobile: false,
	},
];

/**
 * The cards' look for each tier. The rates, monthly ranges and benefits come from the program's own settings
 * (`@/lib/affiliates/tiers`), the same ones commission is paid by, so the page can't promise something else. Each card
 * lists what its tier adds to the one below, all of whose benefits it keeps.
 */
const TIER_LOOK = {
	cloud: { Icon: Cloud, color: "yellow" },
	vapor: { Icon: Wind, color: "orange" },
	surge: { Icon: Zap, color: "pink" },
	global: { Icon: Globe, color: "cyan" },
} as const;

const TIERS = AFFILIATE_TIERS.map((tier) => ({
	name: tier.name,
	...TIER_LOOK[tier.id],
	rate: rateLabel(tier),
	range: rangeLabel(tier),
	benefits: tier.adds,
}));

const STATS = [
	{ label: "TOTAL EARNINGS", value: "$12,480.50", trend: "+14.2% this month", pink: false, mobile: true },
	{ label: "ACTIVE REFERRALS", value: "348 members", trend: "+24 new this week", pink: false, mobile: true },
	{ label: "CONVERSION RATE", value: "4.82%", trend: "+0.6% vs avg", pink: false, mobile: false },
	{ label: "PENDING PAYOUT", value: "$1,120.00", trend: "Arriving April 1", pink: true, mobile: false },
];

const TOOLS = [
	{ title: "REFLINK CREATOR", text: "Generate deep links for specific products or custom vaping kits." },
	{ title: "QR CODE GEN", text: "Instantly create high-res neon styled QR codes for offline scanning." },
	{ title: "CAMPAIGN TAGS", text: "Organize tracking with custom sub-IDs (e.g. instagram, bio-link)." },
];

const BENEFITS = [
	{
		icon: "📈",
		title: "HIGH COMMISSIONS",
		text: "Starting at 10% and scaling up to 20% on all valid orders with zero earnings caps.",
	},
	{
		icon: "🤝",
		title: "DEDICATED SUPPORT",
		text: "A personal affiliate success manager to help optimize your conversion rates and creative design.",
	},
	{
		icon: "🎁",
		title: "EXCLUSIVE OFFERS",
		text: "Receive custom discount codes for your followers & early access product samples.",
	},
	{
		icon: "🎯",
		title: "EASY TRACKING",
		text: "A sleek dashboard loaded with real-time analytics, conversion funnels and cookie data.",
	},
];

function SectionTitle({ title, sub }: { title: string; sub: string }) {
	return (
		<div className="flex flex-col items-center gap-3 text-center">
			<h2 className={`${heyComic} text-2xl text-[var(--wv-cyan-soft)] md:text-[28px] xl:text-[32px]`}>
				{title}
			</h2>
			<p className={`${orbitron} text-[13px] text-[var(--lg-body)] xl:text-sm`}>{sub}</p>
		</div>
	);
}

export function WvAffiliate() {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--ct-bg)] text-white">
			<div
				aria-hidden
				className="bg-[var(--wv-cyan-soft)]/10 pointer-events-none absolute -left-24 top-[150px] size-[350px] rounded-full blur-[110px] xl:size-[500px]"
			/>
			<div
				aria-hidden
				className="bg-[var(--wv-pink)]/10 pointer-events-none absolute -right-24 top-[600px] size-[300px] rounded-full blur-[110px] xl:size-[600px]"
			/>
			<div className="relative">
				<WvHeader />

				{/* Hero. The text has depth, as on the other heroes (`.wv-hero-*`): the shop's neon breadcrumb (`.wv-crumb*`:
				    Home glowing cyan, a pink chevron, this page in a neon pill), a 3D title over a glowing pink-to-cyan bar,
				    brighter copy with its key phrases lit, the glossy button and the neon outline one; the art in the heroes'
				    lit neon frame (`.wv-art`, glass, HUD corners); behind it all a pink and cyan glow. */}
				<section className="wv-hero-backdrop flex flex-col gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-8 md:py-12 xl:px-20 xl:py-20">
					<div className="flex min-w-0 max-w-[680px] flex-col gap-5 xl:gap-6">
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
								Affiliate Program
							</span>
						</nav>
						<div className="flex flex-col gap-3">
							<h1 className={`${heyComic} wv-title-glow wv-hero-title leading-none`}>
								<span className="block text-[38px] tracking-[-0.5px] md:text-[42px] xl:text-[54px] xl:leading-[60px]">
									<span className="text-[var(--wv-cyan-soft)]">EARN</span> WITH
								</span>
								<span className="mt-3 block text-[28px] leading-tight tracking-[-0.3px] text-[var(--wv-pink)] md:text-[32px] xl:text-[46px] xl:leading-[52px]">
									WORLDWIDE VAPOR
								</span>
							</h1>
							<span aria-hidden className="wv-hero-bar h-1 w-[120px] rounded-full xl:w-40" />
						</div>
						{/* The apostrophe is {"'"}, not &apos;: SWC drops the space after a tag when the text that follows holds an
						    entity, which would run "commissions" into "with". */}
						<p className={`${orbitron} wv-hero-copy text-sm leading-[1.7] xl:text-base xl:leading-[26px]`}>
							Promote <strong className="wv-hero-key">premium disposable vapes</strong>, state-of-the-art pod
							systems, and delicious e-liquids. Earn{" "}
							<strong className="wv-hero-key wv-hero-key--pink">high-octane commissions</strong> with the
							globe
							{"'"}s trusted e-commerce vapor storefront.
						</p>
						{/* Stacked beside the art on tablets, where the column is too narrow for both in a row. */}
						<div className="flex flex-col gap-3 xl:flex-row xl:gap-4">
							<a
								href="#apply"
								className={`${heyComic} wv-pc-cta flex h-[49px] items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-6 text-base tracking-[0.04em] text-[var(--wv-ink)] xl:px-8`}
							>
								<Handshake aria-hidden className="size-[18px]" strokeWidth={2.25} />
								<span className="wv-pc-cta-label">Apply Now</span>
							</a>
							<a
								href="#tiers"
								className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-[49px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-6 text-base tracking-[0.04em] text-[var(--wv-cyan-soft)] xl:px-8`}
							>
								<span className="wv-btn-label">See Commission Tiers</span>
								<ArrowDown aria-hidden className="size-4" strokeWidth={2.5} />
							</a>
						</div>
					</div>
					<div className="wv-art relative aspect-[1000/638] w-full shrink-0 overflow-hidden rounded-[20px] md:w-[332px] xl:w-[500px]">
						<Image
							src="/home/affiliate/hero.png"
							alt="A neon handshake over a global network of affiliates"
							fill
							priority
							sizes="(min-width: 1280px) 500px, (min-width: 768px) 332px, 100vw"
							className="object-cover"
						/>
						<span aria-hidden className="wv-art-glass absolute inset-0" />
						<span aria-hidden className="wv-art-hud absolute inset-[10px] md:inset-[14px]" />
					</div>
				</section>

				{/* Highlights, as a trust strip: a lit glass band (`.wv-band`) whose items alternate cyan and pink
				    (`.wv-trust-item`), each icon glowing in a neon ring (`.wv-trust-icon`), its title lifted and its text brighter. */}
				<ul className="wv-band grid gap-5 px-4 py-6 md:grid-cols-2 md:gap-6 md:px-8 md:py-8 xl:grid-cols-4 xl:px-20 xl:py-10">
					{HIGHLIGHTS.map((h) => (
						<li
							key={h.title}
							className={`wv-trust-item wv-af-highlight items-center gap-4 ${h.mobile ? "flex" : "hidden md:flex"}`}
						>
							<span aria-hidden className="wv-trust-icon text-[28px] xl:text-[32px]">
								<h.Icon className="size-[0.7em]" strokeWidth={2} />
							</span>
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} wv-trust-title text-sm`}>{h.title}</span>
								<span className={`${orbitron} wv-trust-text text-xs leading-[1.5]`}>{h.text}</span>
							</span>
						</li>
					))}
				</ul>

				{/* Tiers, over a soft pink and cyan glow (`.wv-faq-glow`): a chrome 3D heading (`.wv-heading-title`) over its
				    pink eyebrow-style line and the glowing hero bar; each tier a neon card in its own colour (`.wv-af-tier`, set by
				    `data-tone`): its icon in a lit tile beside a glowing LEVEL tag and its name, the rate lifted and glowing, the sales
				    volume in glass set into the card, and each benefit marked by a small glowing neon tick. */}
				<section
					id="tiers"
					className="wv-faq-glow flex scroll-mt-6 flex-col items-center gap-8 px-4 py-12 md:gap-10 md:px-8 md:py-16 xl:gap-14 xl:px-20 xl:py-[100px]"
				>
					<div className="flex flex-col items-center gap-3 text-center">
						<h2 className={`${bungee} wv-heading-title text-[22px] text-white md:text-[26px] xl:text-[32px]`}>
							COMMISSION TIERS
						</h2>
						<p
							className={`${heyComic} wv-heading-eyebrow text-xs tracking-[2px] text-[var(--wv-pink)] md:text-sm`}
						>
							AFFILIATE PARTNER LEVELS
						</p>
						<span aria-hidden className="wv-hero-bar h-1 w-20 rounded-full xl:w-[100px]" />
					</div>
					<ul className="grid w-full gap-6 md:grid-cols-2 md:gap-5 xl:grid-cols-4 xl:gap-4 2xl:gap-5">
						{TIERS.map((t, i) => (
							<li
								key={t.name}
								data-tone={t.color}
								className="wv-neon-card wv-af-tier flex flex-col gap-5 rounded-2xl p-6 xl:gap-6"
							>
								<div className="flex items-center gap-3">
									<span
										aria-hidden
										className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
									>
										<t.Icon className="size-5" strokeWidth={2.25} />
									</span>
									<div className="flex min-w-0 flex-col items-start gap-1.5">
										<span
											aria-hidden
											className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-[3px] text-[10px] tracking-[1px]`}
										>
											LEVEL {i + 1}
										</span>
										<h3 className={`${bungee} wv-neon-card-timing text-base leading-none`}>{t.name}</h3>
									</div>
								</div>
								<div className="flex flex-col gap-1.5">
									<p className={`${bungee} wv-stat-value text-[44px] leading-none xl:text-[48px]`}>
										{t.rate}
									</p>
									<p className={`${orbitron} wv-neon-card-text text-xs tracking-[1px]`}>COMMISSION RATE</p>
								</div>
								<div className={`${orbitron} wv-af-range flex flex-col gap-1.5 rounded-xl p-3`}>
									<p className="wv-af-range-label flex items-center gap-1 text-[11px]">
										<TrendingUp aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
										MONTHLY SALES VOLUME
									</p>
									<p className="text-[13px] text-white">{t.range}</p>
								</div>
								<div className={`${orbitron} flex flex-col gap-3 text-xs`}>
									<p className="wv-pc-name font-bold text-white">BENEFITS INCLUDED:</p>
									<span aria-hidden className="wv-acct-card-rule h-px w-full" />
									{i > 0 && (
										<p className="wv-af-includes wv-neon-card-text flex items-center gap-2 text-[11px]">
											<Layers aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
											<span>
												Everything in{" "}
												<strong className="wv-neon-key">{tierTitle(AFFILIATE_TIERS[i - 1])}</strong>, plus:
											</span>
										</p>
									)}
									<ul className="wv-neon-card-text flex flex-col gap-2.5">
										{t.benefits.map((b) => (
											<li key={b} className="flex items-start gap-2.5">
												<span
													aria-hidden
													className="wv-rw-mark -mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
												>
													<Check className="size-3" strokeWidth={3} />
												</span>
												{b}
											</li>
										))}
									</ul>
								</div>
							</li>
						))}
					</ul>
				</section>

				{/* Dashboard preview */}
				<section className="flex flex-col gap-8 border-y border-[var(--wv-control)] bg-[var(--ct-bg)] px-4 py-12 md:gap-10 md:px-8 md:py-14 xl:gap-14 xl:p-20">
					<SectionTitle
						title="YOUR AFFILIATE DASHBOARD"
						sub="Sleek real-time metrics designed for optimal growth"
					/>
					<div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-10">
						<div className="flex min-w-0 flex-1 flex-col gap-5 xl:gap-6">
							<div className="flex items-center justify-between gap-3">
								<h3 className={`${heyComic} text-base text-[var(--wv-cyan-soft)] xl:text-lg`}>
									LIVE MONITORING
								</h3>
								<span
									className={`${orbitron} rounded border border-[var(--wv-control)] px-2 py-1 text-[10px] text-[var(--wv-disabled)]`}
								>
									PREVIEW · SAMPLE DATA
								</span>
							</div>
							<ul className="grid gap-4 md:grid-cols-2 xl:gap-5">
								{STATS.map((s) => (
									<li
										key={s.label}
										className={`flex-col gap-3 rounded-xl border border-[var(--wv-control)] bg-[var(--wv-bg)] p-5 xl:p-6 ${s.mobile ? "flex" : "hidden md:flex"}`}
									>
										<p className={`${orbitron} text-xs text-[var(--wv-disabled)]`}>{s.label}</p>
										<p className={`${bungee} text-2xl xl:text-[28px]`}>{s.value}</p>
										<p
											className={`${orbitron} text-[11px] ${s.pink ? "text-[var(--wv-pink)]" : "text-[var(--wv-cyan-soft)]"}`}
										>
											{s.trend}
										</p>
									</li>
								))}
							</ul>
						</div>
						<div className="flex flex-col gap-5 rounded-2xl border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] p-6 shadow-[0_0_8px_var(--wv-cyan-soft)] xl:w-[480px] xl:shrink-0 xl:gap-6 xl:p-8">
							<h3 className={`${heyComic} text-base text-[var(--wv-cyan-soft)]`}>LIVE PAYOUT INFO</h3>
							<div className="flex flex-col gap-2">
								<p className={`${orbitron} text-xs text-[var(--wv-disabled)]`}>
									ACCUMULATED REVENUE (THIS PERIOD)
								</p>
								<p className={`${bungee} text-[32px] xl:text-[40px]`}>$4,250.00</p>
							</div>
							<hr className="border-[var(--wv-control)]" />
							<dl className={`${orbitron} flex flex-col gap-3 text-[13px] xl:gap-4`}>
								<div className="flex justify-between gap-4">
									<dt className="text-[var(--lg-body)]">Next Payout Date:</dt>
									<dd className="text-[var(--wv-cyan-soft)]">April 01, 2026</dd>
								</div>
								<div className="hidden justify-between gap-4 md:flex">
									<dt className="text-[var(--lg-body)]">Payment Method:</dt>
									<dd>Vapor Tokens (+{TOKEN_BONUS_BPS / 100}%)</dd>
								</div>
								<div className="hidden justify-between gap-4 md:flex">
									<dt className="text-[var(--lg-body)]">Payout Threshold:</dt>
									<dd className="text-[var(--wv-disabled)]">$50.00 Minimum</dd>
								</div>
							</dl>
						</div>
					</div>
				</section>

				{/* Referral tools */}
				<section className="flex flex-col items-center gap-8 px-4 py-12 md:gap-10 md:px-8 md:py-14 xl:p-20">
					<SectionTitle
						title="REFERRAL & TRACKING TOOLS"
						sub="High conversion assets to share with your audience"
					/>
					<div className="flex w-full flex-col gap-4 xl:flex-row xl:gap-6">
						<div className="flex min-w-0 flex-1 flex-col gap-5 rounded-2xl border border-[var(--wv-control)] bg-[var(--wv-ink)] p-5 md:p-8 xl:gap-6 xl:self-start">
							<h3 className={`${heyComic} text-base md:text-lg`}>YOUR GENERAL REFERRAL LINK</h3>
							<p
								className={`${heyComic} truncate rounded-lg border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] px-4 py-3 text-sm`}
							>
								https://worldwidevapor.com/?aff=wv_neo_2026
							</p>
							<p className={`${orbitron} hidden text-xs text-[var(--wv-disabled)] md:block`}>
								Place this unique tracking URL in your bio, video descriptions, or website banners to
								attribute sales.
							</p>
							<p className={`${orbitron} text-[11px] text-[var(--wv-disabled)]`}>
								Sample link. Your personal link is issued once your application is approved.
							</p>
						</div>
						<ul className="flex flex-col gap-3 xl:w-[480px] xl:shrink-0 xl:gap-4">
							{TOOLS.map((t) => (
								<li
									key={t.title}
									className="flex flex-col gap-1 rounded-xl border border-[var(--wv-control)] bg-[var(--wv-ink)] p-5"
								>
									<span className={`${heyComic} text-[13px]`}>{t.title}</span>
									<span className={`${orbitron} text-[11px] leading-[1.5] text-[var(--lg-body)]`}>
										{t.text}
									</span>
								</li>
							))}
						</ul>
					</div>
				</section>

				{/* Apply */}
				<section
					id="apply"
					className="flex scroll-mt-6 flex-col items-center gap-8 px-4 py-12 md:px-8 md:py-14 xl:px-20 xl:py-20"
				>
					<SectionTitle
						title="APPLY TO JOIN"
						sub="Tell us about your audience. We review every application by hand."
					/>
					{/* Depends on who's looking (signed out, applying, under review, or already an affiliate). */}
					<div className="w-full max-w-[820px]">
						<Suspense fallback={<AffiliateApplySkeleton />}>
							<AffiliateApply />
						</Suspense>
					</div>
				</section>

				{/* Benefits */}
				<ul className="grid gap-4 px-4 pb-12 md:grid-cols-2 md:px-8 md:pb-14 xl:grid-cols-4 xl:gap-5 xl:p-20">
					{BENEFITS.map((b) => (
						<li
							key={b.title}
							className="flex flex-col gap-4 rounded-r-lg border border-l-4 border-[var(--wv-control)] bg-[var(--wv-ink)] p-6"
						>
							<span aria-hidden className="text-4xl leading-none">
								{b.icon}
							</span>
							<span className={`${heyComic} text-sm text-[var(--wv-cyan-soft)]`}>{b.title}</span>
							<span className={`${orbitron} text-xs leading-[18px] text-[var(--lg-body)]`}>{b.text}</span>
						</li>
					))}
				</ul>

				<WvFooter />
			</div>
		</div>
	);
}
