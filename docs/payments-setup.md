# Payments setup

What the storefront can take payment with, what each method needs, and the order to switch things on. Everything is
off until its flag is set, so nothing here changes the live store by itself.

| Method                              | Status                                 | Needs                                                                        |
| ----------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Credit / debit card (Authorize.net) | Built, untested against a live account | Merchant account, Authorize.net account, app install in Saleor               |
| Interac e-Transfer                  | Built                                  | Saleor "Allow unpaid orders", a verified Resend sending domain, CAD handling |
| Gift cards — redeem                 | Built (uses Saleor's gift card flow)   | `allowLegacyGiftCardUse` on the channel (Saleor default)                     |
| Gift cards — sell                   | Product created, **unpublished**       | Confirm gift card emails send, then publish the product                      |
| Apple Pay / Google Pay              | Built (Stripe Express Checkout)        | Stripe enabled, Apple Pay domain verified in Stripe                          |
| PayPal, Klarna/Afterpay/Affirm      | Not built                              | A Saleor Adyen (or Stripe-enabled) setup — see "Not built yet"               |
| Crypto                              | Not built                              | See "Not built yet"                                                          |
| Shop Pay                            | Not possible                           | Only works inside Shopify's checkout                                         |

Before wiring any processor, confirm it accepts your business. Vape and nicotine products are restricted or prohibited at
Stripe, PayPal, Klarna, Afterpay, Affirm and most crypto processors; an account that is opened and later closed for the
category can hold funds.

## Card payments with Authorize.net

Authorize.net is a gateway, not a bank. You need **both**:

1. A **merchant account** from an acquiring bank that accepts your category (often a "high-risk" acquirer). This is a
   business application only you can complete. A gateway provider or payments broker can refer you.
2. An **Authorize.net account** attached to that merchant account. Start with a free sandbox account to test:
   https://developer.authorize.net/hello_world/sandbox.html

Then:

1. In Authorize.net: Account → Settings → API Credentials & Keys. Copy the API Login ID and Transaction Key, and create a
   Public Client Key.
2. Set the `AUTHORIZENET_*` variables (see `.env.example`). Leave `AUTHORIZENET_ENVIRONMENT=sandbox` until you have tested.
3. Deploy. Saleor has to reach the app, so install it from the deployed site, not localhost:
   Saleor Dashboard → Apps → Install external app → `https://<your-domain>/api/saleor-app/manifest`.
4. Set `NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS=true` (and `NEXT_PUBLIC_STOREFRONT_URL` to the real domain).
   While on, it takes over card payments from Stripe.
5. Test with Authorize.net's sandbox card numbers (e.g. 4111 1111 1111 1111) end to end, including a refund from the
   Saleor Dashboard, before switching to `production`.

Card numbers are entered in the checkout and sent straight from the browser to Authorize.net (Accept.js); only a one-time
token reaches the server. This is PCI SAQ A-EP territory, which is lighter than handling raw cards but still means your
checkout page's security is yours to maintain.

## Before any Canadian order can complete

As of 2026-10-04 Saleor reports **zero stock for Canada** on every variant (`quantityAvailable(countryCode: CA)` is 0 for
all 1,420, while the same query for the US is in stock). A Canadian shopper's checkout stops at the shipping step.

There is now a **CAD channel** (`cad`, currency CAD, created in the Dashboard) and a warehouse **"Worldwide Vapor Canada"**
(Winnipeg — the street address is a placeholder, edit it) holding 20 units of every sellable variant. Every product is
listed in the `cad` channel with the same published/purchasable flags as in USD and each variant priced 1:1 with its USD
price (e.g. USD 24.99 → CAD 24.99). Re-price in the Dashboard if you want a different rate.

Already set up in Saleor (2026-10-04) and verified with a real Canadian test order:

- Warehouse "Worldwide Vapor Canada" is in the `cad` channel; a shipping zone **"Canada"** (country CA, channel `cad`,
  that warehouse) exists with one method, **Standard Shipping**, priced **CA$0** (matches the "Free shipping" badge —
  change the price in the Dashboard if you want paid shipping).
- The `cad` channel is **active** and has **Allow unpaid orders on** (needed for e-Transfer). `default-channel` (USD) still
  has it off, deliberately: on a live channel anyone could create unpaid orders through the API.
- Canadian addresses get shipping and stock (1,419 sellable variants in stock for CA in `cad`).

Still to do for a real launch:

1. Point the storefront at it: set `NEXT_PUBLIC_DEFAULT_CHANNEL=cad` in Vercel (done locally only). Everyone then sees
   CAD prices, so a US shopper would pay in CAD too; there is no per-visitor channel switching yet.
2. Set the real `ETRANSFER_EMAIL`, and verify your Resend sending domain so customer emails deliver.
3. Attach your payment apps to the `cad` channel, and replace the warehouse's placeholder address.
4. If Canada also appears in the demo "Americas" shipping zone, remove it from there.

With the channel on CAD the e-Transfer option appears with no `NEXT_PUBLIC_ETRANSFER_CURRENCIES` override.

## Interac e-Transfer

1. Saleor Dashboard → Configuration → Channels → **default-channel** (the USD one the storefront uses) → turn on
   **Allow unpaid orders** and save. If checkout answers "couldn't place this order for e-Transfer yet", this is still off for
   that channel (the server log says so).
2. Verify your sending domain in Resend and set `AFFILIATE_FROM_EMAIL` to an address on it, otherwise customer emails will
   not deliver (the confirmation page still shows the details).
3. Set `NEXT_PUBLIC_ENABLE_ETRANSFER=true` and `ETRANSFER_EMAIL` (and `ETRANSFER_SECURITY_QUESTION`/`ANSWER` only if your
   bank account does not use Interac auto-deposit).
4. Interac moves Canadian dollars only. If the channel prices in USD, the option is hidden unless you list the currency in
   `NEXT_PUBLIC_ETRANSFER_CURRENCIES`; customers are then told to send the CAD equivalent.
5. When a transfer arrives, open the order in the Dashboard and choose **Mark as paid**. That is what releases it to
   ShipStation/Xero.

Unpaid orders are not cancelled automatically. Cancel any that pass their deadline.

## Gift cards

- **Redeeming** works in the checkout's "Discount code or gift card" box and can be stacked. Saleor treats this as its
  "legacy" gift card flow; it can be switched off per channel with `allowLegacyGiftCardUse`.
- **Selling:** a "Worldwide Vapor Gift Card" product ($25 / $50 / $100 / $200) exists in Saleor but is **not published**.
  Before publishing, buy one yourself with a test order and confirm the buyer actually receives the code. Saleor sends it
  through its email setup, which this repo does not control. If no email arrives, do not publish.

## Apple Pay / Google Pay

Built on Stripe Express Checkout. Needs `NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS=true`, and for Apple Pay the domain registered
in Stripe's dashboard (Stripe gives you a verification file to serve from `/.well-known/`). They will not appear on a
checkout where the Authorize.net gateway has taken over card payments.

## Not built yet

- **PayPal and buy-now-pay-later:** chosen route is an Adyen gateway. It needs an Adyen account, the Saleor Adyen app
  installed, and the Adyen Drop-in UI added behind a flag. It was not written without an account to test it against.
- **Crypto:** a hosted checkout (e.g. NOWPayments) needs a provider account and a place to keep the Saleor app token so the
  provider's confirmation can be reported back to the order after the customer has left the site.
