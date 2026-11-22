"use server";

import { revalidatePath } from "next/cache";
import { checkAffiliateStaff } from "@/lib/affiliates/staff";
import { approve, reject, setPaused, setTier, type OpResult } from "@/lib/distributors/admin-ops";
import { approvalEmail, rejectionEmail, tierChangedEmail } from "@/lib/distributors/messages";
import type { DistributorRecord } from "@/lib/distributors/records";
import {
	getDistributorAccount,
	saveDistributorRecord,
	type DistributorAccount,
} from "@/lib/distributors/saleor-distributors";
import { sendEmail } from "@/lib/email";

/**
 * The owner's actions on /distributor-admin. Each re-checks that a staff account that can manage customers is signed in
 * (an action can be called directly, so the page's check isn't enough), loads the record fresh, applies the change
 * (admin-ops.ts), saves it with the distributors app's token and, where the business should hear about it, emails them.
 * A tier change takes effect on their next cart change or checkout (sync.ts re-prices it).
 */

export type DistributorAdminState = { ok: boolean; message: string } | null;

const origin = () => process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://www.worldwidevapor.com";
const field = (form: FormData, name: string) => {
	const v = form.get(name);
	return typeof v === "string" ? v : "";
};

const contactName = (account: DistributorAccount) => account.record.application?.contactName || account.name;

async function change(
	userId: string,
	apply: (record: DistributorRecord) => OpResult,
	done: string,
	email?: (
		account: DistributorAccount,
		record: DistributorRecord,
	) => { subject: string; text: string } | null,
): Promise<DistributorAdminState> {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) return { ok: false, message: "Sign in with a staff account that can manage customers." };

	const account = await getDistributorAccount(userId);
	if (!account.ok) return { ok: false, message: `Couldn't load the account: ${account.message}` };
	if (!account.value) return { ok: false, message: "That account couldn't be found. Refresh the page." };

	const result = apply(account.value.record);
	if (!result.ok) return result;
	const saved = await saveDistributorRecord(userId, result.record);
	if (!saved.ok) return { ok: false, message: `Saleor didn't save the change: ${saved.message}` };

	let note = "";
	const message = email?.(account.value, result.record);
	if (message) {
		const to = account.value.record.application?.email || account.value.email;
		const sent = await sendEmail({ to, ...message });
		note = sent.ok
			? ` We've emailed ${to}.`
			: ` The email to ${to} couldn't be sent, so let them know yourself.`;
	}
	revalidatePath("/distributor-admin");
	return { ok: true, message: `${done}${note}` };
}

export async function approveDistributorAction(
	_prev: DistributorAdminState,
	form: FormData,
): Promise<DistributorAdminState> {
	const now = new Date();
	return change(
		field(form, "userId"),
		(record) => approve(record, field(form, "tier"), now),
		"Approved.",
		(account, record) =>
			record.tierId
				? approvalEmail({ name: contactName(account), tierId: record.tierId, origin: origin() })
				: null,
	);
}

export async function rejectDistributorAction(
	_prev: DistributorAdminState,
	form: FormData,
): Promise<DistributorAdminState> {
	const now = new Date();
	return change(
		field(form, "userId"),
		(record) => reject(record, now),
		"Application rejected.",
		(account) => rejectionEmail({ name: contactName(account), origin: origin() }),
	);
}

export async function setDistributorTierAction(
	_prev: DistributorAdminState,
	form: FormData,
): Promise<DistributorAdminState> {
	const now = new Date();
	return change(
		field(form, "userId"),
		(record) => setTier(record, field(form, "tier"), now),
		"Tier saved: it applies from their next cart change or checkout.",
		(account, record) =>
			record.tierId
				? tierChangedEmail({ name: contactName(account), tierId: record.tierId, origin: origin() })
				: null,
	);
}

export async function setDistributorPausedAction(
	_prev: DistributorAdminState,
	form: FormData,
): Promise<DistributorAdminState> {
	const paused = field(form, "paused") === "true";
	const now = new Date();
	return change(
		field(form, "userId"),
		(record) => setPaused(record, paused, now),
		paused
			? "Paused: their orders are at retail until you resume."
			: "Resumed: wholesale pricing is back on.",
	);
}
