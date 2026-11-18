/**
 * "Worldwide Vapor Affiliates" — a small Saleor app that lives inside this storefront (Next.js route handlers under
 * /api/affiliate-app/*). It credits paid orders to the affiliate who referred them and takes the credit back when an order
 * is cancelled or refunded. It is separate from the payments and rewards apps on purpose: it needs to read customers and
 * write their metadata, which neither of them should be able to do, and any of the three can be removed alone.
 *
 * Install it once in the Saleor Dashboard: Apps → Install external app → https://<your-domain>/api/affiliate-app/manifest.
 */
export const AFFILIATE_APP_ID = "worldwide-vapor.affiliates";
const AFFILIATE_APP_NAME = "Worldwide Vapor Affiliates";
const AFFILIATE_APP_VERSION = "1.0.0";

/** Read orders, mark them and leave notes; read customers and keep each affiliate's record on their account. */
export const AFFILIATE_APP_PERMISSIONS = ["MANAGE_ORDERS", "MANAGE_USERS"] as const;

type AffiliateWebhookDefinition = {
	/** URL segment under /api/affiliate-app/webhooks/ — the route dispatches on it. */
	slug: "order-fully-paid" | "order-cancelled" | "order-fully-refunded";
	name: string;
	asyncEvents: string[];
	/** Selects only the order's id: the app re-reads the order itself, so the payload is never trusted. */
	query: string;
};

const orderIdQuery = (type: string) => `subscription {
	event {
		... on ${type} {
			order { id }
		}
	}
}`;

export const AFFILIATE_WEBHOOK_DEFINITIONS: readonly AffiliateWebhookDefinition[] = [
	{
		slug: "order-fully-paid",
		name: "Order fully paid (credit the referring affiliate)",
		asyncEvents: ["ORDER_FULLY_PAID"],
		query: orderIdQuery("OrderFullyPaid"),
	},
	{
		slug: "order-cancelled",
		name: "Order cancelled (take back the affiliate's commission)",
		asyncEvents: ["ORDER_CANCELLED"],
		query: orderIdQuery("OrderCancelled"),
	},
	{
		slug: "order-fully-refunded",
		name: "Order fully refunded (take back the affiliate's commission)",
		asyncEvents: ["ORDER_FULLY_REFUNDED"],
		query: orderIdQuery("OrderFullyRefunded"),
	},
];

export function buildAffiliateAppManifest(origin: string) {
	const base = origin.replace(/\/+$/, "");
	return {
		id: AFFILIATE_APP_ID,
		version: AFFILIATE_APP_VERSION,
		name: AFFILIATE_APP_NAME,
		about:
			"Credits paid orders to the affiliate who referred them (by referral link or linked discount code), and takes the commission back when an order is cancelled or refunded.",
		permissions: [...AFFILIATE_APP_PERMISSIONS],
		appUrl: `${base}/affiliate-admin`,
		tokenTargetUrl: `${base}/api/affiliate-app/register`,
		author: "Worldwide Vapor",
		webhooks: AFFILIATE_WEBHOOK_DEFINITIONS.map((definition) => ({
			name: definition.name,
			asyncEvents: definition.asyncEvents,
			query: definition.query,
			targetUrl: `${base}/api/affiliate-app/webhooks/${definition.slug}`,
			isActive: true,
		})),
	};
}
