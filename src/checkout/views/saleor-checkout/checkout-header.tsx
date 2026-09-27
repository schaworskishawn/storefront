"use client";

import { useTranslations } from "next-intl";
import { useCheckoutSteps } from "@/checkout/hooks/use-checkout-steps";
import { WvHeader } from "@/ui/sections/wv-home/wv-chrome";

interface CheckoutHeaderProps {
	step: number;
	onStepClick?: (step: number) => void;
	isShippingRequired?: boolean;
	storefrontChannel?: string | null;
}

const bungee = "font-[family-name:var(--font-bungee)]";

/** Site header plus the "Secure Checkout" hero and 3-step stepper (Figma 6.09). */
export function CheckoutHeader({ step, onStepClick, isShippingRequired = true }: CheckoutHeaderProps) {
	const t = useTranslations("checkout.steps");
	const steps = useCheckoutSteps(isShippingRequired).map((s) => ({ number: s.index, label: s.label }));

	return (
		<>
			<WvHeader />
			<section className="flex flex-col gap-2 px-4 pb-4 pt-6 md:px-8 md:pt-8 xl:gap-4 xl:px-20 xl:pb-6 xl:pt-10">
				<h1
					className={`${bungee} text-[22px] uppercase tracking-[-1px] text-white md:text-[30px] xl:text-[36px]`}
				>
					Secure Checkout
				</h1>
				<nav aria-label={t("stepsAriaLabel")} className="flex items-center gap-3 py-3 xl:gap-4 xl:py-4">
					{steps.map((s, i) => {
						const state = step > s.number ? "done" : step === s.number ? "active" : "upcoming";
						return (
							<div
								key={s.number}
								className="flex min-w-0 flex-1 items-center gap-2 last:flex-none md:gap-3 xl:gap-4"
							>
								<button
									type="button"
									onClick={() => state === "done" && onStepClick?.(s.number)}
									disabled={state !== "done"}
									aria-current={state === "active" ? "step" : undefined}
									className="flex items-center gap-2 disabled:cursor-default"
								>
									<span className="wv-stepper-dot" data-state={state}>
										{state === "done" ? "✓" : s.number}
									</span>
									<span
										className={`text-[11px] font-bold uppercase xl:text-xs ${state === "active" ? "" : "hidden sm:inline"} ${
											state === "active"
												? "text-[var(--wv-cyan-soft)]"
												: state === "done"
													? "text-[var(--q-text-nav)]"
													: "text-[var(--q-text-mute)]"
										}`}
									>
										{s.label}
									</span>
								</button>
								{i < steps.length - 1 && (
									<div
										aria-hidden
										className={`h-px min-w-4 flex-1 ${step > s.number ? "bg-[var(--wv-cyan-soft)]/60" : "bg-[var(--wv-control)]"}`}
									/>
								)}
							</div>
						);
					})}
				</nav>
			</section>
		</>
	);
}
