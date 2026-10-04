"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addVariantToCart } from "@/lib/wv-cart-actions";
import { WishlistHeart } from "./wv-wishlist-client";
import { formatPrice } from "@/ui/components/plp/utils";

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const chip = (on: boolean) =>
	`${heyComic} rounded-full border px-3 py-[5px] text-[11px] transition-colors ${
		on
			? "border-[var(--wv-cyan-soft)] bg-[var(--wv-cyan-soft)] text-[var(--wv-bg)]"
			: "border-[var(--wv-control)] bg-[var(--wv-bg)] text-white hover:border-[var(--wv-cyan-soft)]"
	}`;

const labelClass = `${orbitron} text-[11px] font-bold tracking-[1px] text-[var(--wv-disabled)]`;

export type ProductImage = { url: string; alt: string };

/** Gallery: main image with prev/next controls and thumbnails (single image → controls are disabled). */
export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
	const [i, setI] = useState(0);
	const many = images.length > 1;
	const cur = images[i];
	const step = (d: number) => setI((v) => (v + d + images.length) % images.length);
	const arrow =
		"absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] text-[var(--wv-cyan-soft)] disabled:opacity-40 md:size-11";
	return (
		<div className="flex flex-col gap-3">
			<div className="relative h-[284px] w-full overflow-hidden rounded-2xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] md:h-[520px] xl:h-[650px]">
				{cur ? (
					<div className="absolute inset-6 md:inset-14">
						<Image
							src={cur.url}
							alt={cur.alt || name}
							fill
							sizes="(min-width: 1280px) 500px, 80vw"
							className="object-contain"
							priority
						/>
					</div>
				) : (
					<div className="absolute left-1/2 top-1/2 flex h-[65%] w-[62%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--wv-cyan-soft)] bg-[var(--wv-ink)]">
						<span className={`${bungee} text-lg text-[var(--wv-cyan-soft)]`}>PRODUCT</span>
					</div>
				)}
				<button
					type="button"
					aria-label="Previous image"
					disabled={!many}
					onClick={() => step(-1)}
					className={`${arrow} left-3 md:left-[15px]`}
				>
					‹
				</button>
				<button
					type="button"
					aria-label="Next image"
					disabled={!many}
					onClick={() => step(1)}
					className={`${arrow} right-3 md:right-[15px]`}
				>
					›
				</button>
			</div>
			{many && (
				<div className="flex gap-2 overflow-x-auto">
					{images.map((im, n) => (
						<button
							key={im.url}
							type="button"
							aria-label={`Show image ${n + 1}`}
							aria-current={n === i}
							onClick={() => setI(n)}
							className={`relative size-14 shrink-0 overflow-hidden rounded-lg border ${n === i ? "border-[var(--wv-cyan-soft)]" : "border-[var(--wv-control)]"}`}
						>
							<Image src={im.url} alt="" fill sizes="56px" className="object-cover" />
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export type PurchaseVariant = {
	id: string;
	name: string;
	price: number;
	undiscountedPrice: number | null;
	currency: string;
	inStock: boolean;
	options: { attribute: string; label: string; value: string }[];
};

type OptionGroup = { attribute: string; label: string; values: string[] };

const optionOf = (v: PurchaseVariant, attribute: string) =>
	v.options.find((o) => o.attribute === attribute)?.value;

function optionGroups(variants: PurchaseVariant[]): OptionGroup[] {
	const groups: OptionGroup[] = [];
	for (const v of variants) {
		for (const o of v.options) {
			let g = groups.find((x) => x.attribute === o.attribute);
			if (!g) {
				g = { attribute: o.attribute, label: o.label, values: [] };
				groups.push(g);
			}
			if (!g.values.includes(o.value)) g.values.push(o.value);
		}
	}
	return groups;
}

/** Price, variant selection, quantity and purchase actions. */
export function ProductPurchase({
	variants,
	optionLabel,
	localeBcp47,
	channel,
	locale,
	name,
	slug,
}: {
	variants: PurchaseVariant[];
	optionLabel: string;
	localeBcp47: string;
	channel: string;
	locale: string;
	name: string;
	slug: string;
}) {
	const [sel, setSel] = useState(
		Math.max(
			0,
			variants.findIndex((v) => v.inStock),
		),
	);
	const [qty, setQty] = useState(1);
	const [pending, start] = useTransition();
	const [status, setStatus] = useState<{ kind: "added" | "error"; text: string } | null>(null);
	const v = variants[sel];

	// One group per selection attribute, but only when every variant carries every attribute;
	// otherwise fall back to a single row of chips named after each variant.
	const groups = optionGroups(variants);
	const grouped =
		groups.length > 0 && variants.every((x) => groups.every((g) => optionOf(x, g.attribute) !== undefined));

	// Prefer the variant that keeps the other groups' current choices, then one that is in stock.
	const pick = (attribute: string, value: string) => {
		const rank = (x: PurchaseVariant) =>
			groups.filter((g) => g.attribute !== attribute && optionOf(x, g.attribute) === optionOf(v, g.attribute))
				.length *
				2 +
			(x.inStock ? 1 : 0);
		const best = variants
			.filter((x) => optionOf(x, attribute) === value)
			.reduce((a, b) => (rank(b) > rank(a) ? b : a));
		setSel(variants.indexOf(best));
	};

	const submit = (buyNow: boolean) => {
		setStatus(null);
		start(async () => {
			const r = await addVariantToCart(channel, locale, v.id, qty);
			if (!r.ok) return setStatus({ kind: "error", text: r.error });
			if (buyNow) {
				window.location.href = r.checkoutUrl;
				return;
			}
			setStatus({ kind: "added", text: `Added ${qty} × ${name} to your cart.` });
		});
	};
	const money = (n: number) => formatPrice(n, v.currency, localeBcp47);
	const percent = v.undiscountedPrice ? Math.round((1 - v.price / v.undiscountedPrice) * 100) : 0;
	const btn =
		"font-[family-name:var(--font-inter)] flex min-h-12 items-center justify-center rounded-md px-6 text-[13px] font-bold tracking-[1.5px] md:min-h-14 xl:h-[100px]";
	const qbtn =
		"flex size-[30px] items-center justify-center rounded-lg border border-[var(--wv-cyan-soft)] bg-[var(--wv-bg)] text-base font-bold text-[var(--wv-cyan-soft)] disabled:opacity-40";
	return (
		<>
			<p className={`${heyComic} flex flex-wrap items-center gap-x-4 gap-y-1`} aria-live="polite">
				<span className="text-[28px] text-[var(--wv-cyan-soft)]">{money(v.price)}</span>
				{v.undiscountedPrice !== null && (
					<span className="text-xl text-[var(--wv-disabled)] line-through">{money(v.undiscountedPrice)}</span>
				)}
				{percent > 0 && (
					<span className="bg-[var(--wv-pink)]/15 rounded border border-[var(--wv-pink)] px-2 py-1 text-[11px] text-[var(--wv-pink)]">
						SAVE {percent}%
					</span>
				)}
			</p>
			<hr className="border-[var(--wv-ink)]" />
			{variants.length === 1 && groups.length > 0 && (
				<div className="flex flex-col gap-3">
					{groups.map((g) => (
						<div key={g.attribute} className="flex flex-col gap-2">
							<p className={labelClass}>{g.label.toUpperCase()}</p>
							<div className="flex flex-wrap gap-[6px]">
								{g.values.map((value) => (
									<span key={value} className={chip(true)}>
										{value}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			)}
			{variants.length > 1 && grouped && (
				<div className="flex flex-col gap-3">
					{groups.map((g) => (
						<div key={g.attribute} className="flex flex-col gap-2">
							<p className={labelClass}>{g.label.toUpperCase()}</p>
							<div role="radiogroup" aria-label={g.label} className="flex flex-wrap gap-[6px]">
								{g.values.map((value) => {
									const on = optionOf(v, g.attribute) === value;
									return (
										<button
											key={value}
											type="button"
											role="radio"
											aria-checked={on}
											disabled={!variants.some((x) => x.inStock && optionOf(x, g.attribute) === value)}
											onClick={() => pick(g.attribute, value)}
											className={`${chip(on)} disabled:cursor-not-allowed disabled:line-through disabled:opacity-40`}
										>
											{value}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}
			{variants.length > 1 && !grouped && (
				<div className="flex flex-col gap-2">
					<p className={labelClass}>SELECT {optionLabel}</p>
					<div role="radiogroup" aria-label={optionLabel} className="flex flex-wrap gap-[6px]">
						{variants.map((o, n) => (
							<button
								key={o.id}
								type="button"
								role="radio"
								aria-checked={n === sel}
								disabled={!o.inStock}
								onClick={() => setSel(n)}
								className={`${chip(n === sel)} disabled:cursor-not-allowed disabled:line-through disabled:opacity-40`}
							>
								{o.name}
							</button>
						))}
					</div>
				</div>
			)}
			<div className="flex flex-col gap-[6px]">
				<p className={labelClass}>QUANTITY</p>
				<div className="flex h-[46px] w-[122px] items-center gap-2 p-2">
					<button
						type="button"
						aria-label="Decrease quantity"
						disabled={qty <= 1}
						onClick={() => setQty((q) => q - 1)}
						className={qbtn}
					>
						−
					</button>
					<span aria-live="polite" className="w-[30px] text-center text-sm font-medium">
						{qty}
					</span>
					<button
						type="button"
						aria-label="Increase quantity"
						disabled={qty >= 99}
						onClick={() => setQty((q) => q + 1)}
						className={qbtn}
					>
						+
					</button>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<WishlistHeart slug={slug} className="size-10 text-lg" />
				<span className={`${orbitron} text-xs text-[var(--q-text-dim)]`}>Save to wishlist</span>
			</div>
			<div className="flex flex-col gap-2">
				{v.inStock ? (
					<>
						<button
							type="button"
							disabled={pending}
							onClick={() => submit(false)}
							className={`${btn} border-[1.5px] border-[var(--wv-cyan-soft)] bg-[var(--wv-ink)] text-[var(--wv-cyan-soft)] disabled:opacity-60`}
						>
							{pending ? "WORKING…" : "ADD TO CART"}
						</button>
						<button
							type="button"
							disabled={pending}
							onClick={() => submit(true)}
							className={`${btn} bg-[var(--wv-cyan-soft)] text-[var(--wv-ink)] disabled:opacity-60`}
						>
							BUY IT NOW
						</button>
						<div role="status" aria-live="polite" className="text-sm">
							{status?.kind === "added" && (
								<p className="text-[var(--wv-cyan-soft)]">
									{status.text}{" "}
									<Link href="/cart" className="font-bold underline">
										View cart
									</Link>
								</p>
							)}
							{status?.kind === "error" && <p className="text-[var(--q-red)]">{status.text}</p>}
						</div>
					</>
				) : (
					<span
						role="status"
						className={`${btn} border border-[var(--wv-control)] text-[var(--wv-disabled)]`}
					>
						OUT OF STOCK
					</span>
				)}
			</div>
		</>
	);
}
