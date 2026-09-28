"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { ChevronLeft, ShieldCheck, ShieldAlert, Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/components/ui/button";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";
import { MobileStickyAction } from "./mobile-sticky-action";
import { useCheckoutStepNumber } from "@/checkout/hooks/use-checkout-steps";
import {
	createIdentityVerification,
	refreshIdentityVerificationStatus,
} from "@/app/(checkout)/identity-actions";
import {
	readIdentityVerificationState,
	type IdentityVerificationStatus,
} from "@/checkout/lib/identity-verification/keys";
import { getStripeIdentityPublishableKey } from "@/checkout/lib/identity-verification/env";
import type { CheckoutFragment } from "@/checkout/graphql";

interface IdentityStepProps {
	checkout: CheckoutFragment;
	isShippingRequired: boolean;
	onBack: () => void;
	onComplete: () => void;
}

/**
 * "Verify Identity" checkout step — required before payment when Stripe Identity is configured
 * (see `checkout/lib/identity-verification/`). We never handle the ID document ourselves: Stripe's
 * hosted `verifyIdentity()` modal captures and stores it; this step only tracks pass/fail status.
 */
export const IdentityStep: FC<IdentityStepProps> = ({ checkout, isShippingRequired, onBack, onComplete }) => {
	const t = useTranslations("checkout.identity");
	const tActions = useTranslations("checkout.actions");
	const identityStepNumber = useCheckoutStepNumber("IDENTITY", isShippingRequired);

	const persisted = readIdentityVerificationState(checkout.metadata);
	const [status, setStatus] = useState<IdentityVerificationStatus | null>(persisted.status);
	const [sessionId, setSessionId] = useState<string | null>(persisted.sessionId);
	const [isStarting, setIsStarting] = useState(false);
	const [isCheckingStatus, setIsCheckingStatus] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const stripeRef = useRef<import("@stripe/stripe-js").Stripe | null>(null);

	const isVerified = status === "verified";
	const isBusy = isStarting || isCheckingStatus;

	const handleStart = useCallback(async () => {
		setError(null);
		setIsStarting(true);

		try {
			if (!stripeRef.current) {
				const publishableKey = getStripeIdentityPublishableKey();
				if (!publishableKey) {
					setError(t("notConfigured"));
					setIsStarting(false);
					return;
				}
				const { loadStripe } = await import("@stripe/stripe-js");
				stripeRef.current = await loadStripe(publishableKey);
			}

			const stripe = stripeRef.current;
			if (!stripe) {
				setError(t("notConfigured"));
				setIsStarting(false);
				return;
			}

			const session = await createIdentityVerification(checkout.id);
			if (!session.ok) {
				setError(session.error);
				setIsStarting(false);
				return;
			}

			setSessionId(session.sessionId);
			setStatus("processing");
			setIsStarting(false);

			// Opens Stripe's own hosted capture UI (camera/upload + selfie match). Resolves once the
			// shopper finishes or closes it — this is *not* the verification result, just "the modal
			// flow ended"; the actual pass/fail comes from the status read right after.
			const { error: stripeError } = await stripe.verifyIdentity(session.clientSecret);
			if (stripeError) {
				setError(stripeError.message ?? t("modalFailed"));
			}

			setIsCheckingStatus(true);
			const statusResult = await refreshIdentityVerificationStatus(checkout.id, session.sessionId);
			setIsCheckingStatus(false);
			if (statusResult.ok) {
				setStatus(statusResult.status);
				if (statusResult.status === "verified") {
					setError(null);
				}
			} else {
				setError(statusResult.error);
			}
		} catch {
			setIsStarting(false);
			setIsCheckingStatus(false);
			setError(t("modalFailed"));
		}
	}, [checkout.id, t]);

	// If a previous attempt left us mid-flight (e.g. tab closed during the modal), re-check the
	// live status once on mount instead of trusting a possibly-stale "processing" from metadata.
	useEffect(() => {
		if (status === "processing" && sessionId) {
			setIsCheckingStatus(true);
			refreshIdentityVerificationStatus(checkout.id, sessionId)
				.then((result) => {
					if (result.ok) setStatus(result.status);
				})
				.finally(() => setIsCheckingStatus(false));
		}
		// Only ever want this on mount for whatever status was persisted at load time.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const statusBanner = (() => {
		if (isVerified) {
			return (
				<div
					className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
					role="status"
				>
					<ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
					<p className="text-sm font-medium text-green-800">{t("verified")}</p>
				</div>
			);
		}
		if (status === "requires_input" || status === "canceled") {
			return (
				<div
					className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
					role="status"
				>
					<ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
					<p className="text-sm text-amber-800">{t("needsRetry")}</p>
				</div>
			);
		}
		return null;
	})();

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div className="flex items-start gap-3">
					<Fingerprint className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
					<div>
						<h2 className="text-lg font-semibold">{t("title")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
					</div>
				</div>

				{statusBanner}

				{error ? <p className="text-sm text-destructive">{error}</p> : null}

				{!isVerified ? (
					<Button
						type="button"
						onClick={handleStart}
						disabled={isBusy}
						className="h-12 w-full sm:w-auto sm:px-8"
					>
						{isBusy ? (
							<span className="flex items-center gap-2">
								<LoadingSpinner />
								{isStarting ? t("preparing") : t("checkingStatus")}
							</span>
						) : status ? (
							t("tryAgain")
						) : (
							t("verifyButton")
						)}
					</Button>
				) : null}

				<p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
			</section>

			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={onBack}
					disabled={isBusy}
					className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
				>
					<ChevronLeft className="h-4 w-4" />
					{isShippingRequired ? tActions("returnToShipping") : tActions("returnToInformation")}
				</button>
				<Button
					type="button"
					onClick={onComplete}
					disabled={!isVerified || isBusy}
					className="hidden h-12 px-8 md:flex"
				>
					{tActions("continueToPayment")}
				</Button>
			</div>

			<MobileStickyAction
				step={identityStepNumber}
				isShippingRequired={isShippingRequired}
				type="button"
				onAction={onComplete}
				disabled={!isVerified || isBusy}
			/>
		</div>
	);
};
