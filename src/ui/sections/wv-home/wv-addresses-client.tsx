"use client";

import {
	Check,
	ChevronDown,
	CreditCard,
	MapPin,
	Pencil,
	Phone,
	Plus,
	Trash2,
	Truck,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
	createAddressAction,
	deleteAddressAction,
	setDefaultAddressAction,
	updateAddressAction,
} from "@/lib/wv-address-actions";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

export type AddressData = {
	id: string;
	firstName: string;
	lastName: string;
	companyName: string;
	streetAddress1: string;
	streetAddress2: string;
	city: string;
	postalCode: string;
	countryArea: string;
	countryCode: string;
	countryName: string;
	phone: string;
	isDefaultShipping: boolean;
	isDefaultBilling: boolean;
};

type Result = { ok: true } | { ok: false; error: string };

const COUNTRIES: [string, string][] = [
	["CA", "Canada"],
	["US", "United States"],
	["GB", "United Kingdom"],
	["AU", "Australia"],
	["DE", "Germany"],
	["FR", "France"],
	["NL", "Netherlands"],
	["IE", "Ireland"],
	["NZ", "New Zealand"],
];

/** A field set into the glass, glowing cyan while focused (`.wv-acct-field` in wv-home.css). */
const field = `${orbitron} wv-acct-field w-full min-w-0 rounded-lg px-3 py-2.5 text-xs text-white placeholder:text-[var(--ac-muted)]/60 focus:outline-none`;

/**
 * An address's card (or the new one's): a neon card (`.wv-neon-card`, `.wv-addr-card` in wv-home.css) in its colour,
 * pink for a billing-only default and cyan otherwise, with its icon in a lit tile beside the lifted title and a neon line
 * beneath.
 */
function Card({
	Icon,
	title,
	pink = false,
	children,
}: {
	Icon: LucideIcon;
	title: string;
	pink?: boolean;
	children: ReactNode;
}) {
	return (
		<article
			className={`wv-neon-card wv-addr-card ${pink ? "wv-neon-card--pink" : ""} flex flex-col gap-3 rounded-xl p-4 md:p-5`}
		>
			<div className="flex items-center gap-3">
				<span
					aria-hidden
					className="wv-neon-card-icon flex size-11 shrink-0 items-center justify-center rounded-xl"
				>
					<Icon className="size-5" strokeWidth={2.25} />
				</span>
				<h2
					className={`${bungee} wv-pc-name min-w-0 break-words text-base uppercase text-white md:text-[19px]`}
				>
					{title}
				</h2>
			</div>
			<span aria-hidden className="wv-acct-card-rule h-px w-full" />
			{children}
		</article>
	);
}

function AddressForm({ initial, onDone }: { initial?: AddressData; onDone: () => void }) {
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const countries =
		initial && !COUNTRIES.some(([c]) => c === initial.countryCode)
			? [...COUNTRIES, [initial.countryCode, initial.countryName] as [string, string]]
			: COUNTRIES;

	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		if (initial) fd.set("id", initial.id);
		start(async () => {
			setError(null);
			const r = await (initial ? updateAddressAction(fd) : createAddressAction(fd));
			if (r.ok) onDone();
			else setError(r.error);
		});
	};

	const d = initial;
	return (
		<form onSubmit={submit} className="flex flex-col gap-3">
			<div className="grid gap-3 md:grid-cols-2">
				<input
					name="firstName"
					required
					defaultValue={d?.firstName}
					placeholder="First name"
					aria-label="First name"
					autoComplete="given-name"
					className={field}
				/>
				<input
					name="lastName"
					required
					defaultValue={d?.lastName}
					placeholder="Last name"
					aria-label="Last name"
					autoComplete="family-name"
					className={field}
				/>
				<input
					name="streetAddress1"
					required
					defaultValue={d?.streetAddress1}
					placeholder="Street address"
					aria-label="Street address"
					autoComplete="address-line1"
					className={field}
				/>
				<input
					name="streetAddress2"
					defaultValue={d?.streetAddress2}
					placeholder="Apartment, suite (optional)"
					aria-label="Apartment, suite"
					autoComplete="address-line2"
					className={field}
				/>
				<input
					name="city"
					required
					defaultValue={d?.city}
					placeholder="City"
					aria-label="City"
					autoComplete="address-level2"
					className={field}
				/>
				<input
					name="countryArea"
					defaultValue={d?.countryArea}
					placeholder="Province / State"
					aria-label="Province or state"
					autoComplete="address-level1"
					className={field}
				/>
				<input
					name="postalCode"
					required
					defaultValue={d?.postalCode}
					placeholder="Postal code"
					aria-label="Postal code"
					autoComplete="postal-code"
					className={field}
				/>
				{/* The country picker, its arrow a glowing chevron (the field's glass hides the browser's own). */}
				<div className="relative">
					<select
						name="country"
						required
						defaultValue={d?.countryCode ?? "CA"}
						aria-label="Country"
						className={`${field} wv-addr-select appearance-none pr-9`}
					>
						{countries.map(([code, name]) => (
							<option key={code} value={code}>
								{name}
							</option>
						))}
					</select>
					<ChevronDown
						aria-hidden
						className="wv-addr-caret pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2"
						strokeWidth={2.5}
					/>
				</div>
				<input
					name="phone"
					type="tel"
					defaultValue={d?.phone}
					placeholder="Phone (optional)"
					aria-label="Phone"
					autoComplete="tel"
					className={field}
				/>
			</div>
			{error && (
				<p role="alert" className="text-xs text-[var(--q-red)]">
					{error}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<button
					type="submit"
					disabled={pending}
					className={`${heyComic} wv-pc-cta flex h-10 items-center gap-2 rounded-[10px] bg-[var(--ac-cyan-bright)] px-6 text-xs text-[var(--ac-input)] disabled:opacity-60`}
				>
					<Check aria-hidden className="size-3.5" strokeWidth={2.75} />
					<span className="wv-pc-cta-label">{pending ? "SAVING…" : "SAVE ADDRESS"}</span>
				</button>
				<button
					type="button"
					onClick={onDone}
					className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon h-10 rounded-[10px] border border-[var(--ac-cyan)] px-6 text-xs text-[var(--ac-cyan)]`}
				>
					<span className="wv-btn-label">CANCEL</span>
				</button>
			</div>
		</form>
	);
}

/** One line of an address, led by its glowing icon in the card's colour (`.wv-addr-row`). */
function Row({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
	return (
		<p className="wv-addr-row flex items-start gap-2.5">
			<Icon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.25} />
			<span className="min-w-0 break-words">{children}</span>
		</p>
	);
}

/** An action as a small neon pill (`.wv-review-btn`, as on My Reviews): cyan, or pink to delete. */
function Action({
	Icon,
	label,
	onClick,
	disabled,
	pink = false,
}: {
	Icon: LucideIcon;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	pink?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={`wv-review-btn ${pink ? "wv-review-btn--pink" : ""} flex items-center gap-1.5 rounded-full px-3 py-1 disabled:opacity-60`}
		>
			<Icon aria-hidden className="size-3" strokeWidth={2.5} />
			{label}
		</button>
	);
}

/**
 * A saved address, in the site's neon style: a neon card led by a truck (default shipping), a card (billing only) or a
 * pin, its name lit, each line led by a glowing icon, the phone glowing, and its actions as small neon pills.
 */
export function AddressCard({ a }: { a: AddressData }) {
	const [editing, setEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();

	const run = (fn: (fd: FormData) => Promise<Result>, extra: Record<string, string> = {}) =>
		start(async () => {
			setError(null);
			const fd = new FormData();
			fd.set("id", a.id);
			for (const [k, v] of Object.entries(extra)) fd.set(k, v);
			const r = await fn(fd);
			if (!r.ok) setError(r.error);
		});

	const label =
		a.isDefaultShipping && a.isDefaultBilling
			? "DEFAULT SHIPPING & BILLING"
			: a.isDefaultShipping
				? "DEFAULT SHIPPING"
				: a.isDefaultBilling
					? "BILLING ADDRESS"
					: "SAVED ADDRESS";
	const Icon = a.isDefaultShipping ? Truck : a.isDefaultBilling ? CreditCard : MapPin;
	const line = [
		a.streetAddress1,
		a.streetAddress2,
		a.city,
		[a.countryArea, a.postalCode].filter(Boolean).join(" "),
		a.countryName,
	]
		.filter(Boolean)
		.join(", ");
	const name = [a.firstName, a.lastName].filter(Boolean).join(" ");

	return (
		<Card Icon={Icon} title={label} pink={a.isDefaultBilling && !a.isDefaultShipping}>
			{editing ? (
				<AddressForm initial={a} onDone={() => setEditing(false)} />
			) : (
				<>
					<div className={`${orbitron} wv-neon-card-text flex flex-col gap-2 text-xs uppercase`}>
						{(name || a.companyName) && (
							<Row Icon={UserRound}>
								<strong className="wv-neon-key">{name}</strong>
								{a.companyName ? ` · ${a.companyName}` : ""}
							</Row>
						)}
						<Row Icon={MapPin}>{line}</Row>
						{a.phone && (
							<Row Icon={Phone}>
								<span className="wv-neon-card-timing text-[11px]">{a.phone}</span>
							</Row>
						)}
					</div>
					{error && (
						<p role="alert" className="text-xs text-[var(--q-red)]">
							{error}
						</p>
					)}
					<div className={`${orbitron} mt-1 flex flex-wrap gap-2 text-[11px]`}>
						{!a.isDefaultShipping && (
							<Action
								Icon={Truck}
								label="MAKE DEFAULT SHIPPING"
								disabled={pending}
								onClick={() => run(setDefaultAddressAction, { type: "SHIPPING" })}
							/>
						)}
						{!a.isDefaultBilling && (
							<Action
								Icon={CreditCard}
								label="MAKE DEFAULT BILLING"
								disabled={pending}
								onClick={() => run(setDefaultAddressAction, { type: "BILLING" })}
							/>
						)}
						<Action Icon={Pencil} label="EDIT" onClick={() => setEditing(true)} />
						<Action
							Icon={Trash2}
							label="DELETE"
							pink
							disabled={pending}
							onClick={() => {
								if (window.confirm("Delete this address?")) run(deleteAddressAction);
							}}
						/>
					</div>
				</>
			)}
		</Card>
	);
}

/** Adds an address: the glossy button, opening a neon card with the form. */
export function AddAddress() {
	const [open, setOpen] = useState(false);
	return open ? (
		<Card Icon={Plus} title="NEW ADDRESS">
			<AddressForm onDone={() => setOpen(false)} />
		</Card>
	) : (
		<button
			type="button"
			onClick={() => setOpen(true)}
			className={`${heyComic} wv-pc-cta flex h-12 items-center gap-2 self-start rounded-xl bg-[var(--ac-cyan-bright)] px-8 text-base text-[var(--ac-input)]`}
		>
			<Plus aria-hidden className="size-4" strokeWidth={2.75} />
			<span className="wv-pc-cta-label">ADD ADDRESS</span>
		</button>
	);
}
