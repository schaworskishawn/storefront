/**
 * "Worldwide Vapor Rewards" — a small Saleor app that lives inside this storefront (Next.js route handlers under
 * /api/rewards-app/*). It awards Vapor Tokens when an order is paid in full and takes them back or returns them when an order
 * is cancelled or refunded. It is separate from the payments app on purpose: it needs to create and adjust gift cards, which
 * the payments app should never be able to do, and either can be installed or removed without the other.
 *
 * Install it once in the Saleor Dashboard: Apps → Install external app → https://<your-domain>/api/rewards-app/manifest.
 */
export const REWARDS_APP_ID = "worldwide-vapor.rewards";
const REWARDS_APP_NAME = "Worldwide Vapor Rewards";
const REWARDS_APP_VERSION = "1.0.0";

/** What the app is granted: read orders and leave notes, and create, adjust and deactivate the gift cards that hold tokens. */
export const REWARDS_APP_PERMISSIONS = ["MANAGE_ORDERS", "MANAGE_GIFT_CARD"] as const;

type RewardsWebhookDefinition = {
	/** URL segment under /api/rewards-app/webhooks/ — the route dispatches on it. */
	slug: "order-fully-paid" | "order-cancelled" | "order-fully-refunded";
	name: string;
	asyncEvents: string[];
	/** Selects only the order's id: the app re-reads the order itself, so the payload is never trusted for amounts. */
	query: string;
};

export const REWARDS_WEBHOOK_DEFINITIONS: readonly RewardsWebhookDefinition[] = [
	{
		slug: "order-fully-paid",
		name: "Order fully paid (award Vapor Tokens)",
		asyncEvents: ["ORDER_FULLY_PAID"],
		query: `subscription {
	event {
		... on OrderFullyPaid {
			order { id }
		}
	}
}`,
	},
	{
		slug: "order-cancelled",
		name: "Order cancelled (return Vapor Tokens)",
		asyncEvents: ["ORDER_CANCELLED"],
		query: `subscription {
	event {
		... on OrderCancelled {
			order { id }
		}
	}
}`,
	},
	{
		slug: "order-fully-refunded",
		name: "Order fully refunded (return Vapor Tokens)",
		asyncEvents: ["ORDER_FULLY_REFUNDED"],
		query: `subscription {
	event {
		... on OrderFullyRefunded {
			order { id }
		}
	}
}`,
	},
];

export function buildRewardsAppManifest(origin: string) {
	const base = origin.replace(/\/+$/, "");
	return {
		id: REWARDS_APP_ID,
		version: REWARDS_APP_VERSION,
		name: REWARDS_APP_NAME,
		about:
			"Awards Vapor Tokens (loyalty points) to customers when an order is paid in full, and returns them when an order is cancelled or refunded.",
		permissions: [...REWARDS_APP_PERMISSIONS],
		appUrl: base,
		tokenTargetUrl: `${base}/api/rewards-app/register`,
		author: "Worldwide Vapor",
		webhooks: REWARDS_WEBHOOK_DEFINITIONS.map((definition) => ({
			name: definition.name,
			asyncEvents: definition.asyncEvents,
			query: definition.query,
			targetUrl: `${base}/api/rewards-app/webhooks/${definition.slug}`,
			isActive: true,
		})),
	};
}
