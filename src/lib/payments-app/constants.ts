/**
 * "Worldwide Vapor Payments" — a small custom Saleor payment app that lives inside this storefront (Next.js route
 * handlers under /api/saleor-app/*). Saleor has no ready-made Authorize.net app, so this one drives Authorize.net
 * through Saleor's Transactions API (see https://docs.saleor.io/developer/extending/apps/building-payment-app).
 *
 * Install it once in the Saleor Dashboard: Apps → Install external app → https://<your-domain>/api/saleor-app/manifest.
 * Saleor then lists it on every checkout as the gateway `app.worldwide-vapor.payments`.
 */
export const PAYMENTS_APP_ID = "worldwide-vapor.payments";

/** Gateway id Saleor shows in `checkout.availablePaymentGateways` ("app." + the manifest id). */
export const PAYMENTS_GATEWAY_ID = `app.${PAYMENTS_APP_ID}`;

export const PAYMENTS_APP_NAME = "Worldwide Vapor Payments";
export const PAYMENTS_APP_VERSION = "1.1.0";

/** Methods this app can offer, reported by the gateway-initialize webhook. */
export type PaymentMethodId = "authorizenet" | "crypto";

/**
 * Crypto transactions carry this prefix on their Saleor `pspReference`, which is how the refund and cancel webhooks tell them
 * apart from Authorize.net card transactions (whose references are plain numbers).
 */
export const CRYPTO_PSP_PREFIX = "crypto:";

export type AuthorizeNetEnvironment = "sandbox" | "production";

/**
 * Where Accept.js is loaded from. Lives here (client-safe) and is looked up by environment name — the browser never loads a
 * script from a URL it was merely told about, so a tampered gateway response cannot inject one.
 */
export const ACCEPT_JS_URLS: Record<AuthorizeNetEnvironment, string> = {
	sandbox: "https://jstest.authorize.net/v1/Accept.js",
	production: "https://js.authorize.net/v1/Accept.js",
};

export function acceptJsUrl(environment: AuthorizeNetEnvironment): string {
	return ACCEPT_JS_URLS[environment];
}
