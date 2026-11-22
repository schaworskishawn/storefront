"use client";

import { BadgePercent } from "lucide-react";
import { useEffect, useState } from "react";
import { formatPrice } from "@/ui/components/plp/utils";

/**
 * The wholesale price an approved distributor pays, shown beside the retail price on product cards and pages. The tier
 * is asked for once per page (and again after a minute) from /api/distributor/me, so the catalogue pages stay cached
 * for everyone; shoppers who aren't distributors see nothing extra. What checkout actually charges is worked out on the
 * server (lib/distributors/sync.ts): this is the same arithmetic, for display.
 */

export type DistributorTierView = { id: string; name: string; discountBps: number; minimumCents: number };

let cached: { at: number; tier: Promise<DistributorTierView | null> } | null = null;

function loadTier(): Promise<DistributorTierView | null> {
	if (!cached || Date.now() - cached.at > 60_000) {
		cached = {
			at: Date.now(),
			tier: fetch("/api/distributor/me", { credentials: "same-origin", cache: "no-store" })
				.then((r) => (r.ok ? (r.json() as Promise<{ tier?: DistributorTierView | null }>) : null))
				.then((d) => d?.tier ?? null)
				.catch(() => null),
		};
	}
	return cached.tier;
}

export function useDistributorTier(): DistributorTierView | null {
	const [tier, setTier] = useState<DistributorTierView | null>(null);
	useEffect(() => {
		let live = true;
		void loadTier().then((t) => {
			if (live) setTier(t);
		});
		return () => {
			live = false;
		};
	}, []);
	return tier;
}

/** A price at the tier's discount, to the cent (the same rounding as the checkout's). */
const atTier = (price: number, tier: DistributorTierView) =>
	Math.round((Math.round(price * 100) * (10_000 - tier.discountBps)) / 10_000) / 100;

const orbitron = "font-[family-name:var(--font-orbitron)]";

export function WholesalePrice({
	price,
	priceStop = null,
	currency,
	localeBcp47,
	variant = "card",
}: {
	price: number;
	priceStop?: number | null;
	currency: string;
	localeBcp47?: string;
	/** "card": one short line under a card's price; "page": the product page's fuller note. */
	variant?: "card" | "page";
}) {
	const tier = useDistributorTier();
	if (!tier) return null;
	const money = (n: number) => formatPrice(n, currency, localeBcp47);
	const amount = `${money(atTier(price, tier))}${priceStop !== null ? ` – ${money(atTier(priceStop, tier))}` : ""}`;
	// Whole dollars ("CA$1,000"): the minimums are round numbers.
	const minimum = money(tier.minimumCents / 100).replace(/[.,]00(?!\d)/, "");

	if (variant === "card")
		return (
			<span className={`${orbitron} wv-wholesale flex items-center gap-1 text-[11px] tracking-[0.5px]`}>
				<BadgePercent aria-hidden className="size-3 shrink-0" strokeWidth={2.5} />
				WHOLESALE {amount}
			</span>
		);

	return (
		<div className={`${orbitron} wv-wholesale-note flex items-start gap-3 rounded-xl px-4 py-3 text-[13px]`}>
			<BadgePercent aria-hidden className="wv-wholesale mt-0.5 size-5 shrink-0" strokeWidth={2.25} />
			<p className="leading-[1.6]">
				Your wholesale price: <strong className="wv-wholesale text-base">{amount}</strong>
				<br />
				<span className="text-[var(--wv-text-dim)]">
					{tier.name}, {tier.discountBps / 100}% off list, on orders of {minimum}+ at list price.
				</span>
			</p>
		</div>
	);
}
