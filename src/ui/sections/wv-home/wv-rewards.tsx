import Link from "next/link";
import type { ReactNode } from "react";
import { describeExpiry, formatRate, hundredTokensWorth, tokenCount } from "@/lib/rewards/program-copy";
import type { RewardsConfig } from "@/lib/rewards/tokens";
import { WvFooter, WvHeader } from "./wv-chrome";
import { SectionHeading } from "./wv-product-section";
import { RewardsCalculator } from "./wv-rewards-calculator";
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
const marker = "font-[family-name:var(--font-permanent-marker)]";

const primaryButton = `${heyComic} flex h-[45px] items-center justify-center rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)] md:h-[46px] xl:h-[49px]`;
const outlineButton = `${heyComic} flex h-[45px] items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)] md:h-[46px] xl:h-[49px]`;

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

/** The program's three headline numbers, as stat cards. */
function stats(config: RewardsConfig) {
	return [
		{
			value: formatRate(config.tokensPerDollar),
			label: `${config.tokensPerDollar === 1 ? "Token" : "Tokens"} for every $1 spent on products`,
		},
		{ value: `100 = ${hundredTokensWorth()}`, label: "What your tokens are worth at checkout" },
		{ value: describeExpiry(config.expiryMonths).short, label: "Before a batch of tokens expires" },
	];
}

const EARNS = ["Money you pay for products, however you pay", "Orders placed while you are signed in"];

const DOES_NOT_EARN = [
	"Shipping and tax",
	"The part of an order paid with a gift card",
	"The part of an order paid with Vapor Tokens",
	"Orders placed as a guest",
];

/** Decorative token art: one large coin and two small ones, floating. */
function Coins() {
	const coin =
		"flex items-center justify-center rounded-full border-4 border-[var(--wv-cyan-soft)] bg-gradient-to-br from-[var(--wv-pink)] via-[var(--wv-purple)] to-[var(--wv-control)] shadow-[0_0_40px_color-mix(in_srgb,var(--wv-cyan)_35%,transparent)]";
	return (
		<div aria-hidden className="relative mx-auto size-[220px] shrink-0 md:size-[260px] xl:size-[340px]">
			<div
				className={`${coin} wv-float absolute left-1/2 top-1/2 size-[150px] -translate-x-1/2 -translate-y-1/2 md:size-[180px] xl:size-[230px]`}
			>
				<div className="flex size-[78%] items-center justify-center rounded-full border-2 border-dashed border-[var(--wv-cyan-soft)]">
					<span className={`${bungee} text-4xl text-white md:text-5xl xl:text-6xl`}>VT</span>
				</div>
			</div>
			<div
				className={`${coin} wv-float absolute left-0 top-2 size-[56px] opacity-90 md:size-[68px] xl:size-[84px]`}
				style={{ animationDelay: "-2s" }}
			>
				<span className={`${bungee} text-sm text-white md:text-base xl:text-xl`}>VT</span>
			</div>
			<div
				className={`${coin} wv-float absolute bottom-3 right-0 size-[44px] opacity-80 md:size-[54px] xl:size-[66px]`}
				style={{ animationDelay: "-4s" }}
			>
				<span className={`${bungee} text-xs text-white md:text-sm xl:text-lg`}>VT</span>
			</div>
		</div>
	);
}

export function WvRewards({ config, account }: { config: RewardsConfig; account: ReactNode }) {
	const expiry = describeExpiry(config.expiryMonths);
	const faqs = faqsFor(config);

	const steps = [
		{
			n: "1",
			title: "Sign in and shop",
			text: "Tokens go to signed-in customers, so log in or create a free account before you check out.",
		},
		{
			n: "2",
			title: "Earn on every order",
			text: `Every $1 you spend on products earns ${tokenCount(config.tokensPerDollar)}. They land in your account as soon as the order is fully paid.`,
		},
		{
			n: "3",
			title: "Spend them at checkout",
			text: `On the payment step, tap “Use my tokens”. 100 tokens take ${hundredTokensWorth()} off your order. ${expiry.sentence}`,
		},
	];

	return (
		<div className="min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />

			{/* Hero */}
			<section className="wv-nebula relative overflow-hidden">
				<div className="relative flex flex-col items-center gap-6 px-5 py-8 md:flex-row-reverse md:gap-8 md:px-8 md:py-12 xl:gap-16 xl:px-20 xl:py-16">
					<Coins />
					<div className="flex min-w-0 flex-1 flex-col items-start gap-4 md:gap-5">
						<p
							className={`${marker} text-[18px] uppercase tracking-[2px] text-[var(--wv-pink)] md:text-[22px]`}
						>
							Worldwide <span className="text-[var(--wv-cyan)]">vapor</span> rewards
						</p>
						<h1
							className={`${heyComic} wv-title-glow text-[34px] leading-[38px] md:text-[44px] md:leading-[50px] xl:text-[56px] xl:leading-[64px]`}
						>
							VAPOR <span className="text-[var(--wv-cyan-soft)]">TOKENS</span>
						</h1>
						<p
							className={`${orbitron} max-w-[560px] text-[13px] leading-[1.6] text-[var(--wv-text-dim)] md:text-[15px]`}
						>
							Get rewarded for shopping with us. Earn {tokenCount(config.tokensPerDollar)} for every $1 you
							spend on products, then spend them at checkout: 100 tokens take {hundredTokensWorth()} off your
							order.
						</p>
						<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:gap-4">
							<Link href="/shop" className={primaryButton}>
								START SHOPPING
							</Link>
							<a href="#how" className={outlineButton}>
								HOW IT WORKS
							</a>
						</div>
					</div>
				</div>
			</section>

			{/* The program in three numbers */}
			<section className="grid grid-cols-1 gap-4 border-y border-[var(--wv-purple)] bg-[var(--wv-surface)] px-5 py-6 md:grid-cols-3 md:gap-6 md:px-8 xl:px-20 xl:py-8">
				{stats(config).map((s) => (
					<div key={s.label} className="flex flex-col items-center gap-1 text-center">
						<p className={`${bungee} text-[28px] text-[var(--wv-cyan-soft)] xl:text-[34px]`}>{s.value}</p>
						<p className={`${orbitron} text-xs text-[var(--wv-text-dim)]`}>{s.label}</p>
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
				<ol className="grid w-full max-w-[1100px] grid-cols-1 gap-3 md:gap-4 xl:grid-cols-3 xl:gap-6">
					{steps.map((s) => (
						<li
							key={s.n}
							className="flex flex-col gap-3 rounded-2xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-5 xl:p-6"
						>
							<span
								className={`${bungee} flex size-10 items-center justify-center rounded-full border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] text-lg text-[var(--wv-cyan-soft)]`}
							>
								{s.n}
							</span>
							<h3 className={`${heyComic} text-base`}>{s.title}</h3>
							<p className={`${orbitron} text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>{s.text}</p>
						</li>
					))}
				</ol>
			</section>

			{/* What earns and what doesn't */}
			<section className="flex flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16">
				<SectionHeading eyebrow="The fine print, in plain words" title="WHAT EARNS TOKENS" />
				<div className="grid w-full max-w-[1100px] grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:gap-6">
					<div className="flex flex-col gap-3 rounded-2xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-5 xl:p-6">
						<h3 className={`${heyComic} text-base text-[var(--wv-cyan-soft)]`}>EARNS TOKENS</h3>
						<ul
							className={`${orbitron} flex flex-col gap-2 text-[13px] leading-[1.5] text-[var(--wv-text-dim)]`}
						>
							{EARNS.map((e) => (
								<li key={e} className="flex gap-2">
									<span aria-hidden className="text-[var(--wv-cyan-soft)]">
										✓
									</span>
									{e}
								</li>
							))}
						</ul>
					</div>
					<div className="flex flex-col gap-3 rounded-2xl border border-[var(--wv-pink)] bg-[var(--wv-control)] p-5 xl:p-6">
						<h3 className={`${heyComic} text-base text-[var(--wv-pink)]`}>DOESN&apos;T EARN TOKENS</h3>
						<ul
							className={`${orbitron} flex flex-col gap-2 text-[13px] leading-[1.5] text-[var(--wv-text-dim)]`}
						>
							{DOES_NOT_EARN.map((e) => (
								<li key={e} className="flex gap-2">
									<span aria-hidden className="text-[var(--wv-pink)]">
										✕
									</span>
									{e}
								</li>
							))}
						</ul>
					</div>
				</div>
			</section>

			{/* Calculator */}
			<section className="wv-nebula flex flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16">
				<SectionHeading eyebrow="Try it" title="WHAT WOULD I EARN?" />
				<RewardsCalculator tokensPerDollar={config.tokensPerDollar} />
			</section>

			{/* FAQ */}
			<section
				id="faqs"
				className="flex flex-col items-center gap-8 px-5 py-8 md:px-8 md:py-12 xl:gap-12 xl:px-20 xl:py-16"
			>
				<SectionHeading eyebrow="Questions" title="REWARDS FAQS" />
				<div className="flex w-full max-w-[860px] flex-col gap-3 xl:gap-4">
					{faqs.map((f, i) => (
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
							<p className={`${orbitron} wv-unfold mt-3 text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>
								{f.a}
							</p>
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
						SHOP NOW
					</Link>
					<Link href="/contact-us" className={outlineButton}>
						CONTACT SUPPORT
					</Link>
				</div>
			</section>

			<WvFooter />
		</div>
	);
}
