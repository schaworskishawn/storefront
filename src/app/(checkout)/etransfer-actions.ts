"use server";

/**
 * Server action for the Interac e-Transfer payment method (see `src/lib/etransfer.ts` for the model).
 *
 * There is no payment app involved: the transfer details go onto the checkout's public metadata (Saleor copies it to
 * the order), the checkout is completed UNPAID, and the customer + store inbox are emailed. Staff mark the order paid in
 * the Saleor Dashboard once the money lands. Needs "Allow unpaid orders" on the Saleor channel.
 */
import { after } from "next/server";
import {
	CheckoutMetadataUpdateDocument,
	type CheckoutMetadataUpdateMutation,
	type CheckoutMetadataUpdateMutationVariables,
} from "@/checkout/graphql";
import type { ETransferOrderActionResult } from "@/checkout/lib/checkout-action-types";
import { fetchCheckoutOnServer } from "@/checkout/lib/server/fetch-checkout";
import { getCheckoutServerTranslations } from "@/checkout/lib/server/get-checkout-server-translations";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { runCheckoutComplete } from "@/app/(checkout)/actions";
import { sendEmail, sendNotification } from "@/lib/email";
import {
	buildETransferEmail,
	buildETransferMetadata,
	eTransferReference,
	formatETransferAmount,
	isETransferCountry,
	isETransferCurrency,
	parseETransferDetails,
	readETransferConfig,
} from "@/lib/etransfer";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { buildOrderConfirmationPath } from "@paper/session-bridge";

const checkoutMetadataUpdateDocument = toTypedDocument<
	CheckoutMetadataUpdateMutation,
	CheckoutMetadataUpdateMutationVariables
>(CheckoutMetadataUpdateDocument);

function absoluteUrl(path: string): string | null {
	const base = process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/+$/, "");
	return base ? `${base}${path}` : null;
}

/**
 * Places the order unpaid and sends the transfer instructions. Never throws for email problems: the order exists and
 * the confirmation page shows the same instructions, so a failed email only costs the customer a convenience.
 */
export async function placeETransferOrder(checkoutId: string): Promise<ETransferOrderActionResult> {
	const { server: t } = await getCheckoutServerTranslations();

	const config = readETransferConfig();
	if (!config) {
		return { ok: false, error: t("eTransferUnavailable") };
	}

	const live = await fetchCheckoutOnServer(checkoutId);
	if (!live.ok || !live.checkout) {
		return { ok: false, error: t("totalVerifyFailed") };
	}
	if (!isETransferCurrency(live.checkout.totalPrice?.gross?.currency)) {
		return { ok: false, error: t("eTransferCurrency") };
	}
	if (
		!isETransferCountry(
			live.checkout.shippingAddress?.country?.code ?? live.checkout.billingAddress?.country?.code,
		)
	) {
		return { ok: false, error: t("eTransferCountry") };
	}

	// Record how to pay on the checkout; Saleor copies public metadata onto the order at checkoutComplete.
	const metadataEntries = buildETransferMetadata(config, new Date());
	const metadata = await executeAuthenticatedGraphQL(checkoutMetadataUpdateDocument, {
		variables: { id: checkoutId, input: metadataEntries },
		cache: "no-cache",
	});
	if (!metadata.ok || metadata.data.updateMetadata?.errors?.length) {
		console.error("[e-Transfer] could not save transfer details on checkout", checkoutId);
		return { ok: false, error: t("eTransferFailed") };
	}

	const result = await runCheckoutComplete(checkoutId);
	if (!result.ok) {
		if (result.fieldErrors?.some((error) => error.code === "CHECKOUT_NOT_FULLY_PAID")) {
			console.error(
				'[e-Transfer] Saleor refused an unpaid order — switch on "Allow unpaid orders" for this channel (Dashboard → Configuration → Channels).',
			);
			return { ok: false, error: t("eTransferNotAllowed") };
		}
		return { ok: false, error: result.error };
	}

	const orderNumber = result.order?.number;
	const total = result.order?.total ?? null;
	const customerEmail = result.order?.userEmail || live.checkout.email || null;
	const details = parseETransferDetails(metadataEntries);
	const orderUrl = absoluteUrl(buildOrderConfirmationPath({ orderId: result.orderId }));

	if (orderNumber && total && details) {
		after(async () => {
			if (customerEmail) {
				const email = buildETransferEmail({
					orderNumber,
					amount: total.amount,
					currency: total.currency,
					details,
					orderUrl,
				});
				await sendEmail({ to: customerEmail, ...email });
			}

			await sendNotification({
				subject: `New e-Transfer order ${eTransferReference(orderNumber)} — awaiting payment`,
				text: [
					`${eTransferReference(orderNumber)} was placed with Interac e-Transfer and is waiting for payment.`,
					"",
					`Amount: ${formatETransferAmount(total.amount, total.currency)}`,
					`Customer: ${customerEmail ?? "(no email)"}`,
					`Match the transfer by its message: "${eTransferReference(orderNumber)}".`,
					"",
					'When the money arrives, open the order in the Saleor Dashboard and choose "Mark as paid".',
				].join("\n"),
				replyTo: customerEmail ?? undefined,
			});
		});
	}

	return { ok: true, orderId: result.orderId };
}
