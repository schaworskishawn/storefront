/**
 * The distributor program's tiers: the one place their discounts and minimum orders live. The distributor page's tier
 * cards, the account page, the admin page, the product prices distributors see and the prices their checkouts are charged
 * all read these, so nothing can promise one thing and charge another.
 *
 * - **Discount:** off the product's list price, on every product.
 * - **Minimum:** the cart's list-price subtotal, in the checkout's own currency (USD or CAD at face value). Below it the
 *   cart is charged retail; from it on, wholesale.
 */

export type DistributorTierId = "small" | "partner" | "authorized" | "regional" | "master";

export type DistributorTier = {
	id: DistributorTierId;
	name: string;
	/** Basis points off list price (500 = 5%). */
	discountBps: number;
	/** The cart's list-price subtotal needed for wholesale prices, in cents. */
	minimumCents: number;
};

/** Lowest to highest. */
export const DISTRIBUTOR_TIERS: readonly DistributorTier[] = [
	{ id: "small", name: "Small Wholesale", discountBps: 500, minimumCents: 25_000 },
	{ id: "partner", name: "Wholesale Partner", discountBps: 1_000, minimumCents: 50_000 },
	{ id: "authorized", name: "Authorized Distributor", discountBps: 1_500, minimumCents: 100_000 },
	{ id: "regional", name: "Regional Distributor", discountBps: 2_000, minimumCents: 250_000 },
	{ id: "master", name: "Master Distributor", discountBps: 2_500, minimumCents: 1_000_000 },
];

export const isDistributorTierId = (v: unknown): v is DistributorTierId =>
	DISTRIBUTOR_TIERS.some((t) => t.id === v);

export const tierById = (id: DistributorTierId): DistributorTier =>
	DISTRIBUTOR_TIERS.find((t) => t.id === id) ?? DISTRIBUTOR_TIERS[0]!;

/** "15%". */
export const discountLabel = (tier: Pick<DistributorTier, "discountBps">): string =>
	`${tier.discountBps / 100}%`;

/** "$1,000". */
export const minimumLabel = (tier: Pick<DistributorTier, "minimumCents">): string =>
	`$${(tier.minimumCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** A unit price at the tier's discount, rounded to the cent: 1499 at 15% is 1274. */
export const wholesaleCents = (listCents: number, tier: Pick<DistributorTier, "discountBps">): number =>
	Math.round((listCents * (10_000 - tier.discountBps)) / 10_000);
