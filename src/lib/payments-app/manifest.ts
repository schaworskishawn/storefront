import { PAYMENTS_APP_ID, PAYMENTS_APP_NAME, PAYMENTS_APP_VERSION } from "./constants";

/**
 * Saleor app manifest for the payments app. Each webhook's `query` is a subscription that selects exactly the fields our
 * handlers read, so Saleor sends nothing more than needed.
 *
 * Only the events this app handles are registered. `TRANSACTION_PROCESS_SESSION` is deliberately absent: card payments finish
 * inside `TRANSACTION_INITIALIZE_SESSION` (no redirect / 3-D Secure step), and crypto payments are confirmed by the provider's
 * IPN call (src/app/api/saleor-app/crypto/ipn), which reports to Saleor itself — so Saleor has nothing to process afterwards.
 */

const ADDRESS_FIELDS = `
	firstName
	lastName
	companyName
	streetAddress1
	streetAddress2
	city
	countryArea
	postalCode
	phone
	country { code }`;

export type WebhookDefinition = {
	/** URL segment under /api/saleor-app/webhooks/ — the route dispatches on it. */
	slug: "payment-gateway-initialize" | "transaction-initialize" | "transaction-refund" | "transaction-cancel";
	name: string;
	syncEvents: string[];
	query: string;
};

export const WEBHOOK_DEFINITIONS: readonly WebhookDefinition[] = [
	{
		slug: "payment-gateway-initialize",
		name: "Payment gateway initialize",
		syncEvents: ["PAYMENT_GATEWAY_INITIALIZE_SESSION"],
		query: `subscription {
	event {
		... on PaymentGatewayInitializeSession {
			__typename
		}
	}
}`,
	},
	{
		slug: "transaction-initialize",
		name: "Transaction initialize",
		syncEvents: ["TRANSACTION_INITIALIZE_SESSION"],
		query: `subscription {
	event {
		... on TransactionInitializeSession {
			action { amount currency actionType }
			data
			merchantReference
			transaction { id pspReference }
			sourceObject {
				__typename
				... on Checkout {
					id
					email
					billingAddress {${ADDRESS_FIELDS}
					}
					shippingAddress {${ADDRESS_FIELDS}
					}
				}
				... on Order {
					id
					number
					userEmail
					billingAddress {${ADDRESS_FIELDS}
					}
					shippingAddress {${ADDRESS_FIELDS}
					}
				}
			}
		}
	}
}`,
	},
	{
		slug: "transaction-refund",
		name: "Transaction refund requested",
		syncEvents: ["TRANSACTION_REFUND_REQUESTED"],
		query: `subscription {
	event {
		... on TransactionRefundRequested {
			action { amount currency }
			transaction { id pspReference }
		}
	}
}`,
	},
	{
		slug: "transaction-cancel",
		name: "Transaction cancelation requested",
		syncEvents: ["TRANSACTION_CANCELATION_REQUESTED"],
		query: `subscription {
	event {
		... on TransactionCancelationRequested {
			action { amount currency }
			transaction { id pspReference }
		}
	}
}`,
	},
];

export function buildPaymentsAppManifest(origin: string) {
	const base = origin.replace(/\/+$/, "");
	return {
		id: PAYMENTS_APP_ID,
		version: PAYMENTS_APP_VERSION,
		name: PAYMENTS_APP_NAME,
		about:
			"Takes credit and debit card payments through Authorize.net, and crypto payments through NOWPayments, for this storefront.",
		permissions: ["HANDLE_PAYMENTS"],
		appUrl: base,
		tokenTargetUrl: `${base}/api/saleor-app/register`,
		author: "Worldwide Vapor",
		webhooks: WEBHOOK_DEFINITIONS.map((definition) => ({
			name: definition.name,
			syncEvents: definition.syncEvents,
			query: definition.query,
			targetUrl: `${base}/api/saleor-app/webhooks/${definition.slug}`,
			isActive: true,
		})),
	};
}
