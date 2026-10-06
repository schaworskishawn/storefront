import { buildCheckoutTokensState, type CheckoutTokensState } from "./checkout-state";
import { planApplication, type TokenLot } from "./lots";
import type { LotWithCode } from "./saleor-rewards";
import type { RewardsConfig } from "./tokens";

/**
 * What the checkout asks of Vapor Tokens: show the customer's balance, put tokens on the checkout, take them off. The
 * rules live here with every outside service injected (rewards-actions.ts wires the real ones), so they are unit-tested
 * without Saleor.
 *
 * Tokens are Saleor gift cards, so "applying" one is Saleor's own promo-code mutation with the lot's code. That code is a
 * bearer secret and never leaves the server: the browser only ever asks to "use my tokens".
 */

/** The parts of a checkout this flow reads. */
export type FlowCheckout = {
	id: string;
	currency: string;
	/** What is still to pay: Saleor has already taken anything applied off it. */
	totalCents: number;
	shippingCents: number;
	taxCents: number;
	subtotalCents: number;
	/** The signed-in customer the checkout belongs to, if it is attached to one. */
	userId: string | null;
	giftCardIds: string[];
};

export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

/** A checkout after a change, in the caller's own type `C` (the full checkout the screen shows) plus what this flow needs. */
export type Changed<C> = { checkout: C; flow: FlowCheckout };

export type FlowDeps<C> = {
	now: () => Date;
	config: RewardsConfig;
	/** The checkout with this id, or null if there isn't one. */
	checkout: (checkoutId: string) => Promise<FlowCheckout | null>;
	/** The signed-in customer's id, or null for a guest. */
	userId: () => Promise<string | null>;
	lots: (userId: string, withCode: boolean) => Promise<Outcome<LotWithCode[]>>;
	/** A lot's code from Saleor, for a lot whose stored copy is missing. */
	readCode: (lotId: string) => Promise<Outcome<string | null>>;
	/** Attach the signed-in customer to a checkout that doesn't have one yet. */
	attach: (checkoutId: string) => Promise<Outcome<Changed<C>>>;
	apply: (checkoutId: string, code: string) => Promise<Outcome<Changed<C>>>;
	remove: (checkoutId: string, giftCardId: string) => Promise<Outcome<Changed<C>>>;
	report: (message: string) => void;
};

export type TokensView =
	| { status: "disabled" }
	| { status: "unavailable" }
	| { status: "guest"; willEarnTokens: number }
	| ({ status: "ready"; currency: string } & CheckoutTokensState);

export type TokensErrorCode =
	| "disabled"
	| "sign-in"
	| "not-yours"
	| "no-checkout"
	| "no-tokens"
	| "unavailable"
	| "failed";

export type TokensResult<C> =
	| { ok: true; checkout: C }
	| { ok: false; code: TokensErrorCode; message?: string };

const fail = <C>(code: TokensErrorCode, message?: string): TokensResult<C> => ({ ok: false, code, message });

const stateFor = (
	checkout: FlowCheckout,
	lots: readonly TokenLot[],
	deps: { now: () => Date; config: RewardsConfig },
) =>
	buildCheckoutTokensState({
		now: deps.now(),
		currency: checkout.currency,
		totalCents: checkout.totalCents,
		shippingCents: checkout.shippingCents,
		taxCents: checkout.taxCents,
		subtotalCents: checkout.subtotalCents,
		checkoutGiftCardIds: checkout.giftCardIds,
		lots,
		tokensPerDollar: deps.config.tokensPerDollar,
	});

/** What the panel shows for this checkout. */
export async function readTokensView<C>(checkoutId: string, deps: FlowDeps<C>): Promise<TokensView> {
	if (!deps.config.enabled) return { status: "disabled" };

	const checkout = await deps.checkout(checkoutId);
	if (!checkout) return { status: "unavailable" };

	const userId = await deps.userId();
	if (!userId) return guestView(checkout, deps);
	// A checkout that belongs to someone else is not this customer's to spend on.
	if (checkout.userId && checkout.userId !== userId) return { status: "unavailable" };

	const lots = await deps.lots(userId, false);
	if (!lots.ok) {
		deps.report(`Couldn't read a customer's Vapor Tokens: ${lots.message}`);
		return { status: "unavailable" };
	}
	return { status: "ready", currency: checkout.currency, ...stateFor(checkout, lots.value, deps) };
}

function guestView<C>(checkout: FlowCheckout, deps: FlowDeps<C>): TokensView {
	// Only the earning estimate: a guest has no tokens to spend.
	const { willEarnTokens } = stateFor(checkout, [], deps);
	return { status: "guest", willEarnTokens };
}

type Context = { checkout: FlowCheckout; userId: string };

/** Checks the request is the signed-in customer's own, and attaches them to a checkout that has no customer yet. */
async function ownContext<C>(checkoutId: string, deps: FlowDeps<C>): Promise<Context | TokensResult<C>> {
	if (!deps.config.enabled) return fail("disabled");

	const userId = await deps.userId();
	if (!userId) return fail("sign-in");

	const checkout = await deps.checkout(checkoutId);
	if (!checkout) return fail("no-checkout");
	if (checkout.userId && checkout.userId !== userId) return fail("not-yours");
	if (checkout.userId) return { checkout, userId };

	const attached = await deps.attach(checkoutId);
	if (!attached.ok) return fail("failed", attached.message);
	return { checkout: attached.value.flow, userId };
}

const isFailure = <C>(value: Context | TokensResult<C>): value is TokensResult<C> => "ok" in value;

/**
 * Puts the customer's tokens on the checkout, soonest-expiring first, as many lots as the order needs. Applying again does
 * nothing more once the order is covered. Returns the checkout as Saleor now has it.
 */
export async function applyTokens<C>(checkoutId: string, deps: FlowDeps<C>): Promise<TokensResult<C>> {
	const context = await ownContext(checkoutId, deps);
	if (isFailure(context)) return context;

	const lots = await deps.lots(context.userId, true);
	if (!lots.ok) {
		deps.report(`Couldn't read a customer's Vapor Tokens to apply them: ${lots.message}`);
		return fail("unavailable");
	}

	let { checkout } = context;
	// Lots whose code couldn't be found: planned around, so the next lot gets its turn.
	const skipped = new Set<string>();
	// The checkout after the last lot that went on, or null while none has.
	let applied: C | null = null;
	let sawTokens = false;

	// One lot at a time, planning again after each, so a lot that can't go on doesn't leave the order short.
	for (let attempt = 0; attempt < lots.value.length; attempt += 1) {
		const [lot] = planApplication(
			lots.value,
			deps.now(),
			checkout.currency,
			checkout.totalCents,
			new Set([...checkout.giftCardIds, ...skipped]),
		).lots;
		if (!lot) break;
		sawTokens = true;

		const code = await codeFor(lot, deps);
		if (!code) {
			deps.report(`A Vapor Tokens lot (${lot.id}) has no code to apply; skipped.`);
			skipped.add(lot.id);
			continue;
		}

		const result = await deps.apply(checkoutId, code);
		if (!result.ok) {
			deps.report(`Saleor refused a Vapor Tokens lot (${lot.id}): ${result.message}`);
			// Lots that already went on stay on; say what went wrong only when none did.
			return applied === null ? fail("failed", result.message) : { ok: true, checkout: applied };
		}
		checkout = result.value.flow;
		applied = result.value.checkout;
	}

	if (applied !== null) return { ok: true, checkout: applied };
	// Tokens existed but none could be applied (lost codes) is a fault; having none to apply is not.
	return fail(sawTokens ? "unavailable" : "no-tokens");
}

async function codeFor<C>(lot: LotWithCode, deps: FlowDeps<C>): Promise<string | null> {
	if (lot.code) return lot.code;
	// The copy kept at creation is missing: Saleor still shows the code of a lot nobody has used yet.
	const read = await deps.readCode(lot.id);
	return read.ok ? read.value : null;
}

/** Takes the customer's tokens off the checkout. Other gift cards and discount codes stay. */
export async function removeTokens<C>(checkoutId: string, deps: FlowDeps<C>): Promise<TokensResult<C>> {
	const context = await ownContext(checkoutId, deps);
	if (isFailure(context)) return context;

	const lots = await deps.lots(context.userId, false);
	if (!lots.ok) {
		deps.report(`Couldn't read a customer's Vapor Tokens to remove them: ${lots.message}`);
		return fail("unavailable");
	}

	const mine = new Set(lots.value.map((lot) => lot.id));
	const onCheckout = context.checkout.giftCardIds.filter((id) => mine.has(id));
	if (onCheckout.length === 0) return fail("no-tokens");

	let latest: C | null = null;
	for (const id of onCheckout) {
		const removed = await deps.remove(checkoutId, id);
		if (!removed.ok) return fail("failed", removed.message);
		latest = removed.value.checkout;
	}
	return latest === null ? fail("unavailable") : { ok: true, checkout: latest };
}
