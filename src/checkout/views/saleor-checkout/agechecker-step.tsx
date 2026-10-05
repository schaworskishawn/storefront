"use client";

import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { ChevronLeft, ShieldCheck, ShieldAlert, Clock, Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/components/ui/button";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";
import { MobileStickyAction } from "./mobile-sticky-action";
import { useCheckoutStepNumber } from "@/checkout/hooks/use-checkout-steps";
import {
	createAgeCheckerVerificationAction,
	refreshAgeCheckerVerificationStatus,
} from "@/app/(checkout)/agechecker-actions";
import {
	needsAgeCheckerPopup,
	readAgeCheckerVerificationState,
	type AgeCheckerStatus,
} from "@/checkout/lib/identity-verification/agechecker/keys";
import { getAgeCheckerApiKey } from "@/checkout/lib/identity-verification/agechecker/env";
import { loadAgeCheckerWidget } from "@/checkout/lib/identity-verification/agechecker/widget";
import type { CheckoutFragment } from "@/checkout/graphql";

interface AgeCheckerStepProps {
	checkout: CheckoutFragment;
	isShippingRequired: boolean;
	onBack: () => void;
	onComplete: () => void;
}

/** Parses a `YYYY-MM-DD` `<input type="date">` value into AgeChecker's separate day/month/year fields. */
function parseDob(value: string): { dobYear: number; dobMonth: number; dobDay: number } | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const [, year, month, day] = match;
	return { dobYear: Number(year), dobMonth: Number(month), dobDay: Number(day) };
}

/**
 * "Verify Identity" checkout step — AgeChecker.Net provider. Independent of `identity-step.tsx`
 * (Stripe Identity) per the "keep both, decide later" call; `saleor-checkout.tsx` picks whichever
 * provider is configured.
 *
 * We already have the customer's name/address from the shipping (or billing) step, so this step
 * only asks for date of birth. Most verifications resolve instantly from that alone; a minority
 * need AgeChecker's own popup for a photo ID / e-signature / SMS code, which we resume in place
 * for the *same* verification instead of starting over.
 */
export const AgeCheckerStep: FC<AgeCheckerStepProps> = ({
	checkout,
	isShippingRequired,
	onBack,
	onComplete,
}) => {
	const t = useTranslations("checkout.agechecker");
	const tActions = useTranslations("checkout.actions");
	const stepNumber = useCheckoutStepNumber("IDENTITY", isShippingRequired);

	const persisted = readAgeCheckerVerificationState(checkout.metadata);
	const [status, setStatus] = useState<AgeCheckerStatus | null>(persisted.status);
	const [uuid, setUuid] = useState<string | null>(persisted.uuid);
	const [dob, setDob] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isCheckingStatus, setIsCheckingStatus] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isVerified = status === "accepted";
	const isBlocked = status === "denied" || status === "not_created";
	const isBusy = isSubmitting || isCheckingStatus;

	const address = checkout.shippingAddress ?? checkout.billingAddress;
	// A verification that already exists and only needs AgeChecker's popup (photo ID, signature, phone) is resumed, not
	// re-created: starting over would open a second verification and ask for the same documents again.
	const canResume = Boolean(uuid && status && needsAgeCheckerPopup(status));
	const canSubmit = !isBusy && (canResume || (Boolean(address) && parseDob(dob) !== null));

	const handleRefresh = useCallback(
		async (verificationUuid: string) => {
			setIsCheckingStatus(true);
			const result = await refreshAgeCheckerVerificationStatus(checkout.id, verificationUuid);
			setIsCheckingStatus(false);
			if (result.ok) {
				setStatus(result.status);
			} else {
				setError(result.error);
			}
		},
		[checkout.id],
	);

	const openPopupFor = useCallback(
		async (verificationUuid: string) => {
			const apiKey = getAgeCheckerApiKey();
			if (!apiKey) {
				setError(t("notConfigured"));
				return;
			}
			try {
				const widget = await loadAgeCheckerWidget(apiKey, {
					onStatusChanged: (event) => {
						if (event.uuid === verificationUuid) {
							setStatus(event.status);
						}
					},
					onClosed: () => {
						void handleRefresh(verificationUuid);
					},
				});
				widget.show(verificationUuid);
			} catch (widgetError) {
				console.error("[AgeChecker] Could not open the verification popup:", widgetError);
				setError(t("widgetLoadFailed"));
			}
		},
		[handleRefresh, t],
	);

	const handleSubmit = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();

			if (canResume && uuid) {
				setError(null);
				await openPopupFor(uuid);
				return;
			}

			const dobParts = parseDob(dob);
			if (!address || !dobParts) return;

			setError(null);
			setIsSubmitting(true);

			const result = await createAgeCheckerVerificationAction(checkout.id, {
				firstName: address.firstName,
				lastName: address.lastName,
				address: [address.streetAddress1, address.streetAddress2].filter(Boolean).join(", "),
				city: address.city,
				state: address.countryArea,
				zip: address.postalCode,
				country: address.country.code,
				...dobParts,
				...(checkout.email ? { email: checkout.email } : {}),
			});

			setIsSubmitting(false);

			if (!result.ok) {
				setError(result.error);
				return;
			}

			setStatus(result.status);
			setUuid(result.uuid ?? null);

			if (result.uuid && needsAgeCheckerPopup(result.status)) {
				await openPopupFor(result.uuid);
			}
		},
		[address, canResume, checkout.email, checkout.id, dob, openPopupFor, uuid],
	);

	// A previous attempt may have left us on "pending" (photo ID awaiting manual review) or a
	// popup-eligible status if the shopper closed the tab mid-flow — re-check once on mount rather
	// than trusting a possibly-stale value from metadata.
	useEffect(() => {
		if (uuid && (status === "pending" || (status && needsAgeCheckerPopup(status)))) {
			void handleRefresh(uuid);
		}
		// Only ever want this on mount for whatever status was persisted at load time.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const maxDob = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
		if (status === "pending") {
			return (
				<div
					className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
					role="status"
				>
					<Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
					<div>
						<p className="text-sm text-amber-800">{t("pending")}</p>
						<button
							type="button"
							onClick={() => uuid && void handleRefresh(uuid)}
							disabled={isBusy}
							className="mt-2 text-sm font-medium text-amber-900 underline disabled:opacity-50"
						>
							{t("checkStatus")}
						</button>
					</div>
				</div>
			);
		}
		if (isBlocked) {
			return (
				<div
					className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
					role="status"
				>
					<ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
					<p className="text-sm text-amber-800">{status === "not_created" ? t("notCreated") : t("denied")}</p>
				</div>
			);
		}
		return null;
	})();

	return (
		<form className="space-y-8" onSubmit={handleSubmit}>
			<section className="space-y-4">
				<div className="flex items-start gap-3">
					<Fingerprint className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
					<div>
						<h2 className="text-lg font-semibold">{t("title")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
					</div>
				</div>

				{!address ? <p className="text-sm text-destructive">{t("addressRequired")}</p> : null}

				{statusBanner}

				{error ? <p className="text-sm text-destructive">{error}</p> : null}

				{!isVerified ? (
					<div className="max-w-xs space-y-1.5">
						<label htmlFor="agechecker-dob" className="text-sm font-medium">
							{t("dobLabel")}
						</label>
						<input
							id="agechecker-dob"
							type="date"
							name="dob"
							value={dob}
							max={maxDob}
							onChange={(e) => setDob(e.target.value)}
							disabled={isBusy}
							required={!canResume}
							className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
						/>
					</div>
				) : null}

				{!isVerified ? (
					<Button type="submit" disabled={!canSubmit} className="h-12 w-full sm:w-auto sm:px-8">
						{isBusy ? (
							<span className="flex items-center gap-2">
								<LoadingSpinner />
								{isSubmitting ? t("verifying") : t("checkingStatus")}
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
				step={stepNumber}
				isShippingRequired={isShippingRequired}
				type="button"
				onAction={onComplete}
				disabled={!isVerified || isBusy}
			/>
		</form>
	);
};
