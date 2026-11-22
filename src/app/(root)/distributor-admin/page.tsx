import { type Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { checkAffiliateStaff } from "@/lib/affiliates/staff";
import { isDistributorAppConfigured, listDistributorAccounts } from "@/lib/distributors/saleor-distributors";
import { DISTRIBUTOR_TIERS } from "@/lib/distributors/tiers";
import {
	DistributorAdmin,
	DistributorAdminNotice,
	DistributorAdminShell,
} from "@/ui/sections/wv-home/wv-distributor-admin";

export const metadata: Metadata = {
	title: "Distributor Admin — Worldwide Vapor",
	robots: { index: false, follow: false },
};

/** The owner's distributor admin. Only a signed-in staff account that can manage customers gets past the first check. */
async function AdminData() {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) {
		if (staff.reason === "unavailable")
			return (
				<DistributorAdminNotice title="WE CAN'T CHECK YOUR SIGN-IN RIGHT NOW">
					Saleor didn&apos;t confirm your session just now. Refresh the page in a moment.
				</DistributorAdminNotice>
			);
		if (staff.reason === "not-staff")
			return (
				<DistributorAdminNotice title="STAFF ONLY">
					You&apos;re signed in as <strong className="wv-neon-key">{staff.email}</strong>, which isn&apos;t a
					Saleor staff account that can manage customers.{" "}
					<Link href="/logout" className="underline">
						Sign out
					</Link>
					, then sign in with the email and password you use for the Saleor Dashboard.
				</DistributorAdminNotice>
			);
		return (
			<DistributorAdminNotice title="STAFF ONLY">
				<Link href="/login?next=%2Fdistributor-admin" className="underline">
					Sign in
				</Link>{" "}
				with the email and password you use for the Saleor Dashboard. You&apos;ll come straight back to this
				page.
			</DistributorAdminNotice>
		);
	}

	if (!isDistributorAppConfigured())
		return (
			<DistributorAdminNotice title="THE DISTRIBUTORS APP ISN'T SET UP YET">
				Install the &quot;Worldwide Vapor Distributors&quot; app in the Saleor Dashboard from
				/api/distributor-app/manifest, create a token for it and set it as DISTRIBUTOR_APP_TOKEN (see
				docs/payments-setup.md).
			</DistributorAdminNotice>
		);

	const accounts = await listDistributorAccounts();
	if (!accounts.ok)
		return (
			<DistributorAdminNotice title="COULDN'T LOAD THE DISTRIBUTORS">
				{accounts.message}
			</DistributorAdminNotice>
		);

	const rank = (id: string | null) => DISTRIBUTOR_TIERS.findIndex((t) => t.id === id);
	const applications = accounts.value
		.filter((a) => a.record.status === "pending")
		.sort((a, b) => (b.record.appliedAt ?? "").localeCompare(a.record.appliedAt ?? ""));
	// Highest tier first, then by business name.
	const distributors = accounts.value
		.filter((a) => a.record.status === "approved" || a.record.status === "paused")
		.sort(
			(a, b) =>
				rank(b.record.tierId) - rank(a.record.tierId) ||
				(a.record.application?.businessName ?? a.name).localeCompare(
					b.record.application?.businessName ?? b.name,
				),
		);

	return <DistributorAdmin applications={applications} distributors={distributors} />;
}

export default function DistributorAdminPage() {
	return (
		<DistributorAdminShell>
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
		</DistributorAdminShell>
	);
}
