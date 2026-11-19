import type { WeeklyReview } from "./ai-review";
import type { AffiliateAccount, Result } from "./engine";
import { formatCents, formatVolume, payoutsSince, payoutStatus, type Ledger } from "./ledger";
import type { DigestLine } from "./messages";
import { describePayoutMethod, shortAddress, walletReady, walletReadyAt } from "./payout-prefs";
import { CRYPTO_COINS, type AffiliateRecord, type CryptoCoin, type Payout } from "./records";
import type { AffiliateSignals } from "./signals";
import { AUTO_PAYOUT_LIMIT_CENTS, TOKEN_BONUS_BPS } from "./tiers";

/**
 * The affiliate program's daily job (and the owner's "pay now" buttons): pays what's due, keeps crypto payouts' status up
 * to date, runs the weekly AI review, and tells the owner only what needs them. Everything outside comes in through
 * `deps`, so the rules are tested with fakes (payout-run.test.ts); payout-deps.ts wires it to Saleor, NOWPayments,
 * Claude and email.
 *
 * - **Vapor Tokens** (the default) are paid automatically, with the bonus, as a token lot that never expires. A lot is
 *   keyed by the affiliate, the payout date and the currency, so a run that's repeated finds the lot it already made
 *   instead of making another. Held for the owner when over the limit, when the affiliate's payouts are held (an AI flag
 *   or the owner), when automatic payouts are switched off, or when Vapor Tokens are off.
 * - **Crypto** is sent automatically only when the owner has given the job the 2FA secret; otherwise it's listed for the
 *   owner, who sends the batch from /affiliate-admin with their code. Never to a wallet set less than 72 hours ago.
 * - **e-Transfer** is always listed for the owner.
 */

/** Tokens a payout buys, with the bonus, and the cash value they cover (the rest stays owed): ⌊owed × 1.25 / 5¢⌋. */
export function tokensFor(owedCents: number, tokenValueCents: number, bonusBps = TOKEN_BONUS_BPS) {
	const factor = 10_000 + bonusBps;
	const tokens = Math.floor((owedCents * factor) / 10_000 / tokenValueCents);
	const coveredCents = Math.floor((tokens * tokenValueCents * 10_000) / factor);
	return { tokens, coveredCents };
}

export type CryptoEntry = {
	userId: string;
	code: string;
	name: string;
	email: string;
	currency: string;
	cents: number;
	coin: CryptoCoin;
	address: string;
};

export type SentCrypto = {
	batchId: string;
	payoutIds: string[];
	amounts: number[];
	verified: boolean;
	/** Why a created batch wasn't verified (it waits for the owner's code, or NOWPayments rejects it within the hour). */
	problem?: string;
};

export type PayoutRunDeps = {
	now: () => Date;
	newId: () => string;
	/** False when AFFILIATE_AUTO_PAYOUTS=off: nothing is paid automatically. */
	autoPayoutsOn: boolean;
	/** Vapor Tokens are switched on (they're how token payouts are spent). */
	tokensOn: boolean;
	tokenValueCents: number;
	accounts: {
		list: () => Promise<Result<AffiliateAccount[]>>;
		save: (userId: string, record: AffiliateRecord) => Promise<Result<void>>;
	};
	ledger: (account: AffiliateAccount) => Promise<Result<Ledger>>;
	tokens: {
		/** Lots already made under this key (from an earlier, interrupted run). */
		find: (key: string) => Promise<Result<Array<{ id: string }>>>;
		create: (lot: {
			tokens: number;
			currency: string;
			userId: string;
			key: string;
			note: string;
		}) => Promise<Result<{ id: string; code: string | null }>>;
		storeCode: (id: string, code: string) => Promise<Result<unknown>>;
	};
	/** Null when NOWPayments payouts aren't set up. */
	crypto: null | {
		/** The job may verify batches itself (NOWPAYMENTS_2FA_SECRET is set). */
		autoVerify: boolean;
		send: (entries: readonly CryptoEntry[]) => Promise<Result<SentCrypto>>;
		state: (payoutId: string) => Promise<Result<"pending" | "finished" | "failed">>;
	};
	/** Null when the AI reviewer isn't set up. */
	ai: null | {
		signals: (account: AffiliateAccount, ledger: Ledger) => Promise<Result<AffiliateSignals>>;
		weekly: (signals: readonly AffiliateSignals[]) => Promise<Result<WeeklyReview>>;
	};
	notify: {
		tokensPaid: (
			account: AffiliateAccount,
			payout: { tokens: number; currency: string; coveredCents: number },
		) => Promise<void>;
		cryptoSent: (
			account: AffiliateAccount,
			payout: { coin: CryptoCoin; amount: number; address: string },
		) => Promise<void>;
		owner: (lines: readonly DigestLine[]) => Promise<void>;
		weekly: (review: WeeklyReview, held: readonly string[]) => Promise<void>;
	};
};

export type RunSummary = {
	paidTokens: number;
	sentCrypto: number;
	digest: DigestLine[];
	weekly: "skipped" | "done" | "failed";
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pays one affiliate's owed amount in one currency as Vapor Tokens, or finds the lot an interrupted run already made.
 * Returns the payout to record, or null when there's nothing to pay (less than a token's worth).
 */
export async function payInTokens(
	account: AffiliateAccount,
	currency: string,
	owedCents: number,
	slot: string,
	deps: Pick<PayoutRunDeps, "tokens" | "tokenValueCents" | "newId" | "now">,
): Promise<Result<Payout | null>> {
	const recordedLots = new Set(account.record.payouts.flatMap((p) => p.lotIds ?? []));
	const { tokens, coveredCents } = tokensFor(owedCents, deps.tokenValueCents);
	if (tokens <= 0 || coveredCents <= 0) return { ok: true, value: null };
	const key = `affiliate-payout:${account.userId}:${slot}:${currency}`;

	const existing = await deps.tokens.find(key);
	if (!existing.ok) return existing;
	let lotId = existing.value[0]?.id;
	// A lot that's already on a recorded payout was paid: never record it twice (a double click, a repeated run).
	if (lotId && recordedLots.has(lotId)) return { ok: true, value: null };
	if (!lotId) {
		const created = await deps.tokens.create({
			tokens,
			currency,
			userId: account.userId,
			key,
			note: `Affiliate payout to ${account.record.code ?? account.email} (${formatCents(coveredCents, currency)} + ${TOKEN_BONUS_BPS / 100}% bonus)`,
		});
		if (!created.ok) return created;
		lotId = created.value.id;
		if (created.value.code) await deps.tokens.storeCode(created.value.id, created.value.code);
	}
	return {
		ok: true,
		value: {
			id: deps.newId(),
			at: deps.now().toISOString(),
			amounts: { [currency]: coveredCents },
			method: `Vapor Tokens: ${tokens.toLocaleString("en-US")} tokens (+${TOKEN_BONUS_BPS / 100}%)`,
			kind: "tokens",
			tokens,
			bonusBps: TOKEN_BONUS_BPS,
			lotIds: [lotId],
		},
	};
}

/** The crypto payouts that should go out for one affiliate now (due, set up, past the wallet's cooling-off). */
export function cryptoEntriesFor(
	account: AffiliateAccount,
	due: ReadonlyArray<{ currency: string; cents: number }>,
	now: Date,
): CryptoEntry[] {
	const method = account.record.payoutMethod;
	if (method.kind !== "crypto" || !walletReady(method, now)) return [];
	return due.map((d) => ({
		userId: account.userId,
		code: account.record.code ?? "",
		name: account.name,
		email: account.email,
		currency: d.currency,
		cents: d.cents,
		coin: method.currency,
		address: method.address,
	}));
}

/** The payouts to record for a crypto batch NOWPayments accepted, one per entry. */
export function cryptoPayouts(
	entries: readonly CryptoEntry[],
	sent: SentCrypto,
	now: Date,
	newId: () => string,
): Map<string, Payout[]> {
	const byUser = new Map<string, Payout[]>();
	entries.forEach((entry, i) => {
		const payout: Payout = {
			id: newId(),
			at: now.toISOString(),
			amounts: { [entry.currency]: entry.cents },
			method: `${CRYPTO_COINS[entry.coin].label}: ${sent.amounts[i] ?? "?"} to ${shortAddress(entry.address)}`,
			kind: "crypto",
			batchId: sent.batchId,
			payoutIds: sent.payoutIds[i] ? [sent.payoutIds[i]!] : [],
			coin: entry.coin,
			...(sent.amounts[i] !== undefined ? { coinAmount: sent.amounts[i] } : {}),
			address: entry.address,
			status: "processing",
			...(sent.verified ? { verifiedAt: now.toISOString() } : {}),
		};
		byUser.set(entry.userId, [...(byUser.get(entry.userId) ?? []), payout]);
	});
	return byUser;
}

export async function runAffiliatePayouts(
	deps: PayoutRunDeps,
	/** `pay: false` runs only the crypto status check and (with `weekly`) the AI review, paying nothing. */
	options: { weekly: boolean; pay?: boolean },
): Promise<RunSummary> {
	const pay = options.pay !== false;
	const now = deps.now();
	const digest: DigestLine[] = [];
	const summary: RunSummary = { paidTokens: 0, sentCrypto: 0, digest, weekly: "skipped" };

	const listed = await deps.accounts.list();
	if (!listed.ok) {
		digest.push({ section: "problems", text: `Couldn't load the affiliates: ${listed.message}` });
		await deps.notify.owner(digest);
		return summary;
	}

	const active = listed.value.filter(
		(a) => (a.record.status === "approved" || a.record.status === "paused") && a.record.code,
	);
	const changed = new Map<string, AffiliateRecord>();
	const recordOf = (a: AffiliateAccount) => changed.get(a.userId) ?? a.record;
	const ledgers = new Map<string, Ledger>();
	const autoCrypto: CryptoEntry[] = [];

	for (const account of active) {
		const label = `${account.record.code} (${account.name})`;

		// 1. Bring crypto payouts up to date: a failed or rejected one is owed again.
		if (deps.crypto) {
			let payouts = recordOf(account).payouts;
			let touched = false;
			for (const payout of payouts.filter((p) => p.kind === "crypto" && p.status === "processing")) {
				const states: Array<"pending" | "finished" | "failed"> = [];
				for (const id of payout.payoutIds ?? []) {
					const state = await deps.crypto.state(id);
					states.push(state.ok ? state.value : "pending");
				}
				const next = states.includes("failed")
					? "failed"
					: states.length > 0 && states.every((s) => s === "finished")
						? "finished"
						: null;
				if (!next) continue;
				payouts = payouts.map((p) => (p.id === payout.id ? { ...p, status: next } : p));
				touched = true;
				if (next === "failed")
					digest.push({
						section: "failed",
						text: `${label}: ${payout.method} (batch ${payout.batchId}) was rejected or failed, so it's owed again.`,
					});
			}
			if (touched) changed.set(account.userId, { ...recordOf(account), payouts });
		}

		const ledgerResult = await deps.ledger({ ...account, record: recordOf(account) });
		if (!ledgerResult.ok) {
			digest.push({
				section: "problems",
				text: `${label}: couldn't load their orders (${ledgerResult.message}).`,
			});
			continue;
		}
		ledgers.set(account.userId, ledgerResult.value);
	}

	// 2. The weekly AI review, before anything is paid: flags go to the owner, and a high one holds that affiliate's
	// automatic payouts from today's run on.
	if (options.weekly && deps.ai) {
		const signals: AffiliateSignals[] = [];
		for (const account of active) {
			const ledger = ledgers.get(account.userId);
			if (!ledger) continue;
			const s = await deps.ai.signals({ ...account, record: recordOf(account) }, ledger);
			if (s.ok) signals.push(s.value);
		}
		const review = await deps.ai.weekly(signals);
		if (!review.ok) {
			summary.weekly = "failed";
			digest.push({ section: "problems", text: `The weekly AI review didn't run: ${review.message}` });
		} else {
			summary.weekly = "done";
			const held: string[] = [];
			for (const flag of review.value.flags) {
				const account = active.find((a) => a.record.code === flag.code);
				if (!account) continue;
				const current = recordOf(account);
				const { code: _code, suggestedAction: _action, ...aiFlag } = flag;
				const next: AffiliateRecord = { ...current, aiFlag };
				if (flag.severity === "high" && !current.autoHold) {
					next.autoHold = { reason: `AI flag: ${flag.reason.slice(0, 200)}`, at: now.toISOString() };
					held.push(flag.code);
				}
				changed.set(account.userId, next);
				digest.push({ section: "flags", text: `[${flag.severity}] ${flag.code}: ${flag.reason}` });
			}
			await deps.notify.weekly(review.value, held);
		}
	}

	// 3. What's due, by how each affiliate is paid.
	for (const account of pay ? active : []) {
		const label = `${account.record.code} (${account.name})`;
		const ledger = ledgers.get(account.userId);
		if (!ledger) continue;
		const record = recordOf(account);
		const status = payoutStatus(
			ledger,
			ledger.thisMonth.tier.schedule,
			payoutsSince(record.payouts, record.approvedAt),
			now,
		);
		if (status.due.length === 0) continue;
		const slot = day(new Date(status.nextDate));
		const method = record.payoutMethod;
		const dueText = status.due.map((d) => formatCents(d.cents, d.currency)).join(" + ");

		if (method.kind === "tokens") {
			// All or nothing per affiliate: paying one currency would restart their payout schedule and hide the held one
			// until the next payout date.
			const reason = !deps.autoPayoutsOn
				? "automatic payouts are switched off"
				: !deps.tokensOn
					? "Vapor Tokens are switched off"
					: record.autoHold
						? `payouts are held (${record.autoHold.reason})`
						: status.due.some((d) => d.cents > AUTO_PAYOUT_LIMIT_CENTS)
							? `over the ${formatVolume(AUTO_PAYOUT_LIMIT_CENTS)} automatic limit`
							: null;
			if (reason) {
				digest.push({ section: "held", text: `${label}: ${dueText} in tokens, ${reason}.` });
				continue;
			}
			for (const due of status.due) {
				const paid = await payInTokens(account, due.currency, due.cents, slot, deps);
				if (!paid.ok) {
					digest.push({ section: "problems", text: `${label}: the token payout failed (${paid.message}).` });
					continue;
				}
				if (!paid.value) continue;
				const current = recordOf(account);
				changed.set(account.userId, { ...current, payouts: [...current.payouts, paid.value] });
				summary.paidTokens += 1;
				await deps.notify.tokensPaid(account, {
					tokens: paid.value.tokens ?? 0,
					currency: due.currency,
					coveredCents: paid.value.amounts[due.currency] ?? 0,
				});
			}
			continue;
		}

		if (method.kind === "crypto") {
			if (!walletReady(method, now)) {
				digest.push({
					section: "wallets",
					text: `${label}: new ${CRYPTO_COINS[method.currency].label} wallet ${method.address}. Whitelist it in NOWPayments; it can be paid from ${day(walletReadyAt(method)!)}.`,
				});
				continue;
			}
			const entries = cryptoEntriesFor({ ...account, record }, status.due, now);
			const automatic =
				deps.crypto?.autoVerify &&
				deps.autoPayoutsOn &&
				!record.autoHold &&
				entries.every((e) => e.cents <= AUTO_PAYOUT_LIMIT_CENTS);
			if (automatic) autoCrypto.push(...entries);
			else
				digest.push({
					section: "cash",
					text: `${label}: ${dueText} to ${describePayoutMethod(method)}${record.autoHold ? ` (held: ${record.autoHold.reason})` : ""}.`,
				});
			continue;
		}

		digest.push({ section: "cash", text: `${label}: ${dueText} by ${describePayoutMethod(method)}.` });
	}

	// 4. Automatic crypto, as one batch. Each payout is saved as "sending" before anything goes out, so if the record
	// can't be saved afterwards it still counts as paid: a failure can only delay a payout, never send it twice.
	if (autoCrypto.length > 0 && deps.crypto) {
		const sending = cryptoPayouts(
			autoCrypto,
			{ batchId: "sending", payoutIds: [], amounts: [], verified: true },
			now,
			deps.newId,
		);
		const ready: CryptoEntry[] = [];
		for (const [userId, payouts] of sending) {
			const account = active.find((a) => a.userId === userId)!;
			const current = recordOf(account);
			const saved = await deps.accounts.save(userId, {
				...current,
				payouts: [...current.payouts, ...payouts],
			});
			if (saved.ok) ready.push(...autoCrypto.filter((e) => e.userId === userId));
			else
				digest.push({
					section: "problems",
					text: `${account.record.code}: their crypto payout wasn't sent, because their record couldn't be saved first (${saved.message}).`,
				});
			// Saved again below: with the batch on success, or without the "sending" payout if it wasn't sent.
			changed.set(userId, current);
		}
		// A failure here came before NOWPayments made the batch (or the batch is unverified and will be rejected), so
		// nothing went out and the "sending" payouts are dropped. Once the batch exists it's recorded with its payout ids,
		// verified or not, and the status check settles it: finished, or rejected and owed again.
		const sent = ready.length > 0 ? await deps.crypto.send(ready) : null;
		if (sent && !sent.ok) {
			digest.push({ section: "problems", text: `Automatic crypto payouts weren't sent: ${sent.message}` });
		} else if (sent) {
			if (sent.value.problem) digest.push({ section: "problems", text: sent.value.problem });
			for (const [userId, payouts] of cryptoPayouts(ready, sent.value, now, deps.newId)) {
				const account = active.find((a) => a.userId === userId)!;
				const current = recordOf(account);
				changed.set(userId, { ...current, payouts: [...current.payouts, ...payouts] });
				if (!sent.value.verified) continue;
				summary.sentCrypto += payouts.length;
				for (const payout of payouts)
					await deps.notify.cryptoSent(account, {
						coin: payout.coin!,
						amount: payout.coinAmount ?? 0,
						address: payout.address!,
					});
			}
		}
	}

	// 5. Save what changed, then tell the owner what needs them.
	for (const [userId, record] of changed) {
		const saved = await deps.accounts.save(userId, record);
		if (!saved.ok)
			digest.push({
				section: "problems",
				text: `Couldn't save ${record.code}'s record (${saved.message}). Check their payouts on the admin page.`,
			});
	}
	if (digest.length > 0) await deps.notify.owner(digest);
	return summary;
}
