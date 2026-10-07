import Link from "next/link";
import { lotRows, type LotStatus } from "@/lib/rewards/history";
import { balances, expiringSoon, type TokenLot } from "@/lib/rewards/lots";
import { centsForTokens } from "@/lib/rewards/tokens";

/**
 * What the rewards page shows once it knows who is looking: a sign-in prompt for visitors, the balance and history for a
 * signed-in customer, or a notice when something couldn't be loaded. Plain presentation with no data fetching (that is
 * `RewardsAccount`), so it can be rendered with sample tokens and tested.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const card = "rounded-2xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] p-5 xl:p-6";
const primaryButton = `${heyComic} flex h-[45px] items-center justify-center rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)]`;
const outlineButton = `${heyComic} flex h-[45px] items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)]`;

/** How many past orders to list before pointing out there are more. */
const HISTORY_LIMIT = 10;

const STATUS: Record<LotStatus, { label: string; style: string }> = {
	active: { label: "Active", style: "border-[var(--wv-cyan-soft)] text-[var(--wv-cyan-soft)]" },
	used: { label: "Used up", style: "border-[var(--wv-muted)] text-[var(--wv-muted)]" },
	expired: { label: "Expired", style: "border-[var(--wv-muted)] text-[var(--wv-muted)]" },
	closed: { label: "Taken back", style: "border-[var(--wv-pink)] text-[var(--wv-pink)]" },
};

export function RewardsAccountSkeleton() {
	return (
		<div aria-hidden className="grid gap-4 md:grid-cols-2">
			<div className="h-[190px] animate-pulse rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-control)]" />
			<div className="h-[190px] animate-pulse rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-control)]" />
		</div>
	);
}

export function Notice({ title, children }: { title: string; children: string }) {
	return (
		<div className={`${card} flex flex-col items-start gap-3`}>
			<p className={`${heyComic} text-base`}>{title}</p>
			<p className={`${orbitron} text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>{children}</p>
		</div>
	);
}

export function RewardsSignInPrompt() {
	return (
		<div className={`${card} flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between`}>
			<div className="flex flex-col gap-2">
				<p className={`${bungee} text-xl md:text-2xl`}>SIGN IN TO SEE YOUR TOKENS</p>
				<p className={`${orbitron} max-w-[520px] text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>
					Your balance and every order that earned tokens show up here. Tokens only go to customers who are
					signed in when they check out.
				</p>
			</div>
			<div className="flex w-full flex-col gap-3 md:w-auto md:shrink-0 md:flex-row">
				<Link href="/login" className={primaryButton}>
					SIGN IN
				</Link>
				<Link href="/register" className={outlineButton}>
					CREATE ACCOUNT
				</Link>
			</div>
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
					<div className={`${card} flex flex-col gap-2`}>
						<p className={`${orbitron} text-xs text-[var(--wv-cyan-soft)]`}>YOUR BALANCE</p>
						<p className={`${bungee} text-[32px]`}>0 TOKENS</p>
						<p className={`${orbitron} text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>
							Place an order while signed in and your first tokens will be waiting here once it is paid.
						</p>
					</div>
				) : (
					balance.map((entry) => {
						const soon = expiringSoon(lots, now, entry.currency);
						return (
							<div key={entry.currency} className={`${card} flex flex-col gap-2`}>
								<p className={`${orbitron} text-xs text-[var(--wv-cyan-soft)]`}>
									YOUR BALANCE{balance.length > 1 ? ` (${entry.currency})` : ""}
								</p>
								<p className={`${bungee} text-[32px] xl:text-[40px]`}>{number(entry.tokens)} TOKENS</p>
								<p className={`${orbitron} text-[13px] text-[var(--wv-text-dim)]`}>
									Worth {money(centsForTokens(entry.tokens), entry.currency)} off your next order
								</p>
								{soon ? (
									<p className={`${orbitron} text-xs text-[var(--wv-pink)]`}>
										{number(soon.tokens)} tokens expire on {day(soon.firstDate)}.
									</p>
								) : null}
							</div>
						);
					})
				)}
				<div className={`${card} flex flex-col items-start justify-between gap-4`}>
					<div className="flex flex-col gap-2">
						<p className={`${heyComic} text-base`}>READY TO SPEND THEM?</p>
						<p className={`${orbitron} text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>
							Check out as usual and tap &ldquo;Use my tokens&rdquo; on the payment step. Whatever you use
							comes off your total.
						</p>
					</div>
					<Link href="/shop" className={primaryButton}>
						SHOP NOW
					</Link>
				</div>
			</div>

			<div className={`${card} flex flex-col gap-4`}>
				<h3 className={`${heyComic} text-base`}>YOUR TOKEN HISTORY</h3>
				{shown.length === 0 ? (
					<p className={`${orbitron} text-[13px] leading-[1.6] text-[var(--wv-text-dim)]`}>
						No tokens yet. Each order you pay for while signed in will appear here.
					</p>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className={`${orbitron} w-full min-w-[560px] text-left text-[13px]`}>
								<thead className="text-xs text-[var(--wv-cyan-soft)]">
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
								<tbody className="text-[var(--wv-text-dim)]">
									{shown.map((row) => (
										<tr key={row.id} className="border-t border-[var(--wv-purple)]">
											<td className="py-3 pr-4 text-white">{day(row.earnedOn)}</td>
											<td className="py-3 pr-4 text-right tabular-nums">{number(row.earnedTokens)}</td>
											<td className="py-3 pr-4 text-right tabular-nums">{number(row.remainingTokens)}</td>
											<td className="py-3 pr-4">{row.expiryDate ? day(row.expiryDate) : "Never"}</td>
											<td className="py-3">
												<span
													className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] ${STATUS[row.status].style}`}
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
