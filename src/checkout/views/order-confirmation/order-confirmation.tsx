"use client";

import { useEffect } from "react";
import { clearPaymentCompleting } from "@/checkout/lib/payment/checkout-payment-completion";
import { useCheckoutBrowseLocale } from "@/checkout/providers/checkout-browse";
import { CheckCircle, Mail, MapPin, Package, CreditCard } from "lucide-react";
import { Button } from "@/ui/components/ui/button";
import { useOrder } from "@/checkout/hooks/use-order";
import { useUser } from "@/checkout/hooks/use-user";
import { OrderSummary } from "@/checkout/views/saleor-checkout/order-summary";
import { OrderConfirmationPageShell } from "./order-confirmation-page-shell";
import { PageNotFound } from "@/checkout/views/page-not-found";
import { useTranslations } from "next-intl";
import { getLocaleDefinition } from "@/config/locale";
import { parseETransferDetails } from "@/lib/etransfer";
import { ETransferInstructions } from "./etransfer-instructions";
import { InstallmentsNotice } from "./installments-notice";
import { TokensEarnedNotice } from "./tokens-earned-notice";
import { estimateOrderTokens } from "@/checkout/lib/vapor-tokens";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { isInstallmentsEnabled } from "@/checkout/lib/payment/providers/installments";
import { buildInstallmentPlan } from "@/lib/installments/plan";

/** Format address for display */
function formatAddress(address: {
	streetAddress1?: string | null;
	city?: string | null;
	postalCode?: string | null;
	country?: { country?: string | null } | null;
}) {
	return [address.streetAddress1, address.city, address.postalCode, address.country?.country]
		.filter(Boolean)
		.join(", ");
}

/**
 * Order confirmation — rendered at `/checkout/complete?order=…` after successful payment.
 */
export const OrderConfirmation = () => {
	const { order } = useOrder();
	const { authenticated } = useUser();
	const storefrontLocale = useCheckoutBrowseLocale();
	const t = useTranslations("checkout.confirmation");
	const tErrors = useTranslations("checkout.errors");
	const tActions = useTranslations("checkout.actions");
	const localeBcp47 = getLocaleDefinition(storefrontLocale)?.bcp47 ?? "en-US";

	useEffect(() => {
		if (!order?.id) {
			return;
		}

		clearPaymentCompleting();
	}, [order?.id]);

	if (!order) {
		return <PageNotFound title={tErrors("orderNotFoundTitle")} message={tErrors("orderNotFoundMessage")} />;
	}

	const channel = order.channel?.slug ?? "";

	const estimatedDelivery = new Date();
	estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);
	const formattedDelivery = estimatedDelivery.toLocaleDateString(localeBcp47, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	const shippingAddress = order.shippingAddress;
	const billingAddress = order.billingAddress;
	const email = order.userEmail || "";

	// An Interac e-Transfer order is placed unpaid: show how to pay it until staff mark it paid.
	const eTransfer = order.isPaid ? null : parseETransferDetails(order.metadata);
	const orderTotal = order.total?.gross;

	// A Pay in 4 order is placed part-paid: show what was paid and when the rest is charged. The dates count from the order's
	// own date, so they match the emails and don't move if the page is opened later.
	const installmentsPlan =
		!eTransfer && orderTotal && isInstallmentsEnabled() && order.chargeStatus === "PARTIAL"
			? buildInstallmentPlan(orderTotal.amount)
			: null;

	// Only a signed-in customer earns Vapor Tokens: a guest order earns nothing, so the note stays off.
	const rewards = readRewardsConfig();
	const tokensEarned =
		rewards.enabled && authenticated ? estimateOrderTokens(order, rewards.tokensPerDollar) : 0;

	return (
		<OrderConfirmationPageShell storefrontChannel={channel}>
			<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				<div className="flex flex-col gap-8 md:flex-row">
					<div className="order-2 min-w-0 flex-1 md:order-1">
						<div className="rounded-lg border border-border bg-card p-6 md:p-8">
							<div className="space-y-8">
								<div className="space-y-4 text-center">
									<div className="flex justify-center">
										<div className="relative">
											<div className="absolute inset-0 animate-ping rounded-full bg-green-400/30" />
											<CheckCircle className="relative h-16 w-16 text-green-500" />
										</div>
									</div>
									<div>
										<p className="text-muted-foreground">{t("orderNumber", { number: order.number })}</p>
										<h1 className="mt-1 text-balance text-h1">{t("thankYou")}</h1>
									</div>
								</div>

								{eTransfer && orderTotal ? (
									<ETransferInstructions
										details={eTransfer}
										orderNumber={String(order.number)}
										amount={orderTotal.amount}
										currency={orderTotal.currency}
										locale={localeBcp47}
									/>
								) : null}

								{installmentsPlan && orderTotal ? (
									<InstallmentsNotice
										plan={installmentsPlan}
										currency={orderTotal.currency}
										orderedAt={new Date(order.created)}
									/>
								) : null}

								{tokensEarned > 0 ? <TokensEarnedNotice tokens={tokensEarned} /> : null}

								<div className="overflow-hidden rounded-lg border border-border">
									<div className="border-b border-border bg-secondary/50 p-4">
										<h2 className="font-semibold">
											{eTransfer ? t("etransfer.reservedTitle") : t("confirmedTitle")}
										</h2>
										<p className="mt-1 text-sm text-muted-foreground">
											{eTransfer ? t("etransfer.reservedEmail", { email }) : t("confirmedEmail", { email })}
										</p>
									</div>

									<div className="space-y-4 p-4">
										<div className="flex items-start gap-3">
											<Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">{t("emailSent")}</p>
												<p className="text-sm text-muted-foreground">{email}</p>
											</div>
										</div>
										{shippingAddress && (
											<div className="flex items-start gap-3">
												<MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
												<div>
													<p className="text-sm font-medium">{t("shippingAddress")}</p>
													<p className="text-sm text-muted-foreground">{formatAddress(shippingAddress)}</p>
												</div>
											</div>
										)}
										{billingAddress && (
											<div className="flex items-start gap-3">
												<CreditCard className="mt-0.5 h-5 w-5 text-muted-foreground" />
												<div>
													<p className="text-sm font-medium">{t("billingAddress")}</p>
													<p className="text-sm text-muted-foreground">{formatAddress(billingAddress)}</p>
												</div>
											</div>
										)}
										{eTransfer || installmentsPlan ? null : (
											<div className="flex items-start gap-3">
												<Package className="mt-0.5 h-5 w-5 text-muted-foreground" />
												<div>
													<p className="text-sm font-medium">{t("estimatedDelivery")}</p>
													<p className="text-sm text-muted-foreground">{formattedDelivery}</p>
												</div>
											</div>
										)}
									</div>
								</div>

								<div className="flex justify-center">
									<Button
										type="button"
										className="min-w-[200px] px-8"
										onClick={() => {
											// This fork's storefront uses flat routes (/shop), not the stock Paper
											// template's /{locale}/{channel} scheme that `navigateToStorefrontHome`
											// builds — that was landing shoppers on the generic, unbranded template
											// homepage instead of the real site. `window.location.assign` (not a
											// Next `Link`) stays consistent with checkout supporting a separate
											// origin via `NEXT_PUBLIC_CHECKOUT_URL` (see `@paper/session-bridge`).
											window.location.assign("/shop");
										}}
									>
										{tActions("continueShopping")}
									</Button>
								</div>
							</div>
						</div>
					</div>

					<div className="order-1 md:order-2 md:shrink-0 md:basis-[30%]">
						<div className="overflow-hidden rounded-lg border border-border bg-card md:sticky md:top-8">
							<OrderSummary order={order} editable={false} />
						</div>
					</div>
				</div>
			</main>
		</OrderConfirmationPageShell>
	);
};
