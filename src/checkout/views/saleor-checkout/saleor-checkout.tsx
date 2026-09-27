"use client";

import { useState, type FC } from "react";
import { useSearchParams } from "next/navigation";

import { useCheckout } from "@/checkout/hooks/use-checkout";
import { useCheckoutStep } from "@/checkout/hooks/use-checkout-step";
import { useCheckoutStepFromUrl } from "@/checkout/hooks/use-checkout-step-from-url";
import { useCustomerAttach } from "@/checkout/hooks/use-customer-attach";
import { useShippingDeliveries } from "@/checkout/hooks/use-shipping-deliveries";
import { useCheckoutSteps } from "@/checkout/hooks/use-checkout-steps";
import { CheckoutPageShell } from "./checkout-page-shell";
import { OrderSummary } from "./order-summary";
import { InformationStep } from "./information-step";
import { ShippingStep } from "./shipping-step";
import { PaymentStep } from "./payment-step";
import { useCheckoutTransition } from "@/checkout/hooks/use-checkout-transition";
import { CheckoutSkeleton } from "./checkout-skeleton";
import { PaymentCompletingScreen } from "./payment-completing-screen";

export const SaleorCheckout: FC = () => {
	const searchParams = useSearchParams()!;
	const transition = useCheckoutTransition();
	const { checkout, setCheckout, refetch } = useCheckout();
	// RootViews shows PaymentCompletingScreen while `transition === "completing"` — keep this
	// as defense-in-depth if SaleorCheckout is ever mounted outside RootViews.
	const [isPaymentBusy, setIsPaymentBusy] = useState(false);
	const isPaymentFlowActive = transition === "completing";
	const isCheckoutNavigationLocked = isPaymentFlowActive || isPaymentBusy;

	useCustomerAttach();

	const isShippingRequired = checkout?.isShippingRequired ?? true;
	const checkoutSteps = useCheckoutSteps(isShippingRequired);
	const urlStep = useCheckoutStepFromUrl(searchParams, isShippingRequired);
	const { currentStep, stepRef, goToStep, completeStep } = useCheckoutStep({
		isShippingRequired,
		searchParams,
		setCheckout,
	});

	const { deliveries: shippingDeliveries, isLoading: isLoadingShippingDeliveries } = useShippingDeliveries(
		checkout,
		currentStep.id === "SHIPPING",
	);

	if (isPaymentFlowActive) {
		return (
			<PaymentCompletingScreen
				isShippingRequired={isShippingRequired}
				storefrontChannel={checkout?.channel.slug}
			/>
		);
	}

	if (!checkout) {
		return <CheckoutSkeleton step={urlStep.index} isShippingRequired={isShippingRequired} />;
	}

	return (
		<CheckoutPageShell
			step={currentStep.index}
			onStepClick={
				isCheckoutNavigationLocked
					? undefined
					: (stepIndex) => {
							const step = checkoutSteps.find((s) => s.index === stepIndex);
							if (step) goToStep(step.id);
						}
			}
			isShippingRequired={isShippingRequired}
			storefrontChannel={checkout.channel.slug}
		>
			<main className="px-4 py-4 pb-24 md:px-8 md:py-6 md:pb-10 xl:px-20 xl:pb-16">
				<div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-12">
					<div className="min-w-0 flex-1">
						<div className="wv-card-summary mb-4 overflow-hidden rounded-xl border border-border bg-card xl:hidden">
							<OrderSummary checkout={checkout} onCheckoutChange={() => void refetch()} />
						</div>
						<div className="wv-card rounded-xl border border-border bg-card p-5 md:p-7">
							<div ref={stepRef} tabIndex={-1} className="outline-none">
								{currentStep.id === "INFO" ? (
									<InformationStep
										checkout={checkout}
										onComplete={(updated) =>
											completeStep(updated, updated.isShippingRequired ? "SHIPPING" : "PAYMENT")
										}
									/>
								) : null}
								{currentStep.id === "SHIPPING" ? (
									<ShippingStep
										checkout={checkout}
										deliveries={shippingDeliveries}
										isLoadingDeliveries={isLoadingShippingDeliveries}
										onBack={() => goToStep("INFO")}
										onComplete={(updated) => completeStep(updated, "PAYMENT")}
									/>
								) : null}
								{currentStep.id === "PAYMENT" ? (
									<PaymentStep
										checkout={checkout}
										onBack={() => goToStep(isShippingRequired ? "SHIPPING" : "INFO")}
										onGoToInformation={() => goToStep("INFO")}
										onPaymentBusyChange={setIsPaymentBusy}
									/>
								) : null}
							</div>
						</div>
					</div>

					<div className="hidden xl:block xl:w-[420px] xl:shrink-0">
						<div className="wv-card-summary overflow-hidden rounded-xl border border-border bg-card xl:sticky xl:top-6">
							<OrderSummary checkout={checkout} onCheckoutChange={() => void refetch()} />
						</div>
					</div>
				</div>
			</main>
		</CheckoutPageShell>
	);
};
