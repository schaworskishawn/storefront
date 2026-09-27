"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeCartLines, setCartLineQuantity } from "@/lib/wv-cart-actions";
import { formatPrice } from "@/ui/components/plp/utils";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

export type CartLineView = {
	id: string;
	slug: string;
	name: string;
	variantName: string | null;
	image: { url: string; alt: string } | null;
	unit: number;
	total: number;
	quantity: number;
};

type Props = {
	channel: string;
	currency: string;
	localeBcp47: string;
	lines: CartLineView[];
	subtotal: number;
	freeShippingThreshold: number | null;
	checkoutHref: string;
};

export function WvCartClient({
	channel,
	currency,
	localeBcp47,
	lines,
	subtotal,
	freeShippingThreshold,
	checkoutHref,
}: Props) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const money = (n: number) => formatPrice(n, currency, localeBcp47);
	const count = lines.reduce((n, l) => n + l.quantity, 0);

	const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
		setError(null);
		start(async () => {
			const r = await fn();
			if (!r.ok) setError(r.error ?? "Something went wrong.");
			router.refresh();
		});
	};

	const remaining = freeShippingThreshold !== null ? Math.max(0, freeShippingThreshold - subtotal) : null;
	const progress = freeShippingThreshold
		? Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100))
		: 0;
	const qbtn =
		"flex size-8 items-center justify-center rounded-lg border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] text-base font-bold text-[var(--wv-cyan-soft)] disabled:opacity-40";

	return (
		<div className="flex flex-col" aria-busy={pending}>
			<section className="flex flex-col gap-5 px-4 pb-6 pt-8 md:px-6 xl:px-20 xl:pb-8 xl:pt-10">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<h1 className={`${heyComic} text-2xl text-white xl:text-[32px]`}>
						YOUR CART{" "}
						<span className="text-[var(--wv-cyan-soft)]">
							({count} {count === 1 ? "ITEM" : "ITEMS"})
						</span>
					</h1>
					<p className="flex items-center gap-2">
						<span className={`${orbitron} text-sm text-[var(--q-text-dim)]`}>Estimated Subtotal:</span>
						<span className={`${orbitron} text-xl font-bold text-white xl:text-[22px]`}>
							{money(subtotal)}
						</span>
					</p>
				</div>
				{remaining !== null && (
					<div className="flex flex-col gap-3 rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-deep)] p-4">
						<div className={`${orbitron} flex items-center justify-between gap-3 text-[13px]`}>
							{remaining > 0 ? (
								<p>
									You&apos;re only <b className="text-[var(--wv-cyan-soft)]">{money(remaining)}</b> away from{" "}
									<b className="text-[var(--wv-pink)]">FREE SHIPPING!</b>
								</p>
							) : (
								<p className="font-bold text-[var(--wv-pink)]">You&apos;ve unlocked FREE SHIPPING!</p>
							)}
							<span className="hidden text-[11px] text-[var(--q-text-dim)] md:block">
								{progress}% ACHIEVED
							</span>
						</div>
						<div
							className="h-2 overflow-hidden rounded bg-[var(--wv-control)]"
							role="progressbar"
							aria-valuenow={progress}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label="Free shipping progress"
						>
							<div
								className="h-full bg-[var(--wv-cyan-soft)] transition-[width]"
								style={{ width: `${progress}%` }}
							/>
						</div>
					</div>
				)}
			</section>

			<div className="flex flex-col gap-8 px-4 pb-12 md:px-6 xl:flex-row xl:items-start xl:gap-10 xl:px-20 xl:pb-20">
				<div className="flex min-w-0 flex-1 flex-col gap-4 xl:gap-6">
					<div
						className={`${bungee} hidden justify-between px-4 text-[11px] text-[var(--q-text-dim)] xl:flex`}
					>
						<span className="w-[280px]">PRODUCT</span>
						<span className="flex flex-1 items-center justify-end gap-10">
							<span className="w-20 text-right">PRICE</span>
							<span className="w-[120px] text-center">QUANTITY</span>
							<span className="w-[100px] text-right">TOTAL</span>
						</span>
					</div>

					<ul className="flex flex-col gap-3 xl:gap-4">
						{lines.map((l) => (
							<li
								key={l.id}
								className="flex flex-col gap-4 rounded-[14px] border border-[var(--wv-purple)] bg-[var(--wv-deep)] p-4 xl:flex-row xl:items-center xl:gap-5"
							>
								<div className="flex min-w-0 flex-1 items-center gap-4">
									<Link
										href={`/product/${l.slug}`}
										className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-[var(--wv-control)]"
									>
										{l.image && (
											<Image
												src={l.image.url}
												alt={l.image.alt}
												fill
												sizes="64px"
												className="object-contain p-1"
											/>
										)}
									</Link>
									<div className="flex min-w-0 flex-col gap-1">
										<Link href={`/product/${l.slug}`} className={`${heyComic} text-[15px] text-white`}>
											{l.name}
										</Link>
										{l.variantName && (
											<p className={`${bungee} truncate text-xs uppercase text-[var(--q-text-dim)]`}>
												{l.variantName}
											</p>
										)}
										<button
											type="button"
											disabled={pending}
											onClick={() => run(() => removeCartLines(channel, [l.id]))}
											className={`${orbitron} w-fit text-[11px] text-[var(--wv-cyan-soft)] hover:underline disabled:opacity-50`}
										>
											REMOVE
										</button>
									</div>
								</div>
								<div className="flex items-center justify-between gap-4 xl:justify-end xl:gap-10">
									<p className={`${bungee} text-sm text-white xl:w-20 xl:text-right`}>
										<span className="mr-2 text-[10px] text-[var(--q-text-dim)] xl:hidden">EACH</span>
										{money(l.unit)}
									</p>
									<div className="flex items-center gap-2 xl:w-[120px] xl:justify-center">
										<button
											type="button"
											aria-label={`Decrease quantity of ${l.name}`}
											disabled={pending}
											onClick={() => run(() => setCartLineQuantity(channel, l.id, l.quantity - 1))}
											className={qbtn}
										>
											−
										</button>
										<span aria-live="polite" className="w-7 text-center text-sm font-medium">
											{l.quantity}
										</span>
										<button
											type="button"
											aria-label={`Increase quantity of ${l.name}`}
											disabled={pending || l.quantity >= 99}
											onClick={() => run(() => setCartLineQuantity(channel, l.id, l.quantity + 1))}
											className={qbtn}
										>
											+
										</button>
									</div>
									<p className={`${bungee} text-sm text-[var(--wv-cyan-soft)] xl:w-[100px] xl:text-right`}>
										{money(l.total)}
									</p>
								</div>
							</li>
						))}
					</ul>

					{error && (
						<p
							role="alert"
							className="rounded-lg border border-[var(--q-red)] px-3 py-2 text-sm text-[var(--q-red)]"
						>
							{error}
						</p>
					)}

					<div className="flex items-center justify-between gap-4 pt-1 xl:pt-3">
						<Link
							href="/shop"
							className={`${heyComic} rounded-lg border border-[var(--wv-cyan-soft)] px-4 py-[10px] text-[13px] text-[var(--wv-cyan-soft)] xl:hidden`}
						>
							CONTINUE SHOPPING
						</Link>
						<button
							type="button"
							disabled={pending}
							onClick={() =>
								run(() =>
									removeCartLines(
										channel,
										lines.map((l) => l.id),
									),
								)
							}
							className={`${orbitron} text-xs font-bold tracking-[1px] text-[var(--wv-pink)] disabled:opacity-50`}
						>
							CLEAR CART
						</button>
					</div>

					<TrustRow />
				</div>

				<aside
					className="flex flex-col gap-6 rounded-2xl border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-deep)] p-6 shadow-[0_4px_8px_rgba(105,235,255,0.13)] xl:sticky xl:top-6 xl:w-[420px] xl:shrink-0"
					aria-label="Order summary"
				>
					<h2 className={`${heyComic} text-xl`}>ORDER SUMMARY</h2>
					<hr className="border-[var(--q-border-strong)]" />
					<dl className={`${orbitron} flex flex-col gap-3 text-[13px]`}>
						<div className="flex justify-between">
							<dt className="text-[var(--q-text-dim)]">
								Subtotal ({count} {count === 1 ? "item" : "items"})
							</dt>
							<dd>{money(subtotal)}</dd>
						</div>
						<div className="flex justify-between">
							<dt className="text-[var(--q-text-dim)]">Shipping &amp; taxes</dt>
							<dd className="text-[var(--q-text-dim)]">Calculated at checkout</dd>
						</div>
					</dl>
					<hr className="border-[var(--wv-cyan-soft)]/30" />
					<p className="flex items-center justify-between">
						<span className={`${heyComic} text-lg`}>TOTAL</span>
						<span className={`${bungee} text-2xl text-[var(--wv-cyan-soft)]`}>{money(subtotal)}</span>
					</p>
					<a
						href={checkoutHref}
						className="flex min-h-12 items-center justify-center rounded-md bg-[var(--wv-cyan-soft)] px-6 font-[family-name:var(--font-inter)] text-[13px] font-bold tracking-[1.5px] text-[var(--wv-ink)]"
					>
						CHECKOUT
					</a>
					<Link
						href="/shop"
						className={`${orbitron} hidden text-center text-[11px] text-[var(--q-text-dim)] underline xl:block`}
					>
						Continue shopping
					</Link>
				</aside>
			</div>
		</div>
	);
}

export function TrustRow() {
	const items = [
		{ icon: "🔒", title: "SECURE CHECKOUT", text: "100% SSL Secure Encryption" },
		{ icon: "✈️", title: "GLOBAL SHIPPING", text: "Fast, fully trackable delivery" },
		{ icon: "🔄", title: "EASY RETURNS", text: "30-Day satisfaction guarantee" },
	];
	return (
		<ul className="grid grid-cols-1 gap-3 pt-4 md:grid-cols-3 xl:gap-4 xl:pt-6">
			{items.map((t) => (
				<li
					key={t.title}
					className="flex items-center gap-3 rounded-xl border border-[var(--q-border-strong)] bg-[var(--wv-deep)] p-4"
				>
					<span aria-hidden className="text-xl">
						{t.icon}
					</span>
					<span className="flex flex-col gap-[2px]">
						<span className={`${heyComic} text-xs`}>{t.title}</span>
						<span className={`${orbitron} text-[10px] text-[var(--q-text-dim)]`}>{t.text}</span>
					</span>
				</li>
			))}
		</ul>
	);
}
