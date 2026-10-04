"use client";

import { useState, type FC } from "react";
import { Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CheckoutFragment } from "@/checkout/graphql";
import { executeETransferPayment } from "@/checkout/lib/payment/execute-etransfer-payment";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";
import { formatMoneyWithFallback } from "@/checkout/lib/utils/money";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";
import { Button } from "@/ui/components/ui/button";
import { needsCurrencyConversionNote } from "@/lib/etransfer";

type ETransferPaymentProps = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	onPaymentError: (message: string) => void;
	onBillingErrors: (errors: Record<string, string>, focusField?: string) => void;
	onPaymentActivityChange?: (active: boolean) => void;
};

/**
 * Interac e-Transfer option: no card form, just a place-order button. The transfer instructions arrive by email and
 * on the confirmation page (see `placeETransferOrder` and `ETransferInstructions`).
 */
export const ETransferPayment: FC<ETransferPaymentProps> = ({
	checkout,
	billing,
	onPaymentError,
	onBillingErrors,
	onPaymentActivityChange,
}) => {
	const t = useTranslations("checkout.payment.etransfer");
	const tActions = useTranslations("checkout.actions");
	const [busy, setBusy] = useState(false);
	const total = formatMoneyWithFallback(checkout.totalPrice?.gross);

	const handlePlaceOrder = async () => {
		if (busy) return;
		setBusy(true);
		onPaymentActivityChange?.(true);

		const result = await executeETransferPayment({ checkoutId: checkout.id, billing });

		if (result.ok) {
			// The page is navigating to the confirmation; keep the button busy until it unloads.
			return;
		}

		if (result.kind === "billing") {
			onBillingErrors(result.errors, result.focusField);
		} else {
			onPaymentError(result.message);
		}
		setBusy(false);
		onPaymentActivityChange?.(false);
	};

	return (
		<div className="wv-card space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-[0_0_12px_var(--wv-cyan-soft)]">
					<Landmark className="h-4 w-4" aria-hidden />
				</span>
				<div className="space-y-1">
					<p className="font-semibold text-foreground">{t("title")}</p>
					<p className="text-sm text-muted-foreground">
						{needsCurrencyConversionNote(checkout.totalPrice?.gross?.currency)
							? t("introConvert", { total })
							: t("intro", { total })}
					</p>
				</div>
			</div>

			<ol className="list-decimal space-y-1 pl-9 text-sm text-muted-foreground">
				<li>{t("step1")}</li>
				<li>{t("step2")}</li>
				<li>{t("step3")}</li>
			</ol>

			<Button type="button" onClick={() => void handlePlaceOrder()} disabled={busy} className="h-12 w-full">
				{busy ? (
					<span className="flex items-center gap-2">
						<LoadingSpinner />
						{tActions("placingOrder")}
					</span>
				) : (
					t("placeOrder")
				)}
			</Button>
		</div>
	);
};
