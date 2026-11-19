import {
	BadgeCheck,
	Banknote,
	CalendarClock,
	Check,
	HandCoins,
	Hourglass,
	Link2,
	Receipt,
	Tags,
	TrendingUp,
	TriangleAlert,
	Wallet,
	Wand2,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode } from "react";
import {
	formatCents,
	formatVolume,
	type CommissionLine,
	type Ledger,
	type PayoutStatus,
} from "@/lib/affiliates/ledger";
import { campaignReport, campaignSuggestions } from "@/lib/affiliates/link-tools";
import { money } from "@/lib/affiliates/live-stats";
import { describePayoutMethod } from "@/lib/affiliates/payout-prefs";
import type { Payout, PayoutMethod } from "@/lib/affiliates/records";
import {
	PAYOUT_MINIMUM_CENTS,
	SCHEDULE_LABEL,
	TOKEN_BONUS_BPS,
	WALLET_CHANGE_HOLD_HOURS,
	benefitsThrough,
	rateLabel,
	tierTitle,
} from "@/lib/affiliates/tiers";
import { AffiliateLinkTools } from "./wv-affiliate-link-tools";
import { PayoutMethodForm } from "./wv-affiliate-payout-form";
import { CopyButton } from "./wv-copy-button";

/**
 * An affiliate's dashboard (/account/affiliate): their referral link and codes, this month's sales and the tier they set,
 * what they've earned (pending through the return window, then payable) and been paid, when the next payout falls, the
 * orders credited to them and their payouts. Pure: the page loads everything and passes it in.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const card = "wv-neon-card wv-rw-card rounded-2xl p-5 xl:p-6";

const day = (iso: string) =>
	new Date(iso).toLocaleDateString("en-CA", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});

const monthName = (month: string) =>
	new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-CA", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

function Tile({ Icon }: { Icon: LucideIcon }) {
	return (
		<span
			aria-hidden
			className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
		>
			<Icon className="size-5" strokeWidth={2.25} />
		</span>
	);
}

function CardHead({ Icon, title, tag }: { Icon: LucideIcon; title: string; tag?: string }) {
	return (
		<div className="flex items-center gap-3">
			<Tile Icon={Icon} />
			<div className="flex min-w-0 flex-col items-start gap-1">
				{tag && (
					<span
						className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-[3px] text-[10px] tracking-[1px]`}
					>
						{tag}
					</span>
				)}
				<h2 className={`${heyComic} wv-pc-name text-base md:text-lg`}>{title}</h2>
			</div>
		</div>
	);
}

/** A notice in a pink neon card: an account that isn't approved yet, a load failure. */
export function AffiliateNotice({
	Icon = TriangleAlert,
	title,
	children,
}: {
	Icon?: LucideIcon;
	title: string;
	children: ReactNode;
}) {
	return (
		<div className={`${card} wv-neon-card--pink flex items-start gap-4`}>
			<Tile Icon={Icon} />
			<div className="flex min-w-0 flex-col gap-2">
				<p className={`${heyComic} wv-pc-name text-base`}>{title}</p>
				<div className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>{children}</div>
			</div>
		</div>
	);
}

const STATUS: Record<CommissionLine["status"], { label: string; tone?: "pink" | "muted" }> = {
	pending: { label: "Pending" },
	payable: { label: "Payable", tone: "pink" },
	reversed: { label: "Reversed", tone: "muted" },
};

/** The card's tag: the method only (a wallet address is case-sensitive, so it's never shown in capitals). */
const METHOD_TAG: Record<PayoutMethod["kind"], string> = {
	tokens: "VAPOR TOKENS",
	crypto: "CRYPTO",
	etransfer: "E-TRANSFER",
};

/** A crypto payout's progress, in the affiliate's words. Other payouts are simply paid. */
const payoutProgress = (p: Payout): string | null =>
	p.status === "processing"
		? "On its way"
		: p.status === "failed"
			? "Didn't go through, so it's owed to you again"
			: null;

export type AffiliateDashboardProps = {
	code: string;
	link: string;
	/** The shop's address, for the links the referral tools build. */
	origin: string;
	vouchers: string[];
	paused: boolean;
	ledger: Ledger;
	payout: PayoutStatus;
	payoutMethod: PayoutMethod;
	/** When a newly added crypto wallet can first be paid (ISO), while that's still in the future. */
	walletReadyAt: string | null;
	/** The team is checking this affiliate's payouts before they go out. */
	held: boolean;
};

export function AffiliateDashboard({
	code,
	link,
	origin,
	vouchers,
	paused,
	ledger,
	payout,
	payoutMethod,
	walletReadyAt,
	held,
}: AffiliateDashboardProps) {
	const bonusPercent = TOKEN_BONUS_BPS / 100;
	const { thisMonth } = ledger;
	const tier = thisMonth.tier;
	const progress = thisMonth.next
		? Math.min(100, (thisMonth.volumeCents / (thisMonth.next.aboveCents + 1)) * 100)
		: 100;
	const currencies = Object.entries(ledger.totals).sort(([a], [b]) => a.localeCompare(b));
	const lines = ledger.lines.slice(0, 25);
	const campaigns = campaignReport(ledger.lines);

	return (
		<div className="flex flex-col gap-5">
			{paused && (
				<AffiliateNotice title="YOUR AFFILIATE ACCOUNT IS PAUSED">
					New orders through your link or codes aren&apos;t being credited right now. What you&apos;ve already
					earned is safe and will still be paid. Questions?{" "}
					<Link href="/contact-us" className="underline">
						Contact us
					</Link>
					.
				</AffiliateNotice>
			)}

			{/* The link */}
			<div className={`${card} flex flex-col gap-4`}>
				<CardHead Icon={Link2} title="YOUR REFERRAL LINK" tag={`CODE: ${code.toUpperCase()}`} />
				<div className="wv-af-link flex flex-col gap-3 rounded-xl p-3 md:flex-row md:items-center">
					<code className={`${orbitron} min-w-0 flex-1 break-all text-[13px] text-white`}>{link}</code>
					<CopyButton text={link} label="COPY LINK" />
				</div>
				<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
					Add <strong className="wv-neon-key">?aff={code}</strong> to any page of the shop to link straight to
					it. Anyone who follows your link is remembered for 30 days, and the orders they pay for count for
					you.
				</p>
				{vouchers.length > 0 && (
					<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
						Your discount {vouchers.length === 1 ? "code" : "codes"}:{" "}
						{vouchers.map((v, i) => (
							<span key={v}>
								{i > 0 && ", "}
								<strong className="wv-neon-key">{v}</strong>
							</span>
						))}
						. Orders that use {vouchers.length === 1 ? "it" : "one"} count for you even without your link.
					</p>
				)}
			</div>

			{/* Referral tools: reflink creator, campaign tags and QR codes */}
			<div className={`${card} flex flex-col gap-5`}>
				<CardHead Icon={Wand2} title="REFERRAL TOOLS" tag="LINKS · TAGS · QR CODES" />
				<AffiliateLinkTools code={code} origin={origin} suggestions={campaignSuggestions(ledger.lines)} />
			</div>

			<div className="grid gap-5 xl:grid-cols-2">
				{/* This month */}
				<div className={`${card} flex flex-col gap-4`}>
					<CardHead
						Icon={TrendingUp}
						title={`${tier.name} · ${rateLabel(tier)} COMMISSION`}
						tag={monthName(thisMonth.month).toUpperCase()}
					/>
					<div className="flex flex-col gap-1">
						<p className={`${bungee} wv-stat-value text-[32px] leading-tight md:text-[36px]`}>
							{formatVolume(thisMonth.volumeCents)}
						</p>
						<p className={`${orbitron} wv-neon-card-text text-xs`}>referred sales this month</p>
					</div>
					<div
						role="progressbar"
						aria-label={thisMonth.next ? `Progress to ${tierTitle(thisMonth.next)}` : "Top tier reached"}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Math.round(progress)}
						className="wv-af-progress h-2 w-full overflow-hidden rounded-full"
						style={{ "--fill": `${progress}%` } as CSSProperties}
					/>
					<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
						{thisMonth.next && thisMonth.toNextCents !== null ? (
							<>
								<strong className="wv-neon-key">{formatVolume(thisMonth.toNextCents)}</strong> more this month
								lifts every sale this month to{" "}
								<strong className="wv-neon-key">
									{tierTitle(thisMonth.next)} ({rateLabel(thisMonth.next)})
								</strong>
								.
							</>
						) : (
							<>
								You&apos;re on our <strong className="wv-neon-key">top tier</strong> this month.
							</>
						)}{" "}
						The tier resets at the start of each month.
					</p>
				</div>

				{/* Earnings */}
				<div className={`${card} flex flex-col gap-4`}>
					<CardHead Icon={Wallet} title="YOUR EARNINGS" tag={SCHEDULE_LABEL[tier.schedule].toUpperCase()} />
					{currencies.length === 0 ? (
						<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
							No commission yet. Share your link: your first referred order will show here once it&apos;s
							paid.
						</p>
					) : (
						<div className="flex flex-col gap-3">
							{currencies.map(([currency, t]) => (
								<dl
									key={currency}
									className={`${orbitron} wv-calc-result grid grid-cols-3 gap-2 rounded-xl p-3 text-center`}
								>
									<div className="flex flex-col gap-1">
										<dt className="wv-neon-card-text text-[10px] tracking-[1px]">PENDING</dt>
										<dd className="text-sm text-white">{formatCents(t.pendingCents, currency)}</dd>
									</div>
									<div className="flex flex-col gap-1">
										<dt className="wv-neon-card-text text-[10px] tracking-[1px]">TO BE PAID</dt>
										<dd className={`${bungee} wv-stat-value text-sm md:text-base`}>
											{formatCents(Math.max(0, t.owedCents), currency)}
										</dd>
									</div>
									<div className="flex flex-col gap-1">
										<dt className="wv-neon-card-text text-[10px] tracking-[1px]">PAID SO FAR</dt>
										<dd className="text-sm text-white">{formatCents(t.paidCents, currency)}</dd>
									</div>
								</dl>
							))}
						</div>
					)}
					<p className={`${orbitron} wv-neon-card-text flex items-start gap-2 text-[13px] leading-[1.6]`}>
						<CalendarClock
							aria-hidden
							className="wv-af-inline-icon mt-0.5 size-4 shrink-0"
							strokeWidth={2.25}
						/>
						<span>
							{payout.due.length > 0 ? "Your next payout is due now" : "Next payout date"}:{" "}
							<strong className="wv-neon-key">{day(payout.nextDate)}</strong>. Commission is pending for 15
							days after an order is paid (the return window), and a payout needs at least{" "}
							{formatVolume(PAYOUT_MINIMUM_CENTS)} owed.
						</span>
					</p>
				</div>
			</div>

			{/* How they're paid */}
			<div className={`${card} flex flex-col gap-4`}>
				<CardHead Icon={HandCoins} title="HOW YOU GET PAID" tag={METHOD_TAG[payoutMethod.kind]} />
				<p className={`${orbitron} wv-neon-card-text flex items-start gap-2 text-[13px] leading-[1.6]`}>
					<Wallet aria-hidden className="wv-af-inline-icon mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
					<span className="min-w-0 break-words">
						You&apos;re paid by <strong className="wv-neon-key">{describePayoutMethod(payoutMethod)}</strong>.
					</span>
				</p>
				<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
					Choose Vapor Tokens and every payout is worth{" "}
					<strong className="wv-neon-key">{bonusPercent}% more</strong>, paid automatically into your token
					balance. Or take it in crypto or by e-Transfer. Any change is confirmed by email.
				</p>
				{walletReadyAt && (
					<p className={`${orbitron} wv-neon-card-text flex items-start gap-2 text-[13px] leading-[1.6]`}>
						<Hourglass aria-hidden className="wv-af-inline-icon mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
						<span>
							Your new wallet can be paid from <strong className="wv-neon-key">{day(walletReadyAt)}</strong>.
							Anything due before then waits for it.
						</span>
					</p>
				)}
				{held && (
					<p className={`${orbitron} wv-neon-card-text flex items-start gap-2 text-[13px] leading-[1.6]`}>
						<Hourglass aria-hidden className="wv-af-inline-icon mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
						<span>
							Our team is checking your next payout before it goes out. Your earnings are safe; questions?{" "}
							<Link href="/contact-us" className="underline">
								Contact us
							</Link>
							.
						</span>
					</p>
				)}
				<PayoutMethodForm
					method={payoutMethod}
					bonusPercent={bonusPercent}
					holdHours={WALLET_CHANGE_HOLD_HOURS}
				/>
			</div>

			{/* Campaigns: what each link tag sold */}
			<div className={`${card} wv-neon-card--pink flex flex-col gap-4`}>
				<CardHead Icon={Tags} title="CAMPAIGNS" tag="BY LINK TAG" />
				{campaigns.length === 0 ? (
					<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
						Tag your links in Referral tools (instagram, tiktok, bio…) and you&apos;ll see here which posts
						sell.
					</p>
				) : (
					<div className="wv-rw-scroll overflow-x-auto">
						<table
							className={`${orbitron} wv-rw-table w-full min-w-[520px] whitespace-nowrap text-left text-[13px]`}
						>
							<thead className="text-xs">
								<tr>
									<th scope="col" className="py-2 pr-4 font-normal">
										Campaign
									</th>
									<th scope="col" className="py-2 pr-4 text-right font-normal">
										Orders
									</th>
									<th scope="col" className="py-2 pr-4 text-right font-normal">
										Sales
									</th>
									<th scope="col" className="py-2 text-right font-normal">
										Commission
									</th>
								</tr>
							</thead>
							<tbody className="wv-neon-card-text">
								{campaigns.map((row) => (
									<tr key={row.key} className="wv-rw-row">
										<td className="py-3 pr-4">
											{row.key === "link" || row.key === "voucher" ? (
												row.label
											) : (
												<span className="wv-af-tag inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]">
													<Tags aria-hidden className="size-3" strokeWidth={2.5} />
													{row.label}
												</span>
											)}
										</td>
										<td className="py-3 pr-4 text-right tabular-nums text-white">{row.orders}</td>
										<td className="py-3 pr-4 text-right tabular-nums">{money(row.salesCents)}</td>
										<td className="py-3 text-right tabular-nums text-white">{money(row.commissionCents)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Orders */}
			<div className={`${card} flex flex-col gap-4`}>
				<CardHead Icon={Receipt} title="REFERRED ORDERS" />
				{lines.length === 0 ? (
					<p className={`${orbitron} wv-neon-card-text text-[13px]`}>No referred orders yet.</p>
				) : (
					<>
						<div className="wv-rw-scroll overflow-x-auto">
							<table
								className={`${orbitron} wv-rw-table w-full min-w-[600px] whitespace-nowrap text-left text-[13px]`}
							>
								<thead className="text-xs">
									<tr>
										<th scope="col" className="py-2 pr-4 font-normal">
											Paid on
										</th>
										<th scope="col" className="py-2 pr-4 font-normal">
											Through
										</th>
										<th scope="col" className="py-2 pr-4 text-right font-normal">
											Sale
										</th>
										<th scope="col" className="py-2 pr-4 text-right font-normal">
											Commission
										</th>
										<th scope="col" className="py-2 font-normal">
											Status
										</th>
									</tr>
								</thead>
								<tbody className="wv-neon-card-text">
									{lines.map((line) => (
										<tr key={line.orderId} className="wv-rw-row">
											<td className="py-3 pr-4 text-white">{day(line.paidAt)}</td>
											<td className="py-3 pr-4">
												{line.via === "voucher" ? (
													"Discount code"
												) : line.campaign ? (
													<>
														Your link{" "}
														<span className="wv-af-tag ml-1 inline-flex rounded-full px-2 py-px text-[11px]">
															{line.campaign}
														</span>
													</>
												) : (
													"Your link"
												)}
											</td>
											<td className="py-3 pr-4 text-right tabular-nums">
												{formatCents(line.baseCents, line.currency)}
											</td>
											<td className="py-3 pr-4 text-right tabular-nums text-white">
												{line.status === "reversed"
													? "—"
													: `${formatCents(line.commissionCents, line.currency)} (${line.rateBps / 100}%)`}
											</td>
											<td className="py-3">
												<span
													data-tone={STATUS[line.status].tone}
													className="wv-rw-status inline-block rounded-full px-2.5 py-0.5 text-[11px]"
												>
													{line.status === "pending"
														? `Pending until ${day(line.payableAt)}`
														: STATUS[line.status].label}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{ledger.lines.length > lines.length && (
							<p className={`${orbitron} text-xs text-[var(--wv-muted)]`}>
								Showing your {lines.length} most recent of {ledger.lines.length} referred orders.
							</p>
						)}
					</>
				)}
			</div>

			<div className="grid gap-5 xl:grid-cols-2">
				{/* Payouts */}
				<div className={`${card} flex flex-col gap-4`}>
					<CardHead Icon={Banknote} title="PAYOUTS" />
					{ledger.payouts.length === 0 ? (
						<p className={`${orbitron} wv-neon-card-text text-[13px]`}>No payouts yet.</p>
					) : (
						<ul className={`${orbitron} wv-neon-card-text flex flex-col gap-2 text-[13px]`}>
							{ledger.payouts.map((p) => (
								<li key={p.id} className="wv-rw-row flex flex-wrap items-baseline justify-between gap-2 py-2">
									<span className="text-white">{day(p.at)}</span>
									<span className="tabular-nums text-white">
										{Object.entries(p.amounts)
											.map(([currency, cents]) => formatCents(cents, currency))
											.join(" + ")}
									</span>
									{p.method && <span className="w-full text-xs">{p.method}</span>}
									{payoutProgress(p) && (
										<span
											data-tone={p.status === "failed" ? "pink" : undefined}
											className="wv-rw-status inline-block rounded-full px-2.5 py-0.5 text-[11px]"
										>
											{payoutProgress(p)}
										</span>
									)}
								</li>
							))}
						</ul>
					)}
				</div>

				{/* Perks */}
				<div className={`${card} wv-neon-card--pink flex flex-col gap-4`}>
					<CardHead Icon={BadgeCheck} title={`YOUR ${tier.name} BENEFITS`} />
					<ul className={`${orbitron} wv-neon-card-text flex flex-col gap-2.5 text-[13px]`}>
						{benefitsThrough(tier).map((b) => (
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
					<p className={`${orbitron} text-xs text-[var(--wv-muted)]`}>
						Benefits follow this month&apos;s tier. For anything that needs us (templates, samples, your
						landing page), just{" "}
						<Link href="/contact-us" className="underline">
							get in touch
						</Link>
						.
					</p>
				</div>
			</div>
		</div>
	);
}
