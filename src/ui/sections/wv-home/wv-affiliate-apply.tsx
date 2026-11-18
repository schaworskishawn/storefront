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
import { getAffiliateAccount, isAffiliateAppConfigured } from "@/lib/affiliates/saleor-affiliates";
import { isSignedInStaff } from "@/lib/affiliates/staff";
import { AffiliateApplyForm } from "./wv-affiliate-form";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const primary = `${heyComic} wv-pc-cta flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-ink)]`;
const outline = `${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--wv-cyan-soft)] px-8 text-base text-[var(--wv-cyan-soft)]`;

/** A lit glass card (`.wv-news-card`) led by an icon in a neon tile, for every state of the apply section but the form. */
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

const copy = `${orbitron} wv-hero-copy text-sm leading-[1.6]`;

export function AffiliateApplySkeleton() {
	return (
		<div
			aria-hidden
			className="wv-news-card h-[260px] w-full animate-pulse rounded-[20px] motion-reduce:animate-none"
		/>
	);
}

/**
 * The apply section's contents, which depend on who is looking: a sign-in prompt (an application belongs to an account),
 * the form, word that the application is being reviewed, or the way to the dashboard for an affiliate. The page renders
 * it inside Suspense, so the rest of the page doesn't wait for the session.
 */
export async function AffiliateApply() {
	const auth = await getAccountAuthState();
	if (auth.status === "unavailable") {
		return (
			<ApplyCard Icon={Lock} title="WE CAN'T CHECK YOUR SIGN-IN RIGHT NOW">
				<p className={copy}>Please refresh the page in a moment to apply.</p>
			</ApplyCard>
		);
	}
	if (auth.status !== "authenticated") {
		return (
			<ApplyCard Icon={Lock} title="SIGN IN TO APPLY">
				<p className={copy}>
					Your affiliate <strong className="wv-hero-key">dashboard</strong>,{" "}
					<strong className="wv-hero-key wv-hero-key--pink">commission</strong> and{" "}
					<strong className="wv-hero-key">payouts</strong> live in your Worldwide Vapor account, so sign in
					(or create an account) first.
				</p>
				<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
					<Link href="/login?next=%2Faffiliate-program" className={primary}>
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
	}

	const user = auth.user;
	if (await isSignedInStaff()) {
		return (
			<ApplyCard Icon={ShieldCheck} title="YOU'RE SIGNED IN AS STAFF">
				<p className={copy}>
					Affiliates apply from a customer account, so staff accounts can&apos;t join the program. You run it
					from the <strong className="wv-hero-key">affiliate admin</strong>: applications, approvals and
					payouts.
				</p>
				<Link href="/affiliate-admin" className={primary}>
					<LayoutDashboard aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">OPEN AFFILIATE ADMIN</span>
				</Link>
			</ApplyCard>
		);
	}
	const defaults = { name: [user.firstName, user.lastName].filter(Boolean).join(" "), email: user.email };

	if (isAffiliateAppConfigured()) {
		const account = await getAffiliateAccount(user.id);
		if (!account.ok)
			console.error(`[affiliates] couldn't read a visitor's affiliate record: ${account.message}`);
		const status = account.ok ? account.value?.record.status : undefined;

		if (status === "pending") {
			return (
				<ApplyCard Icon={Hourglass} title="APPLICATION RECEIVED">
					<p className={copy}>
						Thanks for applying. We review every application by hand and will{" "}
						<strong className="wv-hero-key">email you</strong> at {user.email} once it has been looked at,
						usually within a few business days.
					</p>
				</ApplyCard>
			);
		}
		if (status === "approved" || status === "paused") {
			return (
				<ApplyCard Icon={BadgeCheck} title="YOU'RE A WORLDWIDE VAPOR AFFILIATE">
					<p className={copy}>
						Your <strong className="wv-hero-key">referral link</strong>, sales,{" "}
						<strong className="wv-hero-key wv-hero-key--pink">commission</strong> and payouts are on your
						dashboard.
					</p>
					<Link href="/account/affiliate" className={primary}>
						<LayoutDashboard aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-pc-cta-label">OPEN MY DASHBOARD</span>
					</Link>
				</ApplyCard>
			);
		}
		if (status === "rejected") {
			return (
				<div className="flex flex-col gap-4">
					<p className={`${orbitron} wv-hero-copy text-center text-sm`}>
						Your last application wasn&apos;t approved, but you&apos;re welcome to apply again.
					</p>
					<AffiliateApplyForm defaults={defaults} />
				</div>
			);
		}
	}

	return <AffiliateApplyForm defaults={defaults} />;
}
