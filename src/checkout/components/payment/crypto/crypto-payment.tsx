"use client";

import { useEffect, useState, type FC } from "react";
import { useSearchParams } from "next/navigation";
import { Bitcoin, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CheckoutFragment } from "@/checkout/graphql";
import { useCheckoutGatewayMessages } from "@/checkout/hooks/use-checkout-gateway-messages";
import { useCheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import { buildPaymentReturnUrl } from "@/checkout/lib/payment/build-payment-return-url";
import { type CheckoutPriceChangeNotice } from "@/checkout/lib/payment/checkout-pay-amount";
import { clearPaymentCompleting } from "@/checkout/lib/payment/checkout-payment-completion";
import { executeCryptoPayment } from "@/checkout/lib/payment/execute-crypto-payment";
import {
	clearPendingPayment,
	readPendingPayment,
	type PendingPayment,
} from "@/checkout/lib/payment/pending-payment-storage";
import { isTrustedCryptoInvoiceUrl } from "@/checkout/lib/payment/providers/crypto";
import { formatMoneyWithFallback } from "@/checkout/lib/utils/money";
import { useCheckoutData } from "@/checkout/providers/checkout-data";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";
import { Button, buttonClassName } from "@/ui/components/ui/button";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";
import { useCryptoAvailability } from "./use-crypto-availability";

type CryptoPaymentProps = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	onPaymentError: (message: string) => void;
	onBillingErrors: (errors: Record<string, string>, focusField?: string) => void;
	onPriceChangeNotice: (notice: CheckoutPriceChangeNotice) => void;
	onPaymentActivityChange?: (active: boolean) => void;
};

const iconBadge =
	"mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-[0_0_12px_var(--wv-cyan-soft)]";

/**
 * Hosted crypto checkout. Choosing it sends the shopper to the provider's page to pay; the order is placed once the provider
 * confirms the payment to Saleor. If they come back before that, a pending panel explains and offers a status check.
 */
export const CryptoPayment: FC<CryptoPaymentProps> = ({
	checkout,
	billing,
	onPaymentError,
	onBillingErrors,
	onPriceChangeNotice,
	onPaymentActivityChange,
}) => {
	const t = useTranslations("checkout.payment.crypto");
	const tActions = useTranslations("checkout.actions");
	const searchParams = useSearchParams()!;
	const paymentMessages = useCheckoutPaymentMessages();
	const gatewayMessages = useCheckoutGatewayMessages();
	const { refreshCheckout } = useCheckoutData();
	const availability = useCryptoAvailability(checkout.id);

	const [pending, setPending] = useState<PendingPayment | null>(null);
	const [busy, setBusy] = useState(false);
	const [checking, setChecking] = useState(false);
	const [stillWaiting, setStillWaiting] = useState(false);
	const total = formatMoneyWithFallback(checkout.totalPrice?.gross);

	// Storage is client-only, so the pending attempt can't seed useState without a hydration mismatch.
	useEffect(() => {
		setPending(readPendingPayment("crypto", checkout.id));
	}, [checkout.id]);

	const handlePay = async () => {
		if (busy) return;
		onPaymentError("");
		setBusy(true);
		onPaymentActivityChange?.(true);

		const result = await executeCryptoPayment({
			checkout,
			billing,
			refreshCheckout,
			returnUrl: buildPaymentReturnUrl(searchParams, {
				origin: window.location.origin,
				pathname: window.location.pathname,
			}),
			navigate: (url) => window.location.assign(url),
			messages: paymentMessages,
			gatewayMessages,
		});

		if (result.ok) {
			// The browser is leaving for the payment page; stay busy until it unloads.
			return;
		}

		if (result.kind === "billing") {
			onBillingErrors(result.errors, result.focusField);
		} else if (result.kind === "price_change") {
			onPriceChangeNotice(result.notice);
		} else {
			onPaymentError(result.message);
		}
		clearPaymentCompleting();
		setBusy(false);
		onPaymentActivityChange?.(false);
	};

	const handleCheckStatus = async () => {
		if (checking) return;
		setChecking(true);
		setStillWaiting(false);
		try {
			// A fresh read updates the checkout; once the payment has landed the usual "complete order" recovery appears above.
			const live = await refreshCheckout();
			if (live?.authorizeStatus !== "FULL") {
				setStillWaiting(true);
			}
		} finally {
			setChecking(false);
		}
	};

	const handleStartOver = () => {
		clearPendingPayment("crypto");
		setPending(null);
		setStillWaiting(false);
	};

	if (availability === "loading") {
		return (
			<div className="wv-card flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
				<LoadingSpinner />
				{t("loading")}
			</div>
		);
	}

	if (availability === "unavailable") {
		return (
			<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
				{t("unavailable")}
			</div>
		);
	}

	if (pending) {
		const canReopen = !!pending.invoiceUrl && isTrustedCryptoInvoiceUrl(pending.invoiceUrl);
		return (
			<div className="wv-card space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
				<div className="flex items-start gap-3">
					<span className={iconBadge}>
						<Bitcoin className="h-4 w-4" aria-hidden />
					</span>
					<div className="space-y-1">
						<p className="font-semibold text-foreground">{t("pendingTitle")}</p>
						<p className="text-sm text-muted-foreground">{t("pendingBody")}</p>
					</div>
				</div>

				{stillWaiting ? (
					<p className="text-sm text-muted-foreground" role="status">
						{t("notConfirmed")}
					</p>
				) : null}

				<div className="flex flex-col gap-3 sm:flex-row">
					<Button type="button" onClick={() => void handleCheckStatus()} disabled={checking} className="h-12">
						{checking ? (
							<span className="flex items-center gap-2">
								<LoadingSpinner />
								{t("checking")}
							</span>
						) : (
							t("checkStatus")
						)}
					</Button>
					{canReopen ? (
						<a
							href={pending.invoiceUrl}
							rel="noreferrer"
							className={buttonClassName({ variant: "outline-solid", asLink: true, className: "h-12" })}
						>
							<ExternalLink className="h-4 w-4" aria-hidden />
							{t("openPaymentPage")}
						</a>
					) : null}
					<Button type="button" variant="ghost" onClick={handleStartOver} className="h-12">
						{t("startOver")}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="wv-card space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
			<div className="flex items-start gap-3">
				<span className={iconBadge}>
					<Bitcoin className="h-4 w-4" aria-hidden />
				</span>
				<div className="space-y-1">
					<p className="font-semibold text-foreground">{t("title")}</p>
					<p className="text-sm text-muted-foreground">{t("intro", { total })}</p>
				</div>
			</div>

			<ol className="list-decimal space-y-1 pl-9 text-sm text-muted-foreground">
				<li>{t("step1")}</li>
				<li>{t("step2")}</li>
				<li>{t("step3")}</li>
			</ol>

			<Button type="button" onClick={() => void handlePay()} disabled={busy} className="h-12 w-full">
				{busy ? (
					<span className="flex items-center gap-2">
						<LoadingSpinner />
						{tActions("processingPayment")}
					</span>
				) : (
					t("payButton")
				)}
			</Button>
		</div>
	);
};
