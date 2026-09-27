import Image from "next/image";
import Link from "next/link";
import { AffiliateApplyForm } from "./wv-affiliate-form";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** Worldwide Vapor affiliate program — Figma "6.18 - High Fidelity - Affiliate Program" (desktop 1440, tablet 768, mobile 360). */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const HIGHLIGHTS = [
	{
		icon: "💎",
		title: "15% COMMISSION",
		text: "Earn top-tier industry commissions on every single referral",
		mobile: true,
	},
	{
		icon: "⚡",
		title: "REAL-TIME TRACKING",
		text: "Live cookie tracking & instant conversions on your dashboard",
		mobile: true,
	},
	{
		icon: "📅",
		title: "30-DAY COOKIE",
		text: "Generous window to maximize your referral conversions",
		mobile: true,
	},
	{
		icon: "💰",
		title: "MONTHLY PAYOUTS",
		text: "Guaranteed prompt payouts on the 1st of every month",
		mobile: false,
	},
];

const TIERS = [
	{
		name: "CLOUD",
		rate: "10%",
		range: "$0 - $1,000 / mo",
		color: "yellow",
		benefits: [
			"Basic marketing banners",
			"Monthly payout schedule",
			"Standard email support",
			"30-day cookie life",
		],
	},
	{
		name: "VAPOR",
		rate: "12%",
		range: "$1,001 - $5,000 / mo",
		color: "orange",
		benefits: [
			"Custom social templates",
			"Priority email support",
			"Early access to select drops",
			"Co-branded landing page",
		],
	},
	{
		name: "SURGE",
		rate: "15%",
		range: "$5,001 - $15,000 / mo",
		color: "pink",
		benefits: [
			"Bi-weekly payout option",
			"Dedicated account manager",
			"Exclusive product samples",
			"Custom discount codes",
		],
	},
	{
		name: "GLOBAL",
		rate: "20%",
		range: "$15,000+ / mo",
		color: "cyan",
		benefits: [
			"Weekly payout on-demand",
			"Highest commission rate",
			"Sponsorship & merch kit",
			"Direct Slack line to execs",
		],
	},
] as const;

const TIER_COLOR = {
	yellow: {
		text: "text-[var(--af-yellow)]",
		border: "border-[var(--af-yellow)]",
		glow: "[--glow:var(--af-yellow)]",
		check: "text-[var(--wv-cyan-soft)]",
	},
	orange: {
		text: "text-[var(--af-orange)]",
		border: "border-[var(--af-orange)]",
		glow: "[--glow:var(--af-orange)]",
		check: "text-[var(--wv-cyan-soft)]",
	},
	pink: {
		text: "text-[var(--af-pink)]",
		border: "border-[var(--af-pink)]",
		glow: "[--glow:var(--af-pink)]",
		check: "text-[var(--wv-cyan-soft)]",
	},
	cyan: {
		text: "text-[var(--af-cyan)]",
		border: "border-[var(--af-cyan)]",
		glow: "[--glow:var(--af-cyan)]",
		check: "text-[var(--wv-pink)]",
	},
} as const;

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

				{/* Hero */}
				<section className="flex flex-col gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-8 md:py-12 xl:px-20 xl:py-20">
					<div className="flex max-w-[680px] flex-col gap-5 xl:gap-6">
						<nav
							aria-label="Breadcrumb"
							className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px]"
						>
							<Link href="/home" className={`${bungee} text-[var(--ct-placeholder)]`}>
								Home
							</Link>
							<span aria-hidden className={`${orbitron} font-bold text-[var(--ct-placeholder)]`}>
								&gt;
							</span>
							<span aria-current="page" className={`${bungee} text-[var(--wv-cyan-soft)]`}>
								Affiliate Program
							</span>
						</nav>
						<div className="flex flex-col gap-3">
							<h1 className={`${heyComic} leading-none`}>
								<span className="block text-[38px] tracking-[-0.5px] md:text-[42px] xl:text-[54px] xl:leading-[60px]">
									<span className="text-[var(--wv-cyan-soft)]">EARN</span> WITH
								</span>
								<span className="mt-3 block text-[28px] leading-tight tracking-[-0.3px] text-[var(--wv-pink)] md:text-[32px] xl:text-[46px] xl:leading-[52px]">
									WORLDWIDE VAPOR
								</span>
							</h1>
							<span aria-hidden className="h-[2px] w-[120px] bg-[var(--wv-cyan-soft)] xl:w-40" />
						</div>
						<p
							className={`${orbitron} text-sm leading-[1.7] text-[var(--lg-body)] xl:text-base xl:leading-[26px]`}
						>
							Promote premium disposable vapes, state-of-the-art pod systems, and delicious e-liquids. Earn
							high-octane commissions with the globe&apos;s trusted e-commerce vapor storefront.
						</p>
						<div className="flex flex-col gap-3 md:flex-row md:gap-4">
							<a
								href="#apply"
								className={`${heyComic} flex items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-cyan-soft)] px-6 py-[14px] text-base tracking-[0.04em] text-[var(--wv-ink)]`}
							>
								Apply Now
							</a>
							<a
								href="#tiers"
								className={`${heyComic} flex items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] px-6 py-[14px] text-base tracking-[0.04em] text-[var(--wv-cyan-soft)]`}
							>
								See Commission Tiers
							</a>
						</div>
					</div>
					<div className="relative h-[180px] w-full shrink-0 overflow-hidden rounded-2xl border border-[var(--wv-cyan-soft)] shadow-[0_0_30px_rgba(105,235,255,0.16)] md:h-[240px] md:w-[332px] xl:h-[280px] xl:w-[440px]">
						<Image
							src="/home/affiliate/hero.png"
							alt="A neon handshake over a global network of affiliates"
							fill
							priority
							sizes="(min-width: 1280px) 440px, (min-width: 768px) 332px, 328px"
							className="object-cover"
						/>
					</div>
				</section>

				{/* Highlights */}
				<ul className="grid gap-4 border-y border-[var(--wv-cyan-soft)] bg-[var(--wv-ink)] px-4 py-6 md:grid-cols-2 md:gap-6 md:px-8 md:py-8 xl:grid-cols-4 xl:px-20 xl:py-10">
					{HIGHLIGHTS.map((h) => (
						<li key={h.title} className={`items-center gap-4 ${h.mobile ? "flex" : "hidden md:flex"}`}>
							<span aria-hidden className="text-[32px] leading-none">
								{h.icon}
							</span>
							<span className="flex min-w-0 flex-col gap-1">
								<span className={`${heyComic} text-sm`}>{h.title}</span>
								<span className={`${orbitron} text-xs text-[var(--lg-body)]`}>{h.text}</span>
							</span>
						</li>
					))}
				</ul>

				{/* Tiers */}
				<section
					id="tiers"
					className="flex scroll-mt-6 flex-col items-center gap-8 px-4 py-12 md:gap-10 md:px-8 md:py-16 xl:gap-14 xl:px-20 xl:py-[100px]"
				>
					<div className="flex flex-col items-center gap-3">
						<h2 className={`${bungee} text-[22px] text-[var(--wv-cyan-soft)] md:text-[26px] xl:text-[32px]`}>
							COMMISSION TIERS
						</h2>
						<p className={`${heyComic} text-xs tracking-[2px] md:text-sm`}>AFFILIATE PARTNER LEVELS</p>
						<span aria-hidden className="h-[2px] w-20 bg-[var(--wv-pink)] xl:w-[100px]" />
					</div>
					<ul className="grid w-full gap-8 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
						{TIERS.map((t) => {
							const c = TIER_COLOR[t.color];
							return (
								<li
									key={t.name}
									className={`af-glow flex flex-col gap-5 rounded-2xl border-2 bg-[var(--wv-ink)] p-6 xl:gap-6 xl:p-8 ${c.border} ${c.glow}`}
								>
									<p className={`${bungee} text-base ${c.text}`}>{t.name}</p>
									<div className="flex flex-col gap-1">
										<p className={`${bungee} text-[40px] leading-none xl:text-[48px] ${c.text}`}>{t.rate}</p>
										<p className={`${orbitron} text-xs text-[var(--lg-body)]`}>COMMISSION RATE</p>
									</div>
									<div className={`${orbitron} flex flex-col gap-1 rounded-lg bg-[var(--wv-surface)] p-3`}>
										<p className="text-[11px] text-[var(--wv-disabled)]">MONTHLY SALES VOLUME</p>
										<p className="text-[13px]">{t.range}</p>
									</div>
									<div className={`${orbitron} flex flex-col gap-3 text-xs`}>
										<p className="font-bold">BENEFITS INCLUDED:</p>
										<ul className="flex flex-col gap-3">
											{t.benefits.map((b) => (
												<li key={b} className="flex items-center gap-2 text-[var(--lg-body)]">
													<span aria-hidden className={c.check}>
														✓
													</span>
													{b}
												</li>
											))}
										</ul>
									</div>
								</li>
							);
						})}
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
									<dd>Direct Bank Transfer</dd>
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
					<div className="w-full max-w-[820px]">
						<AffiliateApplyForm />
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
