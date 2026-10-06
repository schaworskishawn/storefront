import {
	staffAlert,
	tokensEarnedEmail,
	tokensReturnedEmail,
	type AlertKind,
	type EmailContent,
} from "./messages";
import {
	centsForTokens,
	earnBaseCents,
	expiryDateFor,
	tokensForCents,
	tokensInCents,
	type RewardsConfig,
} from "./tokens";
import type { LotUsage, LotWithCode, NewLot, RewardsOrder, RewardsResult } from "./saleor-rewards";

/**
 * The rewards webhooks. When an order is paid in full, the customer is awarded tokens (one lot per order). When an order is
 * cancelled or refunded in full, the tokens it earned are taken back and the tokens it spent are given back.
 *
 * Every outside effect (Saleor, email) comes in through `RewardsDeps`, so each path, including the ones that should almost
 * never happen, is tested with fakes. Both flows are safe to run twice for the same order.
 */

export type RewardsDeps = {
	now(): Date;
	config: RewardsConfig;
	orders: {
		get(id: string): Promise<RewardsResult<RewardsOrder | null>>;
		note(orderId: string, message: string): Promise<RewardsResult<true>>;
	};
	lots: {
		findByOrder(orderId: string): Promise<RewardsResult<LotWithCode[]>>;
		create(lot: NewLot): Promise<RewardsResult<{ id: string; code: string | null }>>;
		storeCode(id: string, code: string): Promise<RewardsResult<true>>;
		/** Saleor's own code for a lot that hasn't been used yet: lets us repair a lot whose code was never stored. */
		readCode(id: string): Promise<RewardsResult<string | null>>;
		deactivate(id: string): Promise<RewardsResult<true>>;
		adjust(id: string, deltaCents: number): Promise<RewardsResult<true>>;
		usageForOrder(userId: string, orderId: string, orderNumber: string): Promise<RewardsResult<LotUsage[]>>;
		markRestored(id: string, orderNumber: string): Promise<RewardsResult<true>>;
	};
	notify: {
		customer(to: string, email: EmailContent): Promise<void>;
		staff(email: EmailContent): Promise<void>;
	};
};

/** Saleor statuses after which an order earns nothing. */
const STOPPED_ORDER_STATUSES = new Set(["CANCELED", "EXPIRED"]);

const NOTE_PREFIX = "Vapor Tokens: ";

async function note(deps: RewardsDeps, order: RewardsOrder, message: string): Promise<void> {
	const result = await deps.orders.note(order.id, `${NOTE_PREFIX}${message}`);
	if (!result.ok) console.error(`[rewards] couldn't add a note to order ${order.number}: ${result.message}`);
}

async function alertStaff(
	deps: RewardsDeps,
	kind: AlertKind,
	order: RewardsOrder,
	detail: string,
): Promise<void> {
	await deps.notify.staff(staffAlert(kind, order.number, detail));
	await note(deps, order, detail);
}

type EarnOutcome =
	| "disabled"
	| "not-found"
	| "guest"
	| "stopped"
	| "nothing-to-earn"
	| "already-awarded"
	| "awarded"
	| "failed";

/** The oldest lot is the real one; any others are duplicates from a repeated event. */
const byAge = (a: LotWithCode, b: LotWithCode) => a.createdAt.localeCompare(b.createdAt);

/** Removes duplicate lots an order somehow earned, leaving the oldest. Returns the one to keep. */
async function settleDuplicates(
	deps: RewardsDeps,
	order: RewardsOrder,
	lots: LotWithCode[],
): Promise<LotWithCode> {
	const [keep, ...extras] = [...lots].sort(byAge);
	if (extras.length === 0) return keep;

	for (const extra of extras) {
		if (extra.balanceCents > 0) await deps.lots.adjust(extra.id, -extra.balanceCents);
		await deps.lots.deactivate(extra.id);
	}
	await alertStaff(
		deps,
		"duplicate-lots",
		order,
		`${lots.length} token lots had been created for this order. The oldest was kept and ${extras.length} extra ${extras.length === 1 ? "was" : "were"} emptied and deactivated.`,
	);
	return keep;
}

/** Makes sure a lot's code is stored where the checkout can read it later. */
async function ensureCode(deps: RewardsDeps, order: RewardsOrder, lot: LotWithCode): Promise<void> {
	if (lot.code) return;
	const native = await deps.lots.readCode(lot.id);
	if (native.ok && native.value) {
		const stored = await deps.lots.storeCode(lot.id, native.value);
		if (stored.ok) return;
	}
	await alertStaff(
		deps,
		"code-missing",
		order,
		"The tokens were awarded, but the lot's code couldn't be stored. The customer may not be able to spend this lot at checkout until it is fixed.",
	);
}

/** Awards the tokens an order earned, once its payment is complete. Safe to run twice: the order's lot is looked up first. */
export async function earnForOrder(orderId: string, deps: RewardsDeps): Promise<EarnOutcome> {
	if (!deps.config.enabled) return "disabled";

	const fetched = await deps.orders.get(orderId);
	if (!fetched.ok) {
		console.error(`[rewards] couldn't read order ${orderId}: ${fetched.message}`);
		return "failed";
	}
	const order = fetched.value;
	if (!order) return "not-found";
	if (!order.userId) return "guest";
	if (STOPPED_ORDER_STATUSES.has(order.status)) return "stopped";

	const tokens = tokensForCents(earnBaseCents(order), deps.config.tokensPerDollar);
	if (tokens <= 0) return "nothing-to-earn";

	const existing = await deps.lots.findByOrder(order.id);
	if (!existing.ok) {
		console.error(`[rewards] couldn't check order ${order.number} for earned tokens: ${existing.message}`);
		return "failed";
	}
	if (existing.value.length > 0) {
		const lot = await settleDuplicates(deps, order, existing.value);
		await ensureCode(deps, order, lot);
		return "already-awarded";
	}

	const expiryDate = expiryDateFor(deps.now(), deps.config.expiryMonths);
	const created = await deps.lots.create({
		tokens,
		currency: order.currency,
		expiryDate,
		userId: order.userId,
		orderId: order.id,
		orderNumber: order.number,
	});
	if (!created.ok) {
		await alertStaff(
			deps,
			"create-failed",
			order,
			`Saleor refused to create the token lot: ${created.message}`,
		);
		return "failed";
	}

	if (created.value.code) {
		const stored = await deps.lots.storeCode(created.value.id, created.value.code);
		if (!stored.ok) {
			await alertStaff(
				deps,
				"code-missing",
				order,
				`The tokens were awarded, but the lot's code couldn't be stored (${stored.message}). The customer may not be able to spend this lot until it is fixed.`,
			);
		}
	} else {
		await alertStaff(
			deps,
			"code-missing",
			order,
			"Saleor didn't return the new lot's code, so it couldn't be stored.",
		);
	}

	await note(
		deps,
		order,
		`${tokens} tokens awarded (worth ${centsForTokens(tokens) / 100} ${order.currency})${expiryDate ? `, expiring ${expiryDate}` : ""}.`,
	);
	if (order.email) {
		await deps.notify.customer(
			order.email,
			tokensEarnedEmail({ orderNumber: order.number, tokens, currency: order.currency, expiryDate }),
		);
	}
	return "awarded";
}

type ReverseOutcome = {
	/** Lots earned by the order that were deactivated. */
	takenBack: number;
	/** Tokens given back to the customer from what the order spent. */
	returnedTokens: number;
	/** Something couldn't be done and staff were told. */
	failed: boolean;
};

/**
 * An order was cancelled or refunded in full: take back the tokens it earned, and give back the tokens it spent. Saleor does
 * not restore a gift card's balance when an order is cancelled, so this is what makes cancelling fair to the customer.
 * Safe to run twice: a deactivated lot is skipped, and each restored lot is marked.
 */
export async function reverseForOrder(orderId: string, deps: RewardsDeps): Promise<ReverseOutcome> {
	const outcome: ReverseOutcome = { takenBack: 0, returnedTokens: 0, failed: false };

	const fetched = await deps.orders.get(orderId);
	if (!fetched.ok) {
		console.error(`[rewards] couldn't read order ${orderId}: ${fetched.message}`);
		return { ...outcome, failed: true };
	}
	const order = fetched.value;
	if (!order) return outcome;

	// 1. The tokens this order earned are no longer earned.
	const earned = await deps.lots.findByOrder(order.id);
	if (earned.ok) {
		for (const lot of earned.value) {
			if (!lot.isActive) continue;
			const deactivated = await deps.lots.deactivate(lot.id);
			if (deactivated.ok) {
				outcome.takenBack += 1;
			} else {
				outcome.failed = true;
				await alertStaff(
					deps,
					"clawback-failed",
					order,
					`The tokens this order earned couldn't be taken back (${deactivated.message}). Deactivate the gift card tagged vapor-tokens for this order in the Dashboard.`,
				);
			}
		}
	} else {
		outcome.failed = true;
		console.error(`[rewards] couldn't look up the tokens order ${order.number} earned: ${earned.message}`);
	}

	// 2. The tokens this order spent go back to the lots they came from.
	if (order.userId) {
		const usage = await deps.lots.usageForOrder(order.userId, order.id, order.number);
		if (usage.ok) {
			let returnedCents = 0;
			for (const used of usage.value) {
				if (used.restored) continue;
				const adjusted = await deps.lots.adjust(used.lotId, used.usedCents);
				if (!adjusted.ok) {
					outcome.failed = true;
					await alertStaff(
						deps,
						"restore-failed",
						order,
						`${tokensInCents(used.usedCents)} tokens couldn't be returned to the customer (${adjusted.message}). Add them back to the gift card in the Dashboard.`,
					);
					continue;
				}
				returnedCents += used.usedCents;
				const marked = await deps.lots.markRestored(used.lotId, order.number);
				if (!marked.ok)
					console.error(`[rewards] couldn't mark order ${order.number} restored: ${marked.message}`);
			}
			outcome.returnedTokens = tokensInCents(returnedCents);
			if (outcome.returnedTokens > 0) {
				await note(
					deps,
					order,
					`${outcome.returnedTokens} tokens spent on this order were returned to the customer.`,
				);
				const currency = usage.value.find((used) => used.currency)?.currency ?? order.currency;
				if (order.email) {
					await deps.notify.customer(
						order.email,
						tokensReturnedEmail({ orderNumber: order.number, tokens: outcome.returnedTokens, currency }),
					);
				}
			}
		} else {
			outcome.failed = true;
			console.error(`[rewards] couldn't look up the tokens order ${order.number} spent: ${usage.message}`);
		}
	}

	if (outcome.takenBack > 0) {
		await note(deps, order, "the tokens this order earned were taken back.");
	}
	return outcome;
}
