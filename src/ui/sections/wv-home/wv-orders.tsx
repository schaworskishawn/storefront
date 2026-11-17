import { Calendar, Package, Truck } from "lucide-react";
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

const STEP_STYLE = {
	complete: { box: "border-[var(--ac-card-border)]", dot: "bg-[var(--ac-green)]", text: "text-white" },
	current: { box: "border-[var(--ac-cyan)]", dot: "bg-[var(--ac-cyan)]", text: "text-white" },
	upcoming: {
		box: "border-[var(--ac-card-border)]",
		dot: "bg-[var(--ac-grey)]",
		text: "text-[var(--ac-muted)]",
	},
} as const;

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
				<div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-[var(--ac-card-border)] p-8">
					<p role="alert" className={`${orbitron} text-sm text-[var(--ac-muted)]`}>
						{failed
							? "We couldn't load this order right now. Please try again in a moment."
							: "We couldn't find that order on your account."}
					</p>
					<Link href="/orders" className={`${heyComic} text-sm text-[var(--ac-cyan)] underline`}>
						BACK TO MY ORDERS
					</Link>
				</div>
			) : (
				<>
					<p className={`${orbitron} flex flex-wrap gap-x-4 text-[11px] uppercase text-[var(--ac-muted)]`}>
						<span className="text-[var(--ac-cyan)]">#{order.number}</span>
						<span>{order.date}</span>
						<span>{order.statusLabel}</span>
						<span>Total {order.total}</span>
					</p>
					<ol className="grid gap-3 md:grid-cols-3">
						{order.steps.map((st) => {
							const c = STEP_STYLE[st.state];
							return (
								<li
									key={st.label}
									aria-current={st.state === "current" ? "step" : undefined}
									className={`${orbitron} flex h-16 items-center gap-3 rounded-[10px] border bg-[var(--wv-surface)] p-3 text-xs md:text-[13px] ${c.box} ${c.text}`}
								>
									<span aria-hidden className={`size-7 shrink-0 rounded-full ${c.dot}`} />
									<span>{st.label}</span>
								</li>
							);
						})}
					</ol>
					{order.lines.map((l) => (
						<div
							key={l.id}
							className="flex flex-col gap-2 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-4 md:flex-row md:items-center md:gap-[18px] md:p-5"
						>
							<div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-[var(--ac-card-border)] bg-[var(--ac-subtle)] md:size-[72px]">
								{l.image && (
									<Image
										src={l.image.url}
										alt={l.image.alt}
										fill
										unoptimized
										sizes="72px"
										className="object-cover"
									/>
								)}
							</div>
							<p
								className={`${bungee} min-w-0 flex-1 break-words text-[13px] uppercase text-white md:text-[15px]`}
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
							<p className={`${orbitron} text-[11px] text-[var(--ac-cyan)]`}>QTY {l.quantity}</p>
							<p className={`${bungee} whitespace-nowrap text-base text-white md:text-lg`}>{l.price}</p>
						</div>
					))}
				</>
			)}
		</AccountShell>
	);
}

export type SavedCardData = { id: string; title: string; expiry: string | null };

function InfoCard({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex min-h-[180px] flex-col gap-3 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-4 md:p-5">
			<h2 className={`${bungee} text-base text-white md:text-[19px]`}>{title}</h2>
			{children}
			<div className="flex-1" />
			{action}
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
						<InfoCard title="NO SAVED CARDS YET">
							<p className={`${orbitron} text-xs text-[var(--ac-muted)]`}>
								Cards you choose to save at checkout will appear here.
							</p>
						</InfoCard>
					)}
					{cards.map((c) => (
						<InfoCard key={c.id} title={c.title}>
							{c.expiry && (
								<p className={`${orbitron} text-xs uppercase text-[var(--ac-muted)]`}>Expires {c.expiry}</p>
							)}
						</InfoCard>
					))}
					<InfoCard
						title="YOUR INFORMATION IS SECURE"
						action={
							<Link href="/privacy-policy" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
								LEARN MORE
							</Link>
						}
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
						title={reviews.length ? `${avg.toFixed(1)} / 5` : "NO REVIEWS YET"}
						action={
							pending.length > 0 ? (
								<a href="#pending" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
									VIEW PENDING REVIEWS
								</a>
							) : undefined
						}
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
							<h2 className={`${bungee} text-lg text-[var(--ac-cyan)]`}>READY TO REVIEW</h2>
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
						<InfoCard title="NO SAVED ADDRESSES YET">
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
						title="SECURITY & PRIVACY"
						action={
							<Link href="/privacy-policy" className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
								LEARN MORE
							</Link>
						}
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
	},
	{
		title: "PAYMENTS & ACCOUNT",
		body: "Billing methods, account access, and profile help.",
		href: "/faqs",
		action: "VIEW HELP TOPIC",
	},
	{
		title: "RETURNS & REFUNDS",
		body: "Return eligibility, timelines, and refund status.",
		href: "/returns",
		action: "VIEW HELP TOPIC",
	},
	{
		title: "STILL NEED HELP?",
		body: "Chat with support or send us an email.",
		href: "/contact-us",
		action: "CONTACT SUPPORT",
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
			{HELP_TOPICS.map((t) => (
				<InfoCard
					key={t.title}
					title={t.title}
					action={
						<Link href={t.href} className={`${orbitron} text-[11px] text-[var(--ac-pink)]`}>
							{t.action}
						</Link>
					}
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
