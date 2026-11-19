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
import { formatCents, payoutStatus, payoutsSince } from "@/lib/affiliates/ledger";
import { approvalEmail, cryptoPayoutEmail, payoutEmail, tokenPayoutEmail } from "@/lib/affiliates/messages";
import { authenticate, readPayoutApiConfig, verifyPayoutBatch } from "@/lib/affiliates/nowpayments-payouts";
import { productionPayoutDeps, sendCryptoBatch, storeOrigin } from "@/lib/affiliates/payout-deps";
import {
	cryptoEntriesFor,
	cryptoPayouts,
	payInTokens,
	runAffiliatePayouts,
	type CryptoEntry,
} from "@/lib/affiliates/payout-run";
import { CRYPTO_COINS, type AffiliateRecord } from "@/lib/affiliates/records";
import { listAffiliateAccounts, saveAffiliateRecord } from "@/lib/affiliates/saleor-affiliates";
import { TOKEN_BONUS_BPS } from "@/lib/affiliates/tiers";
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

const notStaff: AdminActionState = {
	ok: false,
	message: "Sign in with a staff account that can manage customers.",
};

export async function clearHoldAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
	return change(
		field(form, "userId"),
		(record) => ({ ok: true, record: { ...record, autoHold: null } }),
		"Hold cleared: automatic payouts resume on the next payout date.",
	);
}

/** Pays everything an affiliate is owed now, in Vapor Tokens with the bonus: the owner's OK for a held or early payout. */
export async function payTokensNowAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) return notStaff;
	const deps = productionPayoutDeps();
	if (!deps.tokensOn)
		return { ok: false, message: "Vapor Tokens aren't switched on, so there's nothing to pay them in." };

	const accounts = await listAffiliateAccounts();
	if (!accounts.ok) return { ok: false, message: `Couldn't load the affiliates: ${accounts.message}` };
	const account = accounts.value.find((a) => a.userId === field(form, "userId"));
	if (!account?.record.code)
		return { ok: false, message: "That affiliate couldn't be found. Refresh the page." };
	const ledger = await deps.ledger(account);
	if (!ledger.ok) return { ok: false, message: `Couldn't load their orders: ${ledger.message}` };

	const now = new Date();
	const slot = `manual-${now.toISOString().slice(0, 16)}`;
	const payouts = [...account.record.payouts];
	const paid: string[] = [];
	for (const [currency, totals] of Object.entries(ledger.value.totals)) {
		if (totals.owedCents <= 0) continue;
		const result = await payInTokens(
			{ ...account, record: { ...account.record, payouts } },
			currency,
			totals.owedCents,
			slot,
			deps,
		);
		if (!result.ok) return { ok: false, message: `The token payout failed: ${result.message}` };
		if (!result.value) continue;
		payouts.push(result.value);
		paid.push(result.value.method);
		await sendEmail({
			to: account.email,
			...tokenPayoutEmail({
				name: account.name,
				tokens: result.value.tokens ?? 0,
				currency,
				coveredCents: result.value.amounts[currency] ?? 0,
				bonusPercent: TOKEN_BONUS_BPS / 100,
				origin: storeOrigin(),
			}),
		});
	}
	if (paid.length === 0) return { ok: true, message: "Nothing is owed right now (or it was just paid)." };
	const saved = await saveAffiliateRecord(account.userId, { ...account.record, payouts });
	revalidatePath("/affiliate-admin");
	return saved.ok
		? { ok: true, message: `Paid ${paid.join(" and ")}. They've been emailed.` }
		: {
				ok: false,
				message: `The tokens were created but the payout wasn't recorded (${saved.message}). Don't pay again: record it by hand.`,
			};
}

/** Creates one NOWPayments batch for every crypto payout that's due. It waits for the owner's 2FA code to go out. */
export async function createCryptoBatchAction(_prev: AdminActionState): Promise<AdminActionState> {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) return notStaff;
	const config = readPayoutApiConfig();
	if (!config)
		return {
			ok: false,
			message:
				"NOWPayments payouts aren't set up: set NOWPAYMENTS_PAYOUT_EMAIL and NOWPAYMENTS_PAYOUT_PASSWORD.",
		};
	const deps = productionPayoutDeps();

	const accounts = await listAffiliateAccounts();
	if (!accounts.ok) return { ok: false, message: `Couldn't load the affiliates: ${accounts.message}` };
	const now = new Date();
	const entries: CryptoEntry[] = [];
	for (const account of accounts.value) {
		const { record } = account;
		// A held affiliate (an AI flag, or the owner) is left out until the hold is cleared on their card.
		if (
			(record.status !== "approved" && record.status !== "paused") ||
			record.payoutMethod.kind !== "crypto" ||
			record.autoHold
		)
			continue;
		const ledger = await deps.ledger(account);
		if (!ledger.ok) continue;
		const due = payoutStatus(
			ledger.value,
			ledger.value.thisMonth.tier.schedule,
			payoutsSince(record.payouts, record.approvedAt),
			now,
		).due;
		entries.push(...cryptoEntriesFor(account, due, now));
	}
	if (entries.length === 0)
		return { ok: true, message: "No crypto payouts are due (a new wallet waits 72 hours)." };

	const sent = await sendCryptoBatch(config, entries, null);
	if (!sent.ok) return { ok: false, message: sent.message };
	const unsaved: string[] = [];
	for (const [userId, payouts] of cryptoPayouts(entries, sent.value, now, randomUUID)) {
		const account = accounts.value.find((a) => a.userId === userId)!;
		const saved = await saveAffiliateRecord(userId, {
			...account.record,
			payouts: [...account.record.payouts, ...payouts],
		});
		if (!saved.ok) unsaved.push(account.record.code ?? account.email);
	}
	revalidatePath("/affiliate-admin");
	// Verifying would pay someone whose payout isn't recorded, and they'd be paid again next time. Left unverified,
	// NOWPayments rejects the batch within the hour and nothing is sent.
	if (unsaved.length > 0)
		return {
			ok: false,
			message: `Batch ${sent.value.batchId} was created, but it couldn't be recorded for ${unsaved.join(", ")}. Don't verify it: NOWPayments rejects it within the hour. Then try again.`,
		};
	const total = entries.map((e) => `${e.code} ${formatCents(e.cents, e.currency)}`).join(", ");
	return {
		ok: true,
		message: `Batch ${sent.value.batchId} created (${total}). Enter your NOWPayments 2FA code below within an hour to send it.`,
	};
}

/** Releases a crypto batch with the owner's NOWPayments 2FA code, then tells each affiliate it's on its way. */
export async function verifyCryptoBatchAction(
	_prev: AdminActionState,
	form: FormData,
): Promise<AdminActionState> {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) return notStaff;
	const config = readPayoutApiConfig();
	if (!config) return { ok: false, message: "NOWPayments payouts aren't set up." };
	const batchId = field(form, "batchId").trim();
	const code = field(form, "code").replace(/\s+/g, "");
	if (!/^\d{6}$/.test(code))
		return { ok: false, message: "Enter the 6-digit code from your authenticator app or email." };

	const token = await authenticate(config);
	if (!token.ok) return { ok: false, message: token.message };
	const verified = await verifyPayoutBatch(config, token.value, batchId, code);
	if (!verified.ok) return { ok: false, message: verified.message };

	const accounts = await listAffiliateAccounts();
	if (!accounts.ok)
		return {
			ok: true,
			message: `Sent. (The affiliates couldn't be reloaded to record it: ${accounts.message})`,
		};
	const now = new Date().toISOString();
	let count = 0;
	for (const account of accounts.value) {
		const inBatch = account.record.payouts.filter((p) => p.batchId === batchId && !p.verifiedAt);
		if (inBatch.length === 0) continue;
		const payouts = account.record.payouts.map((p) =>
			p.batchId === batchId && !p.verifiedAt ? { ...p, verifiedAt: now } : p,
		);
		await saveAffiliateRecord(account.userId, { ...account.record, payouts });
		for (const payout of inBatch) {
			count += 1;
			if (payout.coin && payout.address)
				await sendEmail({
					to: account.email,
					...cryptoPayoutEmail({
						name: account.name,
						coin: CRYPTO_COINS[payout.coin].label,
						amount: payout.coinAmount ?? 0,
						address: payout.address,
						origin: storeOrigin(),
					}),
				});
		}
	}
	revalidatePath("/affiliate-admin");
	return {
		ok: true,
		message: `Batch ${batchId} sent: ${count} payout${count === 1 ? "" : "s"} on the way, and the affiliates have been emailed.`,
	};
}

/** Runs the AI review now (it also runs every Monday), paying nothing. The summary arrives by email. */
export async function runAiReviewNowAction(_prev: AdminActionState): Promise<AdminActionState> {
	const staff = await checkAffiliateStaff();
	if (!staff.ok) return notStaff;
	const deps = productionPayoutDeps();
	if (!deps.ai) return { ok: false, message: "The AI reviewer isn't set up: set ANTHROPIC_API_KEY." };
	const summary = await runAffiliatePayouts(deps, { weekly: true, pay: false });
	revalidatePath("/affiliate-admin");
	return summary.weekly === "done"
		? { ok: true, message: "Done: the review is in your inbox, and any flags show on the affiliates below." }
		: {
				ok: false,
				message: summary.digest.find((d) => d.section === "problems")?.text ?? "The review didn't run.",
			};
}
