import type { CommissionLine } from "./ledger";
import { CAMPAIGN_PARAM, REFERRAL_PARAM, normalizeCampaign } from "./referral";

/**
 * The affiliate dashboard's referral tools, as pure functions (tested in link-tools.test.ts):
 *
 * - **Reflink creator:** where a link should land: a quick pick, a product, or any page of the shop pasted in, checked to
 *   be a page of this shop that a visitor can open.
 * - **Campaign tags:** suggestions, and the report of what each tag sold, from the credited orders.
 *
 * The QR codes are drawn by qr.ts. Kept free of server-only imports: the link builder runs in the browser.
 */

export const QUICK_DESTINATIONS = [
	{ id: "home", label: "Home page", path: "/home" },
	{ id: "shop", label: "The whole shop", path: "/shop" },
	{ id: "disposables", label: "Disposables", path: "/shop?category=disposables" },
	{ id: "ejuice", label: "E-juice", path: "/shop?category=ejuice" },
	{ id: "hardware", label: "Hardware", path: "/shop?category=hardware" },
	{ id: "bundles", label: "Bundles", path: "/shop?category=bundles" },
	{ id: "rewards", label: "Vapor Tokens rewards", path: "/rewards" },
] as const;

/** Tags most affiliates want, offered as one-tap chips alongside the ones they've used before. */
export const CAMPAIGN_PRESETS = ["instagram", "tiktok", "youtube", "bio", "story", "email"] as const;

/** Pages a referral link can't usefully land on: the API, the checkout and pages that need someone's own sign-in. */
const BLOCKED = [
	/^\/api(\/|$)/,
	/^\/_next(\/|$)/,
	/^\/checkout(\/|$)/,
	/^\/account(\/|$)/,
	/^\/affiliate-admin(\/|$)/,
	/^\/(login|logout|register|forgot-password|reset-password|verify-email)(\/|$)/,
];

/**
 * A pasted link or path as a page of this shop: "https://www.worldwidevapor.com/product/x?flavour=mint#reviews",
 * "worldwidevapor.com/shop" and "/product/x" all work. Links to other sites, and pages a visitor can't land on, are
 * refused. Any `aff` and `sub` already in it are dropped (the builder adds the affiliate's own).
 */
export function destinationFromInput(
	input: string,
	storeOrigin: string,
): { ok: true; path: string } | { ok: false; message: string } {
	const raw = input.trim();
	if (!raw) return { ok: false, message: "Paste a link to a page of the shop." };
	const store = new URL(storeOrigin);
	const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

	let url: URL;
	try {
		url = raw.startsWith("/")
			? new URL(raw, store)
			: new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
	} catch {
		return { ok: false, message: "That doesn't look like a link. Copy it from your browser's address bar." };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:")
		return { ok: false, message: "That doesn't look like a link. Copy it from your browser's address bar." };
	if (bare(url.hostname) !== bare(store.hostname))
		return { ok: false, message: `Links can only go to pages of ${bare(store.hostname)}.` };
	if (BLOCKED.some((re) => re.test(url.pathname)))
		return {
			ok: false,
			message: "That page needs a sign-in or is part of checkout. Pick a page shoppers can browse.",
		};

	url.searchParams.delete(REFERRAL_PARAM);
	url.searchParams.delete(CAMPAIGN_PARAM);
	const query = url.searchParams.toString();
	return { ok: true, path: `${url.pathname === "/" ? "/home" : url.pathname}${query ? `?${query}` : ""}` };
}

/** The tags an affiliate has used on credited orders, most recent first, then the presets they haven't. */
export function campaignSuggestions(lines: readonly CommissionLine[]): string[] {
	const used = [...lines]
		.sort((a, b) => b.paidAt.localeCompare(a.paidAt))
		.map((l) => l.campaign)
		.filter((c): c is string => !!c);
	return [...new Set([...used, ...CAMPAIGN_PRESETS])].slice(0, 10);
}

export type CampaignRow = {
	/** The tag, or "link" (untagged link) or "voucher" (a linked discount code). */
	key: string;
	label: string;
	orders: number;
	/** Per currency. */
	salesCents: Record<string, number>;
	commissionCents: Record<string, number>;
};

/** What each campaign sold, from the credited orders (reversed ones left out), busiest first. */
export function campaignReport(lines: readonly CommissionLine[]): CampaignRow[] {
	const rows = new Map<string, CampaignRow>();
	for (const line of lines) {
		if (line.status === "reversed") continue;
		const tag = normalizeCampaign(line.campaign);
		const key = line.via === "voucher" ? "voucher" : (tag ?? "link");
		const label = key === "voucher" ? "Discount code" : key === "link" ? "Untagged link" : key;
		const row = rows.get(key) ?? { key, label, orders: 0, salesCents: {}, commissionCents: {} };
		row.orders += 1;
		row.salesCents[line.currency] = (row.salesCents[line.currency] ?? 0) + line.baseCents;
		row.commissionCents[line.currency] = (row.commissionCents[line.currency] ?? 0) + line.commissionCents;
		rows.set(key, row);
	}
	const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
	return [...rows.values()].sort(
		(a, b) =>
			b.orders - a.orders ||
			total(b.commissionCents) - total(a.commissionCents) ||
			a.key.localeCompare(b.key),
	);
}
