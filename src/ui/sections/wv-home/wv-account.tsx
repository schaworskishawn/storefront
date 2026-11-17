import { ChevronDown, ChevronRight, Lock, LogIn, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { WvFooter, WvHeader } from "./wv-chrome";
import "./wv-home.css";

/** My Account — Figma "6.20 - High Fidelity - Account" (desktop 1440, tablet 768, mobile 360). */

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export type AccountView = {
	/** null = not signed in */
	user: { name: string; email: string; city: string | null } | null;
	/** `/{locale}/{channel}` prefix for the Saleor-backed account screens */
	base: string;
};

type NavItem = { label: string; href?: string; active?: boolean };

function navItems(active: string): NavItem[] {
	return [
		{ label: "My Orders", href: "/orders" },
		{ label: "Wishlist", href: "/wishlist" },
		...(readRewardsConfig().enabled ? [{ label: "Vapor Tokens", href: "/rewards" }] : []),
		{ label: "Payment Methods", href: "/payment-methods" },
		{ label: "My Reviews", href: "/my-reviews" },
		{ label: "Addresses", href: "/addresses" },
		{ label: "Account Settings", href: "/account-settings" },
		{ label: "Help Center", href: "/help-center" },
	].map((n): NavItem => ({ ...n, active: n.label === active }));
}

/**
 * The account menu's rows (`.wv-acct-link` in wv-home.css): each glows under the pointer, its side bar lighting cyan and
 * its chevron nudging on; the page you're on is lit glass inside a cyan-to-pink edge, its bar glowing cyan into pink.
 */
function NavRows({ signedIn, active }: { signedIn: boolean; active: string }) {
	const row = "wv-acct-link flex h-11 items-center gap-3 rounded-xl p-3 text-sm";
	const inner = (label: string) => (
		<>
			<span aria-hidden className="wv-acct-bar h-5 w-[3px] rounded-full" />
			<span className="flex-1">{label}</span>
			<ChevronRight aria-hidden className="wv-acct-chev size-4" strokeWidth={2.25} />
		</>
	);
	return (
		<>
			{navItems(active).map((n) =>
				n.href ? (
					<Link
						key={n.label}
						href={n.href}
						aria-current={n.active ? "page" : undefined}
						data-active={n.active || undefined}
						className={row}
					>
						{inner(n.label)}
					</Link>
				) : (
					<span
						key={n.label}
						aria-disabled="true"
						title="Coming soon"
						data-active={n.active || undefined}
						className={`${row} opacity-50`}
					>
						{inner(n.label)}
					</span>
				),
			)}
			{signedIn && (
				<Link
					href="/logout"
					aria-current={active === "Log Out" ? "page" : undefined}
					data-active={active === "Log Out" || undefined}
					className={row}
				>
					{inner("Log Out")}
				</Link>
			)}
		</>
	);
}

/** One summary on the signed-in account page: a neon card (`.wv-neon-card`, pink for the middle one). */
function SummaryCard({
	label,
	value,
	hint,
	action,
	href,
	pink = false,
}: {
	label: string;
	value: string;
	hint: string;
	action: string;
	href: string;
	pink?: boolean;
}) {
	return (
		<div
			className={`wv-neon-card ${pink ? "wv-neon-card--pink" : ""} flex min-h-[188px] flex-col gap-2 rounded-xl p-[18px] md:min-h-[208px] md:p-5 lg:min-h-[216px] lg:gap-[10px] lg:p-6`}
		>
			<p className={`${orbitron} wv-neon-card-timing text-xs`}>{label}</p>
			<p className={`${bungee} wv-pc-name break-words text-[22px] text-white lg:text-[26px]`}>{value}</p>
			<p className={`${orbitron} wv-neon-card-text text-xs lg:text-[13px]`}>{hint}</p>
			<div className="flex-1" />
			<Link href={href} className={`${orbitron} wv-neon-card-link self-end text-[11px]`}>
				{action} →
			</Link>
		</div>
	);
}

/** A page title with its last word lit cyan ("MY ACCOUNT" → "MY" "ACCOUNT"), as the site's other heroes do. */
function TitleWords({ title }: { title: string }) {
	const cut = title.lastIndexOf(" ");
	if (cut < 0) return <span>{title}</span>;
	return (
		<>
			<span>{title.slice(0, cut)}</span> <span className="text-[var(--ac-cyan)]">{title.slice(cut + 1)}</span>
		</>
	);
}

/**
 * Every account page's frame, in the site's neon style (`.wv-acct-*` in wv-home.css). Below the desktop layout the menu
 * is a lit glass panel that opens (an icon tile, a glowing chevron); on desktop it is a lit glass sidebar with the
 * avatar in a glowing ring (a person icon for a guest), the email glowing cyan and a neon divider. The title is 3D with
 * its last word lit cyan over a glowing bar, the subtitle brighter, all over the heroes' soft pink and cyan glows.
 */
export function AccountShell({
	user,
	active,
	title,
	subtitle,
	children,
}: AccountView & { active: string; title: string; subtitle: string; children: ReactNode }) {
	const initial = user?.name.trim().charAt(0).toUpperCase() ?? "";

	return (
		<div className="relative min-h-dvh overflow-x-clip bg-[var(--wv-bg)] text-white">
			<WvHeader />
			<main className="wv-hero-backdrop mx-auto flex max-w-[1440px] flex-col gap-5 px-4 pb-16 pt-12 md:px-8 lg:flex-row lg:items-start lg:gap-8 lg:px-16">
				{/* Nav: collapsed menu below lg, full sidebar at lg */}
				<details className="wv-acct-menu group rounded-xl lg:hidden">
					<summary
						className={`${orbitron} flex h-[52px] cursor-pointer list-none items-center justify-between px-4 text-sm [&::-webkit-details-marker]:hidden`}
					>
						<span className="flex items-center gap-3">
							<span aria-hidden className="wv-acct-icon flex size-8 items-center justify-center rounded-lg">
								<Menu className="size-4" strokeWidth={2.5} />
							</span>
							Account Menu
						</span>
						<ChevronDown
							aria-hidden
							className="wv-acct-caret size-4 transition-transform group-open:rotate-180"
							strokeWidth={2.5}
						/>
					</summary>
					<nav aria-label="Account" className={`${orbitron} flex flex-col gap-2 px-3 pb-3`}>
						<NavRows signedIn={!!user} active={active} />
					</nav>
				</details>

				<aside className="wv-acct-side hidden w-[320px] shrink-0 flex-col gap-2 rounded-xl p-6 lg:flex">
					<div className="flex flex-col items-center gap-2">
						<div
							className={`${bungee} wv-acct-avatar flex size-16 items-center justify-center rounded-full text-2xl`}
						>
							{initial || <UserRound aria-hidden className="size-7" strokeWidth={2} />}
						</div>
						<p className={`${bungee} wv-pc-name text-xl leading-7 tracking-[-0.2px]`}>
							{user?.name ?? "Guest"}
						</p>
						<p className={`${orbitron} wv-acct-email text-xs`}>{user ? user.email : "Not signed in"}</p>
					</div>
					<div aria-hidden className="wv-acct-rule my-2 h-px" />
					<nav aria-label="Account" className={`${orbitron} flex flex-col gap-2`}>
						<NavRows signedIn={!!user} active={active} />
					</nav>
				</aside>

				<section className="flex min-w-0 flex-1 flex-col gap-6">
					<div className="flex flex-col gap-3 py-2">
						<h1
							className={`${bungee} wv-title-glow wv-hero-title text-[40px] leading-[48px] tracking-[-0.4px]`}
						>
							<TitleWords title={title} />
						</h1>
						<div className="wv-hero-bar h-1 w-20 rounded-full md:w-[120px]" />
						<p className={`${orbitron} wv-hero-copy text-base leading-6`}>{subtitle}</p>
					</div>

					{children}
				</section>
			</main>
			<WvFooter />
		</div>
	);
}

/** Signed out: a lit glass card (`.wv-news-card`) with a lock in a neon tile and the glossy sign-in button. */
export function SignInPrompt() {
	return (
		<div className="wv-news-card flex flex-col items-start gap-4 rounded-[20px] p-6 md:p-8">
			<span aria-hidden className="wv-acct-icon flex size-12 items-center justify-center rounded-xl">
				<Lock className="size-5" strokeWidth={2.25} />
			</span>
			<p className={`${bungee} wv-heading-title text-2xl`}>SIGN IN TO CONTINUE</p>
			<p className={`${orbitron} wv-hero-copy text-sm leading-[1.6]`}>
				Sign in to see your <strong className="wv-hero-key">orders</strong>,{" "}
				<strong className="wv-hero-key wv-hero-key--pink">saved addresses</strong> and{" "}
				<strong className="wv-hero-key">account settings</strong>.
			</p>
			<Link
				href="/login"
				className="wv-pc-cta flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--ac-cyan-bright)] px-8 font-[family-name:var(--font-hey-comic)] text-base text-[var(--wv-bg)]"
			>
				<LogIn aria-hidden className="size-4" strokeWidth={2.5} />
				<span className="wv-pc-cta-label">SIGN IN</span>
			</Link>
		</div>
	);
}

export function WvAccount({ user, base }: AccountView) {
	return (
		<AccountShell
			user={user}
			base={base}
			active=""
			title="MY ACCOUNT"
			subtitle="Manage orders, saved details, and account settings."
		>
			{user ? (
				<div className="grid gap-4 md:grid-cols-3">
					<SummaryCard
						label="RECENT ORDER"
						value="MY ORDERS"
						hint="Track and review your purchases"
						action="VIEW DETAILS"
						href="/orders"
					/>
					<SummaryCard
						pink
						label="DEFAULT ADDRESS"
						value={user.city ? user.city.toUpperCase() : "NOT SET"}
						hint={user.city ? "Default shipping address" : "Add a shipping address"}
						action={user.city ? "VIEW DETAILS" : "ADD ADDRESS"}
						href="/addresses"
					/>
					<SummaryCard
						label="ACCOUNT EMAIL"
						value={user.name.toUpperCase()}
						hint={user.email}
						action="EDIT DETAILS"
						href="/account-settings"
					/>
				</div>
			) : (
				<SignInPrompt />
			)}
		</AccountShell>
	);
}
