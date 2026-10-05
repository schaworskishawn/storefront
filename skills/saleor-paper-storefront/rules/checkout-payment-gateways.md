---
name: checkout-payment-gateways
description: Adding/changing Saleor payment apps: INTEGRATED_GATEWAYS registry, server- vs client-submit, Stripe + Express Checkout, shared transaction actions. Use when integrating a payment gateway or touching Stripe.
---

# Checkout Payment Gateways

How to integrate Saleor payment apps in the Paper checkout. Covers the registry architecture, the two payment submit patterns, shared Saleor transaction primitives, and a checklist for wiring a new gateway (e.g. Adyen).

> **Related**: `checkout-management` (checkout lifecycle, **payment completion / transition UX**, debugging failed transactions) · Saleor transaction API in `saleor-storefront` skill

---

## Architecture

Saleor exposes payment apps on `checkout.availablePaymentGateways`. The storefront picks **one** integrated app via `INTEGRATED_GATEWAYS` (priority order), renders its UI, and drives Saleor's transaction mutations.

```
checkout.availablePaymentGateways
        │
        ▼
resolvePaymentProvider()          ← INTEGRATED_GATEWAYS registry (priority)
        │
        ├── submitMode: "server"  → useCheckoutPayment().submit → executePayment()
        └── submitMode: "client"  → provider UI owns Pay button (Stripe pattern)
        │
        ▼
Shared server actions (src/app/(checkout)/actions.ts)
  • paymentGatewayInitialize
  • transactionInitialize
  • transactionProcess
  • checkoutComplete
        │
        ▼
finalizeCheckoutOrder() / navigateToOrderConfirmation()
```

### Key files

| File                                                        | Purpose                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/checkout/lib/payment/integrated-gateways.ts`           | **Registry** — priority, env flags, supported-gateway detection         |
| `src/checkout/lib/payment/resolve-provider.ts`              | Picks provider + `submitMode`                                           |
| `src/checkout/lib/payment/execute-payment.ts`               | Server-submit flow only (`submitMode: "server"`)                        |
| `src/checkout/lib/payment/providers/*.ts`                   | Per-app helpers (gateway ID, config parsing, errors)                    |
| `src/checkout/components/payment/integrated-payment-ui.tsx` | **UI registry** — maps provider type → component                        |
| `src/checkout/views/saleor-checkout/payment-step.tsx`       | Layout; uses `usesClientPaymentSubmit()` not provider-specific branches |
| `src/app/(checkout)/actions.ts`                             | Saleor mutations + optional server guards                               |
| `src/checkout/graphql/payment.graphql`                      | Transaction mutations                                                   |

---

## Two submit patterns

Pick the pattern that matches how the Saleor payment app expects to be driven.

| Pattern           | `submitMode` | Current example | Who clicks Pay?                | Typical flow                                                                                               |
| ----------------- | ------------ | --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Server-submit** | `"server"`   | Dummy Payment   | Payment step form / sticky bar | `transactionInitialize` → `checkoutComplete`                                                               |
| **Client-submit** | `"client"`   | Stripe          | Provider component's button    | `paymentGatewayInitialize` → `transactionInitialize` → PSP SDK → `transactionProcess` → `checkoutComplete` |

**Shared by both patterns** (reuse — do not reimplement):

- `updateCheckoutBilling()` before charging
- Live total validation (`getCheckoutPayAmount`, `hasMaterialCheckoutTotalChange`)
- `initializeCheckoutTransaction` / `processCheckoutTransaction` server actions
- `finalizeCheckoutOrder()` + `markPaymentCompleting()` session storage
- Zero-amount orders: `completeCheckoutOrder()` without a transaction

### Server-submit template

See `src/checkout/lib/payment/providers/dummy-pay.ts` + `executePayment()` switch case.

### Client-submit template

See `src/checkout/components/payment/stripe/` — especially `stripe-payment-form.tsx` for the full initialize → confirm → process → complete sequence.

`payment-step.tsx` automatically uses client-submit layout when `usesClientPaymentSubmit(provider)` is true (no outer `<form>`, billing above payment UI, no shared Pay button).

---

## Stripe Express Checkout (wallets)

The payment step mounts **two Stripe Elements** inside one shared `<Elements>` provider. Both paths call the same pipeline (`executeStripeCheckoutPayment`) and the same Saleor mutations afterward.

```
Payment step (Stripe enabled)
│
├── ExpressCheckoutElement          ← wallet shortcuts (top)
│     Apple Pay · Google Pay · Link
│     onConfirm → expressPaymentType → transactionInitialize
│
├── "Or pay with card" divider      ← hidden when no wallets available
│
└── PaymentElement + Pay button     ← card / saved Link in form
      onChange (value.type) + elements.submit() → transactionInitialize
```

### What Express Checkout does here

- **Payment shortcut only** — faster pay with saved wallet / card credentials.
- **No Saleor address flow** — Express options set `billingAddressRequired: false`, `shippingAddressRequired: false`, `emailRequired: false`. Shipping, contact, and billing still come from checkout steps; `updateCheckoutBilling()` runs before charge; `confirmPayment` passes **Saleor checkout** billing into Stripe.
- **Link in two places** — green Express Link button (wallet) vs saved Link inside Payment Element (Pay button). Different Stripe surfaces; only the path the shopper uses drives `paymentIntent.paymentMethod`.

Wallets are enabled when Stripe is on. Opt out with `NEXT_PUBLIC_ENABLE_STRIPE_EXPRESS_CHECKOUT=false` (see `.env.example`).

### Payment method → `transactionInitialize`

Saleor's Stripe app expects `paymentGateway.data.paymentIntent.paymentMethod`. Stripe exposes the type differently per surface — encode that in `StripeInitializePaymentMethodContext` (`src/checkout/lib/payment/providers/stripe.ts`):

| Surface           | Stripe signal                                                                              | When                |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------- |
| `expressCheckout` | `onConfirm.expressPaymentType` (`apple_pay`, `google_pay`, `link`, …)                      | Wallet button click |
| `paymentElement`  | `PaymentElement` `onChange` → `value.type`, then `elements.submit().selectedPaymentMethod` | Pay button          |

`resolveStripePaymentMethodForInitialize()` prefers Payment Element `onChange` over submit, and **never sends `"unknown"`** (saved Link in Payment Element reports `"unknown"` on submit but `"link"` on change).

### Shared pay pipeline

All Stripe pay paths:

1. `updateCheckoutBilling()` — persist billing from checkout form
2. Refresh checkout — live total before `transactionInitialize`
3. `transactionInitialize` — with resolved `paymentMethod`
4. `stripe.confirmPayment()` — Elements stay mounted until confirm succeeds
5. `transactionProcess` → `finalizeCheckoutOrder()`

Processing UX: local overlay during confirm → `PaymentCompletingScreen` after success. Payment step hides pay UI when `authorizeStatus === FULL` (recovery banner). See `checkout-management` for transition guards, 3DS return, and session storage.

### Stripe file map

| File                                    | Purpose                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| `stripe-payment.tsx`                    | Loads publishable key, wraps `<Elements>`                     |
| `stripe-payment-form.tsx`               | Express + Payment Element + Pay button                        |
| `stripe-express-checkout.tsx`           | `ExpressCheckoutElement`, wallet availability                 |
| `execute-stripe-checkout-payment.ts`    | Shared initialize → confirm → process → complete              |
| `providers/stripe.ts`                   | Gateway ID, env flags, payment-method resolver, error parsing |
| `stripe-checkout-completion-host.tsx`   | Shell-level 3DS return handler                                |
| `stripe-payment-processing-overlay.tsx` | In-form processing state                                      |

### Stripe environment variables

| Variable                                     | Purpose                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS`         | Master Stripe toggle (required in production)                          |
| `ENABLE_STRIPE_PAYMENTS`                     | Server-side mirror for `transactionInitialize` guard                   |
| `NEXT_PUBLIC_ENABLE_STRIPE_EXPRESS_CHECKOUT` | Wallet buttons; default on when Stripe enabled; set `false` to disable |

Publishable keys come from Saleor `paymentGatewayInitialize`, not env.

### Stripe manual QA (add to gateway checklist)

- [ ] Express wallets appear when device/browser supports them; section hidden when none available
- [ ] Apple Pay / Google Pay / Express Link complete an order
- [ ] Payment Element card pay works
- [ ] Saved Link in Payment Element + **Pay** (not Express button) sends `link`, not `unknown`
- [ ] Billing from checkout steps is used — Express does not replace shipping/contact
- [ ] Price change notice when total shifts after billing refresh
- [ ] 3DS redirect return completes via shell return handler
- [ ] Browser Back during payment aborts in-flight flow without stuck processing UI

---

## Adding a new gateway

Example: wiring **Adyen** after Stripe and Dummy are already integrated.

### 1. Provider module

Create `src/checkout/lib/payment/providers/adyen.ts`:

- Export gateway ID constant (match Saleor app manifest ID exactly)
- `isAdyenGateway(gatewayId)` / `findAdyenGateway(gateways)`
- `isAdyenPaymentEnabled()` — env flag (mirror Stripe: `NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS`)
- `getAdyenPaymentGuardError(gatewayId)` — block `transactionInitialize` when flag is off
- Parse `paymentGatewayInitialize` / `transactionInitialize` / `transactionProcess` `data` payloads
- User-facing error helpers for failed transaction events

### 2. Registry entry

Add to `INTEGRATED_GATEWAYS` in `integrated-gateways.ts` **at the desired priority** (first match wins):

```typescript
{
  type: "adyen",
  submitMode: "client", // or "server" for simple apps
  findGateway: (gateways) => findAdyenGateway(gateways),
  isEnabled: isAdyenPaymentEnabled,
  matchesGateway: (gateway) => isAdyenGateway(gateway.id),
},
```

### 3. Types

Extend in `src/checkout/lib/payment/types.ts`:

- Add `"adyen"` to the integrated provider union (alongside `"stripe"` | `"dummy"`)
- Update `isIntegratedPaymentProvider()` if needed

Extend `IntegratedGatewayType` in `integrated-gateways.ts`.

### 4. Server-submit only: `execute-payment.ts`

If `submitMode: "server"`, add a case that calls `executeAdyenPayment()` (same shape as `dummy-pay.ts`).

If `submitMode: "client"`, add a case that returns a clear error — same as Stripe today — so nobody accidentally routes client flows through the form submit handler.

### 5. UI component

Create `src/checkout/components/payment/adyen/` (Drop-in, redirect handler, return URL builder, etc.).

Register in `integrated-payment-ui.tsx`:

```typescript
case "adyen":
  return <AdyenPayment checkout={checkout} gatewayName={provider.gateway.name} ... />;
```

### 6. Server action guard (recommended)

In `initializeCheckoutTransaction()` inside `src/app/(checkout)/actions.ts`:

```typescript
const adyenGuardError = getAdyenPaymentGuardError(variables.paymentGateway?.id);
if (adyenGuardError) return { ok: false, error: adyenGuardError };
```

Prevents bypassing disabled gateways via direct server action calls.

### 7. Tests

| File                                                 | What to test                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `providers/adyen.test.ts`                            | ID matching, env flag, config/error parsing                    |
| `resolve-provider.test.ts`                           | Priority vs other gateways, `submitMode` on resolved provider  |
| `integrated-gateways` via `payment-gateways.test.ts` | `hasUnsupportedPaymentGateway` when Adyen present but disabled |
| `execute-payment.test.ts`                            | Server-submit path only (if applicable)                        |

Run: `pnpm exec vitest run src/checkout/lib/payment`

### 8. Environment variables

Document in `.env.example` / deployment config:

```env
NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS=true
# Server-only mirror if needed:
ENABLE_ADYEN_PAYMENTS=true
```

Publishable keys and PSP config come from Saleor's `paymentGatewayInitialize` response — not from env (see Stripe).

### 9. Manual QA checklist

- [ ] Gateway appears on checkout when app is active in Saleor Dashboard
- [ ] `PaymentGatewayAlerts` hidden when integrated + enabled
- [ ] Billing address saved before charge
- [ ] Price change notice when total shifts after billing refresh
- [ ] Successful payment → order confirmation + checkout cookie cleared
- [ ] Failed payment → user sees error, can retry (fresh transaction)
- [ ] Zero-total checkout completes without PSP
- [ ] Redirect-return flows (if any) recover authorized transactions

---

## What you usually do **not** need to change

- `payment-step.tsx` layout — works for any `submitMode: "client"` gateway via `usesClientPaymentSubmit()`
- GraphQL mutations in `payment.graphql` — same for all Saleor payment apps
- `updateCheckoutBilling`, `checkout-pay-amount`, `finalizeCheckoutOrder`
- Cart / checkout cookie logic (`src/lib/checkout.ts`)

Only touch `payment-step.tsx` for **provider-specific** extras (e.g. Stripe's `AuthorizedPaymentRecovery`).

---

## Current integrated gateways

| App           | Gateway ID                                     | Env flag                             | Submit mode |
| ------------- | ---------------------------------------------- | ------------------------------------ | ----------- |
| Stripe        | `saleor.app.payment.stripe`                    | `NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS` | `client`    |
| Dummy Payment | `saleor.io.dummy-payment-app` (and legacy IDs) | `ALLOW_DUMMY_PAYMENT` / dev only     | `server`    |

Registry order is priority: Stripe first, then the dummy gateway. The Worldwide Vapor Payments app (crypto only) is **not** here — it is an extra method, see below. Authorize.net card payments were removed on 2026-10-05; they are in git history if a card processor is ever needed again.

Gift card gateway (`saleor.io.gift-card-payment-gateway`) is **ignorable** — it does not block resolution. Gift cards are redeemed through the checkout's promo box (`checkoutAddPromoCode` accepts both discount codes and gift card codes; applied cards show in `CheckoutPromoSection`, removed by id with `removeCheckoutGiftCard`).

---

## Worldwide Vapor Payments app (crypto)

Saleor has no ready-made hosted-crypto app, so this repo ships one as route handlers (`src/app/api/saleor-app/*`, logic in `src/lib/payments-app/*`):

- `manifest` — install URL for Dashboard → Apps. Webhook subscription queries live in `manifest.ts` (validate them against the live schema after editing; bump `PAYMENTS_APP_VERSION` when they change and reinstall the app).
- `register` — token handshake; only checks the install is ours and has `HANDLE_PAYMENTS`.
- `webhooks/[event]` — every request is verified (`saleor-signature` RS256 detached JWS against Saleor's JWKS, pinned to `NEXT_PUBLIC_SALEOR_API_URL`) before any handler runs.
- Handlers answer `PAYMENT_GATEWAY_INITIALIZE_SESSION` (lists `crypto` once the NOWPayments keys are set), `TRANSACTION_INITIALIZE_SESSION` (`method: "crypto"` creates the hosted invoice; any other method is an `unknown_method` failure), and `TRANSACTION_REFUND_REQUESTED` / `TRANSACTION_CANCELATION_REQUESTED` (always a clear failure: crypto is refunded from the provider's dashboard). Saleor's `action.amount` is the only amount trusted.
- `nowpayments.ts` creates the invoice and verifies the IPN; `saleor-api.ts` reports the confirmed payment with `transactionEventReport` using `PAYMENTS_APP_TOKEN`. Crypto transactions carry a `crypto:` `pspReference` prefix.
- Server-to-server calls to `/api/saleor-app/*` must not be challenged by a firewall / bot protection (Saleor and NOWPayments can't solve a challenge page).

## Test card form (Dummy Payment)

The dummy gateway is still `submitMode: "server"` (the checkout's Pay button submits it), but `DummyPaymentPlaceholder` now renders a real card form (`TestCardForm`). The Pay button lives outside that form, so the form leaves its card in `providers/dummy-card.ts` (`setDummyCardEntry`) and `executeDummyPayment` reads it: a malformed card never reaches Saleor, the decline numbers (`4000 0000 0000 0002` and friends) send `CHARGE_FAILURE` and return the reason, anything else is approved. Two traps: Pay replaces the whole step with the processing screen _before_ the card is read, so the entry must **not** be cleared when the form unmounts (the form re-reads it on remount); and for the same reason `useCheckoutPayment` stashes a failed pay's message (`stashPaymentCompletionError`) so the remounted step can show it. Never enable the dummy gateway on a store taking real orders.

## Extra methods beside the card gateway

Adyen (PayPal/BNPL) and crypto are **not** in `INTEGRATED_GATEWAYS` — that registry picks ONE primary card provider. They are extra tabs in the payment step, listed by `payment-methods.ts`:

- `getGatewayPaymentOffers(gateways, isFreeOrder)` — `adyen` needs `NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS` + the `app.saleor.adyen` gateway on the checkout; `crypto` needs `NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS` + the payments-app gateway. Neither has a development default.
- `listPaymentMethods` / `resolvePaymentMethod` order the tabs (`card`, `adyen`, `etransfer`, `crypto`) and fall back when the saved pick is no longer offered. `payment-step.tsx` shows `PaymentMethodTabs` whenever more than one is on offer.
- `isExtraMethodGateway` keeps their gateways from reading as "unsupported" in `hasUnsupportedPaymentGateway` / `resolvePaymentProvider`.
- Server guards: `getAdyenGuardError` and `getCryptoPaymentGuardError` run in `initializeCheckoutTransaction`.

**Adyen** (`providers/adyen.ts`, `execute-adyen-payment.ts`, `components/payment/adyen/`): Drop-in is loaded lazily (`next/dynamic`) and owns the Pay button. `submitAdyenPayment` (billing → live total → `transactionInitialize` with `paymentMethod`/`browserInfo`/`returnUrl`) and `submitAdyenDetails` (`transactionProcess`) are the Saleor side of Drop-in's `onSubmit` / `onAdditionalDetails`. Cards are filtered out of `paymentMethodsResponse` (`allowedAdyenPaymentMethods`). A redirect (lender) saves `{transactionId, paymentData}` in `pending-payment-storage.ts` first; `use-adyen-return-completion.ts` finishes it when the shopper returns with `processingPayment=true&redirectResult=…`.

**Crypto** (`providers/crypto.ts`, `execute-crypto-payment.ts`, `components/payment/crypto/`): `transactionInitialize` returns `CHARGE_ACTION_REQUIRED` with the hosted invoice URL, which is only followed when it is an https `nowpayments.io` page. The order is placed after the IPN reports `CHARGE_SUCCESS`; `use-crypto-return-completion.ts` watches the checkout (`wait-for-checkout-payment.ts`) after the shopper returns, and `CryptoPayment` shows a pending panel plus the usual `AuthorizedPaymentRecovery` if it lands later. Return handlers are mounted by `ExternalPaymentCompletionHost` next to the Stripe one.

## Manual method: Interac e-Transfer

Not a Saleor gateway. `src/lib/etransfer.ts` + `placeETransferOrder` (server action) place the order **unpaid** (channel needs "Allow unpaid orders"), write the transfer details to checkout public metadata (Saleor copies it to the order), and email the customer. `ETransferInstructions` shows the same details on the confirmation page while the order is unpaid. Staff mark the order paid in the Dashboard, which fires `ORDER_FULLY_PAID` (ShipStation/Xero sync only then). Offered next to the card gateway by `PaymentMethodTabs` in `payment-step.tsx`.

---

## Anti-patterns

❌ **Don't add a mock card form fallback** for unsupported gateways — `PaymentGatewayAlerts` explains the problem  
❌ **Don't route client-submit PSPs through `useCheckoutPayment().submit`** — they need their own Pay button and SDK lifecycle  
❌ **Don't hardcode `provider.type === "stripe"` in payment-step** — use `usesClientPaymentSubmit()`  
❌ **Don't skip server guards** for env-gated test gateways (Dummy pattern)  
❌ **Don't cache checkout totals at payment time** — always refresh before `transactionInitialize`  
❌ **Don't build a generic PSP abstraction interface** — each app has different SDK steps; reuse Saleor actions + per-provider modules instead
