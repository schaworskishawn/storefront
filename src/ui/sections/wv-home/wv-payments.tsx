import Link from "next/link";
import { WvFooter, WvHeader } from "./wv-chrome";
import { CardNewsletterForm } from "./wv-newsletter-client";
import "./wv-home.css";

/**
 * Worldwide Vapor payments page — Figma "6.03 - High Fidelity - Payments".
 * Responsive: mobile base (Figma 360), tablet from `md` (768), desktop from `xl` (1280+, Figma 1440).
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

const BADGES = ["Visa", "Mastercard", "Amex", "Discover", "PayPal", "Apple Pay", "Google Pay", "⚡ Bitcoin"];

const METHODS = [
	{
		icon: "💳",
		title: "Credit & Debit Cards",
		text: "Visa, Mastercard, Discover, and American Express processed globally with instant validation.",
	},
	{
		icon: "🅿️",
		title: "PayPal Integration",
		text: "Express Checkout with PayPal balance, connected bank accounts, or pay-later arrangements.",
	},
	{
		icon: "🍎",
		title: "Apple Pay",
		text: "Seamless one-touch transactions secure from iOS, iPadOS, and macOS devices instantly.",
	},
	{
		icon: "🤖",
		title: "Google Pay",
		text: "Quick verification and secure credit tokens directly via Android or Chrome payment agents.",
	},
	{
		icon: "🛍️",
		title: "Shop Pay",
		text: "Access rapid profile billing, tracking tools, and split payment installations automatically.",
	},
	{
		icon: "🪙",
		title: "Crypto Payments",
		text: "Decentralized privacy using standard Bitcoin (BTC), Ethereum (ETH), and major stablecoins.",
	},
	{
		icon: "🎁",
		title: "Gift Cards",
		text: "Apply promo points, store voucher balances, or bulk discount gift credits directly at checkout.",
	},
	{
		icon: "🗓️",
		title: "Buy Now Pay Later",
		text: "Tier options enabling custom payment plans and split credit rates for bulk distributions.",
	},
];

const TRUST = [
	{ icon: "🛡️", title: "100% Secure Payments", text: "AES-256 bank-level encryption standard." },
	{ icon: "⚡", title: "Fast & Reliable", text: "Immediate order updates and validation." },
	{ icon: "🌀", title: "Multiple Options", text: "Traditional cards, digital wallets & crypto." },
	{ icon: "📞", title: "24/7 Priority Support", text: "Direct response line for all transaction logs." },
];

const FAQS = [
	{
		q: "What security compliance do you use?",
		a: "We utilize level 1 PCI-DSS compliant processing along with automated fraud protection filters to ensure fully verified, highly encrypted transactional pipelines.",
	},
	{ q: "Can I pay with multiple payment methods?" },
	{ q: "Do you support immediate cryptocurrency settlements?" },
	{ q: "Are there extra transactional fee rates?" },
	{ q: "How are payment declines resolved?" },
];

const PENDING_ANSWER =
	"Details for this answer are coming soon. Contact support@worldwidevapor.com in the meantime.";

function OutlineLink({ href, children }: { href: string; children: string }) {
	return (
		<Link
			href={href}
			className={`${heyComic} flex h-[45px] items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)] md:h-[46px] xl:h-[49px]`}
		>
			{children}
		</Link>
	);
}

export function WvPayments() {
	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			<section className="relative overflow-hidden">
				<span className="absolute left-[120px] top-[90px] hidden size-[5px] rounded-full bg-[var(--wv-cyan-soft)] xl:block" />
				<span className="absolute left-[450px] top-[320px] hidden size-[3px] rounded-full bg-[var(--wv-pink)] xl:block" />
				<span className="absolute left-[600px] top-20 hidden size-1 rounded-full bg-[var(--wv-cyan-soft)] xl:block" />
				<div className="relative flex flex-col items-center gap-6 px-5 py-5 md:flex-row md:gap-6 md:px-6 md:py-6 xl:gap-12 xl:px-20 xl:py-12">
					<div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-xl shadow-[0_0_32px_4px_rgba(0,229,255,0.12)] md:h-[307px] md:w-[320px] xl:h-[444px] xl:w-[540px]">
						{/* eslint-disable-next-line @next/next/no-img-element -- cropped artwork positioned by percentage */}
						<img
							src="/home/imgPaymentsHero.png"
							alt="Worldwide Vapor"
							className="absolute left-[-8.82%] top-[-0.34%] h-[100.69%] w-[117.65%] max-w-none"
						/>
					</div>
					<div className="flex min-w-0 flex-1 flex-col items-center gap-4 text-center md:items-start md:text-left xl:gap-6">
						<span
							className={`${heyComic} rounded-full border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] px-4 py-[6px] text-xs tracking-[1.5px] text-[var(--wv-cyan-soft)]`}
						>
							FAST &amp; ENCRYPTED TRANSACTIONS
						</span>
						<div className="flex w-full flex-col items-center gap-3 md:items-start">
							<h1
								className={`${heyComic} text-[28px] leading-[1.1] md:text-[40px] md:leading-tight xl:text-[54px] xl:leading-[60px]`}
							>
								SECURE &amp; EASY PAYMENTS
							</h1>
							<div className="h-1 w-[120px] rounded-full bg-[var(--wv-pink)]" />
						</div>
						<p className={`${orbitron} text-sm leading-[1.6] text-[var(--wv-text-dim)] xl:text-base`}>
							Fast-track your inventory procurement. Whether wholesale, retail, or custom global distribution
							rates, our fully compliant, encrypted checkout system processes your purchase instantly.
						</p>
						<div className="flex flex-col items-center gap-3 md:flex-row md:gap-4">
							<Link
								href="/shop"
								className={`${heyComic} flex h-[45px] items-center justify-center rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)] md:h-[46px] xl:h-[49px]`}
							>
								Shop Best Sellers
							</Link>
							<OutlineLink href="#faqs">View Payment FAQs</OutlineLink>
						</div>
					</div>
				</div>
			</section>

			{/* We accept */}
			<section className="flex flex-col items-center gap-5 border-y border-[var(--wv-cyan-soft)] bg-[var(--wv-ink)] px-5 py-5 md:px-8 md:py-7 xl:px-20 xl:py-8">
				<p
					className={`${heyComic} text-center text-xs uppercase tracking-[2px] text-[var(--wv-text-dim)] md:text-sm`}
				>
					PROUDLY ACCEPTING SECURED PAYMENTS FROM
				</p>
				<div className="flex flex-wrap justify-center gap-3 xl:gap-4">
					{BADGES.map((b) => (
						<span
							key={b}
							className={`${heyComic} rounded-lg border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] px-4 py-[6px] text-[13px] xl:px-5 xl:py-2 xl:text-sm`}
						>
							{b}
						</span>
					))}
				</div>
			</section>

			{/* Payment options */}
			<section className="flex flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-10 xl:gap-12 xl:p-20">
				<div className="flex flex-col items-center gap-2 text-center">
					<p
						className={`${marker} text-[18px] uppercase tracking-[2px] text-[var(--wv-pink)] md:text-[22px] xl:text-2xl`}
					>
						Worldwide <span className="text-[var(--wv-cyan)]">vapor</span>
					</p>
					<h2 className={`${bungee} text-[22px] tracking-[1px] md:text-[26px] xl:text-[32px]`}>
						Payment Options
					</h2>
					<div className="h-[3px] w-[60px] rounded-full bg-[var(--wv-cyan-soft)] xl:w-20" />
				</div>
				<div className="grid w-full max-w-[1280px] grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4 xl:gap-6">
					{METHODS.map((m) => (
						<article
							key={m.title}
							className="flex flex-col gap-3 rounded-2xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-5 xl:p-6"
						>
							<span className="flex size-10 items-center justify-center rounded-lg border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] text-xl">
								{m.icon}
							</span>
							<h3 className={`${heyComic} text-base`}>{m.title}</h3>
							<p className={`${orbitron} text-[13px] leading-[1.5] text-[var(--wv-text-dim)]`}>{m.text}</p>
						</article>
					))}
				</div>
			</section>

			{/* Trust */}
			<section className="grid grid-cols-1 gap-5 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-5 py-6 md:grid-cols-2 md:gap-x-6 md:gap-y-6 md:px-8 xl:flex xl:items-start xl:justify-between xl:px-20 xl:py-10">
				{TRUST.map((t) => (
					<div key={t.title} className="flex items-center gap-4 xl:w-[280px]">
						<span className="text-[28px] xl:text-[32px]">{t.icon}</span>
						<div className="flex min-w-0 flex-1 flex-col gap-[2px]">
							<p className={`${heyComic} text-sm`}>{t.title}</p>
							<p className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>{t.text}</p>
						</div>
					</div>
				))}
			</section>

			{/* FAQ + newsletter */}
			<section
				id="faqs"
				className="flex flex-col gap-8 px-5 py-8 md:px-8 md:py-12 xl:flex-row xl:items-start xl:gap-12 xl:p-20"
			>
				<div className="flex min-w-0 flex-1 flex-col gap-4 xl:gap-6">
					<div className="flex flex-col gap-2">
						<p className={`${marker} text-lg text-[var(--wv-pink)] md:text-xl`}>QUESTIONS</p>
						<h2 className={`${bungee} text-2xl md:text-[28px] xl:text-[32px]`}>PAYMENT FAQS</h2>
					</div>
					<div className="flex flex-col gap-3 xl:gap-4">
						{FAQS.map((f, i) => (
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
				<div className="flex w-full shrink-0 flex-col gap-6 rounded-[20px] border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-5 shadow-[0_0_12px_rgba(241,121,251,0.06)] md:gap-8 md:p-8 xl:w-[480px] xl:p-10">
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

			<WvFooter />
			<div className="wv-glow-line mx-auto w-[1100px] max-w-full" />
		</div>
	);
}
