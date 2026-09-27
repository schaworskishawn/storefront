"use client";

import { useState, useTransition, type FormEvent } from "react";
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

const field = `${orbitron} w-full min-w-0 rounded-lg border border-[var(--ac-subtle)] bg-[var(--ac-input)] px-3 py-2.5 text-xs text-white placeholder:text-[var(--ac-muted)]/60 focus:border-[var(--ac-cyan)] focus:outline-none`;
const card =
	"flex flex-col gap-3 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-4 md:p-5";

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
				<select
					name="country"
					required
					defaultValue={d?.countryCode ?? "CA"}
					aria-label="Country"
					className={field}
				>
					{countries.map(([code, name]) => (
						<option key={code} value={code}>
							{name}
						</option>
					))}
				</select>
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
			<div className="flex gap-2">
				<button
					type="submit"
					disabled={pending}
					className={`${heyComic} h-10 rounded-[10px] bg-[var(--ac-cyan-bright)] px-6 text-xs text-[var(--ac-input)] disabled:opacity-60`}
				>
					{pending ? "SAVING…" : "SAVE ADDRESS"}
				</button>
				<button
					type="button"
					onClick={onDone}
					className={`${heyComic} h-10 rounded-[10px] border border-[var(--ac-cyan)] px-6 text-xs text-[var(--ac-cyan)]`}
				>
					CANCEL
				</button>
			</div>
		</form>
	);
}

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
	const line = [
		a.streetAddress1,
		a.streetAddress2,
		a.city,
		[a.countryArea, a.postalCode].filter(Boolean).join(" "),
		a.countryName,
	]
		.filter(Boolean)
		.join(", ");
	const link = `${orbitron} text-[11px] text-[var(--ac-pink)] disabled:opacity-60`;
	const dot = (
		<span aria-hidden className="text-[var(--ac-pink)]">
			·
		</span>
	);

	return (
		<article className={card}>
			<h2 className={`${bungee} text-base uppercase text-white md:text-[19px]`}>{label}</h2>
			{editing ? (
				<AddressForm initial={a} onDone={() => setEditing(false)} />
			) : (
				<>
					<p className={`${orbitron} text-xs uppercase text-[var(--ac-muted)]`}>
						{[a.firstName, a.lastName].filter(Boolean).join(" ")}
						{a.companyName ? ` · ${a.companyName}` : ""}
					</p>
					<p className={`${orbitron} text-xs uppercase text-[var(--ac-muted)]`}>{line}</p>
					{a.phone && <p className={`${orbitron} text-[11px] text-[var(--ac-cyan)]`}>{a.phone}</p>}
					{error && (
						<p role="alert" className="text-xs text-[var(--q-red)]">
							{error}
						</p>
					)}
					<div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
						{!a.isDefaultShipping && (
							<>
								<button
									type="button"
									disabled={pending}
									onClick={() => run(setDefaultAddressAction, { type: "SHIPPING" })}
									className={link}
								>
									MAKE DEFAULT SHIPPING
								</button>
								{dot}
							</>
						)}
						{!a.isDefaultBilling && (
							<>
								<button
									type="button"
									disabled={pending}
									onClick={() => run(setDefaultAddressAction, { type: "BILLING" })}
									className={link}
								>
									MAKE DEFAULT BILLING
								</button>
								{dot}
							</>
						)}
						<button type="button" onClick={() => setEditing(true)} className={link}>
							EDIT
						</button>
						{dot}
						<button
							type="button"
							disabled={pending}
							onClick={() => {
								if (window.confirm("Delete this address?")) run(deleteAddressAction);
							}}
							className={link}
						>
							DELETE
						</button>
					</div>
				</>
			)}
		</article>
	);
}

export function AddAddress() {
	const [open, setOpen] = useState(false);
	return open ? (
		<article className={card}>
			<h2 className={`${bungee} text-base text-white md:text-[19px]`}>NEW ADDRESS</h2>
			<AddressForm onDone={() => setOpen(false)} />
		</article>
	) : (
		<button
			type="button"
			onClick={() => setOpen(true)}
			className={`${heyComic} h-12 self-start rounded-xl bg-[var(--ac-cyan-bright)] px-8 text-base text-[var(--ac-input)]`}
		>
			ADD ADDRESS
		</button>
	);
}
