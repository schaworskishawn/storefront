import { Hourglass, ShieldCheck, Store } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getDefaultLocaleSlug } from "@/config/locale";
import { isSignedInStaff } from "@/lib/affiliates/staff";
import { getDistributorAccount, isDistributorAppConfigured } from "@/lib/distributors/saleor-distributors";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { AccountShell, SignInPrompt, type AccountView } from "@/ui/sections/wv-home/wv-account";
import { DistributorAccount, DistributorNotice } from "@/ui/sections/wv-home/wv-distributor-account";

export const metadata: Metadata = {
	title: "Distributor Account — Worldwide Vapor",
	description: "Your distributor tier, wholesale discount and minimum order.",
	robots: { index: false },
};

const base = () =>
	buildStorefrontPath(
		getDefaultLocaleSlug(),
		DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0] ?? "",
	);

function Shell({ user, children }: { user: AccountView["user"]; children: ReactNode }) {
	return (
		<AccountShell
			user={user}
			base={base()}
			active="Distributor"
			title="DISTRIBUTOR ACCOUNT"
			subtitle="Your tier, wholesale discount and minimum order."
		>
			{children}
		</AccountShell>
	);
}

const applyLink = (
	<Link href="/distributor#apply" className="underline">
		apply on the distributor page
	</Link>
);

async function DistributorData() {
	const auth = await getAccountAuthState();
	if (auth.status === "unavailable")
		return (
			<Shell user={null}>
				<DistributorNotice title="WE CAN'T CHECK YOUR SIGN-IN RIGHT NOW">
					Please refresh the page in a moment.
				</DistributorNotice>
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
				<DistributorNotice Icon={ShieldCheck} title="STAFF ACCOUNTS AREN'T DISTRIBUTORS">
					You run the program: approve applications and set tiers on the{" "}
					<Link href="/distributor-admin" className="underline">
						distributor admin
					</Link>
					.
				</DistributorNotice>
			</Shell>
		);

	if (!isDistributorAppConfigured())
		return (
			<Shell user={user}>
				<DistributorNotice title="THE DISTRIBUTOR PROGRAM ISN'T OPEN YET">
					Check back soon, or {applyLink} and we will be in touch.
				</DistributorNotice>
			</Shell>
		);

	const account = await getDistributorAccount(u.id);
	if (!account.ok) {
		console.error(`[distributors] couldn't load a distributor's record: ${account.message}`);
		return (
			<Shell user={user}>
				<DistributorNotice title="WE COULDN'T LOAD YOUR ACCOUNT">
					Please refresh the page in a moment.
				</DistributorNotice>
			</Shell>
		);
	}
	const record = account.value?.record;
	if (!record)
		return (
			<Shell user={user}>
				<DistributorNotice Icon={Store} title="YOU'RE NOT A DISTRIBUTOR YET">
					Licensed retailers and distributors get 5–25% off list price on every product: {applyLink}.
				</DistributorNotice>
			</Shell>
		);
	if (record.status === "pending")
		return (
			<Shell user={user}>
				<DistributorNotice Icon={Hourglass} title="YOUR APPLICATION IS BEING REVIEWED">
					We verify every business by hand and will email you at {u.email} once your tier is set, usually
					within 48 business hours.
				</DistributorNotice>
			</Shell>
		);
	if (record.status === "rejected" || !record.tierId)
		return (
			<Shell user={user}>
				<DistributorNotice title="YOUR APPLICATION WASN'T APPROVED">
					You&apos;re welcome to {applyLink} again with updated details, or{" "}
					<Link href="/contact-us" className="underline">
						contact us
					</Link>{" "}
					with any questions.
				</DistributorNotice>
			</Shell>
		);

	return (
		<Shell user={user}>
			<DistributorAccount record={record} tierId={record.tierId} />
		</Shell>
	);
}

export default function DistributorAccountPage() {
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
			<DistributorData />
		</Suspense>
	);
}
