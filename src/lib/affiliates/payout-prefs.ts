import { CRYPTO_COINS, isCryptoCoin, type PayoutMethod } from "./records";
import { TOKEN_BONUS_BPS, WALLET_CHANGE_HOLD_HOURS } from "./tiers";

/**
 * An affiliate's choice of how to be paid, checked before it's saved: Vapor Tokens (automatic, with the bonus), a crypto
 * wallet (USDT on TRON or USDC on Polygon, through NOWPayments), or Interac e-Transfer (sent by hand). Pure, so every rule
 * is tested on its own (payout-prefs.test.ts).
 */

/** A wallet address in the shape its network uses: TRON addresses start with T, Polygon ones are 0x and 40 hex digits. */
const ADDRESS_SHAPE: Record<keyof typeof CRYPTO_COINS, RegExp> = {
	usdttrc20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
	usdcmatic: /^0x[0-9a-fA-F]{40}$/,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PayoutChoice = { kind: string; currency?: string; address?: string; email?: string };

export function choosePayoutMethod(
	choice: PayoutChoice,
	current: PayoutMethod,
	now: Date,
): { ok: true; method: PayoutMethod; changed: boolean } | { ok: false; message: string } {
	if (choice.kind === "tokens")
		return { ok: true, method: { kind: "tokens" }, changed: current.kind !== "tokens" };

	if (choice.kind === "crypto") {
		if (!isCryptoCoin(choice.currency))
			return { ok: false, message: "Choose USDT (TRON) or USDC (Polygon)." };
		const address = (choice.address ?? "").trim();
		if (!ADDRESS_SHAPE[choice.currency].test(address))
			return {
				ok: false,
				message: `That doesn't look like a ${CRYPTO_COINS[choice.currency].network} wallet address. Copy it straight from your wallet.`,
			};
		const same =
			current.kind === "crypto" && current.currency === choice.currency && current.address === address;
		return {
			ok: true,
			// Keeping the same wallet keeps its age; a new one starts the cooling-off period again.
			method: {
				kind: "crypto",
				currency: choice.currency,
				address,
				setAt: same ? current.setAt : now.toISOString(),
			},
			changed: !same,
		};
	}

	if (choice.kind === "etransfer") {
		const email = (choice.email ?? "").trim();
		if (!EMAIL.test(email))
			return { ok: false, message: "Enter the email address your bank uses for e-Transfers." };
		return {
			ok: true,
			method: { kind: "etransfer", email },
			changed: current.kind !== "etransfer" || current.email !== email,
		};
	}

	return { ok: false, message: "Choose how you'd like to be paid." };
}

/** When a crypto wallet can first be paid: the cooling-off after it was set. Null for other methods. */
export function walletReadyAt(method: PayoutMethod): Date | null {
	if (method.kind !== "crypto") return null;
	return new Date(Date.parse(method.setAt) + WALLET_CHANGE_HOLD_HOURS * 60 * 60 * 1000);
}

export const walletReady = (method: PayoutMethod, now: Date): boolean =>
	method.kind !== "crypto" || (walletReadyAt(method)?.getTime() ?? Infinity) <= now.getTime();

/** "T9yD…k2Pq": enough of an address to recognise it, without printing the whole thing everywhere. */
export const shortAddress = (address: string): string =>
	address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

/** "Vapor Tokens (+25%)", "USDT (TRON) to T9yD…k2Pq", "Interac e-Transfer to neo@example.com". */
export function describePayoutMethod(method: PayoutMethod): string {
	if (method.kind === "tokens") return `Vapor Tokens (+${TOKEN_BONUS_BPS / 100}%)`;
	if (method.kind === "crypto")
		return `${CRYPTO_COINS[method.currency].label} to ${shortAddress(method.address)}`;
	return `Interac e-Transfer to ${method.email}`;
}
