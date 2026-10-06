"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CheckoutFragment } from "@/checkout/graphql";
import { useCheckoutGatewayMessages } from "@/checkout/hooks/use-checkout-gateway-messages";
import { useCheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import {
	getCheckoutPayAmount,
	getCheckoutPayCurrency,
	isCheckoutFreeOrder,
	type CheckoutPriceChangeNotice,
} from "@/checkout/lib/payment/checkout-pay-amount";
import { clearPaymentCompleting } from "@/checkout/lib/payment/checkout-payment-completion";
import { executeWvPayPayment } from "@/checkout/lib/payment/execute-wvpay-payment";
import { formatMoneyWithFallback, getFormattedMoney } from "@/checkout/lib/utils/money";
import { useCheckoutData } from "@/checkout/providers/checkout-data";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";
import { Button } from "@/ui/components/ui/button";
import { Checkbox } from "@/ui/components/ui/checkbox";
import { Input } from "@/ui/components/ui/input";
import { buildInstallmentPlan } from "@/lib/installments/plan";
import { InstallmentsSchedule } from "@/checkout/components/payment/installments/installments-schedule";
import { FreeOrderCheckout } from "@/checkout/components/payment/stripe/free-order-checkout";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";
import { loadAcceptJs, tokenizeCard } from "./accept-js";
import {
	detectBrand,
	formatCardNumber,
	formatExpiry,
	parseExpiry,
	validateCard,
	type CardErrors,
} from "./card-validation";
import { useWvPayGatewayConfig } from "./use-wvpay-gateway-config";

type WvPayPaymentProps = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	onPaymentError: (message: string) => void;
	onBillingErrors: (errors: Record<string, string>, focusField?: string) => void;
	onPriceChangeNotice: (notice: CheckoutPriceChangeNotice) => void;
	onPaymentActivityChange?: (active: boolean) => void;
	/** Pay in 4: shows the schedule, asks the shopper to agree to it, and charges only the deposit. */
	installments?: boolean;
};

const BRAND_LABELS = {
	visa: "Visa",
	mastercard: "Mastercard",
	amex: "American Express",
	discover: "Discover",
	unknown: "",
};

export const WvPayPayment: FC<WvPayPaymentProps> = (props) => {
	if (isCheckoutFreeOrder(props.checkout)) {
		return (
			<FreeOrderCheckout
				checkout={props.checkout}
				billing={props.billing}
				onError={props.onPaymentError}
				onBillingErrors={props.onBillingErrors}
				onPaymentActivityChange={props.onPaymentActivityChange}
			/>
		);
	}

	return <WvPayCardForm {...props} />;
};

const WvPayCardForm: FC<WvPayPaymentProps> = ({
	checkout,
	billing,
	onPaymentError,
	onBillingErrors,
	onPriceChangeNotice,
	onPaymentActivityChange,
	installments = false,
}) => {
	const t = useTranslations("checkout.payment.wvpay");
	const tInstallments = useTranslations("checkout.payment.installments");
	const tActions = useTranslations("checkout.actions");
	const paymentMessages = useCheckoutPaymentMessages();
	const gatewayMessages = useCheckoutGatewayMessages();
	const { refreshCheckout } = useCheckoutData();
	const config = useWvPayGatewayConfig(checkout);

	const [scriptState, setScriptState] = useState<"loading" | "ready" | "error">("loading");
	const [number, setNumber] = useState("");
	const [expiry, setExpiry] = useState("");
	const [cvv, setCvv] = useState("");
	const [errors, setErrors] = useState<CardErrors>({});
	const [fieldMessage, setFieldMessage] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [agreed, setAgreed] = useState(false);
	const [consentMissing, setConsentMissing] = useState(false);

	const brand = detectBrand(number);
	const totalStr = formatMoneyWithFallback(checkout.totalPrice?.gross);
	const payAmount = getCheckoutPayAmount(checkout);
	const currency = getCheckoutPayCurrency(checkout);
	// The schedule is worked out from the same total Saleor will check the deposit against.
	const plan = installments && payAmount !== null ? buildInstallmentPlan(payAmount) : null;

	useEffect(() => {
		if (config.status !== "ready") return;
		let cancelled = false;
		loadAcceptJs(config.authorizenet.environment)
			.then(() => !cancelled && setScriptState("ready"))
			.catch(() => !cancelled && setScriptState("error"));
		return () => {
			cancelled = true;
		};
	}, [config]);

	// Name and ZIP help the processor's fraud checks; they come from the billing form (or shipping when "same as shipping").
	const holder = useMemo(() => {
		const useShipping = billing.sameAsBilling && billing.hasShippingAddress && billing.shippingAddress;
		const first = useShipping ? billing.shippingAddress?.firstName : billing.billingData.formData.firstName;
		const last = useShipping ? billing.shippingAddress?.lastName : billing.billingData.formData.lastName;
		const zip = useShipping ? billing.shippingAddress?.postalCode : billing.billingData.formData.postalCode;
		return { fullName: [first, last].filter(Boolean).join(" ").trim(), zip: (zip ?? "").trim() };
	}, [billing]);

	if (config.status === "loading") {
		return (
			<div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
				<LoadingSpinner />
				{t("loading")}
			</div>
		);
	}

	if (installments && config.status === "ready" && !config.offersInstallments) {
		return (
			<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4" role="alert">
				<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
				<p className="text-sm text-amber-800">{tInstallments("notConfigured")}</p>
			</div>
		);
	}

	if (config.status === "error" || scriptState === "error") {
		const message =
			config.status === "error" && config.reason === "not_configured"
				? t("notConfigured")
				: config.status === "error" && config.message
					? config.message
					: t("loadFailed");
		return (
			<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4" role="alert">
				<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
				<p className="text-sm text-amber-800">{message}</p>
			</div>
		);
	}

	const handlePay = async () => {
		if (busy || config.status !== "ready") return;
		onPaymentError("");
		setFieldMessage(null);

		if (installments && !agreed) {
			setConsentMissing(true);
			return;
		}

		const cardErrors = validateCard({ number, expiry, cvv });
		setErrors(cardErrors);
		if (Object.keys(cardErrors).length > 0) return;

		const parsedExpiry = parseExpiry(expiry);
		if (!parsedExpiry) return;

		setBusy(true);
		onPaymentActivityChange?.(true);
		let orderPlaced = false;

		const result = await executeWvPayPayment({
			checkout,
			billing,
			refreshCheckout,
			messages: paymentMessages,
			gatewayMessages,
			installments,
			tokenize: () =>
				tokenizeCard({
					card: {
						number,
						month: parsedExpiry.month,
						year: parsedExpiry.year,
						cvv,
						fullName: holder.fullName,
						zip: holder.zip,
					},
					apiLoginId: config.authorizenet.apiLoginId,
					clientKey: config.authorizenet.clientKey,
				}),
		});

		if (result.ok) {
			orderPlaced = true;
		} else if (result.kind === "billing") {
			onBillingErrors(result.errors, result.focusField);
		} else if (result.kind === "price_change") {
			onPriceChangeNotice(result.notice);
		} else if (result.kind === "card") {
			if (result.field)
				setErrors({
					[result.field]:
						result.field === "number"
							? "numberInvalid"
							: result.field === "expiry"
								? "expiryInvalid"
								: "cvvInvalid",
				});
			setFieldMessage(result.field ? null : t("cardRejected"));
		} else {
			onPaymentError(result.message);
		}

		if (!orderPlaced) {
			clearPaymentCompleting();
			setBusy(false);
			onPaymentActivityChange?.(false);
		}
	};

	const fieldClass = "h-11 bg-white";

	return (
		<div className="space-y-4 rounded-lg border border-border bg-card p-4 md:p-5">
			{plan && currency ? <InstallmentsSchedule plan={plan} currency={currency} /> : null}

			<div className="space-y-4">
				<div className="space-y-1.5">
					<label htmlFor="wvpay-number" className="flex items-center justify-between text-sm font-medium">
						{t("cardNumber")}
						<span className="text-xs font-normal text-muted-foreground">{BRAND_LABELS[brand]}</span>
					</label>
					<Input
						id="wvpay-number"
						name="cardnumber"
						inputMode="numeric"
						autoComplete="cc-number"
						placeholder="1234 1234 1234 1234"
						value={number}
						onChange={(event) => setNumber(formatCardNumber(event.target.value))}
						aria-invalid={Boolean(errors.number)}
						disabled={busy}
						className={fieldClass}
					/>
					{errors.number ? (
						<p className="text-sm text-destructive" role="alert">
							{t(errors.number)}
						</p>
					) : null}
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-1.5">
						<label htmlFor="wvpay-expiry" className="text-sm font-medium">
							{t("expiry")}
						</label>
						<Input
							id="wvpay-expiry"
							name="cc-exp"
							inputMode="numeric"
							autoComplete="cc-exp"
							placeholder="MM / YY"
							value={expiry}
							onChange={(event) => setExpiry(formatExpiry(event.target.value))}
							aria-invalid={Boolean(errors.expiry)}
							disabled={busy}
							className={fieldClass}
						/>
						{errors.expiry ? (
							<p className="text-sm text-destructive" role="alert">
								{t(errors.expiry)}
							</p>
						) : null}
					</div>
					<div className="space-y-1.5">
						<label htmlFor="wvpay-cvv" className="text-sm font-medium">
							{t("cvv")}
						</label>
						<Input
							id="wvpay-cvv"
							name="cvc"
							inputMode="numeric"
							autoComplete="cc-csc"
							placeholder={brand === "amex" ? "1234" : "123"}
							maxLength={4}
							value={cvv}
							onChange={(event) => setCvv(event.target.value.replace(/\D/g, ""))}
							aria-invalid={Boolean(errors.cvv)}
							disabled={busy}
							className={fieldClass}
						/>
						{errors.cvv ? (
							<p className="text-sm text-destructive" role="alert">
								{t(errors.cvv)}
							</p>
						) : null}
					</div>
				</div>
			</div>

			{plan ? (
				<div className="space-y-1.5">
					<label className="flex cursor-pointer items-start gap-3 text-sm">
						<Checkbox
							checked={agreed}
							onCheckedChange={(checked) => {
								setAgreed(checked);
								if (checked) setConsentMissing(false);
							}}
							disabled={busy}
							aria-invalid={consentMissing}
							className="mt-0.5"
						/>
						<span>{tInstallments("consent")}</span>
					</label>
					{consentMissing ? (
						<p className="text-sm text-destructive" role="alert">
							{tInstallments("consentRequired")}
						</p>
					) : null}
				</div>
			) : null}

			{fieldMessage ? (
				<p className="text-sm text-destructive" role="alert">
					{fieldMessage}
				</p>
			) : null}

			<p className="flex items-start gap-2 text-xs text-muted-foreground">
				<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
				{t("securityNote")}
			</p>

			<Button
				type="button"
				className="h-12 w-full md:w-auto md:min-w-[200px]"
				disabled={busy || scriptState !== "ready" || (installments && !plan)}
				onClick={() => void handlePay()}
			>
				{busy ? (
					<span className="flex items-center justify-center gap-2">
						<LoadingSpinner />
						{tActions("processingPayment")}
					</span>
				) : plan && currency ? (
					tInstallments("payToday", { amount: getFormattedMoney({ amount: plan.deposit, currency }) })
				) : (
					tActions("payTotal", { total: totalStr })
				)}
			</Button>
		</div>
	);
};
