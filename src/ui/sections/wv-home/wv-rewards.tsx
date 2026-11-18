import {
	ArrowDown,
	BadgeCheck,
	BadgePercent,
	Ban,
	Check,
	Coins,
	Hourglass,
	LogIn,
	ShoppingBag,
	Ticket,
	X,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { describeExpiry, formatRate, hundredTokensWorth, tokenCount } from "@/lib/rewards/program-copy";
import type { RewardsConfig } from "@/lib/rewards/tokens";
import { WvFooter, WvHeader } from "./wv-chrome";
import { SectionHeading } from "./wv-product-section";
import { RewardsCalculator } from "./wv-rewards-calculator";
import { RewardsHeroArt } from "./wv-rewards-hero-art";
import "./wv-home.css";

/**
 * Worldwide Vapor rewards page: what Vapor Tokens are, how to earn and spend them, the signed-in customer's balance and
 * history (passed in as `account`, which streams in separately so the rest of the page can be served instantly), and the
 * answers to the usual questions. Every number comes from the live program settings, so the page never promises a rate or
 * expiry the store isn't using. Responsive: mobile base (360), tablet from `md` (768), desktop from `xl` (1280+).
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
/** The glossy cyan button (`.wv-pc-cta`, its label in `.wv-pc-cta-label`) and the neon outline one (`.wv-btn-neon`, its
 * label in `.wv-btn-label`), as on the other pages. */
const primaryButton = `${heyComic} wv-pc-cta flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)] md:h-[46px] xl:h-[49px]`;
const outlineButton = `${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-[45px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)] md:h-[46px] xl:h-[49px]`;

type Faq = { q: string; a: string };

function faqsFor(config: RewardsConfig): Faq[] {
	const expiry = describeExpiry(config.expiryMonths);
	return [
		{
			q: "Who can earn Vapor Tokens?",
			a: `Anyone with an account who is signed in when they check out. An order placed as a guest earns nothing, so sign in before you pay. Every $1 you spend on products earns ${tokenCount(config.tokensPerDollar)}.`,
		},
		{
			q: "When do my tokens arrive?",
			a: "As soon as the order is fully paid, and they show up on this page. For an Interac e-Transfer order that is once we have received your transfer; for a crypto payment it is once the payment is confirmed.",
		},
		{
			q: "What is a token worth?",
			a: `100 tokens take ${hundredTokensWorth()} off an order. You can use as many as you like, up to what is left to pay.`,
		},
		{
			q: "How do I spend my tokens?",
			a: "Sign in, go through checkout as normal, and on the payment step tap “Use my tokens”. They come off your total before you pay. If you have tokens from several orders, the ones expiring soonest are used first.",
		},
		{
			q: "Do tokens expire?",
			a:
				config.expiryMonths > 0
					? `Yes. Each order's tokens expire ${expiry.short} after you earn them. This page shows every batch's expiry date, and checkout warns you when some are about to expire.`
					: "No, your tokens don't expire.",
		},
		{
			q: "Do I earn tokens on shipping, tax or gift cards?",
			a: "No. Tokens are earned on the money you pay for products. Shipping, tax, and any part of an order paid with a gift card or with Vapor Tokens don't earn tokens.",
		},
		{
			q: "What happens if I cancel or return an order?",
			a: "If an order is cancelled or refunded in full, the tokens it earned are taken back and any tokens you spent on it go back into your balance.",
		},
		{
			q: "Can I use my tokens in any currency?",
			a: "Tokens work in the currency they were earned in. Tokens earned on a Canadian-dollar order are spent on Canadian-dollar orders, and the same for US dollars.",
		},
	];
}

/** The program's three headline numbers, each with its icon. */
function stats(config: RewardsConfig): { Icon: LucideIcon; value: string; label: string }[] {
	return [
		{
			Icon: Coins,
			value: formatRate(config.tokensPerDollar),
			label: `${config.tokensPerDollar === 1 ? "Token" : "Tokens"} for every $1 spent on products`,
		},
		{
			Icon: BadgePercent,
			value: `100 = ${hundredTokensWorth()}`,
			label: "What your tokens are worth at checkout",
		},
		{
			Icon: Hourglass,
			value: describeExpiry(config.expiryMonths).short,
			label: "Before a batch of tokens expires",
		},
	];
}

const EARNS = ["Money you pay for products, however you pay", "Orders placed while you are signed in"];

const DOES_NOT_EARN = [
	"Shipping and tax",
	"The part of an order paid with a gift card",
	"The part of an order paid with Vapor Tokens",
	"Orders placed as a guest",
];

/**
 * The hero's art: the program's idea drawn in the site's style (wv-rewards-hero-art.tsx), a shopping bag throwing
 * tokens onto a glowing stack that pays down a price tag, framed as a lit neon screen like the other heroes' art: a
 * cyan-to-pink edge that glows (`.wv-art`), glass over it and HUD corner brackets.
 */
function HeroArt() {
	return (
		<div className="wv-art relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-[20px] md:aspect-[4/3] md:w-[320px] xl:w-[500px]">
			<RewardsHeroArt idPrefix="rewards-hero-art" />
			<span aria-hidden className="wv-art-glass absolute inset-0" />
			<span aria-hidden className="wv-art-hud absolute inset-[10px] md:inset-[14px]" />
		</div>
	);
}

/**
 * One side of the fine print: a neon card (cyan for what earns, pink for what doesn't; `.wv-neon-card`) led by its icon in
 * a lit tile and a glowing title over a neon line, each line marked by a small glowing neon badge (`.wv-rw-mark`).
 */
function FinePrint({
	pink = false,
	Icon,
	Mark,
	title,
	items,
}: {
	pink?: boolean;
	Icon: LucideIcon;
	Mark: LucideIcon;
	title: string;
	items: readonly string[];
}) {
	return (
		<div
			className={`wv-neon-card wv-rw-card ${pink ? "wv-neon-card--pink" : ""} flex flex-col gap-4 rounded-2xl p-5 xl:p-6`}
		>
			<div className="flex items-center gap-3">
				<span
					aria-hidden
					className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
				>
					<Icon className="size-5" strokeWidth={2.25} />
				</span>
				<h3 className={`${heyComic} wv-neon-card-timing text-base xl:text-lg`}>{title}</h3>
			</div>
			<span aria-hidden className="wv-acct-card-rule h-px w-full" />
			<ul className={`${orbitron} wv-neon-card-text flex flex-col gap-2.5 text-[13px] leading-[1.5]`}>
				{items.map((e) => (
					<li key={e} className="flex items-start gap-2.5">
						<span
							aria-hidden
							className="wv-rw-mark mt-px flex size-5 shrink-0 items-center justify-center rounded-full"
						>
							<Mark className="size-3" strokeWidth={3} />
						</span>
						{e}
					</li>
				))}
			</ul>
		</div>
	);
}

export function WvRewards({ config, account }: { config: RewardsConfig; account: ReactNode }) {
	const expiry = describeExpiry(config.expiryMonths);
	const faqs = faqsFor(config);

	const steps: { n: string; Icon: LucideIcon; title: string; text: string }[] = [
		{
			n: "1",
			Icon: LogIn,
			title: "Sign in and shop",
			text: "Tokens go to signed-in customers, so log in or create a free account before you check out.",
		},
		{
			n: "2",
			Icon: Coins,
			title: "Earn on every order",
			text: `Every $1 you spend on products earns ${tokenCount(config.tokensPerDollar)}. They land in your account as soon as the order is fully paid.`,
		},
		{
			n: "3",
			Icon: Ticket,
			title: "Spend them at checkout",
			text: `On the payment step, tap “Use my tokens”. 100 tokens take ${hundredTokensWorth()} off your order. ${expiry.sentence}`,
		},
	];

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			{/* The hero's text has depth, as on the other heroes (`.wv-hero-*`): a neon badge with glowing coins, a 3D title
			    over a glowing pink-to-cyan bar, brighter copy with the program's key facts lit, the glossy button and the
			    neon outline one; behind it all a pink and cyan glow (`.wv-hero-backdrop`). */}
			<section className="wv-hero-backdrop relative overflow-hidden">
				<div className="relative flex flex-col items-center gap-6 px-5 py-8 md:flex-row-reverse md:gap-8 md:px-8 md:py-12 xl:gap-16 xl:px-20 xl:py-16">
					<HeroArt />
					<div className="flex min-w-0 flex-1 flex-col items-start gap-4 md:gap-5">
						<span
							className={`${heyComic} wv-hero-badge flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1.5px] md:px-4 md:py-[6px] md:text-[11px]`}
						>
							<Coins aria-hidden className="size-3.5 md:size-4" strokeWidth={2.25} />
							WORLDWIDE VAPOR REWARDS
						</span>
						<div className="flex w-full flex-col gap-3">
							<h1
								className={`${heyComic} wv-title-glow wv-hero-title text-[34px] leading-[38px] md:text-[44px] md:leading-[50px] xl:text-[56px] xl:leading-[64px]`}
							>
								<span>VAPOR</span> <span className="text-[var(--wv-cyan-soft)]">TOKENS</span>
							</h1>
							<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
						</div>
						<p className={`${orbitron} wv-hero-copy max-w-[560px] text-[13px] leading-[1.6] md:text-[15px]`}>
							Get rewarded for shopping with us. Earn{" "}
							<strong className="wv-hero-key">{tokenCount(config.tokensPerDollar)} for every $1</strong> you
							spend on products, then{" "}
							<strong className="wv-hero-key wv-hero-key--pink">spend them at checkout</strong>: 100 tokens
							take <strong className="wv-hero-key">{hundredTokensWorth()} off</strong> your order.
						</p>
						{/* Stacked beside the art on tablets, where the column is too narrow for both in a row. */}
						<div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:gap-4">
							<Link href="/shop" className={primaryButton}>
								<ShoppingBag aria-hidden className="size-4" strokeWidth={2.5} />
								<span className="wv-pc-cta-label">START SHOPPING</span>
							</Link>
							<a href="#how" className={outlineButton}>
								<span className="wv-btn-label">HOW IT WORKS</span>
								<ArrowDown aria-hidden className="size-4" strokeWidth={2.5} />
							</a>
						</div>
					</div>
				</div>
			</section>

			{/* The program in three numbers, in a lit glass band (`.wv-band`): each led by its icon in a glowing neon ring
			    (`.wv-trust-icon`; cyan, pink, cyan), its value lifted and glowing in that colour (`.wv-stat-value`), its label
			    brighter, with glowing neon lines between them. A row each on phones, side by side from tablets up. */}
			<section className="wv-band grid grid-cols-1 gap-4 px-5 py-6 md:grid-cols-3 md:gap-6 md:px-8 xl:px-20 xl:py-8">
				{stats(config).map((s) => (
					<div
						key={s.label}
						className="wv-trust-item wv-stat flex items-center gap-4 md:flex-col md:gap-2 md:text-center"
					>
						<span aria-hidden className="wv-trust-icon text-2xl xl:text-[28px]">
							<s.Icon className="size-[0.75em]" strokeWidth={2} />
						</span>
						<div className="flex min-w-0 flex-col gap-1 md:items-center">
							<p
								className={`${bungee} wv-stat-value text-[26px] leading-tight md:text-[28px] xl:text-[34px]`}
							>
								{s.value}
							</p>
							<p className={`${orbitron} wv-trust-text text-xs`}>{s.label}</p>
						</div>
					</div>
				))}
			</section>

			{/* Signed-in balance and history, or a sign-in prompt */}
			<section
				id="your-tokens"
				className="flex scroll-mt-6 flex-col gap-6 px-5 py-8 md:px-8 md:py-12 xl:px-20 xl:py-16"
			>
				<SectionHeading eyebrow="Your account" title="YOUR TOKENS" />
				<div className="mx-auto w-full max-w-[1100px]">{account}</div>
			</section>

			{/* How it works */}
			<section
				id="how"
				className="wv-nebula flex scroll-mt-6 flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16"
			>
				<SectionHeading eyebrow="Simple as 1, 2, 3" title="HOW IT WORKS" />
				{/* Each step a neon card (cyan, pink, cyan; `.wv-neon-card`), led by its icon in a lit tile and a glowing
				    step tag, with its number as a big neon outline in the corner; glowing lines run from one step to the
				    next, down on phones and tablets, across on desktops (`.wv-step*` in wv-home.css). */}
				<ol className="grid w-full max-w-[1100px] grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">
					{steps.map((s, i) => (
						<li
							key={s.n}
							className={`wv-neon-card wv-rw-card wv-step ${i % 2 === 1 ? "wv-neon-card--pink" : ""} flex flex-col gap-3 rounded-2xl p-5 xl:p-6`}
						>
							<span
								aria-hidden
								className={`${bungee} wv-step-ghost pointer-events-none absolute right-4 top-2 text-[64px] leading-none xl:text-[72px]`}
							>
								{s.n}
							</span>
							<div className="flex items-center gap-3">
								<span
									aria-hidden
									className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
								>
									<s.Icon className="size-5" strokeWidth={2.25} />
								</span>
								<span
									aria-hidden
									className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-1 text-[10px] tracking-[1px]`}
								>
									STEP {s.n}
								</span>
							</div>
							<h3 className={`${heyComic} wv-pc-name text-base xl:text-lg`}>{s.title}</h3>
							<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>{s.text}</p>
						</li>
					))}
				</ol>
			</section>

			{/* What earns and what doesn't, over a soft pink and cyan glow (`.wv-faq-glow`). */}
			<section className="wv-faq-glow flex flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16">
				<SectionHeading eyebrow="The fine print, in plain words" title="WHAT EARNS TOKENS" />
				<div className="grid w-full max-w-[1100px] grid-cols-1 gap-4 md:grid-cols-2 xl:gap-6">
					<FinePrint Icon={BadgeCheck} Mark={Check} title="EARNS TOKENS" items={EARNS} />
					<FinePrint pink Icon={Ban} Mark={X} title="DOESN'T EARN TOKENS" items={DOES_NOT_EARN} />
				</div>
			</section>

			{/* Calculator */}
			<section className="wv-nebula flex flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16">
				<SectionHeading eyebrow="Try it" title="WHAT WOULD I EARN?" />
				<RewardsCalculator tokensPerDollar={config.tokensPerDollar} />
			</section>

			{/* FAQ: the shipping page's glassy neon answer panels (`.wv-info-*`: pink while closed, cyan once open, the +/−
			    in a neon ring, the question lifted), over a soft pink and cyan glow (`.wv-faq-glow`). */}
			<section
				id="faqs"
				className="wv-faq-glow flex scroll-mt-6 flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16"
			>
				<SectionHeading eyebrow="Questions" title="REWARDS FAQS" />
				<div className="flex w-full max-w-[860px] flex-col gap-3 xl:gap-4">
					{faqs.map((f, i) => (
						<details key={f.q} open={i === 0} className="wv-info-item group rounded-xl p-4 md:p-5">
							<summary
								className={`${heyComic} wv-trust-title flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] [&::-webkit-details-marker]:hidden`}
							>
								{f.q}
								<span aria-hidden className="wv-info-toggle font-mono text-base">
									<span className="group-open:hidden">+</span>
									<span className="hidden group-open:inline">−</span>
								</span>
							</summary>
							<p className={`${orbitron} wv-trust-text wv-unfold mt-3 text-[13px] leading-[1.6]`}>{f.a}</p>
						</details>
					))}
				</div>
			</section>

			{/* Closing call to action */}
			<section className="wv-nebula flex flex-col items-center gap-5 border-y border-[var(--wv-purple)] px-5 py-10 text-center md:px-8 md:py-14 xl:py-20">
				<h2 className={`${heyComic} text-[26px] leading-tight md:text-[34px] xl:text-[40px]`}>
					EVERY ORDER GETS YOU <span className="text-[var(--wv-cyan-soft)]">CLOSER</span> TO THE NEXT ONE
				</h2>
				<p
					className={`${orbitron} max-w-[520px] text-[13px] leading-[1.6] text-[var(--wv-text-dim)] md:text-sm`}
				>
					Sign in, shop, and your tokens add up automatically. Questions? Our team is happy to help.
				</p>
				<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:gap-4">
					<Link href="/shop" className={primaryButton}>
						<span className="wv-pc-cta-label">SHOP NOW</span>
					</Link>
					<Link href="/contact-us" className={outlineButton}>
						<span className="wv-btn-label">CONTACT SUPPORT</span>
					</Link>
				</div>
			</section>

			<WvFooter />
		</div>
	);
}
