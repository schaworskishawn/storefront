import Link from "next/link";
import { type ReactNode } from "react";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { AccountCover } from "./wv-cover";
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

function NavRows({ signedIn, active }: { signedIn: boolean; active: string }) {
	const row = "flex h-11 items-center gap-3 rounded-xl p-3 text-sm";
	return (
		<>
			{navItems(active).map((n) => {
				const inner = (
					<>
						<span
							aria-hidden
							className={`h-5 w-[3px] rounded-full ${n.active ? "bg-[var(--ac-cyan)]" : "bg-[var(--ac-subtle)]"}`}
						/>
						<span className="flex-1">{n.label}</span>
					</>
				);
				const style = n.active
					? `${row} border border-[var(--ac-cyan)] bg-[var(--ac-input)] text-white`
					: `${row} text-[var(--ac-muted)]`;
				return n.href ? (
					<Link key={n.label} href={n.href} aria-current={n.active ? "page" : undefined} className={style}>
						{inner}
					</Link>
				) : (
					<span key={n.label} aria-disabled="true" title="Coming soon" className={`${style} opacity-50`}>
						{inner}
					</span>
				);
			})}
			{signedIn && (
				<Link
					href="/logout"
					aria-current={active === "Log Out" ? "page" : undefined}
					className={
						active === "Log Out"
							? `${row} border border-[var(--ac-cyan)] bg-[var(--ac-input)] text-white`
							: `${row} text-[var(--ac-muted)]`
					}
				>
					<span
						aria-hidden
						className={`h-5 w-[3px] rounded-full ${active === "Log Out" ? "bg-[var(--ac-cyan)]" : "bg-[var(--ac-subtle)]"}`}
					/>
					<span className="flex-1">Log Out</span>
				</Link>
			)}
		</>
	);
}

function SummaryCard({
	label,
	value,
	hint,
	action,
	href,
}: {
	label: string;
	value: string;
	hint: string;
	action: string;
	href: string;
}) {
	return (
		<div className="flex min-h-[188px] flex-col gap-2 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-[18px] md:min-h-[208px] md:p-5 lg:min-h-[216px] lg:gap-[10px] lg:p-6">
			<p className={`${orbitron} text-xs text-[var(--ac-cyan)]`}>{label}</p>
			<p className={`${bungee} break-words text-[22px] text-white lg:text-[26px]`}>{value}</p>
			<p className={`${orbitron} text-xs text-[var(--ac-muted)] lg:text-[13px]`}>{hint}</p>
			<div className="flex-1" />
			<Link href={href} className={`${orbitron} self-end text-[11px] text-[var(--ac-pink)]`}>
				{action}
			</Link>
		</div>
	);
}

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
			<main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 pb-16 pt-12 md:px-8 lg:flex-row lg:items-start lg:gap-8 lg:px-16">
				{/* Nav: collapsed menu below lg, full sidebar at lg */}
				<details className="group rounded-xl border border-[var(--ac-subtle)] bg-[var(--wv-surface)] lg:hidden">
					<summary
						className={`${orbitron} flex h-[52px] cursor-pointer list-none items-center justify-between px-4 text-sm [&::-webkit-details-marker]:hidden`}
					>
						<span className="flex items-center gap-3">
							<span aria-hidden className="text-[var(--ac-cyan)]">
								☰
							</span>
							Account Menu
						</span>
						<span aria-hidden className="text-[var(--ac-muted)] transition-transform group-open:rotate-180">
							⌄
						</span>
					</summary>
					<nav aria-label="Account" className={`${orbitron} flex flex-col gap-2 px-3 pb-3`}>
						<NavRows signedIn={!!user} active={active} />
					</nav>
				</details>

				<aside className="hidden w-[320px] shrink-0 flex-col gap-2 rounded-xl border border-[var(--ac-subtle)] bg-[var(--wv-surface)] p-6 lg:flex">
					<div className="flex flex-col items-center gap-2">
						<div
							className={`${bungee} flex size-16 items-center justify-center rounded-full border border-[var(--ac-cyan)] text-2xl text-[var(--ac-cyan)]`}
						>
							{initial}
						</div>
						<p className={`${bungee} text-xl leading-7 tracking-[-0.2px]`}>{user?.name ?? "Guest"}</p>
						<p className={`${orbitron} text-xs text-[var(--ac-cyan)]`}>
							{user ? user.email : "Not signed in"}
						</p>
					</div>
					<div className="my-2 h-px bg-[var(--ac-subtle)]" />
					<nav aria-label="Account" className={`${orbitron} flex flex-col gap-2`}>
						<NavRows signedIn={!!user} active={active} />
					</nav>
				</aside>

				<section className="flex min-w-0 flex-1 flex-col gap-6">
					<div className="flex flex-col gap-2 py-2">
						<h1 className={`${bungee} text-[40px] leading-[48px] tracking-[-0.4px]`}>{title}</h1>
						<p className={`${orbitron} text-base leading-6 text-[var(--ac-muted)]`}>{subtitle}</p>
					</div>

					{children}
				</section>
			</main>
			<WvFooter />
		</div>
	);
}

export function SignInPrompt() {
	return (
		<div className="flex flex-col items-start gap-4 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-6">
			<p className={`${bungee} text-2xl`}>SIGN IN TO CONTINUE</p>
			<p className={`${orbitron} text-sm text-[var(--ac-muted)]`}>
				Sign in to see your orders, saved addresses and account settings.
			</p>
			<Link
				href="/login"
				className="flex h-12 items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-8 font-[family-name:var(--font-hey-comic)] text-base text-[var(--wv-bg)]"
			>
				SIGN IN
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
			{user ? <AccountCover fallbackName={user.name} /> : null}
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
