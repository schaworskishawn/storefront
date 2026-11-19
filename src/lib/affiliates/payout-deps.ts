import "server-only";

import { randomUUID } from "node:crypto";
import { sendEmail, sendNotification } from "@/lib/email";
import { createLot, findLotsByOrder, readRewardsAppToken, storeLotCode } from "@/lib/rewards/saleor-rewards";
import { centsForTokens, readRewardsConfig } from "@/lib/rewards/tokens";
import { isAiConfigured, weeklyReview } from "./ai-review";
import type { Result } from "./engine";
import { computeLedger } from "./ledger";
import { cryptoPayoutEmail, ownerDigestEmail, tokenPayoutEmail, weeklyReportEmail } from "./messages";
import {
	authenticate,
	createPayoutBatch,
	estimateCoinAmount,
	getPayoutState,
	readPayoutApiConfig,
	totp,
	verifyPayoutBatch,
	type PayoutApiConfig,
} from "./nowpayments-payouts";
import type { CryptoEntry, PayoutRunDeps, SentCrypto } from "./payout-run";
import { CRYPTO_COINS } from "./records";
import {
	listAffiliateAccounts,
	listCreditedOrders,
	listReferredOrders,
	saveAffiliateRecord,
} from "./saleor-affiliates";
import { computeSignals } from "./signals";
import { TOKEN_BONUS_BPS } from "./tiers";

/** Connects the payout engine (payout-run.ts) to the real services. The engine is tested with fakes; this is wiring. */

export const storeOrigin = () => process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://www.worldwidevapor.com";

/**
 * Prices each entry in its coin, creates one NOWPayments batch and, when given a code (or allowed to make one from the
 * 2FA secret), verifies it. Without a code the batch waits for the owner's code on /affiliate-admin; NOWPayments rejects
 * it if that doesn't come within the hour, and the job then marks the payouts failed so they're owed again.
 */
export async function sendCryptoBatch(
	config: PayoutApiConfig,
	entries: readonly CryptoEntry[],
	verification: { code: string } | { auto: true } | null,
): Promise<Result<SentCrypto>> {
	const amounts: number[] = [];
	for (const entry of entries) {
		const amount = await estimateCoinAmount(config, entry.cents, entry.currency, entry.coin);
		if (!amount.ok) return { ok: false, message: `Couldn't price ${entry.code}'s payout: ${amount.message}` };
		amounts.push(amount.value);
	}
	const token = await authenticate(config);
	if (!token.ok) return token;
	const batch = await createPayoutBatch(
		config,
		token.value,
		entries.map((e, i) => ({
			address: e.address,
			coin: e.coin,
			amount: amounts[i]!,
			description: `Worldwide Vapor affiliate payout (${e.code})`,
		})),
	);
	if (!batch.ok) return batch;

	if (!verification) return { ok: true, value: { ...batch.value, amounts, verified: false } };
	const code =
		"code" in verification
			? verification.code
			: config.totpSecret
				? totp(config.totpSecret, new Date())
				: null;
	const result = code
		? await verifyPayoutBatch(config, token.value, batch.value.batchId, code)
		: ({ ok: false, message: "the 2FA secret couldn't be read" } as const);
	// The batch exists either way, so it's returned to be recorded; its payouts' status settles whether it went out.
	if (!result.ok)
		return {
			ok: true,
			value: {
				...batch.value,
				amounts,
				verified: false,
				problem: `Crypto batch ${batch.value.batchId} was created but not verified (${result.message}). Verify it on /affiliate-admin within the hour, or NOWPayments rejects it and it's owed again.`,
			},
		};
	return { ok: true, value: { ...batch.value, amounts, verified: true } };
}

/** What's switched on, so /affiliate-admin can say what happens by itself and what waits for the owner. */
export function payoutSetup(): { ai: boolean; crypto: boolean; tokens: boolean; auto: boolean } {
	const deps = productionPayoutDeps();
	return {
		ai: deps.ai !== null,
		crypto: deps.crypto !== null,
		tokens: deps.tokensOn,
		auto: deps.autoPayoutsOn,
	};
}

export function productionPayoutDeps(): PayoutRunDeps {
	const cryptoConfig = readPayoutApiConfig();
	const rewards = readRewardsConfig();
	return {
		now: () => new Date(),
		newId: () => randomUUID(),
		autoPayoutsOn: process.env.AFFILIATE_AUTO_PAYOUTS?.trim().toLowerCase() !== "off",
		tokensOn: rewards.enabled && readRewardsAppToken() !== null,
		tokenValueCents: centsForTokens(1),
		accounts: {
			list: () => listAffiliateAccounts(),
			save: (userId, record) => saveAffiliateRecord(userId, record),
		},
		ledger: async (account) => {
			const orders = await listCreditedOrders(account.record.code ?? "", account.userId);
			return orders.ok
				? { ok: true, value: computeLedger(orders.value, account.record.payouts, new Date()) }
				: orders;
		},
		tokens: {
			find: async (key) => {
				const lots = await findLotsByOrder(key);
				return lots.ok ? { ok: true, value: lots.value.map((l) => ({ id: l.id })) } : lots;
			},
			create: (lot) =>
				createLot({
					tokens: lot.tokens,
					currency: lot.currency,
					// Paid commission is the affiliate's to keep: these lots never expire.
					expiryDate: null,
					userId: lot.userId,
					orderId: lot.key,
					orderNumber: "affiliate payout",
					note: lot.note,
				}),
			storeCode: (id, code) => storeLotCode(id, code),
		},
		crypto: cryptoConfig
			? {
					autoVerify: cryptoConfig.totpSecret !== null,
					send: (entries) => sendCryptoBatch(cryptoConfig, entries, { auto: true }),
					state: (payoutId) => getPayoutState(cryptoConfig, payoutId),
				}
			: null,
		ai: isAiConfigured()
			? {
					signals: async (account, ledger) => {
						const orders = await listReferredOrders(account.record.code ?? "", account.userId);
						return orders.ok
							? {
									ok: true,
									value: computeSignals(
										account.record.code ?? "",
										account.email,
										orders.value,
										ledger,
										new Date(),
									),
								}
							: orders;
					},
					weekly: (signals) => weeklyReview(signals, new Date()),
				}
			: null,
		notify: {
			tokensPaid: async (account, payout) => {
				const sent = await sendEmail({
					to: account.email,
					...tokenPayoutEmail({
						name: account.name,
						tokens: payout.tokens,
						currency: payout.currency,
						coveredCents: payout.coveredCents,
						bonusPercent: TOKEN_BONUS_BPS / 100,
						origin: storeOrigin(),
					}),
				});
				if (!sent.ok) console.warn(`[affiliates] couldn't email a token payout to ${account.record.code}`);
			},
			cryptoSent: async (account, payout) => {
				const sent = await sendEmail({
					to: account.email,
					...cryptoPayoutEmail({
						name: account.name,
						coin: CRYPTO_COINS[payout.coin].label,
						amount: payout.amount,
						address: payout.address,
						origin: storeOrigin(),
					}),
				});
				if (!sent.ok) console.warn(`[affiliates] couldn't email a crypto payout to ${account.record.code}`);
			},
			owner: async (lines) => {
				const sent = await sendNotification(ownerDigestEmail(lines, storeOrigin()));
				if (!sent.ok)
					console.error(`[affiliates] OWNER DIGEST (not emailed):\n${lines.map((l) => l.text).join("\n")}`);
			},
			weekly: async (review, held) => {
				const sent = await sendNotification(weeklyReportEmail(review, held, storeOrigin()));
				if (!sent.ok) console.error(`[affiliates] weekly AI review (not emailed): ${review.summary}`);
			},
		},
	};
}
