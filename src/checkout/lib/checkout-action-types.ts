import type { CheckoutErrorFragment, ValidationRulesFragment } from "@/checkout/graphql";
import type { DeliveryOption, ServerCheckout } from "@/checkout/lib/checkout-types";
import type { AgeCheckerStatus } from "@/checkout/lib/identity-verification/agechecker/keys";
import type { IdentityVerificationStatus } from "@/checkout/lib/identity-verification/keys";
import type { TransactionInitializePayload } from "@/checkout/lib/payment/types";

export type CheckoutFieldError = Pick<CheckoutErrorFragment, "field" | "message" | "code">;

export type CheckoutActionResult =
	| { ok: true; checkout: ServerCheckout }
	| { ok: false; error?: string; fieldErrors?: CheckoutFieldError[] };

export type SimpleActionResult =
	| { ok: true }
	| { ok: false; error?: string; fieldErrors?: CheckoutFieldError[] };

export type DeliveryOptionsActionResult =
	| { ok: true; deliveries: DeliveryOption[] }
	| { ok: false; error: string };

export type AddressValidationRulesActionResult =
	| { ok: true; rules: ValidationRulesFragment }
	| { ok: false; error: string };

export type TransactionInitializeActionResult =
	| { ok: true; data: NonNullable<TransactionInitializePayload> }
	| { ok: false; error: string };

/** What `checkoutComplete` reports about the new order — enough for confirmation emails. */
export type CompletedOrderSummary = {
	number: string;
	userEmail: string | null;
	total: { amount: number; currency: string } | null;
};

export type ETransferOrderActionResult = { ok: true; orderId: string } | { ok: false; error: string };

export type CheckoutCompleteActionResult =
	| { ok: true; orderId: string; order?: CompletedOrderSummary }
	| { ok: false; error: string; fieldErrors?: CheckoutFieldError[] };

export type PaymentGatewayInitializePayload = {
	errors?: ReadonlyArray<{ message?: string | null }> | null;
	gatewayConfigs?: ReadonlyArray<{
		id: string;
		data?: unknown;
		errors?: ReadonlyArray<{ message?: string | null }> | null;
	}> | null;
};

export type PaymentGatewaysInitializeActionResult =
	| { ok: true; data: NonNullable<PaymentGatewayInitializePayload> }
	| { ok: false; error: string };

export type TransactionProcessPayload = {
	errors?: ReadonlyArray<{ message?: string | null }> | null;
	transactionEvent?: { type?: string | null; message?: string | null } | null;
	transaction?: { id?: string | null } | null;
	data?: unknown;
};

export type TransactionProcessActionResult =
	| { ok: true; data: NonNullable<TransactionProcessPayload> }
	| { ok: false; error: string };

export type IdentityVerificationSessionActionResult =
	| { ok: true; clientSecret: string; sessionId: string }
	| { ok: false; error: string };

export type IdentityVerificationStatusActionResult =
	| { ok: true; status: IdentityVerificationStatus }
	| { ok: false; error: string };

export type AgeCheckerVerificationActionResult =
	| { ok: true; uuid?: string; status: AgeCheckerStatus }
	| { ok: false; error: string };
