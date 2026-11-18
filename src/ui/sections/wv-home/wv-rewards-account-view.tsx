import {
	Coins,
	History,
	Hourglass,
	Lock,
	LogIn,
	ShoppingBag,
	Ticket,
	TriangleAlert,
	UserPlus,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { lotRows, type LotStatus } from "@/lib/rewards/history";
import { balances, expiringSoon, type TokenLot } from "@/lib/rewards/lots";
import { centsForTokens } from "@/lib/rewards/tokens";

/**
 * What the rewards page shows once it knows who is looking: a sign-in prompt for visitors, the balance and history for a
 * signed-in customer, or a notice when something couldn't be loaded. Plain presentation with no data fetching (that is
 * `RewardsAccount`), so it can be rendered with sample tokens and tested.
 *
 * In the site's neon style (`.wv-rw-*` in wv-home.css): each panel is a neon card (`.wv-neon-card`; pink for a notice and
 * for "ready to spend") led by its icon in a lit tile; the balance glows in the card's colour under a glowing tag; tokens
 * about to expire sit in a pink glass strip; and the history is lit glass with a glowing header and neon status pills.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

/** A neon card that stays put under the pointer (it isn't a link). */
const card = "wv-neon-card wv-rw-card rounded-2xl p-5 xl:p-6";
const primaryButton = `${heyComic} wv-pc-cta flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)]`;
const outlineButton = `${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-[45px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)]`;

/** How many past orders to list before pointing out there are more. */
const HISTORY_LIMIT = 10;

/** Each status as a neon pill: cyan while active, pink once taken back, dimmed once used up or expired. */
const STATUS: Record<LotStatus, { label: string; tone: "cyan" | "pink" | "muted" }> = {
	active: { label: "Active", tone: "cyan" },
	used: { label: "Used up", tone: "muted" },
	expired: { label: "Expired", tone: "muted" },
	closed: { label: "Taken back", tone: "pink" },
};

/** A panel's icon in its lit tile, in the card's colour. */
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

export function RewardsAccountSkeleton() {
	return (
		<div aria-hidden className="grid gap-4 md:grid-cols-2">
			<div className="wv-order-line h-[190px] animate-pulse rounded-2xl" />
			<div className="wv-order-line h-[190px] animate-pulse rounded-2xl" />
		</div>
	);
}

export function Notice({ title, children }: { title: string; children: string }) {
	return (
		<div className={`${card} wv-neon-card--pink flex items-start gap-4`}>
			<Tile Icon={TriangleAlert} />
			<div className="flex min-w-0 flex-col gap-2">
				<p className={`${heyComic} wv-pc-name text-base`}>{title}</p>
				<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>{children}</p>
			</div>
		</div>
	);
}

export function RewardsSignInPrompt() {
	return (
		<div className={`${card} flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between`}>
			<div className="flex items-start gap-4">
				<Tile Icon={Lock} />
				<div className="flex flex-col gap-2">
					<p className={`${bungee} wv-heading-title text-xl md:text-2xl`}>SIGN IN TO SEE YOUR TOKENS</p>
					<p className={`${orbitron} wv-neon-card-text max-w-[520px] text-[13px] leading-[1.6]`}>
						Your <strong className="wv-neon-key">balance</strong> and{" "}
						<strong className="wv-neon-key">every order that earned tokens</strong> show up here. Tokens only
						go to customers who are signed in when they check out.
					</p>
				</div>
			</div>
			<div className="flex w-full flex-col gap-3 md:w-auto md:shrink-0 md:flex-row">
				<Link href="/login" className={primaryButton}>
					<LogIn aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">SIGN IN</span>
				</Link>
				<Link href="/register" className={outlineButton}>
					<UserPlus aria-hidden className="size-4" strokeWidth={2.25} />
					<span className="wv-btn-label">CREATE ACCOUNT</span>
				</Link>
			</div>
		</div>
	);
}

/** A balance panel: coins in a lit tile beside a glowing tag, the balance glowing beneath, then its details. */
function BalanceCard({ tag, value, children }: { tag: string; value: string; children: ReactNode }) {
	return (
		<div className={`${card} flex flex-col gap-3`}>
			<div className="flex items-center justify-between gap-3">
				<Tile Icon={Coins} />
				<p className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-1 text-[10px] tracking-[1px]`}>
					{tag}
				</p>
			</div>
			<p className={`${bungee} wv-stat-value text-[32px] leading-tight xl:text-[40px]`}>{value}</p>
			{children}
		</div>
	);
}

export function RewardsAccountView({
	lots,
	now,
	bcp47,
}: {
	lots: readonly TokenLot[];
	now: Date;
	bcp47: string;
}) {
	const money = (cents: number, currency: string) =>
		new Intl.NumberFormat(bcp47, { style: "currency", currency }).format(cents / 100);
	const day = (iso: string) =>
		new Intl.DateTimeFormat(bcp47, { dateStyle: "medium", timeZone: "UTC" }).format(
			new Date(`${iso}T00:00:00Z`),
		);
	const number = (value: number) => value.toLocaleString(bcp47);

	const balance = balances(lots, now);
	const rows = lotRows(lots, now);
	const shown = rows.slice(0, HISTORY_LIMIT);

	return (
		<div className="flex flex-col gap-4 xl:gap-6">
			<div className="grid gap-4 md:grid-cols-2 xl:gap-6">
				{balance.length === 0 ? (
					<BalanceCard tag="YOUR BALANCE" value="0 TOKENS">
						<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
							Place an order while signed in and your first tokens will be waiting here once it is paid.
						</p>
					</BalanceCard>
				) : (
					balance.map((entry) => {
						const soon = expiringSoon(lots, now, entry.currency);
						return (
							<BalanceCard
								key={entry.currency}
								tag={`YOUR BALANCE${balance.length > 1 ? ` (${entry.currency})` : ""}`}
								value={`${number(entry.tokens)} TOKENS`}
							>
								<p className={`${orbitron} wv-neon-card-text text-[13px]`}>
									Worth{" "}
									<strong className="wv-neon-key">
										{money(centsForTokens(entry.tokens), entry.currency)}
									</strong>{" "}
									off your next order
								</p>
								{soon ? (
									<p
										className={`${orbitron} wv-rw-expiring flex items-center gap-2 rounded-lg px-3 py-2 text-xs`}
									>
										<Hourglass aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
										<span>
											{number(soon.tokens)} tokens expire on {day(soon.firstDate)}.
										</span>
									</p>
								) : null}
							</BalanceCard>
						);
					})
				)}
				<div className={`${card} wv-neon-card--pink flex flex-col items-start justify-between gap-4`}>
					<div className="flex items-start gap-4">
						<Tile Icon={Ticket} />
						<div className="flex flex-col gap-2">
							<p className={`${heyComic} wv-pc-name text-base`}>READY TO SPEND THEM?</p>
							<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
								Check out as usual and tap{" "}
								<strong className="wv-neon-key">&ldquo;Use my tokens&rdquo;</strong> on the payment step.
								Whatever you use comes off your total.
							</p>
						</div>
					</div>
					<Link href="/shop" className={primaryButton}>
						<ShoppingBag aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">SHOP NOW</span>
					</Link>
				</div>
			</div>

			<div className="wv-order-line flex flex-col gap-4 rounded-2xl p-5 xl:p-6">
				<div className="flex items-center gap-3">
					<span aria-hidden className="wv-acct-icon flex size-9 items-center justify-center rounded-lg">
						<History className="size-4" strokeWidth={2.25} />
					</span>
					<h3 className={`${heyComic} wv-pc-name text-base`}>YOUR TOKEN HISTORY</h3>
				</div>
				{shown.length === 0 ? (
					<p className={`${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`}>
						No tokens yet. Each order you pay for while signed in will appear here.
					</p>
				) : (
					<>
						<div className="wv-rw-scroll overflow-x-auto">
							<table className={`${orbitron} wv-rw-table w-full min-w-[560px] text-left text-[13px]`}>
								<thead className="text-xs">
									<tr>
										<th scope="col" className="py-2 pr-4 font-normal">
											Earned on
										</th>
										<th scope="col" className="py-2 pr-4 text-right font-normal">
											Earned
										</th>
										<th scope="col" className="py-2 pr-4 text-right font-normal">
											Left
										</th>
										<th scope="col" className="py-2 pr-4 font-normal">
											Expires
										</th>
										<th scope="col" className="py-2 font-normal">
											Status
										</th>
									</tr>
								</thead>
								<tbody className="wv-neon-card-text">
									{shown.map((row) => (
										<tr key={row.id} className="wv-rw-row">
											<td className="py-3 pr-4 text-white">{day(row.earnedOn)}</td>
											<td className="py-3 pr-4 text-right tabular-nums">{number(row.earnedTokens)}</td>
											{/* Tokens still there to spend glow; none left, taken back or expired don't. */}
											<td
												className={`py-3 pr-4 text-right tabular-nums ${row.status === "active" && row.remainingTokens > 0 ? "wv-rw-left" : ""}`}
											>
												{number(row.remainingTokens)}
											</td>
											<td className="py-3 pr-4">{row.expiryDate ? day(row.expiryDate) : "Never"}</td>
											<td className="py-3">
												<span
													data-tone={STATUS[row.status].tone}
													className="wv-rw-status inline-block rounded-full px-2.5 py-0.5 text-[11px]"
												>
													{STATUS[row.status].label}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{rows.length > shown.length ? (
							<p className={`${orbitron} text-xs text-[var(--wv-muted)]`}>
								Showing your {shown.length} most recent of {rows.length} orders.
							</p>
						) : null}
					</>
				)}
			</div>
		</div>
	);
}
