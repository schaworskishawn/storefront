import { describe, expect, it } from "vitest";
import {
	choosePayoutMethod,
	describePayoutMethod,
	shortAddress,
	walletReady,
	walletReadyAt,
} from "./payout-prefs";
import type { PayoutMethod } from "./records";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const TRON = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const POLYGON = "0x52908400098527886E0F7030069857D2E4169EE7";
const tokens: PayoutMethod = { kind: "tokens" };

describe("choosePayoutMethod", () => {
	it("accepts Vapor Tokens", () => {
		expect(choosePayoutMethod({ kind: "tokens" }, tokens, NOW)).toEqual({
			ok: true,
			method: tokens,
			changed: false,
		});
	});

	it("accepts a TRON wallet for USDT and a Polygon wallet for USDC, starting the cooling-off now", () => {
		expect(
			choosePayoutMethod({ kind: "crypto", currency: "usdttrc20", address: ` ${TRON} ` }, tokens, NOW),
		).toEqual({
			ok: true,
			method: { kind: "crypto", currency: "usdttrc20", address: TRON, setAt: NOW.toISOString() },
			changed: true,
		});
		expect(
			choosePayoutMethod({ kind: "crypto", currency: "usdcmatic", address: POLYGON }, tokens, NOW).ok,
		).toBe(true);
	});

	it("refuses an address for the wrong network, or an unknown coin", () => {
		expect(
			choosePayoutMethod({ kind: "crypto", currency: "usdttrc20", address: POLYGON }, tokens, NOW),
		).toEqual({
			ok: false,
			message: expect.stringContaining("TRON wallet address"),
		});
		expect(choosePayoutMethod({ kind: "crypto", currency: "usdcmatic", address: TRON }, tokens, NOW).ok).toBe(
			false,
		);
		expect(choosePayoutMethod({ kind: "crypto", currency: "btc", address: TRON }, tokens, NOW).ok).toBe(
			false,
		);
	});

	it("keeps the age of a wallet that's saved again unchanged", () => {
		const current: PayoutMethod = {
			kind: "crypto",
			currency: "usdttrc20",
			address: TRON,
			setAt: "2026-10-01T00:00:00.000Z",
		};
		expect(
			choosePayoutMethod({ kind: "crypto", currency: "usdttrc20", address: TRON }, current, NOW),
		).toEqual({
			ok: true,
			method: current,
			changed: false,
		});
	});

	it("needs a real email for e-Transfer", () => {
		expect(choosePayoutMethod({ kind: "etransfer", email: "neo@bank.example" }, tokens, NOW)).toEqual({
			ok: true,
			method: { kind: "etransfer", email: "neo@bank.example" },
			changed: true,
		});
		expect(choosePayoutMethod({ kind: "etransfer", email: "neo" }, tokens, NOW).ok).toBe(false);
		expect(choosePayoutMethod({ kind: "paypal" }, tokens, NOW).ok).toBe(false);
	});
});

describe("the wallet cooling-off", () => {
	const wallet: PayoutMethod = {
		kind: "crypto",
		currency: "usdttrc20",
		address: TRON,
		setAt: "2026-11-17T12:00:00.000Z",
	};

	it("pays a new wallet only 72 hours after it was set", () => {
		expect(walletReadyAt(wallet)?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
		expect(walletReady(wallet, NOW)).toBe(false);
		expect(walletReady(wallet, new Date("2026-11-20T12:00:00.000Z"))).toBe(true);
	});

	it("doesn't apply to other ways of being paid", () => {
		expect(walletReadyAt(tokens)).toBeNull();
		expect(walletReady(tokens, NOW)).toBe(true);
	});
});

describe("describePayoutMethod", () => {
	it("says how someone is paid without printing a whole wallet address", () => {
		expect(describePayoutMethod(tokens)).toBe("Vapor Tokens (+25%)");
		expect(describePayoutMethod({ kind: "crypto", currency: "usdcmatic", address: POLYGON, setAt: "" })).toBe(
			"USDC (Polygon) to 0x5290…9EE7",
		);
		expect(describePayoutMethod({ kind: "etransfer", email: "neo@bank.example" })).toBe(
			"Interac e-Transfer to neo@bank.example",
		);
		expect(shortAddress("short")).toBe("short");
	});
});
