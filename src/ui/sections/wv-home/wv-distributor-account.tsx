import { BadgePercent, Building2, Check, Layers, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import type { DistributorRecord } from "@/lib/distributors/records";
import {
	DISTRIBUTOR_TIERS,
	discountLabel,
	minimumLabel,
	tierById,
	type DistributorTierId,
} from "@/lib/distributors/tiers";

/**
 * A distributor's tier on their account (/account/distributor): the tier and what it earns (its discount and the
 * minimum order it needs), the whole ladder with theirs lit, and the business on file. Pure: the page loads the record
 * and passes it in.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const card = "wv-neon-card wv-rw-card rounded-2xl p-5 xl:p-6";
const text = `${orbitron} wv-neon-card-text text-[13px] leading-[1.6]`;

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

export function DistributorNotice({
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
				<div className={text}>{children}</div>
			</div>
		</div>
	);
}

export function DistributorAccount({
	record,
	tierId,
}: {
	record: DistributorRecord;
	tierId: DistributorTierId;
}) {
	const tier = tierById(tierId);
	const paused = record.status === "paused";
	const business = record.application;

	return (
		<div className="flex flex-col gap-5">
			{paused && (
				<DistributorNotice title="YOUR WHOLESALE PRICING IS PAUSED">
					Your orders are at retail prices for now. Questions?{" "}
					<Link href="/contact-us" className="underline">
						Contact us
					</Link>
					.
				</DistributorNotice>
			)}

			<div className={`${card} ${paused ? "" : "wv-neon-card--featured"} wv-dist-acct flex flex-col gap-5`}>
				<CardHead Icon={BadgePercent} title="YOUR DISTRIBUTOR TIER" tag={paused ? "PAUSED" : "ACTIVE"} />
				<div className="flex flex-col gap-1">
					<p className={`${bungee} wv-stat-value text-[28px] leading-tight md:text-[34px]`}>
						{tier.name.toUpperCase()}
					</p>
					<p className={`${orbitron} wv-neon-card-text text-xs`}>approved for wholesale pricing</p>
				</div>
				<dl className={`${orbitron} grid grid-cols-2 gap-3`}>
					<div className="wv-calc-result flex flex-col gap-1 rounded-xl p-3 text-center">
						<dt className="wv-neon-card-text text-[10px] tracking-[1px]">YOUR DISCOUNT</dt>
						<dd className={`${bungee} wv-stat-value text-xl`}>{discountLabel(tier)} OFF</dd>
					</div>
					<div className="wv-calc-result flex flex-col gap-1 rounded-xl p-3 text-center">
						<dt className="wv-neon-card-text text-[10px] tracking-[1px]">MINIMUM ORDER</dt>
						<dd className={`${bungee} wv-stat-value text-xl`}>{minimumLabel(tier)}</dd>
					</div>
				</dl>
				<p className={text}>
					Every product shows your <strong className="wv-neon-key">wholesale price</strong> whenever you sign
					in. Once your cart reaches {minimumLabel(tier)} at list price, checkout charges{" "}
					<strong className="wv-neon-key">{discountLabel(tier)} off list</strong> on every line; below that,
					you pay retail. Sale prices and discount codes still apply on top.
				</p>
				<Link
					href="/shop"
					className={`${heyComic} wv-pc-cta flex h-12 items-center justify-center rounded-xl bg-[var(--wv-cyan-soft)] px-6 text-base text-[var(--wv-ink)] md:w-fit`}
				>
					<span className="wv-pc-cta-label">SHOP WHOLESALE</span>
				</Link>
			</div>

			<div className={`${card} flex flex-col gap-4`}>
				<CardHead Icon={Layers} title="DISTRIBUTOR TIERS" />
				<ol className="flex flex-col gap-2">
					{DISTRIBUTOR_TIERS.map((t) => {
						const current = t.id === tier.id;
						return (
							<li
								key={t.id}
								aria-current={current ? "true" : undefined}
								className={`${orbitron} wv-dist-rung flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-[13px]`}
							>
								<span className="flex items-center gap-2 text-white">
									{current && <Check aria-hidden className="size-4" strokeWidth={3} />}
									{t.name}
									{current && <span className="wv-neon-key text-[11px]">(you)</span>}
								</span>
								<span className="wv-neon-card-text tabular-nums">
									{discountLabel(t)} off · {minimumLabel(t)} minimum
								</span>
							</li>
						);
					})}
				</ol>
				<p className={`${orbitron} text-xs text-[var(--wv-muted)]`}>
					Growing? Tiers are reviewed with your order history.{" "}
					<Link href="/contact-us" className="underline">
						Ask us about a higher tier
					</Link>
					.
				</p>
			</div>

			{business && (
				<div className={`${card} wv-neon-card--pink flex flex-col gap-4`}>
					<CardHead Icon={Building2} title="YOUR BUSINESS ON FILE" />
					<dl className={`${orbitron} grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2`}>
						{(
							[
								["Business", business.businessName],
								["Contact", business.contactName],
								["Location", `${business.region}, ${business.country}`],
								["Type", business.businessType],
								["Licence / registration", business.licenseNumber],
								["Tobacco / vapour permit", business.taxPermit || "—"],
							] as const
						).map(([k, v]) => (
							<div key={k} className="flex gap-2">
								<dt className="wv-neon-card-text shrink-0">{k}:</dt>
								<dd className="min-w-0 break-words text-white">{v}</dd>
							</div>
						))}
					</dl>
					<p className={`${orbitron} text-xs text-[var(--wv-muted)]`}>
						Something changed?{" "}
						<Link href="/contact-us" className="underline">
							Let us know
						</Link>{" "}
						so your account stays verified.
					</p>
				</div>
			)}
		</div>
	);
}
