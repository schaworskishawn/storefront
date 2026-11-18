import type { AffiliateAccount } from "./engine";
import { normalizeAffiliateCode } from "./referral";
import { normalizeVoucher, type AffiliateRecord, type Payout } from "./records";

/**
 * What the owner can do on /affiliate-admin, as pure changes to an affiliate's record: approve (with a referral code),
 * reject, pause or resume, link discount codes, and record a payout. Each checks what it needs against the other
 * affiliates and returns the new record or the reason it can't be done. The server actions (app/(root)/affiliate-admin)
 * load the records, call these and save the result.
 */

export type OpResult = { ok: true; record: AffiliateRecord } | { ok: false; message: string };

const others = (accounts: readonly AffiliateAccount[], userId: string) =>
	accounts.filter((a) => a.userId !== userId);

/** A suggested referral code from a name: "Neo Anderson" → "neoanderson". */
export function suggestCode(name: string): string {
	const slug = name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
		.slice(0, 24);
	return slug.length >= 3 ? slug : `${slug}partner`.slice(0, 24);
}

export function approve(
	record: AffiliateRecord,
	rawCode: string,
	accounts: readonly AffiliateAccount[],
	userId: string,
	now: Date,
): OpResult {
	if (record.status !== "pending" && record.status !== "rejected")
		return { ok: false, message: "This affiliate is already approved." };
	const code = normalizeAffiliateCode(rawCode);
	if (!code)
		return {
			ok: false,
			message: "A code is 3–32 letters, numbers, - or _, starting with a letter or number.",
		};
	if (others(accounts, userId).some((a) => a.record.code === code))
		return { ok: false, message: `The code "${code}" already belongs to another affiliate.` };
	return { ok: true, record: { ...record, status: "approved", code, approvedAt: now.toISOString() } };
}

export function reject(record: AffiliateRecord): OpResult {
	if (record.status !== "pending")
		return { ok: false, message: "Only a pending application can be rejected." };
	return { ok: true, record: { ...record, status: "rejected" } };
}

export function setPaused(record: AffiliateRecord, paused: boolean): OpResult {
	if (record.status !== "approved" && record.status !== "paused")
		return { ok: false, message: "Only an approved affiliate can be paused or resumed." };
	return { ok: true, record: { ...record, status: paused ? "paused" : "approved" } };
}

const VOUCHER = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

/** Links the discount codes typed in (separated by commas or spaces), replacing the ones linked before. */
export function setVouchers(
	record: AffiliateRecord,
	raw: string,
	accounts: readonly AffiliateAccount[],
	userId: string,
): OpResult {
	if (!record.code) return { ok: false, message: "Approve the affiliate before linking discount codes." };
	const vouchers = [
		...new Set(
			raw
				.split(/[\s,]+/)
				.map(normalizeVoucher)
				.filter(Boolean),
		),
	];
	const bad = vouchers.find((v) => !VOUCHER.test(v));
	if (bad) return { ok: false, message: `"${bad}" doesn't look like a discount code.` };
	for (const v of vouchers) {
		const owner = others(accounts, userId).find((a) => a.record.vouchers.includes(v));
		if (owner)
			return { ok: false, message: `${v} is already linked to ${owner.record.code ?? owner.email}.` };
	}
	return { ok: true, record: { ...record, vouchers } };
}

/** "12.50" → 1250; blank → 0; anything else → null. */
export function parseAmount(raw: string): number | null {
	const v = raw.trim().replace(/[$,\s]/g, "");
	if (!v) return 0;
	if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
	return Math.round(Number(v) * 100);
}

export function recordPayout(
	record: AffiliateRecord,
	input: { amounts: Record<string, string>; method: string; note: string },
	now: Date,
	id: string,
): OpResult {
	if (record.status !== "approved" && record.status !== "paused")
		return { ok: false, message: "Payouts can only be recorded for an approved affiliate." };
	const amounts: Record<string, number> = {};
	for (const [currency, raw] of Object.entries(input.amounts)) {
		const cents = parseAmount(raw);
		if (cents === null) return { ok: false, message: `Enter the ${currency} amount like 125.00.` };
		if (cents > 0) amounts[currency] = cents;
	}
	if (Object.keys(amounts).length === 0) return { ok: false, message: "Enter the amount you paid." };
	const method = input.method.trim().slice(0, 120);
	if (!method) return { ok: false, message: "Say how you paid (e.g. Interac e-Transfer)." };
	const note = input.note.trim().slice(0, 500);
	const payout: Payout = { id, at: now.toISOString(), amounts, method, ...(note ? { note } : {}) };
	return { ok: true, record: { ...record, payouts: [...record.payouts, payout] } };
}
