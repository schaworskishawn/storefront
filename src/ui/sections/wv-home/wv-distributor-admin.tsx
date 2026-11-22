import { BadgeCheck, Building2, Inbox, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import type { DistributorAccount } from "@/lib/distributors/saleor-distributors";
import { discountLabel, minimumLabel, tierById } from "@/lib/distributors/tiers";
import { WvFooter, WvHeader } from "./wv-chrome";
import {
	ApproveDistributorForm,
	DistributorTierForm,
	PauseDistributorButton,
} from "./wv-distributor-admin-forms";
import "./wv-home.css";

/**
 * /distributor-admin: the owner's view of the distributor program. New applications (the business and its licences) to
 * approve at a tier or reject, and each distributor with their tier, to move between tiers or pause.
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

export function DistributorAdminShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="wv-hero-backdrop mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-12 md:px-8">
				<div className="flex flex-col gap-3 py-2">
					<h1
						className={`${bungee} wv-title-glow wv-hero-title text-[34px] leading-[40px] md:text-[40px] md:leading-[48px]`}
					>
						<span>DISTRIBUTOR</span> <span className="text-[var(--wv-cyan-soft)]">ADMIN</span>
					</h1>
					<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
					<p className={`${orbitron} wv-hero-copy text-sm leading-6`}>
						Verify applications, set each distributor&apos;s tier, and pause wholesale pricing when needed.
					</p>
				</div>
				{children}
			</main>
			<WvFooter />
		</div>
	);
}

export function DistributorAdminNotice({ title, children }: { title: string; children: ReactNode }) {
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
				<h3 className={`${heyComic} wv-pc-name break-words text-base`}>{title}</h3>
			</div>
		</div>
	);
}

function Details({ account }: { account: DistributorAccount }) {
	const a = account.record.application;
	if (!a) return <p className={text}>No application details were saved.</p>;
	const rows: [string, string][] = [
		["Contact", `${a.contactName} · ${a.email}${a.phone ? ` · ${a.phone}` : ""}`],
		["Location", `${a.region}, ${a.country}`],
		["Type", a.businessType],
		["Licence / registration", a.licenseNumber],
		["Tobacco / vapour permit", a.taxPermit || "—"],
		["Website", a.website || "—"],
		["Expected volume", a.monthlyVolume],
		["Tier asked for", tierById(a.requestedTier).name],
	];
	return (
		<>
			<dl className={`${orbitron} grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2`}>
				{rows.map(([k, v]) => (
					<div key={k} className="flex gap-2">
						<dt className="wv-neon-card-text shrink-0">{k}:</dt>
						<dd className="min-w-0 break-words text-white">{v}</dd>
					</div>
				))}
			</dl>
			{a.message && <p className={`${text} whitespace-pre-line`}>{a.message}</p>}
		</>
	);
}

export function DistributorAdmin({
	applications,
	distributors,
}: {
	applications: DistributorAccount[];
	distributors: DistributorAccount[];
}) {
	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-4">
				<h2 className={`${bungee} wv-heading-title text-xl md:text-2xl`}>
					APPLICATIONS ({applications.length})
				</h2>
				{applications.length === 0 ? (
					<DistributorAdminNotice title="NOTHING TO REVIEW">
						<span className="flex items-center gap-2">
							<Inbox aria-hidden className="size-4" strokeWidth={2.25} /> New applications show up here.
						</span>
					</DistributorAdminNotice>
				) : (
					<ul className="flex flex-col gap-4">
						{applications.map((account) => (
							<li key={account.userId} className={`${card} flex flex-col gap-4`}>
								<Head
									Icon={Building2}
									title={account.record.application?.businessName ?? account.name}
									tag={`APPLIED ${day(account.record.appliedAt).toUpperCase()}`}
								/>
								<p className={text}>Account: {account.email}</p>
								<Details account={account} />
								<p className={`${orbitron} text-xs text-[var(--wv-muted)]`}>
									Verify the licence and permits before approving: approval switches on wholesale prices for
									this account.
								</p>
								<ApproveDistributorForm
									userId={account.userId}
									requestedTier={account.record.application?.requestedTier ?? "small"}
								/>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="flex flex-col gap-4">
				<h2 className={`${bungee} wv-heading-title text-xl md:text-2xl`}>
					DISTRIBUTORS ({distributors.length})
				</h2>
				{distributors.length === 0 ? (
					<DistributorAdminNotice title="NO DISTRIBUTORS YET">
						Approve an application to add one.
					</DistributorAdminNotice>
				) : (
					<ul className="flex flex-col gap-4">
						{distributors.map((account) => {
							const { record } = account;
							const tier = tierById(record.tierId ?? "small");
							const paused = record.status === "paused";
							return (
								<li
									key={account.userId}
									className={`${card} ${paused ? "wv-neon-card--pink" : ""} flex flex-col gap-4`}
								>
									<Head
										Icon={BadgeCheck}
										title={record.application?.businessName ?? account.name}
										tag={paused ? "PAUSED" : tier.name.toUpperCase()}
									/>
									<p className={text}>
										{account.email} · {tier.name}: {discountLabel(tier)} off list on orders of{" "}
										{minimumLabel(tier)}+ · since {day(record.decidedAt)}
									</p>
									<details className="group">
										<summary className={`${orbitron} cursor-pointer text-xs text-[var(--wv-cyan-soft)]`}>
											Business details
										</summary>
										<div className="mt-3 flex flex-col gap-3">
											<Details account={account} />
										</div>
									</details>
									<div aria-hidden className="wv-acct-card-rule h-px w-full" />
									<DistributorTierForm userId={account.userId} tierId={tier.id} />
									<PauseDistributorButton userId={account.userId} paused={paused} />
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
