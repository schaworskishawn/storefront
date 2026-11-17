import {
	ArrowLeft,
	ArrowRight,
	Calendar,
	Check,
	ClipboardCheck,
	CreditCard,
	MapPin,
	MessageCircle,
	Package,
	RotateCcw,
	ShieldCheck,
	Star,
	TriangleAlert,
	Truck,
	type LucideIcon,
} from "lucide-react";
import { type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { summarize, type Review, type ReviewableProduct } from "@/lib/reviews";
import { AddAddress, AddressCard, type AddressData } from "./wv-addresses-client";
import { LogoutCard } from "./wv-logout-card";
import { PasswordForm, ProfileForm } from "./wv-settings-client";
import { PendingReview, ReviewCard } from "./wv-reviews-client";
import { AccountShell, SignInPrompt, type AccountView } from "./wv-account";

/** My Orders — Figma "6.21 - High Fidelity - Orders" (desktop 1440, tablet 768, mobile 360). */

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

export type OrderCardData = {
	id: string;
	number: string;
	date: string;
	status: string;
	itemCount: number;
	total: string;
	thumbs: { url: string; alt: string }[];
};

/** The colour of an order's status pill: green once fulfilled, pink if it was cancelled or ran out, cyan otherwise. */
function statusTone(status: string): "done" | "stop" | "open" {
	const s = status.toLowerCase();
	if (s === "fulfilled") return "done";
	if (s.includes("cancel") || s.includes("expired") || s.includes("refund")) return "stop";
	return "open";
}

/**
 * One order, as a neon card (`.wv-neon-card`) that lifts and glows under the pointer: its number lifted beside a
 * parcel in a lit tile, the date led by a glowing calendar, the status a glowing pill in its colour, the products'
 * thumbnails in neon frames, a neon line, the item count and the total glowing, then the glossy "Track order" button
 * and the neon outline "View details" (`.wv-order-*` in wv-home.css). The buttons stack on phones and sit side by side
 * from tablets up.
 */
function OrderCard({ o }: { o: OrderCardData }) {
	const details = `/orders/${o.number}`;
	return (
		<article className="wv-neon-card wv-order-card flex flex-col gap-4 rounded-xl p-4 md:p-5">
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3">
					<span
						aria-hidden
						className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
					>
						<Package className="size-5" strokeWidth={2.25} />
					</span>
					<div className="flex flex-col gap-1">
						<h2 className={`${bungee} wv-pc-name text-[17px] leading-none text-white md:text-[19px]`}>
							#{o.number}
						</h2>
						<p className={`${orbitron} wv-order-date flex items-center gap-1.5 text-[11px] uppercase`}>
							<Calendar aria-hidden className="size-3.5" strokeWidth={2.25} />
							{o.date}
						</p>
					</div>
				</div>
				<span
					data-tone={statusTone(o.status)}
					className={`${orbitron} wv-order-status shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[1px]`}
				>
					{o.status}
				</span>
			</div>
			{o.thumbs.length > 0 && (
				<div className="flex gap-2">
					{o.thumbs.map((t, i) => (
						<div key={i} className="wv-order-thumb relative size-12 overflow-hidden rounded-lg md:size-14">
							<Image src={t.url} alt={t.alt} fill unoptimized sizes="56px" className="object-cover" />
						</div>
					))}
				</div>
			)}
			<span aria-hidden className="wv-acct-card-rule h-px w-full" />
			<div className="flex items-end justify-between gap-3">
				<p className={`${orbitron} wv-neon-card-text text-[11px] uppercase`}>
					{o.itemCount} {o.itemCount === 1 ? "ITEM" : "ITEMS"}
				</p>
				<p className={`${bungee} wv-order-total text-xl md:text-2xl`}>{o.total}</p>
			</div>
			<div className="flex flex-col gap-2 md:flex-row">
				<Link
					href={details}
					className={`${heyComic} wv-pc-cta flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--ac-cyan-bright)] px-4 text-sm tracking-[0.5px] text-[var(--ac-input)] md:flex-1`}
				>
					<Truck aria-hidden className="size-4" strokeWidth={2.5} />
					<span className="wv-pc-cta-label">TRACK ORDER</span>
				</Link>
				<Link
					href={details}
					className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-11 items-center justify-center rounded-xl border-[1.5px] border-[var(--ac-cyan)] px-4 text-sm text-[var(--ac-cyan)] md:flex-1`}
				>
					<span className="wv-btn-label">VIEW DETAILS</span>
				</Link>
			</div>
		</article>
	);
}

export function WvOrders({
	user,
	base,
	orders,
	failed,
}: AccountView & { orders: OrderCardData[]; failed?: boolean }) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="My Orders"
			title="MY ORDERS"
			subtitle="View and track your orders."
		>
			{!user ? (
				<SignInPrompt />
			) : failed ? (
				<p
					role="alert"
					className={`${orbitron} rounded-xl border border-dashed border-[var(--ac-card-border)] p-8 text-center text-sm text-[var(--ac-muted)]`}
				>
					We couldn&apos;t load your orders right now. Please try again in a moment.
				</p>
			) : orders.length === 0 ? (
				<div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--ac-card-border)] p-8 text-center">
					<p className={`${orbitron} text-sm text-[var(--ac-muted)]`}>
						You haven&apos;t placed any orders yet.
					</p>
					<Link
						href="/shop"
						className={`${heyComic} flex h-11 items-center justify-center rounded-xl bg-[var(--ac-cyan-bright)] px-8 text-sm text-[var(--ac-input)]`}
					>
						START SHOPPING
					</Link>
				</div>
			) : (
				orders.map((o) => <OrderCard key={o.id} o={o} />)
			)}
		</AccountShell>
	);
}

export type OrderLineData = {
	id: string;
	name: string;
	option: string | null;
	quantity: number;
	price: string;
	image: { url: string; alt: string } | null;
};
export type OrderDetailData = {
	number: string;
	date: string;
	total: string;
	statusLabel: string;
	steps: { label: string; state: "complete" | "current" | "upcoming" }[];
	lines: OrderLineData[];
};

/** Each step's icon in the tracker (a check once it's done). */
const STEP_ICON: Record<string, LucideIcon> = {
	"ORDER PLACED": ClipboardCheck,
	PROCESSING: Package,
	SHIPPED: Truck,
};

export function WvOrderDetail({
	user,
	base,
	order,
	failed,
}: AccountView & { order: OrderDetailData | null; failed?: boolean }) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="My Orders"
			title="ORDER DETAILS"
			subtitle="Track shipment progress and review purchased items."
		>
			{!user ? (
				<SignInPrompt />
			) : failed || !order ? (
				<div className="wv-news-card flex flex-col items-start gap-4 rounded-[20px] p-6 md:p-8">
					<span aria-hidden className="wv-acct-icon flex size-12 items-center justify-center rounded-xl">
						<TriangleAlert className="size-5" strokeWidth={2.25} />
					</span>
					<p role="alert" className={`${orbitron} wv-hero-copy text-sm`}>
						{failed
							? "We couldn't load this order right now. Please try again in a moment."
							: "We couldn't find that order on your account."}
					</p>
					<Link
						href="/orders"
						className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[var(--ac-cyan)] px-5 text-sm text-[var(--ac-cyan)]`}
					>
						<ArrowLeft aria-hidden className="size-4" strokeWidth={2.5} />
						<span className="wv-btn-label">BACK TO MY ORDERS</span>
					</Link>
				</div>
			) : (
				<>
					{/* The order at a glance, a neon card like My Orders': the number by a parcel in a lit tile, the date by a
					    glowing calendar, the status a glowing pill in its colour and the total glowing. */}
					<div className="wv-neon-card wv-order-card flex flex-wrap items-center justify-between gap-4 rounded-xl p-4 md:p-5">
						<div className="flex items-center gap-3">
							<span
								aria-hidden
								className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
							>
								<Package className="size-5" strokeWidth={2.25} />
							</span>
							<div className="flex flex-col gap-1">
								<p className={`${bungee} wv-pc-name text-[19px] leading-none text-white`}>#{order.number}</p>
								<p className={`${orbitron} wv-order-date flex items-center gap-1.5 text-[11px] uppercase`}>
									<Calendar aria-hidden className="size-3.5" strokeWidth={2.25} />
									{order.date}
								</p>
							</div>
						</div>
						<span
							data-tone={statusTone(order.statusLabel)}
							className={`${orbitron} wv-order-status rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[1px]`}
						>
							{order.statusLabel}
						</span>
						<div className="flex flex-col items-end gap-0.5">
							<span className={`${orbitron} text-[10px] uppercase tracking-[1px] text-[var(--ac-muted)]`}>
								Total
							</span>
							<span className={`${bungee} wv-order-total text-xl md:text-2xl`}>{order.total}</span>
						</div>
					</div>

					{/* The tracker: each step a glass tile with its icon in a ring, done green with a check, the current one lit
					    cyan with a ring pulsing out of it, the rest dim; glowing lines join them (`.wv-order-step*`). */}
					<ol className="grid gap-3 md:grid-cols-3">
						{order.steps.map((st) => {
							const Icon = st.state === "complete" ? Check : (STEP_ICON[st.label] ?? Package);
							return (
								<li
									key={st.label}
									data-state={st.state}
									aria-current={st.state === "current" ? "step" : undefined}
									className={`${orbitron} wv-order-step relative flex h-16 items-center gap-3 rounded-xl p-3 text-xs md:text-[13px]`}
								>
									<span
										aria-hidden
										className="wv-order-step-ring relative flex size-9 shrink-0 items-center justify-center rounded-full"
									>
										<Icon className="size-4" strokeWidth={2.5} />
									</span>
									<span>{st.label}</span>
								</li>
							);
						})}
					</ol>

					{/* Each item: a glass row, its picture in a neon frame, the name lifted, the quantity a glowing pill and the
					    price glowing. */}
					{order.lines.map((l) => (
						<div
							key={l.id}
							className="wv-order-line flex flex-col gap-2 rounded-xl p-4 md:flex-row md:items-center md:gap-[18px] md:p-5"
						>
							<div className="wv-order-thumb relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg md:size-[72px]">
								{l.image ? (
									<Image
										src={l.image.url}
										alt={l.image.alt}
										fill
										unoptimized
										sizes="72px"
										className="object-cover"
									/>
								) : (
									<Package aria-hidden className="wv-order-thumb-icon size-6" strokeWidth={1.75} />
								)}
							</div>
							<p
								className={`${bungee} wv-pc-name min-w-0 flex-1 break-words text-[13px] uppercase text-white md:text-[15px]`}
							>
								{l.name}
							</p>
							{l.option && (
								<p
									className={`${orbitron} text-[11px] uppercase text-[var(--ac-muted)] md:w-[119px] md:shrink-0`}
								>
									{l.option}
								</p>
							)}
							<p
								className={`${orbitron} wv-order-qty w-fit rounded-full px-2.5 py-0.5 text-[11px] tracking-[0.5px]`}
							>
								QTY {l.quantity}
							</p>
							<p className={`${bungee} wv-order-total whitespace-nowrap text-base md:text-lg`}>{l.price}</p>
						</div>
					))}
				</>
			)}
		</AccountShell>
	);
}

export type SavedCardData = { id: string; title: string; expiry: string | null };

/**
 * An account page's information card (payment methods, addresses, reviews, settings, help topics), like the account
 * summaries: a neon card in cyan or pink (`.wv-neon-card`) with its icon in a lit tile and its title lifted; with an
 * action, a neon line runs above it and it is a neon pill whose arrow slides on under the pointer (`.wv-acct-card*`).
 * Without one, the card is only as tall as its content.
 */
function InfoCard({
	title,
	children,
	action,
	icon: Icon,
	pink = false,
}: {
	title: string;
	children?: ReactNode;
	action?: { href: string; label: string };
	icon?: LucideIcon;
	pink?: boolean;
}) {
	return (
		<div
			className={`wv-neon-card wv-acct-card ${pink ? "wv-neon-card--pink" : ""} flex flex-col gap-3 rounded-xl p-4 md:p-5 ${action ? "min-h-[180px]" : ""}`}
		>
			<div className="flex items-center gap-3">
				{Icon && (
					<span
						aria-hidden
						className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
					>
						<Icon className="size-5" strokeWidth={2.25} />
					</span>
				)}
				<h2 className={`${bungee} wv-pc-name text-base text-white md:text-[19px]`}>{title}</h2>
			</div>
			{children}
			{action && (
				<>
					<div className="flex-1" />
					<span aria-hidden className="wv-acct-card-rule h-px w-full" />
					<Link
						href={action.href}
						className={`${orbitron} wv-acct-card-action group/act flex items-center gap-2 self-end rounded-full px-3.5 py-1.5 text-[11px] tracking-[0.5px]`}
					>
						{action.label}
						<ArrowRight
							aria-hidden
							className="size-3.5 transition-transform group-hover/act:translate-x-1"
							strokeWidth={2.5}
						/>
					</Link>
				</>
			)}
		</div>
	);
}

export function WvPaymentMethods({
	user,
	base,
	cards,
	failed,
}: AccountView & { cards: SavedCardData[]; failed?: boolean }) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="Payment Methods"
			title="PAYMENT METHODS"
			subtitle="Manage saved cards and billing details."
		>
			{!user ? (
				<SignInPrompt />
			) : (
				<>
					{failed && (
						<p role="alert" className={`${orbitron} text-sm text-[var(--ac-muted)]`}>
							We couldn&apos;t load your saved cards right now. Please try again in a moment.
						</p>
					)}
					{!failed && cards.length === 0 && (
						<InfoCard icon={CreditCard} title="NO SAVED CARDS YET">
							<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
								Cards you choose to save at checkout will appear here.
							</p>
						</InfoCard>
					)}
					{cards.map((c) => (
						<InfoCard key={c.id} icon={CreditCard} title={c.title}>
							{c.expiry && (
								<p className={`${orbitron} text-xs uppercase text-[var(--ac-muted)]`}>Expires {c.expiry}</p>
							)}
						</InfoCard>
					))}
					<InfoCard
						icon={ShieldCheck}
						pink
						title="YOUR INFORMATION IS SECURE"
						action={{ href: "/privacy-policy", label: "LEARN MORE" }}
					>
						<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
							Payment and account data are encrypted and processed securely.
						</p>
					</InfoCard>
				</>
			)}
		</AccountShell>
	);
}

export function WvMyReviews({
	user,
	base,
	reviews,
	pending,
	failed,
}: AccountView & { reviews: Review[]; pending: ReviewableProduct[]; failed?: boolean }) {
	const { avg, counts } = summarize(reviews);
	return (
		<AccountShell
			user={user}
			base={base}
			active="My Reviews"
			title="MY REVIEWS"
			subtitle="View, write, and manage your product reviews."
		>
			{!user ? (
				<SignInPrompt />
			) : (
				<>
					{failed && (
						<p role="alert" className={`${orbitron} text-sm text-[var(--ac-muted)]`}>
							We couldn&apos;t load your reviews right now. Please try again in a moment.
						</p>
					)}
					<InfoCard
						icon={Star}
						title={reviews.length ? `${avg.toFixed(1)} / 5` : "NO REVIEWS YET"}
						action={pending.length > 0 ? { href: "#pending", label: "VIEW PENDING REVIEWS" } : undefined}
					>
						{reviews.length ? (
							<>
								<p className={`${orbitron} text-xs uppercase text-[var(--ac-muted)]`}>
									Based on {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
								</p>
								<p className={`${orbitron} whitespace-pre-wrap text-[11px] text-[var(--ac-cyan)]`}>
									{counts
										.filter((c) => c.count > 0)
										.map((c) => `${"★".repeat(c.stars)} ${c.count}`)
										.join("  ·  ")}
								</p>
							</>
						) : (
							<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
								{pending.length
									? "Review products you've bought below."
									: "Once you've bought something, you can review it here."}
							</p>
						)}
					</InfoCard>
					{reviews.map((r) => (
						<ReviewCard key={r.id} review={r} />
					))}
					{pending.length > 0 && (
						<section id="pending" className="flex scroll-mt-24 flex-col gap-3">
							<div className="flex flex-col gap-2">
								<h2 className={`${bungee} wv-heading-title text-lg`}>READY TO REVIEW</h2>
								<div className="wv-hero-bar h-[3px] w-12 rounded-full" />
							</div>
							{pending.map((p) => (
								<PendingReview key={p.id} product={p} />
							))}
						</section>
					)}
				</>
			)}
		</AccountShell>
	);
}

export function WvAddresses({
	user,
	base,
	addresses,
	failed,
}: AccountView & { addresses: AddressData[]; failed?: boolean }) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="Addresses"
			title="ADDRESSES"
			subtitle="Manage shipping and billing addresses."
		>
			{!user ? (
				<SignInPrompt />
			) : (
				<>
					{failed && (
						<p role="alert" className={`${orbitron} text-sm text-[var(--ac-muted)]`}>
							We couldn&apos;t load your addresses right now. Please try again in a moment.
						</p>
					)}
					{!failed && addresses.length === 0 && (
						<InfoCard icon={MapPin} title="NO SAVED ADDRESSES YET">
							<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
								Add an address to speed up checkout.
							</p>
						</InfoCard>
					)}
					{addresses.map((a) => (
						<AddressCard key={a.id} a={a} />
					))}
					{!failed && <AddAddress />}
				</>
			)}
		</AccountShell>
	);
}

export function WvAccountSettings({
	user,
	base,
	profile,
}: AccountView & { profile: { firstName: string; lastName: string; email: string } | null }) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="Account Settings"
			title="ACCOUNT SETTINGS"
			subtitle="Update profile, security, and communication preferences."
		>
			{!user || !profile ? (
				<SignInPrompt />
			) : (
				<>
					<ProfileForm firstName={profile.firstName} lastName={profile.lastName} email={profile.email} />
					<PasswordForm />
					<InfoCard
						icon={ShieldCheck}
						pink
						title="SECURITY & PRIVACY"
						action={{ href: "/privacy-policy", label: "LEARN MORE" }}
					>
						<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
							Use a strong password and keep your contact details current.
						</p>
					</InfoCard>
				</>
			)}
		</AccountShell>
	);
}

const HELP_TOPICS = [
	{
		title: "ORDERS & DELIVERY",
		body: "Tracking, delivery timing, order changes, and returns.",
		href: "/shipping",
		action: "VIEW HELP TOPIC",
		icon: Truck,
	},
	{
		title: "PAYMENTS & ACCOUNT",
		body: "Billing methods, account access, and profile help.",
		href: "/faqs",
		action: "VIEW HELP TOPIC",
		icon: CreditCard,
	},
	{
		title: "RETURNS & REFUNDS",
		body: "Return eligibility, timelines, and refund status.",
		href: "/returns",
		action: "VIEW HELP TOPIC",
		icon: RotateCcw,
	},
	{
		title: "STILL NEED HELP?",
		body: "Chat with support or send us an email.",
		href: "/contact-us",
		action: "CONTACT SUPPORT",
		icon: MessageCircle,
	},
];

export function WvHelpCenter({ user, base }: AccountView) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="Help Center"
			title="HELP CENTER"
			subtitle="Find answers or contact Worldwide Vapor support."
		>
			{HELP_TOPICS.map((t, i) => (
				<InfoCard
					key={t.title}
					icon={t.icon}
					pink={i % 2 === 1}
					title={t.title}
					action={{ href: t.href, label: t.action }}
				>
					<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>{t.body}</p>
				</InfoCard>
			))}
		</AccountShell>
	);
}

export function WvLogout({ user, base }: AccountView) {
	return (
		<AccountShell
			user={user}
			base={base}
			active="Log Out"
			title="LOG OUT"
			subtitle="End your current account session securely."
		>
			{user ? <LogoutCard /> : <SignInPrompt />}
		</AccountShell>
	);
}
