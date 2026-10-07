# Payments setup

What the storefront can take payment with, what each method needs, and the order to switch things on. Everything is
off until its flag is set, so nothing here changes the live store by itself.

| Method                              | Status                                 | Needs                                                                         |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Test credit card (Dummy Payment)    | Built, dev/staging only                | The Saleor Dummy Payment app (already installed), `ALLOW_DUMMY_PAYMENT`       |
| Credit / debit card (Authorize.net) | Built, untested against a live account | Merchant account, Authorize.net account, app install in Saleor                |
| Interac e-Transfer                  | Built                                  | Saleor "Allow unpaid orders", a verified Resend sending domain, CAD handling  |
| Gift cards — redeem                 | Built (uses Saleor's gift card flow)   | `allowLegacyGiftCardUse` on the channel (Saleor default)                      |
| Gift cards — sell                   | Product created, **unpublished**       | Confirm gift card emails send, then publish the product                       |
| Apple Pay / Google Pay              | Built (Stripe Express Checkout)        | Stripe enabled, Apple Pay domain verified in Stripe                           |
| PayPal, Klarna/Afterpay/Affirm      | Built, untested against a live account | Adyen account (PayPal/lender methods enabled), the Saleor Adyen app installed |
| Crypto (hosted checkout)            | Built, untested against a live account | NOWPayments account, a Saleor app token, the payments app installed           |
| Vapor Tokens (rewards)              | Built, untested against a live install | The rewards app installed, `REWARDS_APP_TOKEN`, `allowLegacyGiftCardUse`      |
| Shop Pay                            | Not possible                           | Only works inside Shopify's checkout                                          |

Before wiring any processor, confirm it accepts your business. Vape and nicotine products are restricted or prohibited at
Stripe, PayPal, Klarna, Afterpay, Affirm and most crypto processors; an account that is opened and later closed for the
category can hold funds.

## Test credit card (Saleor Dummy Payment app)

For trying the checkout without any payment account. The store's Saleor already has the **Dummy Payment App** installed
(gateway `saleor.io.dummy-payment-app`); when it is the card gateway on a checkout, the payment step shows a credit card form
that takes no real card and makes no real charge. It is pre-filled with an approved card, so **Pay** still completes in one
click, and a few numbers simulate declines (the card is shown the reason, and Saleor records a failed transaction):

| Card number           | Result                                        |
| --------------------- | --------------------------------------------- |
| `4242 4242 4242 4242` | Approved (any well-formed number is approved) |
| `4000 0000 0000 0002` | Declined — "Your card was declined."          |
| `4000 0000 0000 9995` | Declined — insufficient funds                 |
| `4000 0000 0000 0127` | Declined — wrong security code                |

Use any future expiry and any 3-digit code (4 for American Express). A malformed number is rejected before anything is
sent to Saleor. The chips under the form fill the test numbers.

It only appears in development, or where `ALLOW_DUMMY_PAYMENT=true` / `NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT=true` is set. **Never
turn that on for a store taking real orders:** it approves nearly any card number and creates real orders in Saleor with
nothing paid. An approved test payment creates a real order in Saleor (cancel it afterwards in the Dashboard).

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

An Authorize.net account settles in **one currency** (the sandbox account created on 2026-10-05 reports CAD only), so it can
only charge checkouts in that currency. A CAD account can't take the USD channel's orders; point Canadian shoppers at the
`cad` channel (see the Canada section) or add a second account for USD.

Checked against the sandbox on 2026-10-05 with real calls: the credentials, a charge of an Accept.js token (test card
`4111 1111 1111 1111`), the transaction lookup, and the void all work. Not yet exercised: Saleor calling the app's webhooks (it
needs a public URL), refunds (they only work after a transaction settles), and declines.

Card numbers are entered in the checkout and sent straight from the browser to Authorize.net (Accept.js); only a one-time
token reaches the server. This is PCI SAQ A-EP territory, which is lighter than handling raw cards but still means your
checkout page's security is yours to maintain.

## Pay in 4 (the store's own installment plan)

The shopper pays a quarter at checkout and the rest in three equal payments two weeks apart, with no interest or fees. The
order ships only after the last payment, so the store never sends goods it hasn't been paid for. The store carries the risk of
a card that stops working: the order simply doesn't ship until it is paid.

**What happens.**

1. At checkout the shopper picks "Pay in 4", sees the four dates and amounts, ticks the agreement, and pays the deposit with
   the usual card form. The payments app charges exactly a quarter of Saleor's total (never an amount the browser sends) and
   marks it as the first payment of a series.
2. Saleor creates the order part-paid (the channel must allow unpaid orders). Saleor then tells the app (`ORDER_CREATED`), which
   saves the card used for the deposit as an Authorize.net customer profile, writes the schedule on the order, and emails the
   shopper the schedule.
3. Once a day the job (`/api/installments/run`) reminds the shopper two days before each payment, charges the stored card on
   the due date, and reports each payment to Saleor. After the fourth payment Saleor marks the order paid, which is what lets
   ShipStation and your other `ORDER_FULLY_PAID` integrations release it, and the saved card is deleted.
4. A declined payment is tried again 3 days later and then 7 days after that. After the third decline the plan stops, the shopper
   is emailed, and staff are alerted.

**Set up.**

1. The card flow must already work (see the Authorize.net section). Ask your merchant account provider that it allows
   stored-card / recurring payments: the later charges are merchant-initiated, and some high-risk accounts restrict that.
2. In Saleor, switch on **Allow unpaid orders** for each channel that offers it (Configuration, Channels), then list those
   channels in `NEXT_PUBLIC_INSTALLMENT_CHANNELS`. Other channels never show the option. An Authorize.net account settles in
   one currency, so a CAD account can only serve the CAD channel.
3. **Reinstall the payments app** from `https://<your-domain>/api/saleor-app/manifest`. This version asks for the
   `MANAGE_ORDERS` permission (to read orders and store each plan on its order) and adds the order-created webhook. Saleor
   shows the permissions before you approve. Then create a new app token for it and put it in `PAYMENTS_APP_TOKEN`: a token
   made for the old version doesn't have the new permission.
4. Set `CRON_SECRET` to a long random value (at least 16 characters). Vercel Cron then sends it to the job automatically; with
   no secret the job refuses everyone. The schedule is in `vercel.json` (14:00 UTC every day).
5. Allow `/api/installments/run` and `/api/saleor-app/*` through Vercel's firewall (Bot Protection in challenge mode answers
   non-browser callers, such as Saleor and the scheduler, with a 429).
6. Set `NEXT_PUBLIC_ENABLE_INSTALLMENTS=true`. Optionally set the order range with `NEXT_PUBLIC_INSTALLMENT_MIN_TOTAL` and
   `NEXT_PUBLIC_INSTALLMENT_MAX_TOTAL` (defaults 50 and 1000). Email (`RESEND_API_KEY`) sends the shopper's reminders and
   staff alerts; without it, alerts appear only as order notes and in the logs.

**Running it.** Every step is recorded as a note on the order in the Dashboard, and each payment appears as a charge on the
order's transaction. The plan itself is stored on the order in private metadata (`paper.installments.plan`), with its status
also in public metadata (`paper.installments`: `active`, `complete`, `defaulted`, `cancelled`, `needs_review`).

- **To cancel a plan, cancel the order in Saleor.** The next run stops charging and deletes the saved card. Refund what the
  customer already paid: the deposit can be refunded from the Dashboard; a later installment has to be refunded in the
  Authorize.net dashboard and recorded in Saleor.
- **`defaulted`:** a payment was declined three times. Charging has stopped and staff were alerted. Contact the customer to
  finish the order, or cancel it and refund.
- **`needs_review`:** a charge started, or wasn't confirmed (a network error, a fraud hold), and it is unknown whether the card
  was charged, so nothing more is charged until someone checks. Look in Authorize.net for the invoice named in the alert
  (`WV<order number>-<payment number>`). If it went through, set that payment to `paid` (with the transaction id) and
  `reported` to false in the order's private metadata, so the job tells Saleor; if it didn't, set the payment back to `pending`.
  Then set the plan's `status` back to `active` (and the public `paper.installments` marker to `active`).
- **A payment taken but Saleor not told:** the job retries telling Saleor every run, and alerts staff meanwhile. The order shows
  unpaid until it succeeds, so it won't ship early.

**Testing in the sandbox.** Use a sandbox card (4111 1111 1111 1111) on the CAD channel. To try a later payment without waiting
two weeks, move that payment's `dueOn` date in the order's private metadata to today, then run the job by hand:
`curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/installments/run`.

**Not yet exercised against live services.** The logic is unit-tested with fakes, and every request to Authorize.net and Saleor
has been checked against their published schemas, but a full run (deposit, order, saved card, a later charge, the final
payment marking the order paid) has not been done against a real sandbox account and an installed app. Do that before enabling it
for customers. Also not built: automatic refunds of later installments, letting the shopper update an expired card, and a
Dashboard screen for plans.

## Vapor Tokens (rewards)

Customers earn Vapor Tokens on what they pay for products and spend them at checkout as money off. One token is worth five
cents, so the default of **1 token per $1** is 5% back, and 100 tokens take $5.00 off. Tokens **expire 12 months after they are
earned**. Only signed-in customers earn: a guest order earns nothing.

**What happens.**

1. When an order is paid in full (`ORDER_FULLY_PAID`), the rewards app creates a Saleor gift card for the customer, a "lot",
   worth the tokens earned. It is tagged `vapor-tokens`, assigned to the customer, and given its own expiry date. The customer
   is emailed. Tokens are earned on what was paid **in money** for products: shipping, tax, gift cards and tokens earn nothing,
   so paying part of an order with tokens earns tokens on the rest only.
2. At checkout a signed-in customer with tokens sees their balance and a **Use my tokens** button. The server puts their lots on
   the checkout, soonest-expiring first and only as many as the order needs, using Saleor's gift card mechanism. Saleor
   lowers the total, and the payment (card, e-Transfer, crypto, Pay in 4) is for what is left. Tokens that aren't needed stay on
   the lot. The gift card codes never reach the browser.
3. If the order is cancelled (`ORDER_CANCELLED`) or fully refunded (`ORDER_FULLY_REFUNDED`), the tokens it earned are
   deactivated and the tokens it spent are returned to the lots they came from; the customer is emailed. Saleor doesn't give a
   gift card's balance back on its own, which is why the app does it. Running the same event twice does nothing the second time.
4. The customer's account has a **Vapor Tokens** page (`/account/tokens`): balance, what is about to expire, how it works, and
   each lot's history.

**Set up.**

1. In Saleor, make sure the channel allows gift cards at checkout: `allowLegacyGiftCardUse` (Configuration, Channels; it is on by
   default, and gift card redemption on this site relies on it too). Saleor documents that flow as deprecated, so check
   the release notes when you upgrade Saleor.
2. Install the app: Dashboard, Apps, **Install external app**, `https://<your-domain>/api/rewards-app/manifest`. Saleor shows
   the permissions before you approve: `MANAGE_ORDERS` (read orders, leave notes) and `MANAGE_GIFT_CARD` (create, adjust and
   deactivate token gift cards). It is separate from the payments app on purpose, so the payments app never gets to create
   gift cards.
3. Open the installed app in the Dashboard, create a token, and set it as `REWARDS_APP_TOKEN` (server-only, never `NEXT_PUBLIC_`).
4. Allow `/api/rewards-app/*` through Vercel's firewall (Bot Protection in challenge mode answers non-browser callers such
   as Saleor with a 429), the same as `/api/saleor-app/*`.
5. Set `NEXT_PUBLIC_ENABLE_REWARDS=true`. Optionally set `NEXT_PUBLIC_REWARDS_TOKENS_PER_DOLLAR` (default 1) and
   `NEXT_PUBLIC_REWARDS_EXPIRY_MONTHS` (default 12; `0` means tokens never expire). A change applies to tokens earned from then
   on: tokens already earned keep their value and expiry date. Email (`RESEND_API_KEY`) sends the customer's emails and staff
   alerts; without it, alerts appear only as order notes and in the logs.

**Running it.** Every award and return is noted on the order in the Dashboard. Each lot is a gift card you can see in Gift
Cards, filtered by the tag `vapor-tokens`; its public metadata names the order that earned it (`paper.vt.order`) and the tokens it
started with (`paper.vt.tokens`). Its private metadata holds the code the app needs to apply it (`paper.vt.code`): don't delete it.

- **To give a customer tokens by hand,** create a gift card in the Dashboard with the tag `vapor-tokens`, assign it to the customer,
  and set its balance and expiry. 1 token = 5 cents of balance (100 tokens = $5.00). It then behaves like any other lot, but it has no stored code
  (`paper.vt.code`), so the app reads the code from Saleor when the customer uses it, which Saleor only shows for a card nobody has
  used yet. Add the code to private metadata under `paper.vt.code` yourself to be safe.
- **To extend or shorten a lot's life,** change the gift card's expiry date.
- **A staff alert** names the order and what failed: tokens not created (the customer was not rewarded, so create the lot by hand),
  a missing code, a duplicate award (two lots for one order; the app deactivates the extra one but check), tokens that couldn't be
  returned or taken back. The order note says the same.

**Things to know.**

- A lot can only be spent in its own currency, so on a store with CAD and USD channels a customer's CAD tokens don't count at
  a USD checkout. The checkout and the account page show only what can be spent.
- Tokens returned from a cancelled order go back to the lot they came from. If that lot has expired by then, they come back
  expired: extend its expiry date in the Dashboard if you want the customer to keep them.
- A **partial** refund doesn't take tokens back; only a cancellation or a full refund does. Cancelling an order that already
  spent some of its earned tokens deactivates what is left of that lot.
- Tokens are Saleor gift cards, so they could also be spent on a gift card product if one is ever published (the gift card product
  is unpublished today): a customer could convert tokens into a gift card that doesn't expire. Keep it unpublished, or exclude it
  from the program, before you turn this on if that matters to you.
- Rewards programs can carry rules: loyalty terms, expiry notices, and in some places unclaimed-balance or consumer-protection
  rules. Have the terms (how tokens are earned, that they expire, and that they have no cash value) checked and published on the site.

**Not yet exercised against live services.** The earn, return, plan and apply logic is unit-tested with fakes, and every
request to Saleor has been checked against Saleor's schema, but a full run (install the app, pay an order, see the lot, spend it at
checkout, cancel the order) has not been done against a running Saleor with the app installed. Do that on a test order before
enabling it for customers.

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
- **The USD channel (`default-channel`) also serves Canada** (linked 2026-10-05): the Canada warehouse and "Canada" zone are
  attached to it and Standard Shipping is listed at USD 0. Before that, a Canadian address on a USD cart had zero stock and
  "Continue to shipping" stopped with "Some items in your cart can't be shipped to this address". Canadians on the USD site
  pay in USD (e-Transfer stays hidden unless `NEXT_PUBLIC_ETRANSFER_CURRENCIES` includes USD), and the leftover demo carriers
  (DHL/UPS/FedEx/EMS) on the "Americas" zone, which still includes CA, are offered alongside the free option — delete them or
  take CA out of that zone in the Dashboard if you don't want that. To undo: remove the Canada warehouse from the channel,
  the channel from the "Canada" zone, and the USD price from Standard Shipping.

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

## PayPal and buy-now-pay-later (Adyen)

Adyen's Drop-in sits **beside** the card form as an extra tab ("PayPal & Pay Later"); cards stay on Authorize.net or
Stripe. By default only PayPal, Klarna, Afterpay/Clearpay and Affirm are shown (override with
`NEXT_PUBLIC_ADYEN_PAYMENT_METHODS`, a comma-separated list of Adyen method types).

1. Open an Adyen merchant account and enable the methods you want (PayPal needs your PayPal business details; each lender
   has its own approval). Adyen decides which are offered for a given amount and country, so a US/CA vape shop may see
   fewer than the list above — and most of these providers prohibit vape products, so confirm before applying.
2. In the Adyen Customer Area create an API credential and a **client key**, and add your storefront domain to the client
   key's allowed origins.
3. Install Saleor's Adyen app (Dashboard → Apps → Marketplace/Install external app) and configure it with the Adyen
   credentials, merchant account and the webhook it asks you to register in Adyen. Docs:
   https://docs.saleor.io/developer/app-store/apps/adyen/overview
4. Attach the app to the channels you sell in. Saleor then lists the gateway `app.saleor.adyen` on the checkout.
5. Set `NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS=true`. If your Adyen account is not in Europe, also set
   `NEXT_PUBLIC_ADYEN_ENVIRONMENT` to its live region (`live-us`, `live-au`, `live-apse`, `live-in`, `live-nea`). Test mode
   is automatic when the Adyen app is in test.
6. Test end to end in Adyen's test environment: PayPal sandbox buyer, a lender test redirect, a refused payment, and a
   refund from the Dashboard.

How it works: Drop-in collects the method and calls `transactionInitialize`; redirects (lenders) send the shopper back to
the payment step with `redirectResult`, which the storefront forwards through `transactionProcess`. A "pending" lender
decision is waited for briefly, then the order is placed once Saleor reports the checkout paid.

## Crypto (hosted checkout)

The shopper is sent to NOWPayments' hosted page to choose a coin and pay. The order is placed once NOWPayments confirms the
payment to our server (an IPN call); the shopper's return to the site proves nothing by itself. It is served by the same
"Worldwide Vapor Payments" app as cards, so that app must be installed (see Card payments, step 3).

1. Create a NOWPayments account, set your payout wallet(s), and in Store Settings create an **API key** and an **IPN secret**.
   (NOWPayments has a sandbox with its own keys: set `NOWPAYMENTS_SANDBOX=true` while testing.)
2. Set `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` (server-only, never `NEXT_PUBLIC_`).
3. In the Saleor Dashboard open Apps → Worldwide Vapor Payments and create a token (it needs only `HANDLE_PAYMENTS`, which
   the app already has). Set it as `PAYMENTS_APP_TOKEN`. The IPN route uses it to report the payment to Saleor.
4. Set `NEXT_PUBLIC_STOREFRONT_URL` to the real https domain — NOWPayments has to reach
   `https://<your-domain>/api/saleor-app/crypto/ipn`, so crypto cannot be fully tested from localhost.
5. Turn on **Automatically complete fully paid checkouts** for the channel, so an order is still created if the shopper
   closes the tab before returning (otherwise the order is only placed when they come back and the page finishes it).
6. Set `NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS=true`.

Things to know:

- Only a `finished` payment marks the order paid. A **partially paid** invoice (the shopper sent too little) is logged and
  left unpaid for you to resolve with the customer in NOWPayments.
- Crypto can't be refunded from Saleor. The refund button reports a clear failure; send it from NOWPayments and note it on the
  order.
- Confirm in the sandbox that NOWPayments accepts the Saleor transaction ID as `order_id` and that very small totals are
  accepted (they enforce a minimum; the shopper sees the provider's message if not).

## What has not been proven

Everything above is covered by unit tests and a browser walkthrough of the checkout UI states, but **none of the Adyen or
crypto paths have run against a real Adyen or NOWPayments account**: the Drop-in rendering, PayPal pop-up, lender redirects,
3-D Secure challenges, and the IPN signature against NOWPayments' own callbacks are unverified until you test them with your
accounts. Authorize.net is in the same position, as are Pay in 4 and Vapor Tokens (see their sections).
