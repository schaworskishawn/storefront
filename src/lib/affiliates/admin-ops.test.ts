import { describe, expect, it } from "vitest";
import { approve, parseAmount, recordPayout, reject, setPaused, setVouchers, suggestCode } from "./admin-ops";
import type { AffiliateAccount } from "./engine";
import {
	parseAffiliateRecord,
	parseOrderStamp,
	serializeAffiliateRecord,
	type AffiliateRecord,
} from "./records";
import { normalizeAffiliateCode, referralLink } from "./referral";

const NOW = new Date("2026-11-18T12:00:00.000Z");

const pending: AffiliateRecord = {
	status: "pending",
	code: null,
	vouchers: [],
	application: null,
	appliedAt: "2026-11-01T00:00:00.000Z",
	approvedAt: null,
	payouts: [],
	payoutMethod: { kind: "tokens" },
	autoHold: null,
	aiReview: null,
	aiFlag: null,
};
const approved: AffiliateRecord = {
	...pending,
	status: "approved",
	code: "neo",
	approvedAt: "2026-11-02T00:00:00.000Z",
};

const others: AffiliateAccount[] = [
	{
		userId: "u-trin",
		email: "t@example.com",
		name: "Trinity",
		record: { ...approved, code: "trinity", vouchers: ["TRIN10"] },
	},
];

describe("approve", () => {
	it("gives the affiliate their code and the approval date", () => {
		const result = approve(pending, "  Neo_1 ", others, "u-neo", NOW);
		expect(result).toEqual({
			ok: true,
			record: { ...pending, status: "approved", code: "neo_1", approvedAt: NOW.toISOString() },
		});
	});

	it("refuses a code someone else has, a malformed one, and an affiliate already approved", () => {
		expect(approve(pending, "trinity", others, "u-neo", NOW).ok).toBe(false);
		expect(approve(pending, "no", others, "u-neo", NOW).ok).toBe(false);
		expect(approve(pending, "has space", others, "u-neo", NOW).ok).toBe(false);
		expect(approve(approved, "neo2", others, "u-neo", NOW).ok).toBe(false);
	});
});

describe("other changes", () => {
	it("rejects only a pending application, and pauses or resumes only an approved affiliate", () => {
		expect(reject(pending)).toMatchObject({ ok: true, record: { status: "rejected" } });
		expect(reject(approved).ok).toBe(false);
		expect(setPaused(approved, true)).toMatchObject({ ok: true, record: { status: "paused" } });
		expect(setPaused({ ...approved, status: "paused" }, false)).toMatchObject({
			ok: true,
			record: { status: "approved" },
		});
		expect(setPaused(pending, true).ok).toBe(false);
	});

	it("links discount codes in uppercase, without duplicates or codes another affiliate has", () => {
		expect(setVouchers(approved, "neo10, Neo10  neo-vip", others, "u-neo")).toMatchObject({
			ok: true,
			record: { vouchers: ["NEO10", "NEO-VIP"] },
		});
		expect(setVouchers(approved, "trin10", others, "u-neo").ok).toBe(false);
		expect(setVouchers(approved, "", others, "u-neo")).toMatchObject({ ok: true, record: { vouchers: [] } });
		expect(setVouchers(pending, "NEO10", others, "u-neo").ok).toBe(false);
	});

	it("records a payout of what was entered in each currency", () => {
		const result = recordPayout(
			approved,
			{ amounts: { USD: "125.50", CAD: "" }, method: " Interac e-Transfer ", note: "" },
			NOW,
			"p1",
		);
		expect(result).toEqual({
			ok: true,
			record: {
				...approved,
				payouts: [
					{ id: "p1", at: NOW.toISOString(), amounts: { USD: 12_550 }, method: "Interac e-Transfer" },
				],
			},
		});
		expect(recordPayout(approved, { amounts: { USD: "" }, method: "x", note: "" }, NOW, "p").ok).toBe(false);
		expect(recordPayout(approved, { amounts: { USD: "12.345" }, method: "x", note: "" }, NOW, "p").ok).toBe(
			false,
		);
		expect(recordPayout(approved, { amounts: { USD: "10" }, method: " ", note: "" }, NOW, "p").ok).toBe(
			false,
		);
		expect(recordPayout(pending, { amounts: { USD: "10" }, method: "x", note: "" }, NOW, "p").ok).toBe(false);
	});

	it("reads amounts the way people type them", () => {
		expect(parseAmount("$1,250.5")).toBe(125_050);
		expect(parseAmount("")).toBe(0);
		expect(parseAmount("-5")).toBeNull();
	});

	it("suggests a code from a name", () => {
		expect(suggestCode("Neo Anderson")).toBe("neoanderson");
		expect(suggestCode("Zoë")).toBe("zoe");
		expect(normalizeAffiliateCode(suggestCode("A"))).not.toBeNull();
	});
});

describe("records", () => {
	it("round-trip, and anything unreadable or of the wrong shape counts as no record", () => {
		expect(parseAffiliateRecord(serializeAffiliateRecord(approved))).toEqual(approved);
		expect(parseAffiliateRecord("not json")).toBeNull();
		expect(parseAffiliateRecord(JSON.stringify({ status: "boss" }))).toBeNull();
		expect(parseAffiliateRecord(null)).toBeNull();
		expect(parseOrderStamp(JSON.stringify({ code: "neo" }))).toBeNull();
	});
});

describe("referral links", () => {
	it("accept 3–32 letters, numbers, - and _, lowercased", () => {
		expect(normalizeAffiliateCode(" NEO ")).toBe("neo");
		expect(normalizeAffiliateCode("wv_neo_2026")).toBe("wv_neo_2026");
		expect(normalizeAffiliateCode("-neo")).toBeNull();
		expect(normalizeAffiliateCode("ne")).toBeNull();
		expect(normalizeAffiliateCode("x".repeat(33))).toBeNull();
		expect(normalizeAffiliateCode(42)).toBeNull();
	});

	it("point at the shop's home page by default", () => {
		expect(referralLink("https://www.worldwidevapor.com/", "neo")).toBe(
			"https://www.worldwidevapor.com/home?aff=neo",
		);
	});
});
