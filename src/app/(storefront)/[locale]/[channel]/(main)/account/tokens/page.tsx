import { Suspense } from "react";
import { Coins } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLocaleDefinition, localeConfig } from "@/config/locale";
import { cn } from "@/lib/utils";
import { expiringSoon, balances } from "@/lib/rewards/lots";
import { lotRows, type LotStatus } from "@/lib/rewards/history";
import { listLots } from "@/lib/rewards/saleor-rewards";
import { centsForTokens, readRewardsConfig } from "@/lib/rewards/tokens";
import { getAccountAuthState } from "../get-current-user";

type Props = {
	params: Promise<{ locale: string }>;
};

export default function AccountTokensPage({ params }: Props) {
	return (
		<Suspense fallback={<TokensSkeleton />}>
			<AccountTokensContent params={params} />
		</Suspense>
	);
}

const STATUS_STYLES: Record<LotStatus, string> = {
	active: "bg-green-50 text-green-800",
	expired: "bg-secondary text-muted-foreground",
	used: "bg-secondary text-muted-foreground",
	closed: "bg-secondary text-muted-foreground",
};

async function AccountTokensContent({ params }: Props) {
	const { locale } = await params;
	const config = readRewardsConfig();
	if (!config.enabled) notFound();

	const t = await getTranslations({ locale, namespace: "account.tokens" });
	const auth = await getAccountAuthState();
	// The account layout already shows sign-in or an outage notice for these.
	if (auth.status !== "authenticated") return null;

	const result = await listLots(auth.user.id);
	if (!result.ok) {
		console.error(`[rewards] couldn't load a customer's tokens for their account page: ${result.message}`);
		return (
			<div className="space-y-6">
				<h1 className="text-balance text-h1">{t("title")}</h1>
				<p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
					{t("loadFailed")}
				</p>
			</div>
		);
	}

	const now = new Date();
	const bcp47 = getLocaleDefinition(locale)?.bcp47 ?? localeConfig.default;
	const money = (cents: number, currency: string) =>
		new Intl.NumberFormat(bcp47, { style: "currency", currency }).format(cents / 100);
	const day = (iso: string) =>
		new Intl.DateTimeFormat(bcp47, { dateStyle: "medium", timeZone: "UTC" }).format(
			new Date(`${iso}T00:00:00Z`),
		);

	const lots = result.value;
	const rows = lotRows(lots, now);
	const balance = balances(lots, now);

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-balance text-h1">{t("title")}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
			</div>

			<section aria-labelledby="tokens-balance" className="rounded-lg border border-border bg-card p-5">
				<h2 id="tokens-balance" className="text-sm font-medium text-muted-foreground">
					{t("balanceTitle")}
				</h2>
				{balance.length === 0 ? (
					<p className="mt-2 text-muted-foreground">{t("noBalance")}</p>
				) : (
					<ul className="mt-2 space-y-3">
						{balance.map((entry) => {
							const soon = expiringSoon(lots, now, entry.currency);
							return (
								<li key={entry.currency}>
									<p className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
										<Coins aria-hidden className="h-6 w-6 shrink-0 text-muted-foreground" />
										{t("balanceValue", { tokens: entry.tokens })}
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										{t("balanceWorth", { amount: money(centsForTokens(entry.tokens), entry.currency) })}
									</p>
									{soon ? (
										<p className="mt-1 text-sm text-muted-foreground">
											{t("expiringSoon", { tokens: soon.tokens, date: day(soon.firstDate) })}
										</p>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<section aria-labelledby="tokens-how" className="space-y-2">
				<h2 id="tokens-how" className="font-semibold">
					{t("howTitle")}
				</h2>
				<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					<li>{t("howEarn", { rate: config.tokensPerDollar })}</li>
					<li>{t("howSpend", { amount: money(centsForTokens(100), localeConfig.fallbackCurrency) })}</li>
					<li>
						{config.expiryMonths > 0 ? t("howExpire", { months: config.expiryMonths }) : t("howNeverExpire")}
					</li>
					<li>{t("howRefund")}</li>
				</ul>
			</section>

			<section aria-labelledby="tokens-history" className="space-y-3">
				<h2 id="tokens-history" className="font-semibold">
					{t("historyTitle")}
				</h2>
				{rows.length === 0 ? (
					<p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
						{t("empty")}
					</p>
				) : (
					<ul className="space-y-2">
						{rows.map((row) => (
							<li key={row.id} className="rounded-lg border border-border bg-card p-4">
								<div className="flex items-start justify-between gap-3">
									<p className="font-medium">{day(row.earnedOn)}</p>
									<span
										className={cn(
											"shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
											STATUS_STYLES[row.status],
										)}
									>
										{t(`status.${row.status}`)}
									</span>
								</div>
								<dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
									<div>
										<dt className="text-xs text-muted-foreground">{t("earnedTokens")}</dt>
										<dd className="tabular-nums">{row.earnedTokens.toLocaleString(bcp47)}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">{t("remainingTokens")}</dt>
										<dd className="tabular-nums">{row.remainingTokens.toLocaleString(bcp47)}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">{t("expires")}</dt>
										<dd>{row.expiryDate ? day(row.expiryDate) : t("never")}</dd>
									</div>
								</dl>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

function TokensSkeleton() {
	return (
		<div className="space-y-8">
			<div>
				<div className="h-8 w-40 animate-pulse rounded bg-muted" />
				<div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
			</div>
			<div className="h-28 animate-pulse rounded-lg border bg-muted/30" />
			<div className="space-y-2">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/30" />
				))}
			</div>
		</div>
	);
}
