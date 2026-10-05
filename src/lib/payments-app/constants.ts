/**
 * "Worldwide Vapor Payments" — a small custom Saleor payment app that lives inside this storefront (Next.js route
 * handlers under /api/saleor-app/*). It hosts crypto checkout through NOWPayments via Saleor's Transactions API
 * (see https://docs.saleor.io/developer/extending/apps/building-payment-app).
 *
 * Install it once in the Saleor Dashboard: Apps → Install external app → https://<your-domain>/api/saleor-app/manifest.
 * Saleor then lists it on every checkout as the gateway `app.worldwide-vapor.payments`.
 */
export const PAYMENTS_APP_ID = "worldwide-vapor.payments";

/** Gateway id Saleor shows in `checkout.availablePaymentGateways` ("app." + the manifest id). */
export const PAYMENTS_GATEWAY_ID = `app.${PAYMENTS_APP_ID}`;

export const PAYMENTS_APP_NAME = "Worldwide Vapor Payments";
/** 2.0.0: card payments (Authorize.net) were removed, so the app now only handles crypto. */
export const PAYMENTS_APP_VERSION = "2.0.0";

/** Methods this app can offer, reported by the gateway-initialize webhook. */
export type PaymentMethodId = "crypto";

/**
 * Crypto transactions carry this prefix on their Saleor `pspReference`, which is how the refund and cancel webhooks
 * recognise them.
 */
export const CRYPTO_PSP_PREFIX = "crypto:";
