import {
	buildInstallmentPlan,
	checkInstallmentEligibility,
	readInstallmentConfig,
} from "@/lib/installments/plan";
import { type PaymentGatewayLike } from "../types";
import { findWvPayGateway, isWvPayEnabled, isWvPayGateway } from "./wvpay";

/**
 * "Pay in 4" — the store's own pay-over-time plan (src/lib/installments). It rides on the "Worldwide Vapor Payments" app and
 * the Authorize.net card form, so there is no gateway of its own: `method: "installments"` on `transactionInitialize` charges
 * the deposit, and a daily job collects the rest.
 *
 * Needs the card flag too (the deposit is a card payment), and the order's channel listed in NEXT_PUBLIC_INSTALLMENT_CHANNELS,
 * because the channel must allow unpaid orders for the order to be created before it is paid in full.
 */

/** Shown when a Pay in 4 payment is attempted but the storefront flags are off. */
export const INSTALLMENTS_NOT_ENABLED_MESSAGE =
	"Pay in 4 is not enabled in this environment. Set NEXT_PUBLIC_ENABLE_INSTALLMENTS=true (and the card flag) on the storefront.";

/** Opt-in only: it stores cards and charges them later, so switch it on deliberately. */
export function isInstallmentsEnabled(): boolean {
	return readInstallmentConfig().enabled && isWvPayEnabled();
}

/** The payments app also serves Pay in 4; those requests carry `method: "installments"`. */
export function isWvPayInstallmentsRequest(data: unknown): boolean {
	return !!data && typeof data === "object" && (data as { method?: unknown }).method === "installments";
}

/** Server-side guard for transactionInitialize — blocks Pay in 4 requests when the storefront flags are off. */
export function getInstallmentsGuardError(
	gatewayId: string | null | undefined,
	data: unknown,
): string | null {
	if (!gatewayId || !isWvPayGateway(gatewayId) || !isWvPayInstallmentsRequest(data)) {
		return null;
	}
	return isInstallmentsEnabled() ? null : INSTALLMENTS_NOT_ENABLED_MESSAGE;
}

/**
 * The amount a `transactionInitialize` call should carry, given the checkout's live total: the whole total, or just the
 * deposit for Pay in 4. Null when there's nothing sensible to expect (no total, or a total that can't be split). The server
 * action compares what the browser sent against this, so a shopper can't ask for a smaller charge than the plan allows.
 */
export function expectedInitializeAmount(liveTotal: number | null, gatewayData: unknown): number | null {
	if (liveTotal === null) return null;
	if (!isWvPayInstallmentsRequest(gatewayData)) return liveTotal;
	return buildInstallmentPlan(liveTotal)?.deposit ?? null;
}

type CheckoutLike = {
	totalPrice?: { gross?: { amount: number; currency: string } | null } | null;
	channel?: { slug: string } | null;
};

/** Should this checkout show the Pay in 4 option? Needs the payments app's gateway, the flags, and an eligible order. */
export function isInstallmentsOffered(
	checkout: CheckoutLike,
	gateways: ReadonlyArray<PaymentGatewayLike> | null | undefined,
): boolean {
	if (!isInstallmentsEnabled() || !findWvPayGateway(gateways)) return false;
	const gross = checkout.totalPrice?.gross;
	if (!gross) return false;
	return checkInstallmentEligibility({
		total: gross.amount,
		currency: gross.currency,
		channel: checkout.channel?.slug,
	}).ok;
}

/**
 * A deposit has been taken but the checkout isn't paid in full. Nothing else here leaves a checkout part-paid, so when Pay in 4
 * is on this means "finish the order" (rather than paying again), e.g. after the order failed to complete.
 */
export function hasInstallmentDeposit(checkout: { chargeStatus?: string | null }): boolean {
	return isInstallmentsEnabled() && checkout.chargeStatus === "PARTIAL";
}
