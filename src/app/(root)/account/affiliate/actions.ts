"use server";

import { revalidatePath } from "next/cache";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { payoutDetailsChangedEmail } from "@/lib/affiliates/messages";
import { readPayoutApiConfig, validateAddress } from "@/lib/affiliates/nowpayments-payouts";
import { storeOrigin } from "@/lib/affiliates/payout-deps";
import { choosePayoutMethod, describePayoutMethod } from "@/lib/affiliates/payout-prefs";
import { getAffiliateAccount, saveAffiliateRecord } from "@/lib/affiliates/saleor-affiliates";
import { WALLET_CHANGE_HOLD_HOURS } from "@/lib/affiliates/tiers";
import { sendEmail } from "@/lib/email";

export type PayoutPrefsState = { ok: boolean; message: string } | null;

const field = (form: FormData, name: string) => {
	const v = form.get(name);
	return typeof v === "string" ? v : "";
};

/**
 * An affiliate choosing how they're paid (their own session; the record is saved with the affiliates app's token). A
 * crypto wallet is checked with NOWPayments when payouts are set up there, any change is emailed to the account so a
 * hijacked account can't redirect payouts quietly, and a new wallet isn't paid for 72 hours.
 */
export async function savePayoutMethodAction(
	_prev: PayoutPrefsState,
	form: FormData,
): Promise<PayoutPrefsState> {
	const auth = await getAccountAuthState();
	if (auth.status !== "authenticated") return { ok: false, message: "Please sign in again to change this." };
	const account = await getAffiliateAccount(auth.user.id);
	if (!account.ok)
		return { ok: false, message: "We couldn't load your affiliate account. Please try again." };
	const record = account.value?.record;
	if (!record || (record.status !== "approved" && record.status !== "paused"))
		return { ok: false, message: "Only approved affiliates can set payout details." };

	const choice = choosePayoutMethod(
		{
			kind: field(form, "kind"),
			currency: field(form, "currency"),
			address: field(form, "address"),
			email: field(form, "email"),
		},
		record.payoutMethod,
		new Date(),
	);
	if (!choice.ok) return choice;
	if (!choice.changed) return { ok: true, message: "No change: that's already how you're paid." };

	if (choice.method.kind === "crypto") {
		const config = readPayoutApiConfig();
		if (config) {
			const valid = await validateAddress(config, choice.method.currency, choice.method.address);
			if (!valid.ok)
				return {
					ok: false,
					message: "That wallet can't receive this coin. Check the address and the network.",
				};
		}
	}

	const saved = await saveAffiliateRecord(auth.user.id, { ...record, payoutMethod: choice.method });
	if (!saved.ok) return { ok: false, message: "We couldn't save that. Please try again." };
	await sendEmail({
		to: auth.user.email,
		...payoutDetailsChangedEmail({
			name: [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || auth.user.email,
			description: describePayoutMethod(choice.method),
			walletHoldHours: choice.method.kind === "crypto" ? WALLET_CHANGE_HOLD_HOURS : null,
			origin: storeOrigin(),
		}),
	});
	revalidatePath("/account/affiliate");
	return {
		ok: true,
		message:
			choice.method.kind === "crypto"
				? `Saved. For your security, nothing is sent to a new wallet for ${WALLET_CHANGE_HOLD_HOURS} hours.`
				: "Saved.",
	};
}
