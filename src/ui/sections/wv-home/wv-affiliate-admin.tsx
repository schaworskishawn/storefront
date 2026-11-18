import { BadgeCheck, CalendarClock, Inbox, UserRound, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { suggestCode } from "@/lib/affiliates/admin-ops";
import type { AffiliateAccount } from "@/lib/affiliates/engine";
import { formatCents, formatVolume, type Ledger, type PayoutStatus } from "@/lib/affiliates/ledger";
import { SCHEDULE_LABEL, rateLabel } from "@/lib/affiliates/tiers";
import { WvFooter, WvHeader } from "./wv-chrome";
import { ApproveForm, PauseButton, PayoutForm, VouchersForm } from "./wv-affiliate-admin-forms";
import "./wv-home.css";

/**
 * /affiliate-admin: the owner's view of the program. New applications to approve (with a referral code) or reject, and
 * each affiliate with this month's sales and tier, what's pending, owed and paid in each currency, whether a payout is
 * due, their linked discount codes, the orders credited to them, and the forms to record a payout or pause them.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const card = "wv-neon-card wv-rw-card rounded-2xl p-5 xl:p-6";
const text = `${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`;

const day = (iso: string | null) =>
	iso
		? new Date(iso).toLocaleDateString("en-CA", {
				year: "numeric",
				month: "short",
				day: "numeric",
				timeZone: "UTC",
			})
		: "—";

export function AdminShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="wv-hero-backdrop mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-12 md:px-8">
				<div className="flex flex-col gap-3 py-2">
					<h1
						className={`${bungee} wv-title-glow wv-hero-title text-[34px] leading-[40px] md:text-[40px] md:leading-[48px]`}
					>
						<span>AFFILIATE</span> <span className="text-[var(--wv-cyan-soft)]">ADMIN</span>
					</h1>
					<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
					<p className={`${orbitron} wv-hero-copy text-sm leading-6`}>
						Approve applications, link discount codes, and record the payouts you send.
					</p>
				</div>
				{children}
			</main>
			<WvFooter />
		</div>
	);
}

export function AdminNotice({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className={`${card} wv-neon-card--pink flex flex-col gap-2`}>
			<p className={`${heyComic} wv-pc-name text-base`}>{title}</p>
			<div className={text}>{children}</div>
		</div>
	);
}

function Head({ Icon, title, tag }: { Icon: LucideIcon; title: string; tag?: string }) {
	return (
		<div className="flex items-center gap-3">
			<span
				aria-hidden
				className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
			>
				<Icon className="size-5" strokeWidth={2.25} />
			</span>
			<div className="flex min-w-0 flex-col items-start gap-1">
				{tag && (
					<span
						className={`${orbitron} wv-acct-card-tag rounded-full px-2.5 py-[3px] text-[10px] tracking-[1px]`}
					>
						{tag}
					</span>
				)}
				<h3 className={`${heyComic} wv-pc-name break-all text-base`}>{title}</h3>
			</div>
		</div>
	);
}

function Application({ account }: { account: AffiliateAccount }) {
	const a = account.record.application;
	const rows: [string, ReactNode][] = a
		? [
				["Name", a.name],
				["Email", a.email],
				["Phone", a.phone || "—"],
				["Country", a.country],
				["Platform", a.platform],
				[
					"Profile",
					<a
						key="profile"
						href={/^https?:\/\//i.test(a.profileUrl) ? a.profileUrl : `https://${a.profileUrl}`}
						target="_blank"
						rel="noopener noreferrer nofollow"
						className="break-all underline"
					>
						{a.profileUrl}
					</a>,
				],
				["Audience", a.audience],
			]
		: [];
	return (
		<li className={`${card} flex flex-col gap-4`}>
			<Head
				Icon={UserRound}
				title={account.name}
				tag={`${account.record.status === "rejected" ? "REJECTED" : "APPLIED"} ${day(account.record.appliedAt).toUpperCase()}`}
			/>
			<p className={text}>Account: {account.email}</p>
			{a ? (
				<>
					<dl className={`${orbitron} grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2`}>
						{rows.map(([k, v]) => (
							<div key={k} className="flex gap-2">
								<dt className="wv-neon-card-text shrink-0">{k}:</dt>
								<dd className="min-w-0 text-white">{v}</dd>
							</div>
						))}
					</dl>
					<p className={`${text} whitespace-pre-line`}>{a.plan}</p>
				</>
			) : (
				<p className={text}>No application details were saved.</p>
			)}
			<ApproveForm userId={account.userId} suggested={suggestCode(account.name)} />
		</li>
	);
}

export type AdminAffiliate = {
	account: AffiliateAccount;
	ledger: Ledger | null;
	payout: PayoutStatus | null;
	/** Why the ledger is missing, when it is. */
	error?: string;
};

function Affiliate({ account, ledger, payout, error }: AdminAffiliate) {
	const { record } = account;
	const paused = record.status === "paused";
	const owed = ledger
		? Object.entries(ledger.totals)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([currency, t]) => ({ currency, cents: Math.max(0, t.owedCents) }))
		: [];
	return (
		<li className={`${card} ${paused ? "wv-neon-card--pink" : ""} flex flex-col gap-4`}>
			<Head
				Icon={BadgeCheck}
				title={`${record.code ?? "?"} · ${account.name}`}
				tag={paused ? "PAUSED" : payout?.due.length ? "PAYOUT DUE" : "ACTIVE"}
			/>
			<p className={text}>
				{account.email} · approved {day(record.approvedAt)}
			</p>
			{error || !ledger || !payout ? (
				<p role="alert" className={`${orbitron} text-xs text-[var(--q-red)]`}>
					Couldn&apos;t load their orders: {error ?? "unknown error"}
				</p>
			) : (
				<>
					<p className={text}>
						This month: <strong className="wv-neon-key">{formatVolume(ledger.thisMonth.volumeCents)}</strong>{" "}
						in referred sales, so{" "}
						<strong className="wv-neon-key">
							{ledger.thisMonth.tier.name} ({rateLabel(ledger.thisMonth.tier)})
						</strong>
						, paid {SCHEDULE_LABEL[ledger.thisMonth.tier.schedule].toLowerCase()}.
					</p>
					{owed.length > 0 && (
						<div className={`${orbitron} wv-rw-scroll overflow-x-auto`}>
							<table className="wv-rw-table w-full min-w-[420px] whitespace-nowrap text-left text-[13px]">
								<thead className="text-xs">
									<tr>
										<th scope="col" className="py-2 pr-4 font-normal">
											Currency
										</th>
										<th scope="col" className="py-2 pr-4 text-right font-normal">
											Pending
										</th>
										<th scope="col" className="py-2 pr-4 text-right font-normal">
											Owed now
										</th>
										<th scope="col" className="py-2 text-right font-normal">
											Paid so far
										</th>
									</tr>
								</thead>
								<tbody className="wv-neon-card-text">
									{Object.entries(ledger.totals).map(([currency, t]) => (
										<tr key={currency} className="wv-rw-row">
											<td className="py-2 pr-4 text-white">{currency}</td>
											<td className="py-2 pr-4 text-right tabular-nums">
												{formatCents(t.pendingCents, currency)}
											</td>
											<td className="py-2 pr-4 text-right tabular-nums text-white">
												{formatCents(t.owedCents, currency)}
											</td>
											<td className="py-2 text-right tabular-nums">{formatCents(t.paidCents, currency)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					<p className={`${text} flex items-start gap-2`}>
						<CalendarClock
							aria-hidden
							className="wv-af-inline-icon mt-0.5 size-4 shrink-0"
							strokeWidth={2.25}
						/>
						<span>
							{payout.due.length > 0 ? (
								<>
									<strong className="wv-neon-key">Payout due</strong> since {day(payout.nextDate)}:{" "}
									{payout.due.map((d) => formatCents(d.cents, d.currency)).join(" + ")}.
								</>
							) : (
								<>Next payout date: {day(payout.nextDate)} (if at least $50.00 is owed by then).</>
							)}
						</span>
					</p>
					{ledger.lines.length > 0 && (
						<details className="group">
							<summary className={`${orbitron} cursor-pointer text-xs text-[var(--wv-cyan-soft)]`}>
								Credited orders ({ledger.lines.length})
							</summary>
							<ul className={`${orbitron} wv-neon-card-text mt-2 flex flex-col text-xs`}>
								{ledger.lines.map((l) => (
									<li key={l.orderId} className="wv-rw-row flex flex-wrap justify-between gap-2 py-1.5">
										<span className="text-white">
											#{l.number} · {day(l.paidAt)} · {l.via === "voucher" ? "code" : "link"}
										</span>
										<span className="tabular-nums">
											{formatCents(l.baseCents, l.currency)} →{" "}
											{l.status === "reversed"
												? "reversed"
												: `${formatCents(l.commissionCents, l.currency)} (${l.status})`}
										</span>
									</li>
								))}
							</ul>
						</details>
					)}
				</>
			)}
			<div aria-hidden className="wv-acct-card-rule h-px w-full" />
			<VouchersForm userId={account.userId} vouchers={record.vouchers} />
			<PayoutForm userId={account.userId} name={account.name} owed={owed} />
			<PauseButton userId={account.userId} paused={paused} />
		</li>
	);
}

export function AffiliateAdmin({
	applications,
	affiliates,
}: {
	applications: AffiliateAccount[];
	affiliates: AdminAffiliate[];
}) {
	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-4">
				<h2 className={`${bungee} wv-heading-title text-xl md:text-2xl`}>
					APPLICATIONS ({applications.length})
				</h2>
				{applications.length === 0 ? (
					<AdminNotice title="NOTHING TO REVIEW">
						<span className="flex items-center gap-2">
							<Inbox aria-hidden className="size-4" strokeWidth={2.25} /> New applications show up here.
						</span>
					</AdminNotice>
				) : (
					<ul className="flex flex-col gap-4">
						{applications.map((a) => (
							<Application key={a.userId} account={a} />
						))}
					</ul>
				)}
			</section>
			<section className="flex flex-col gap-4">
				<h2 className={`${bungee} wv-heading-title text-xl md:text-2xl`}>AFFILIATES ({affiliates.length})</h2>
				{affiliates.length === 0 ? (
					<AdminNotice title="NO AFFILIATES YET">Approve an application to add one.</AdminNotice>
				) : (
					<ul className="flex flex-col gap-4">
						{affiliates.map((a) => (
							<Affiliate key={a.account.userId} {...a} />
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
