"use client";

import { useState } from "react";
import { Coins, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { applyVaporTokens, removeVaporTokens } from "@/app/(checkout)/rewards-actions";
import { Button } from "@/ui/components/ui/button";
import type { ServerCheckout } from "@/checkout/lib/checkout-types";
import { useCheckoutBrowseLocale } from "@/checkout/providers/checkout-browse";
import { useCheckoutData } from "@/checkout/providers/checkout-data";
import { localeConfig, getLocaleDefinition } from "@/config/locale";
import type { TokensErrorCode, TokensView } from "@/lib/rewards/checkout-flow";
import { centsForTokens } from "@/lib/rewards/tokens";

type VaporTokensPanelProps = {
	checkout: ServerCheckout;
	view: TokensView | null;
	/**
	 * "summary" (the order summary, on every step) shows what is applied and what the order earns, and points to the payment step.
	 * "payment" (the payment step) is the full card: balance, the Use button, and a way for a guest to sign in.
	 */
	variant?: "summary" | "payment";
	/** Takes a guest to where they can log in (the contact step). */
	onSignIn?: () => void;
	/** Called after tokens go on or off, like the promo code form's own change callback. */
	onCheckoutChange?: () => void;
};

const ERROR_KEYS = {
	disabled: "unavailable",
	"sign-in": "signIn",
	"not-yours": "notYours",
	"no-checkout": "unavailable",
	"no-tokens": "noTokens",
	unavailable: "unavailable",
	failed: "failed",
} as const satisfies Record<TokensErrorCode, string>;

/** Vapor Tokens on the checkout: the balance, a button to spend it, what is applied, and what the order will earn. */
export function VaporTokensPanel({
	checkout,
	view,
	variant = "summary",
	onSignIn,
	onCheckoutChange,
}: VaporTokensPanelProps) {
	const t = useTranslations("checkout.tokens");
	const localeSlug = useCheckoutBrowseLocale();
	const locale = getLocaleDefinition(localeSlug)?.bcp47 ?? localeConfig.default;
	const { setCheckout } = useCheckoutData();
	const [busy, setBusy] = useState<"apply" | "remove" | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (!view || view.status === "disabled" || view.status === "unavailable") return null;

	const currency = checkout.totalPrice?.gross?.currency ?? localeConfig.fallbackCurrency;
	const money = (cents: number) =>
		new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);

	if (view.status === "guest") {
		if (view.willEarnTokens <= 0) return null;
		if (variant === "payment") {
			return (
				<div className="rounded-lg border border-border bg-secondary/30 p-3">
					<div className="flex flex-wrap items-center gap-3">
						<Coins aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="min-w-[10rem] flex-1">
							<p className="text-sm font-medium">{t("title")}</p>
							<p className="text-xs text-muted-foreground">
								{t("guestEarnEstimate", { tokens: view.willEarnTokens })}
							</p>
						</div>
						{onSignIn ? (
							<Button
								type="button"
								variant="outline-solid"
								onClick={onSignIn}
								className="h-9 shrink-0 bg-white px-3 text-sm"
							>
								{t("signInAction")}
							</Button>
						) : null}
					</div>
				</div>
			);
		}
		return (
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				<Coins aria-hidden className="h-4 w-4 shrink-0" />
				{t("guestEarnEstimate", { tokens: view.willEarnTokens })}
			</p>
		);
	}

	const change = async (kind: "apply" | "remove") => {
		if (busy) return;
		setError(null);
		setBusy(kind);
		try {
			const result = await (kind === "apply" ? applyVaporTokens : removeVaporTokens)(checkout.id);
			if (!result.ok) {
				setError(
					kind === "remove" && result.code === "failed"
						? t("errors.removeFailed")
						: t(`errors.${ERROR_KEYS[result.code]}`),
				);
				return;
			}
			setCheckout(result.checkout);
			onCheckoutChange?.();
		} catch {
			setError(t(kind === "apply" ? "errors.failed" : "errors.removeFailed"));
		} finally {
			setBusy(null);
		}
	};

	const hasApplied = view.appliedLotIds.length > 0;
	const expiry = view.expiringSoon
		? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
				new Date(`${view.expiringSoon.firstDate}T00:00:00Z`),
			)
		: null;

	return (
		<div className="space-y-3">
			{hasApplied ? (
				<div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
					<Coins aria-hidden className="h-4 w-4 shrink-0 text-green-700" />
					<p className="min-w-0 flex-1 text-sm font-medium text-green-800">
						{view.coversOrder
							? t("coversOrder")
							: t("applied", {
									tokens: view.appliedTokens,
									amount: money(centsForTokens(view.appliedTokens)),
								})}
					</p>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={busy !== null}
						onClick={() => void change("remove")}
						aria-label={t("removeAriaLabel")}
						className="h-8 w-8 shrink-0 text-green-700 hover:bg-green-100 hover:text-green-800"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
			) : null}

			{view.canApply && variant === "summary" ? (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<Coins aria-hidden className="h-4 w-4 shrink-0" />
					{t("availableAtPayment", { tokens: view.balanceTokens })}
				</p>
			) : null}

			{view.canApply && variant === "payment" ? (
				<div className="rounded-lg border border-border bg-secondary/30 p-3">
					<div className="flex flex-wrap items-center gap-3">
						<Coins aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="min-w-[10rem] flex-1">
							<p className="text-sm font-medium">{t("title")}</p>
							<p className="text-xs text-muted-foreground">
								{t("balance", { tokens: view.balanceTokens, amount: money(view.balanceCents) })}
							</p>
						</div>
						<Button
							type="button"
							variant="outline-solid"
							disabled={busy !== null}
							onClick={() => void change("apply")}
							className="h-9 shrink-0 bg-white px-3 text-sm"
						>
							{busy === "apply" ? t("applying") : t("use")}
						</Button>
					</div>
					<p className="mt-2 text-xs text-muted-foreground">
						{t("rate", { amount: money(centsForTokens(100)) })}
					</p>
					{expiry && view.expiringSoon ? (
						<p className="mt-1 text-xs text-muted-foreground">
							{t("expiringSoon", { tokens: view.expiringSoon.tokens, date: expiry })}
						</p>
					) : null}
				</div>
			) : null}

			{error ? (
				<p className="text-sm text-destructive" role="alert">
					{error}
				</p>
			) : null}

			{view.willEarnTokens > 0 ? (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<Coins aria-hidden className="h-4 w-4 shrink-0" />
					{t("earnEstimate", { tokens: view.willEarnTokens })}
				</p>
			) : null}
		</div>
	);
}
