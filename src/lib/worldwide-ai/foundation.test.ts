import { describe, expect, it } from "vitest";
import { keyFrom, sha256Hex } from "./hash";
import {
	MoneyError,
	addMoney,
	formatMoney,
	isMoney,
	makeMoney,
	parseMoney,
	subtractMoney,
	sumMoney,
} from "./money";
import { passesLuhn, previewText, redactDeep, redactText } from "./redact";
import { daysBetween, formatAge, formatOpsDate, formatOpsDateTime, opsDayKey } from "./time";
import { actorKey, actorLabel, isOperator, isRoleId, isTaskKind, ROLE_IDS, TASK_STATES } from "./types";

describe("money", () => {
	it("keeps the currency with the amount and refuses to mix currencies", () => {
		const cad = makeMoney(1050, "CAD");
		expect(addMoney(cad, makeMoney(250, "CAD"))).toEqual({ amountMinor: 1300, currency: "CAD" });
		expect(subtractMoney(cad, makeMoney(50, "CAD"))).toEqual({ amountMinor: 1000, currency: "CAD" });
		expect(() => addMoney(cad, makeMoney(1, "USD"))).toThrow(MoneyError);
		expect(() => subtractMoney(cad, makeMoney(1, "USD"))).toThrow(MoneyError);
	});

	it("rejects an amount without a real currency or whole minor units", () => {
		expect(() => makeMoney(100, "")).toThrow(MoneyError);
		expect(() => makeMoney(100, "cad")).toThrow(MoneyError);
		expect(() => makeMoney(1.5, "CAD")).toThrow(MoneyError);
		expect(isMoney({ amountMinor: 5, currency: "CAD" })).toBe(true);
		expect(isMoney({ amountMinor: 5 })).toBe(false);
		expect(isMoney({ amountMinor: 5.5, currency: "CAD" })).toBe(false);
		expect(isMoney(null)).toBe(false);
	});

	it("does exact arithmetic where floats drift", () => {
		const dimes = Array.from({ length: 10 }, () => parseMoney("0.10", "CAD"));
		expect(sumMoney(dimes, "CAD")).toEqual({ amountMinor: 100, currency: "CAD" });
		expect(sumMoney([], "USD")).toEqual({ amountMinor: 0, currency: "USD" });
		expect(() => sumMoney([makeMoney(1, "USD")], "CAD")).toThrow(MoneyError);
	});

	it("parses decimals without a float", () => {
		expect(parseMoney("19.99", "CAD").amountMinor).toBe(1999);
		expect(parseMoney("12", "CAD").amountMinor).toBe(1200);
		expect(parseMoney("-0.5", "CAD").amountMinor).toBe(-50);
		expect(parseMoney("1200", "JPY").amountMinor).toBe(1200);
		expect(parseMoney("1.234", "KWD").amountMinor).toBe(1234);
		expect(() => parseMoney("1.999", "CAD")).toThrow(MoneyError);
		expect(() => parseMoney("12.5.1", "CAD")).toThrow(MoneyError);
		expect(() => parseMoney("abc", "CAD")).toThrow(MoneyError);
	});

	it("always prints the currency", () => {
		expect(formatMoney(makeMoney(123456, "CAD"))).toBe("CAD 1,234.56");
		expect(formatMoney(makeMoney(-5, "USD"))).toBe("-USD 0.05");
		expect(formatMoney(makeMoney(1500, "JPY"))).toBe("JPY 1,500");
	});
});

describe("redaction", () => {
	it("removes emails, phone numbers and card numbers but keeps short order numbers", () => {
		const out = redactText(
			"Email jane.doe@example.com or call +1 (204) 555-0142. Card 4242 4242 4242 4242, order 1042.",
		);
		expect(out).not.toContain("jane.doe");
		expect(out).toContain("[email]");
		expect(out).toContain("[phone]");
		expect(out).toContain("[card]");
		expect(out).toContain("order 1042");
	});

	it("removes tokens and keys", () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
		const out = redactText(
			`token ${jwt} key sk-ant-api03-abcdefghijklmnop Authorization: Bearer abcdef1234567890xyz hash ${"a1".repeat(20)}`,
		);
		expect(out).not.toContain("eyJhbGci");
		expect(out).not.toContain("abcdefghijklmnop");
		expect(out).not.toContain("abcdef1234567890xyz");
		expect(out).not.toContain("a1a1a1a1");
	});

	it("leaves ordinary words, short numbers and URLs readable", () => {
		const text = "Order 1042 shipped on 2026-10-06 via https://www.example.com/track/abc. Thanks!";
		expect(redactText(text)).toBe(text);
	});

	it("checks Luhn", () => {
		expect(passesLuhn("4242424242424242")).toBe(true);
		expect(passesLuhn("4242424242424241")).toBe(false);
		expect(passesLuhn("123")).toBe(false);
	});

	it("redacts inside nested data and drops secret-named fields", () => {
		const out = redactDeep({
			note: "from a@b.co",
			password: "hunter2",
			nested: { apiKey: "xyz", list: ["call 204-555-0100 now", 3, null] },
		});
		expect(out).toEqual({
			note: "from [email]",
			password: "[redacted]",
			nested: { apiKey: "[redacted]", list: ["call [phone] now", 3, null] },
		});
	});

	it("keeps record ids, hashes and token counts, which are not secrets", () => {
		const id = "50bfded9-18fb-4110-b08f-75c4f0f5a085";
		const sha = "a".repeat(32) + "1".repeat(32);
		const out = redactDeep({
			draftId: id,
			bodySha256: sha,
			inputTokens: 120,
			outputTokens: 80,
			accessToken: "abc",
			note: `case ${id}`,
		});
		expect(out).toEqual({
			draftId: id,
			bodySha256: sha,
			inputTokens: 120,
			outputTokens: 80,
			accessToken: "[redacted]",
			note: `case ${id}`,
		});
	});

	it("survives cycles and very deep data", () => {
		const a: Record<string, unknown> = { name: "x" };
		a.self = a;
		expect(() => redactDeep(a)).not.toThrow();
		let deep: Record<string, unknown> = { v: "end" };
		for (let i = 0; i < 20; i++) deep = { child: deep };
		expect(JSON.stringify(redactDeep(deep))).toContain("[truncated]");
	});

	it("previews long text briefly and redacted", () => {
		expect(previewText("hello\n\n  world a@b.co", 100)).toBe("hello world [email]");
		expect(previewText("x".repeat(500), 20)).toHaveLength(20);
	});
});

describe("time", () => {
	it("shows operational times in Winnipeg", () => {
		// 2026-10-07 03:30 UTC is 22:30 on Oct 6 in Winnipeg (CDT, UTC-5).
		expect(formatOpsDate("2026-10-07T03:30:00Z")).toBe("Oct 6, 2026");
		expect(opsDayKey("2026-10-07T03:30:00Z")).toBe("2026-10-06");
		expect(formatOpsDateTime("2026-10-07T03:30:00Z")).toMatch(/Oct 6, 2026/);
		expect(formatOpsDateTime("2026-10-07T03:30:00Z")).toMatch(/CDT/);
	});

	it("uses standard time in winter", () => {
		expect(formatOpsDateTime("2026-01-15T18:00:00Z")).toMatch(/CST/);
		expect(opsDayKey("2026-01-16T05:30:00Z")).toBe("2026-01-15");
	});

	it("shows a dash for nothing", () => {
		expect(formatOpsDateTime(null)).toBe("—");
		expect(formatOpsDate(undefined)).toBe("—");
		expect(formatOpsDateTime("not a date")).toBe("—");
	});

	it("counts calendar days", () => {
		expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6);
		expect(daysBetween("2026-10-07", "2026-10-01")).toBe(-6);
		expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
		expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
	});

	it("describes how long ago", () => {
		const now = Date.parse("2026-10-07T12:00:00Z");
		expect(formatAge(now - 10_000, now)).toBe("just now");
		expect(formatAge(now - 5 * 60_000, now)).toBe("5 min ago");
		expect(formatAge(now - 3 * 3_600_000, now)).toBe("3 h ago");
		expect(formatAge(now - 5 * 86_400_000, now)).toBe("5 days ago");
	});
});

describe("hash and types", () => {
	it("hashes consistently and builds unambiguous keys", () => {
		expect(sha256Hex("a")).toBe(sha256Hex("a"));
		expect(sha256Hex("a")).toHaveLength(64);
		expect(keyFrom("ab", "c")).not.toBe(keyFrom("a", "bc"));
		expect(keyFrom("x", 1)).toBe(keyFrom("x", 1));
	});

	it("knows the 49 roles and 7 task states", () => {
		expect(ROLE_IDS).toHaveLength(49);
		expect(new Set(ROLE_IDS).size).toBe(49);
		expect(ROLE_IDS[0]).toBe("nexus");
		expect(TASK_STATES).toEqual([
			"queued",
			"running",
			"needs_review",
			"completed",
			"failed",
			"cancelled",
			"outcome_unknown",
		]);
		expect(isRoleId("relay")).toBe(true);
		expect(isRoleId("mallory")).toBe(false);
		expect(isTaskKind("relay.support_draft")).toBe(true);
		expect(isTaskKind("ledger.post_entry")).toBe(false);
	});

	it("tells actors apart", () => {
		const operator = { kind: "operator", id: "u1", label: "Pat", role: "owner" } as const;
		expect(actorKey(operator)).toBe("operator:u1");
		expect(actorKey({ kind: "agent", roleId: "relay" })).toBe("agent:relay");
		expect(actorKey({ kind: "system", label: "schedule" })).toBe("system:schedule");
		expect(actorLabel(operator)).toBe("Pat");
		expect(isOperator(operator)).toBe(true);
		expect(isOperator({ kind: "agent", roleId: "relay" })).toBe(false);
	});
});
