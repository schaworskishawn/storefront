"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
	approve,
	recordPayout,
	reject,
	setPaused,
	setVouchers,
	type OpResult,
} from "@/lib/affiliates/admin-ops";
import type { AffiliateAccount } from "@/lib/affiliates/engine";
import { approvalEmail, payoutEmail } from "@/lib/affiliates/messages";
import type { AffiliateRecord } from "@/lib/affiliates/records";
import { listAffiliateAccounts, saveAffiliateRecord } from "@/lib/affiliates/saleor-affiliates";
import { checkAffiliateStaff } from "@/lib/affiliates/staff";
import { sendEmail } from "@/lib/email";

/**
 * The owner's actions on /affiliate-admin. Each re-checks that a staff account is signed in (the page check alone isn't
 * enough: an action can be called directly), loads the affiliates fresh, applies the change (admin-ops.ts), saves it with
 * the affiliates app's token and, where the affiliate should hear about it, emails them.
 */

export type AdminActionState = { ok: boolean; message: string } | null;

const origin = () => process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://www.worldwidevapor.com";
const field = (form: FormData, name: string) => {
	const v = form.get(name);
	return typeof v === "string" ? v : "";
};

async function change(
	userId: string,
	apply: (record: AffiliateRecord, accounts: AffiliateAccount[]) => OpResult,
	done: string,
	after?: (account: AffiliateAccount, record: AffiliateRecord) => Promise<string | null>,
): Promise<AdminActionState> {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) return { ok: false, message: "Sign in with a staff account that can manage customers." };

	const accounts = await listAffiliateAccounts();
	if (!accounts.ok) return { ok: false, message: `Couldn't load the affiliates: ${accounts.message}` };
	const account = accounts.value.find((a) => a.userId === userId);
	if (!account) return { ok: false, message: "That affiliate couldn't be found. Refresh the page." };

	const result = apply(account.record, accounts.value);
	if (!result.ok) return result;
	const saved = await saveAffiliateRecord(userId, result.record);
	if (!saved.ok) return { ok: false, message: `Saleor didn't save the change: ${saved.message}` };

	const extra = after ? await after(account, result.record) : null;
	revalidatePath("/affiliate-admin");
	return { ok: true, message: extra ? `${done} ${extra}` : done };
}

const emailed = async (to: string, email: { subject: string; text: string }) => {
	const sent = await sendEmail({ to, ...email });
	return sent.ok ? `We've emailed ${to}.` : `The email to ${to} couldn't be sent, so let them know yourself.`;
};

export async function approveAffiliateAction(
	_prev: AdminActionState,
	form: FormData,
): Promise<AdminActionState> {
	const userId = field(form, "userId");
	return change(
		userId,
		(record, accounts) => approve(record, field(form, "code"), accounts, userId, new Date()),
		"Approved.",
		(account, record) =>
			emailed(
				account.email,
				approvalEmail({ name: account.name, code: record.code ?? "", origin: origin() }),
			),
	);
}

export async function rejectAffiliateAction(
	_prev: AdminActionState,
	form: FormData,
): Promise<AdminActionState> {
	return change(field(form, "userId"), (record) => reject(record), "Application rejected.");
}

export async function setAffiliatePausedAction(
	_prev: AdminActionState,
	form: FormData,
): Promise<AdminActionState> {
	const paused = field(form, "paused") === "true";
	return change(
		field(form, "userId"),
		(record) => setPaused(record, paused),
		paused ? "Paused: new orders won't be credited." : "Resumed.",
	);
}

export async function setAffiliateVouchersAction(
	_prev: AdminActionState,
	form: FormData,
): Promise<AdminActionState> {
	const userId = field(form, "userId");
	return change(
		userId,
		(record, accounts) => setVouchers(record, field(form, "vouchers"), accounts, userId),
		"Discount codes saved.",
	);
}

export async function recordAffiliatePayoutAction(
	_prev: AdminActionState,
	form: FormData,
): Promise<AdminActionState> {
	const amounts: Record<string, string> = {};
	for (const [key, value] of form.entries()) {
		const currency = /^amount_([A-Z]{3})$/.exec(key)?.[1];
		if (currency && typeof value === "string") amounts[currency] = value;
	}
	const id = randomUUID();
	return change(
		field(form, "userId"),
		(record) =>
			recordPayout(
				record,
				{ amounts, method: field(form, "method"), note: field(form, "note") },
				new Date(),
				id,
			),
		"Payout recorded.",
		(account, record) => {
			const payout = record.payouts.find((p) => p.id === id);
			return payout
				? emailed(account.email, payoutEmail({ name: account.name, payout, origin: origin() }))
				: Promise.resolve(null);
		},
	);
}
