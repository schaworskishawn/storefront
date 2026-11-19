import { type Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { computeLedger, payoutStatus, payoutsSince } from "@/lib/affiliates/ledger";
import { payoutSetup } from "@/lib/affiliates/payout-deps";
import {
	isAffiliateAppConfigured,
	listAffiliateAccounts,
	listCreditedOrders,
} from "@/lib/affiliates/saleor-affiliates";
import { checkAffiliateStaff } from "@/lib/affiliates/staff";
import {
	AdminNotice,
	AdminShell,
	AffiliateAdmin,
	type AdminAffiliate,
} from "@/ui/sections/wv-home/wv-affiliate-admin";

export const metadata: Metadata = {
	title: "Affiliate Admin — Worldwide Vapor",
	robots: { index: false, follow: false },
};

/** The owner's affiliate admin. Only a signed-in staff account that can manage customers gets past the first check. */
async function AdminData() {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) {
		if (staff.reason === "unavailable")
			return (
				<AdminNotice title="WE CAN'T CHECK YOUR SIGN-IN RIGHT NOW">
					Saleor didn&apos;t confirm your session just now. Refresh the page in a moment; if it keeps
					happening,{" "}
					<Link href="/logout" className="underline">
						sign out
					</Link>{" "}
					and sign in again.
				</AdminNotice>
			);
		if (staff.reason === "not-staff")
			return (
				<AdminNotice title="STAFF ONLY">
					You&apos;re signed in as <strong className="wv-neon-key">{staff.email}</strong>, which isn&apos;t a
					Saleor staff account that can manage customers.{" "}
					<Link href="/logout" className="underline">
						Sign out
					</Link>
					, then sign in with the email and password you use for the Saleor Dashboard.
				</AdminNotice>
			);
		return (
			<AdminNotice title="STAFF ONLY">
				<Link href="/login?next=%2Faffiliate-admin" className="underline">
					Sign in
				</Link>{" "}
				with the email and password you use for the Saleor Dashboard (being signed in to the Dashboard
				doesn&apos;t sign you in here). You&apos;ll come straight back to this page.
			</AdminNotice>
		);
	}

	if (!isAffiliateAppConfigured())
		return (
			<AdminNotice title="THE AFFILIATES APP ISN'T SET UP YET">
				Install the &quot;Worldwide Vapor Affiliates&quot; app in the Saleor Dashboard from
				/api/affiliate-app/manifest, create a token for it and set it as AFFILIATE_APP_TOKEN (see
				docs/payments-setup.md).
			</AdminNotice>
		);

	const accounts = await listAffiliateAccounts();
	if (!accounts.ok) return <AdminNotice title="COULDN'T LOAD THE AFFILIATES">{accounts.message}</AdminNotice>;

	// Read the clock only after the session above, so it doesn't make the page's static shell depend on it.
	const now = new Date();
	const applications = accounts.value
		.filter((a) => a.record.status === "pending")
		.sort((a, b) => (b.record.appliedAt ?? "").localeCompare(a.record.appliedAt ?? ""));
	const affiliates: AdminAffiliate[] = await Promise.all(
		accounts.value
			.filter((a) => (a.record.status === "approved" || a.record.status === "paused") && a.record.code)
			.map(async (account): Promise<AdminAffiliate> => {
				const orders = await listCreditedOrders(account.record.code as string, account.userId);
				if (!orders.ok) return { account, ledger: null, payout: null, error: orders.message };
				const ledger = computeLedger(orders.value, account.record.payouts, now);
				const payout = payoutStatus(
					ledger,
					ledger.thisMonth.tier.schedule,
					payoutsSince(account.record.payouts, account.record.approvedAt),
					now,
				);
				return { account, ledger, payout };
			}),
	);
	// Payouts due first, then by code.
	affiliates.sort(
		(a, b) =>
			Number(!!b.payout?.due.length) - Number(!!a.payout?.due.length) ||
			(a.account.record.code ?? "").localeCompare(b.account.record.code ?? ""),
	);

	return (
		<AffiliateAdmin applications={applications} affiliates={affiliates} setup={payoutSetup()} now={now} />
	);
}

export default function AffiliateAdminPage() {
	return (
		<AdminShell>
			<Suspense
				fallback={
					<div
						aria-hidden
						className="wv-order-line h-[320px] animate-pulse rounded-2xl motion-reduce:animate-none"
					/>
				}
			>
				<AdminData />
			</Suspense>
		</AdminShell>
	);
}
