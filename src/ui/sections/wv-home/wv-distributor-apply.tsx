import {
	BadgeCheck,
	Hourglass,
	LayoutDashboard,
	Lock,
	LogIn,
	ShieldCheck,
	UserPlus,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { isSignedInStaff } from "@/lib/affiliates/staff";
import { getDistributorAccount, isDistributorAppConfigured } from "@/lib/distributors/saleor-distributors";
import { discountLabel, tierById } from "@/lib/distributors/tiers";
import { DistributorApplyForm } from "./wv-distributor-form";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const primary = `${heyComic} wv-pc-cta flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)]`;
const outline = `${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)]`;
const copy = `${orbitron} wv-hero-copy text-sm leading-[1.6]`;

function ApplyCard({ Icon, title, children }: { Icon: LucideIcon; title: string; children: ReactNode }) {
	return (
		<div className="wv-news-card flex flex-col items-start gap-4 rounded-[20px] p-6 md:p-8">
			<span aria-hidden className="wv-acct-icon flex size-12 items-center justify-center rounded-xl">
				<Icon className="size-5" strokeWidth={2.25} />
			</span>
			<p className={`${bungee} wv-heading-title text-xl md:text-2xl`}>{title}</p>
			{children}
		</div>
	);
}

export function DistributorApplySkeleton() {
	return (
		<div
			aria-hidden
			className="wv-news-card h-[260px] w-full animate-pulse rounded-[20px] motion-reduce:animate-none"
		/>
	);
}

/**
 * The distributor page's apply section, which depends on who's looking: a sign-in prompt (the tier and its prices belong
 * to an account), the application form, word that it's being reviewed, or the way to their tier for a distributor. The
 * page renders it inside Suspense, so the rest of the page doesn't wait for the session.
 */
export async function DistributorApply() {
	const auth = await getAccountAuthState();
	if (auth.status === "unavailable")
		return (
			<ApplyCard Icon={Lock} title="WE CAN'T CHECK YOUR SIGN-IN RIGHT NOW">
				<p className={copy}>Please refresh the page in a moment to apply.</p>
			</ApplyCard>
		);
	if (auth.status !== "authenticated")
		return (
			<ApplyCard Icon={Lock} title="SIGN IN TO APPLY">
				<p className={copy}>
					Your <strong className="wv-hero-key">tier</strong> and its{" "}
					<strong className="wv-hero-key wv-hero-key--pink">wholesale prices</strong> belong to your business
					account at Worldwide Vapor, so sign in (or create one) first.
				</p>
				<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
					<Link href="/login?next=%2Fdistributor%23apply" className={primary}>
						<LogIn aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">SIGN IN</span>
					</Link>
					<Link href="/register" className={outline}>
						<UserPlus aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-btn-label">CREATE ACCOUNT</span>
					</Link>
				</div>
			</ApplyCard>
		);

	if (await isSignedInStaff())
		return (
			<ApplyCard Icon={ShieldCheck} title="YOU'RE SIGNED IN AS STAFF">
				<p className={copy}>
					Distributors apply from a customer account. You run the program from the{" "}
					<strong className="wv-hero-key">distributor admin</strong>: applications, tiers and pausing.
				</p>
				<Link href="/distributor-admin" className={primary}>
					<LayoutDashboard aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">OPEN DISTRIBUTOR ADMIN</span>
				</Link>
			</ApplyCard>
		);

	const user = auth.user;
	const defaults = { name: [user.firstName, user.lastName].filter(Boolean).join(" "), email: user.email };

	if (isDistributorAppConfigured()) {
		const account = await getDistributorAccount(user.id);
		if (!account.ok) console.error(`[distributors] couldn't read a visitor's record: ${account.message}`);
		const record = account.ok ? account.value?.record : undefined;

		if (record?.status === "pending")
			return (
				<ApplyCard Icon={Hourglass} title="APPLICATION RECEIVED">
					<p className={copy}>
						Thanks for applying. We verify every business by hand and will{" "}
						<strong className="wv-hero-key">email you</strong> at {user.email} once your tier is set, usually
						within 48 business hours.
					</p>
				</ApplyCard>
			);
		if ((record?.status === "approved" || record?.status === "paused") && record.tierId) {
			const tier = tierById(record.tierId);
			return (
				<ApplyCard Icon={BadgeCheck} title={`YOU'RE A ${tier.name.toUpperCase()}`}>
					<p className={copy}>
						You get <strong className="wv-hero-key">{discountLabel(tier)} off list</strong> on every product.
						Your tier, minimum order and wholesale prices are on your account.
					</p>
					<Link href="/account/distributor" className={primary}>
						<LayoutDashboard aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">MY DISTRIBUTOR ACCOUNT</span>
					</Link>
				</ApplyCard>
			);
		}
		if (record?.status === "rejected")
			return (
				<div className="flex flex-col gap-4">
					<p className={`${orbitron} wv-hero-copy text-center text-sm`}>
						Your last application wasn&apos;t approved, but you&apos;re welcome to apply again with updated
						details.
					</p>
					<DistributorApplyForm defaults={defaults} />
				</div>
			);
	}

	return <DistributorApplyForm defaults={defaults} />;
}
