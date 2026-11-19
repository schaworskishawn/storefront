import { Hourglass, ShieldCheck, UserPlus } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { computeLedger, payoutStatus, payoutsSince } from "@/lib/affiliates/ledger";
import { walletReadyAt } from "@/lib/affiliates/payout-prefs";
import { referralLink } from "@/lib/affiliates/referral";
import {
	getAffiliateAccount,
	isAffiliateAppConfigured,
	listCreditedOrders,
} from "@/lib/affiliates/saleor-affiliates";
import { isSignedInStaff } from "@/lib/affiliates/staff";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { AccountShell, SignInPrompt, type AccountView } from "@/ui/sections/wv-home/wv-account";
import { AffiliateDashboard, AffiliateNotice } from "@/ui/sections/wv-home/wv-affiliate-dashboard";

export const metadata: Metadata = {
	title: "Affiliate Dashboard — Worldwide Vapor",
	description: "Your referral link, sales, commission and payouts.",
	robots: { index: false },
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

const origin = () => process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://www.worldwidevapor.com";

function Shell({ user, children }: { user: AccountView["user"]; children: ReactNode }) {
	return (
		<AccountShell
			user={user}
			base={base()}
			active="Affiliate Program"
			title="AFFILIATE DASHBOARD"
			subtitle="Your referral link, sales, commission and payouts."
		>
			{children}
		</AccountShell>
	);
}

const applyLink = (
	<Link href="/affiliate-program#apply" className="underline">
		apply on the affiliate program page
	</Link>
);

async function DashboardData() {
	const auth = await getAccountAuthState();
	if (auth.status === "unavailable")
		return (
			<Shell user={null}>
				<AffiliateNotice title="WE CAN'T CHECK YOUR SIGN-IN RIGHT NOW">
					Please refresh the page in a moment.
				</AffiliateNotice>
			</Shell>
		);
	if (auth.status !== "authenticated")
		return (
			<Shell user={null}>
				<SignInPrompt />
			</Shell>
		);

	const u = auth.user;
	const addr = u.addresses.find((a) => a.id === u.defaultShippingAddress?.id) ?? u.addresses[0];
	const user = {
		name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
		email: u.email,
		city: addr?.city ?? null,
	};

	if (await isSignedInStaff())
		return (
			<Shell user={user}>
				<AffiliateNotice Icon={ShieldCheck} title="STAFF ACCOUNTS AREN'T AFFILIATES">
					You&apos;re signed in with a staff account, which runs the program rather than earning from it.
					Manage applications, approvals and payouts on the{" "}
					<Link href="/affiliate-admin" className="underline">
						affiliate admin
					</Link>
					.
				</AffiliateNotice>
			</Shell>
		);

	if (!isAffiliateAppConfigured())
		return (
			<Shell user={user}>
				<AffiliateNotice title="THE AFFILIATE PROGRAM ISN'T OPEN YET">
					Check back soon, or {applyLink} and we will be in touch.
				</AffiliateNotice>
			</Shell>
		);

	const account = await getAffiliateAccount(u.id);
	if (!account.ok) {
		console.error(`[affiliates] couldn't load an affiliate's record: ${account.message}`);
		return (
			<Shell user={user}>
				<AffiliateNotice title="WE COULDN'T LOAD YOUR DASHBOARD">
					Your earnings are safe. Please refresh the page in a moment.
				</AffiliateNotice>
			</Shell>
		);
	}

	const record = account.value?.record;
	if (!record)
		return (
			<Shell user={user}>
				<AffiliateNotice Icon={UserPlus} title="YOU'RE NOT AN AFFILIATE YET">
					Earn 10–20% on every order you refer: {applyLink}.
				</AffiliateNotice>
			</Shell>
		);
	if (record.status === "pending")
		return (
			<Shell user={user}>
				<AffiliateNotice Icon={Hourglass} title="YOUR APPLICATION IS BEING REVIEWED">
					We review every application by hand and will email you at {u.email} once it has been looked at.
				</AffiliateNotice>
			</Shell>
		);
	if (record.status === "rejected" || !record.code)
		return (
			<Shell user={user}>
				<AffiliateNotice title="YOUR APPLICATION WASN'T APPROVED">
					You&apos;re welcome to {applyLink} again, or{" "}
					<Link href="/contact-us" className="underline">
						contact us
					</Link>{" "}
					with any questions.
				</AffiliateNotice>
			</Shell>
		);

	const orders = await listCreditedOrders(record.code, u.id);
	if (!orders.ok) {
		console.error(`[affiliates] couldn't load an affiliate's orders: ${orders.message}`);
		return (
			<Shell user={user}>
				<AffiliateNotice title="WE COULDN'T LOAD YOUR ORDERS">
					Your earnings are safe. Please refresh the page in a moment.
				</AffiliateNotice>
			</Shell>
		);
	}

	// Read the clock only after the session above, so it doesn't make the page's static shell depend on it.
	const now = new Date();
	const ledger = computeLedger(orders.value, record.payouts, now);
	const payout = payoutStatus(
		ledger,
		ledger.thisMonth.tier.schedule,
		payoutsSince(record.payouts, record.approvedAt),
		now,
	);
	const readyAt = walletReadyAt(record.payoutMethod);
	return (
		<Shell user={user}>
			<AffiliateDashboard
				code={record.code}
				link={referralLink(origin(), record.code)}
				vouchers={record.vouchers}
				paused={record.status === "paused"}
				ledger={ledger}
				payout={payout}
				payoutMethod={record.payoutMethod}
				walletReadyAt={readyAt && readyAt > now ? readyAt.toISOString() : null}
				held={record.autoHold !== null}
			/>
		</Shell>
	);
}

export default function AffiliateDashboardPage() {
	return (
		<Suspense
			fallback={
				<Shell user={null}>
					<div
						aria-hidden
						className="wv-order-line h-[320px] animate-pulse rounded-2xl motion-reduce:animate-none"
					/>
				</Shell>
			}
		>
			<DashboardData />
		</Suspense>
	);
}
