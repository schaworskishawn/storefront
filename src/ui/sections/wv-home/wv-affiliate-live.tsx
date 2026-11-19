import {
	CalendarClock,
	Coins,
	Handshake,
	Hourglass,
	LayoutDashboard,
	LogIn,
	Percent,
	Receipt,
	ShieldCheck,
	TrendingUp,
	Wallet,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type CSSProperties } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { computeLedger, payoutStatus, payoutsSince } from "@/lib/affiliates/ledger";
import {
	affiliateLiveView,
	programLiveView,
	type LiveStatId,
	type LiveView,
} from "@/lib/affiliates/live-stats";
import {
	getAffiliateAccount,
	isAffiliateAppConfigured,
	listCreditedOrders,
} from "@/lib/affiliates/saleor-affiliates";
import { isSignedInStaff } from "@/lib/affiliates/staff";

/**
 * The affiliate page's "Your affiliate dashboard" section, from real data only (see live-stats.ts): an affiliate's own
 * numbers when one is signed in, the program's actual terms for everyone else. Lit neon cards alternating cyan and pink,
 * values glowing in the card's colour, and the payout panel brightest of all. The page renders it inside Suspense, so the
 * rest of the page doesn't wait for the session.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const primary = `${heyComic} wv-pc-cta flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-6 text-base text-[var(--wv-ink)]`;

const ICONS: Record<LiveStatId, LucideIcon> = {
	earned: Wallet,
	orders: Receipt,
	month: TrendingUp,
	pending: Hourglass,
	rate: Percent,
	cookie: CalendarClock,
	hold: ShieldCheck,
	bonus: Coins,
};

type Cta = { href: string; label: string; Icon: LucideIcon } | null;

export function LiveSection({
	view,
	heading,
	tag,
	cta,
	note,
}: {
	view: LiveView;
	heading: string;
	tag: string;
	cta: Cta;
	note?: string;
}) {
	return (
		<div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-10">
			<div className="flex min-w-0 flex-1 flex-col gap-5 xl:gap-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h3 className={`${heyComic} wv-pc-name text-base xl:text-lg`}>{heading}</h3>
					<span
						className={`${orbitron} wv-af-live-pill flex items-center gap-2 rounded-full px-3 py-1 text-[10px] tracking-[1px]`}
					>
						<span aria-hidden className="wv-af-live-dot size-2 rounded-full" />
						{tag}
					</span>
				</div>
				<ul className="wv-af-stats grid gap-4 md:grid-cols-2 xl:gap-5">
					{view.stats.map((s) => {
						const Icon = ICONS[s.id];
						return (
							<li key={s.id} className="wv-neon-card wv-af-stat flex flex-col gap-3 rounded-2xl p-5 xl:p-6">
								<div className="flex items-center gap-3">
									<span
										aria-hidden
										className="wv-neon-card-icon flex size-10 shrink-0 items-center justify-center rounded-xl"
									>
										<Icon className="size-[18px]" strokeWidth={2.25} />
									</span>
									<p className={`${orbitron} wv-neon-card-text text-[11px] tracking-[1px]`}>{s.label}</p>
								</div>
								<p className={`${bungee} wv-stat-value break-words text-2xl leading-tight xl:text-[28px]`}>
									{s.value}
								</p>
								{s.progress && (
									<div
										role="progressbar"
										aria-label={s.progress.label}
										aria-valuemin={0}
										aria-valuemax={100}
										aria-valuenow={Math.round(s.progress.percent)}
										className="wv-af-progress h-2 w-full overflow-hidden rounded-full"
										style={{ "--fill": `${s.progress.percent}%` } as CSSProperties}
									/>
								)}
								<p className={`${orbitron} wv-neon-card-timing text-[11px] leading-[1.5]`}>{s.note}</p>
							</li>
						);
					})}
				</ul>
			</div>
			<div
				className={`wv-neon-card wv-neon-card--featured wv-af-stat flex flex-col gap-5 rounded-2xl p-6 xl:w-[480px] xl:shrink-0 xl:gap-6 xl:p-8`}
			>
				<h3 className={`${heyComic} wv-pc-name text-base`}>LIVE PAYOUT INFO</h3>
				<div className="flex flex-col gap-2">
					<p className={`${orbitron} wv-neon-card-text text-xs tracking-[1px]`}>{view.payout.label}</p>
					<p className={`${bungee} wv-stat-value break-words text-[32px] leading-tight xl:text-[40px]`}>
						{view.payout.value}
					</p>
				</div>
				<div aria-hidden className="wv-acct-card-rule h-px w-full" />
				<dl className={`${orbitron} flex flex-col gap-3 text-[13px] xl:gap-4`}>
					{view.payout.rows.map(([k, v]) => (
						<div key={k} className="flex justify-between gap-4">
							<dt className="wv-neon-card-text shrink-0">{k}</dt>
							<dd className="wv-neon-key min-w-0 break-words text-right">{v}</dd>
						</div>
					))}
				</dl>
				{note && <p className={`${orbitron} wv-neon-card-text text-xs leading-5`}>{note}</p>}
				{cta && (
					<Link href={cta.href} className={primary}>
						<cta.Icon aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">{cta.label}</span>
					</Link>
				)}
			</div>
		</div>
	);
}

export function AffiliateLiveSkeleton() {
	return (
		<div aria-hidden className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-10">
			<div className="grid min-w-0 flex-1 gap-4 pt-12 md:grid-cols-2 xl:gap-5">
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="wv-neon-card h-[150px] animate-pulse rounded-2xl motion-reduce:animate-none"
					/>
				))}
			</div>
			<div className="wv-neon-card wv-neon-card--featured h-[320px] animate-pulse rounded-2xl motion-reduce:animate-none xl:w-[480px] xl:shrink-0" />
		</div>
	);
}

const terms = (cta: Cta, note?: string) => (
	<LiveSection
		view={programLiveView(new Date())}
		heading="THE PROGRAM, LIVE"
		tag="REAL TERMS"
		cta={cta}
		note={note}
	/>
);

export async function AffiliateLive() {
	const auth = await getAccountAuthState();
	if (auth.status !== "authenticated")
		return terms(
			auth.status === "unavailable"
				? null
				: { href: "/login?next=%2Faffiliate-program", label: "SIGN IN TO SEE YOURS", Icon: LogIn },
			auth.status === "unavailable"
				? undefined
				: "Affiliates see their own sales, commission and payouts here once signed in.",
		);
	if (await isSignedInStaff())
		return terms({ href: "/affiliate-admin", label: "OPEN AFFILIATE ADMIN", Icon: LayoutDashboard });

	const apply = { href: "#apply", label: "APPLY NOW", Icon: Handshake };
	if (!isAffiliateAppConfigured()) return terms(apply);
	const account = await getAffiliateAccount(auth.user.id);
	const record = account.ok ? account.value?.record : undefined;
	if (!record || record.status === "rejected") return terms(apply);
	if (record.status === "pending")
		return terms(null, "We're reviewing your application. Your own numbers show here once you're approved.");
	if (!record.code) return terms(apply);

	const orders = await listCreditedOrders(record.code, auth.user.id);
	if (!orders.ok) {
		console.error(`[affiliates] couldn't load an affiliate's orders for the program page: ${orders.message}`);
		return terms(
			{ href: "/account/affiliate", label: "OPEN MY DASHBOARD", Icon: LayoutDashboard },
			"We couldn't load your numbers just now. Your earnings are safe.",
		);
	}
	// Read the clock only after the session, so it doesn't make the page's static shell depend on it.
	const now = new Date();
	const ledger = computeLedger(orders.value, record.payouts, now);
	const payout = payoutStatus(
		ledger,
		ledger.thisMonth.tier.schedule,
		payoutsSince(record.payouts, record.approvedAt),
		now,
	);
	return (
		<LiveSection
			view={affiliateLiveView(ledger, payout, record.payoutMethod, now)}
			heading={`LIVE MONITORING · ${record.code.toUpperCase()}`}
			tag={record.status === "paused" ? "PAUSED" : "LIVE · YOUR ACCOUNT"}
			cta={{ href: "/account/affiliate", label: "OPEN MY DASHBOARD", Icon: LayoutDashboard }}
		/>
	);
}
