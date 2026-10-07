import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { sha256Hex } from "../hash";
import { ROLES } from "../agents/registry";
import { freshDb, owner, staff } from "../testing.test-util";
import { COLLECTION_IDS, collectionLabel, isCollectionId } from "./collections";
import { daysUntil, evaluateFreshness, isIsoDay } from "./freshness";
import { buildOrQuery, searchTerms } from "./query";
import {
	AtlasError,
	addVersion,
	approveVersion,
	createDocument,
	getDocument,
	listDocuments,
	listPendingVersions,
	rejectVersion,
	retireDocument,
	searchApproved,
	updateDocumentDetails,
	versionStillMatches,
} from "./service";

describe("collections", () => {
	it("knows the shelves and labels them", () => {
		expect(isCollectionId("support-policy")).toBe(true);
		expect(isCollectionId("secrets")).toBe(false);
		expect(collectionLabel("tax-rules")).toBe("Tax rules");
		expect(collectionLabel("unknown")).toBe("unknown");
	});

	it("only lets roles read collections that exist", () => {
		for (const role of ROLES)
			for (const c of role.knowledge) expect(COLLECTION_IDS, `${role.id} -> ${c}`).toContain(c);
	});
});

describe("freshness", () => {
	const now = new Date("2026-10-07T15:00:00Z");
	const base = {
		approvedAt: "2026-09-01T12:00:00Z",
		reviewDue: null,
		expiresAt: null,
		now,
		staleAfterDays: 180,
	};

	it("is current inside the dates", () => {
		expect(evaluateFreshness({ ...base, reviewDue: "2026-12-01", expiresAt: "2027-06-01" })).toEqual({
			state: "current",
			reasons: [],
		});
		expect(evaluateFreshness(base).state).toBe("current");
	});

	it("is stale once a review date has passed, but not on the day itself", () => {
		expect(evaluateFreshness({ ...base, reviewDue: "2026-10-06" }).state).toBe("stale");
		expect(evaluateFreshness({ ...base, reviewDue: "2026-10-07" }).state).toBe("current");
	});

	it("is stale when it has no review date and is older than the limit", () => {
		const out = evaluateFreshness({ ...base, approvedAt: "2026-01-01T12:00:00Z" });
		expect(out.state).toBe("stale");
		expect(out.reasons[0]).toMatch(/no review date/);
	});

	it("is expired after its last valid day, and expiry wins over a stale review", () => {
		expect(evaluateFreshness({ ...base, expiresAt: "2026-10-06" }).state).toBe("expired");
		expect(evaluateFreshness({ ...base, expiresAt: "2026-10-07" }).state).toBe("current");
		expect(evaluateFreshness({ ...base, reviewDue: "2026-01-01", expiresAt: "2026-10-06" }).state).toBe(
			"expired",
		);
	});

	it("compares dates on the Winnipeg calendar, not UTC", () => {
		// 03:30 UTC on Oct 8 is still the evening of Oct 7 in Winnipeg.
		const lateEvening = new Date("2026-10-08T03:30:00Z");
		expect(evaluateFreshness({ ...base, now: lateEvening, expiresAt: "2026-10-07" }).state).toBe("current");
	});

	it("counts days and validates dates", () => {
		expect(daysUntil("2026-10-10", now)).toBe(3);
		expect(daysUntil("2026-10-01", now)).toBe(-6);
		expect(isIsoDay("2026-02-29")).toBe(false);
		expect(isIsoDay("2028-02-29")).toBe(true);
		expect(isIsoDay("10/07/2026")).toBe(false);
		expect(isIsoDay(20261007)).toBe(false);
	});
});

describe("search queries", () => {
	it("keeps meaningful words and drops filler", () => {
		expect(searchTerms("Hello, where is my order? I want to return the coil please!")).toEqual([
			"want",
			"return",
			"coil",
		]);
	});

	it("matches any word, not all", () => {
		expect(buildOrQuery("refund for damaged coil")).toBe("refund | damaged | coil");
	});

	it("keeps query syntax out of the query", () => {
		const q = buildOrQuery("'; drop table wai_tasks; -- & | ! ( ) :* <-> refund");
		expect(q).toBe("drop | table | wai | tasks | refund");
		expect(q).not.toMatch(/[';:&!()<>*-]/);
	});

	it("folds accents, dedupes and caps the number of terms", () => {
		expect(searchTerms("Café café CAFÉ")).toEqual(["cafe"]);
		const many = Array.from({ length: 60 }, (_, i) => `word${i}x`).join(" ");
		expect(searchTerms(many)).toHaveLength(24);
	});

	it("has nothing to search for when there is only filler", () => {
		expect(buildOrQuery("hi, thanks!")).toBeNull();
		expect(buildOrQuery("12345 6789")).toBeNull();
	});
});

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
}, 60_000);
afterAll(async () => {
	await sql.close();
});

const now = new Date("2026-10-07T15:00:00Z");
const returns = {
	collection: "returns",
	title: "Returns and refunds",
	owner: "Olivia",
	source: "Returns page, October 2026",
	content:
		"Unopened items can be returned within 30 days for a refund to the original payment method. Opened coils and e-liquids cannot be returned.",
};
const search = (query: string, extra: Partial<Parameters<typeof searchApproved>[1]> = {}) =>
	searchApproved(sql, {
		query,
		allowedCollections: ["returns", "shipping", "support-policy"],
		now,
		...extra,
	});

describe("the document library", () => {
	it("creates a draft that no search will return until the owner approves it", async () => {
		const { document, version } = await createDocument(sql, staff, returns);
		expect(document.status).toBe("draft");
		expect(document.currentVersion).toBeNull();
		expect(document.freshness).toBeNull();
		expect(version.version).toBe(1);
		expect(version.status).toBe("draft");
		expect(version.contentSha256).toBe(sha256Hex(returns.content));
		expect((await search("refund return coil")).hits).toHaveLength(0);
		expect((await listPendingVersions(sql)).map((v) => v.documentId)).toContain(document.id);
	});

	it("lets only the owner approve, and logs a refused attempt", async () => {
		const { document } = await createDocument(sql, staff, { ...returns, title: "Staff-submitted returns" });
		await expect(approveVersion(sql, staff, document.id, 1)).rejects.toMatchObject({ code: "forbidden" });
		const denied = (await listAudit(sql)).find(
			(a) => a.action === "atlas.approve_version" && a.outcome === "denied",
		);
		expect(denied).toMatchObject({ actor: "operator:staff-1", subject: document.id });
		expect((await getDocument(sql, document.id))?.document.status).toBe("draft");
	});

	it("makes an approved version retrievable, with its version, hash and freshness", async () => {
		const { document } = await createDocument(sql, owner, {
			...returns,
			title: "Returns policy v1",
			reviewDue: "2026-12-01",
		});
		const approved = await approveVersion(sql, owner, document.id, 1, { note: "Matches the live page" });
		expect(approved.status).toBe("approved");
		expect(approved.approvedBy).toBe("operator:owner-1");

		const result = await search("Can I return an opened coil for a refund?", { collection: "returns" });
		const hit = result.hits.find((h) => h.documentId === document.id);
		expect(hit).toBeDefined();
		expect(hit).toMatchObject({
			version: 1,
			contentSha256: sha256Hex(returns.content),
			freshness: { state: "current" },
			owner: "Olivia",
		});
		expect(hit?.content).toContain("30 days");
		expect(hit?.excerpt.length).toBeGreaterThan(0);
		expect(hit?.excerpt).not.toContain("<b>");
		expect(result.retrievedAt).toBe(now.toISOString());
	});

	it("records the approval as a review decision", async () => {
		const { document } = await createDocument(sql, owner, { ...returns, title: "Reviewed returns" });
		await approveVersion(sql, owner, document.id, 1, { note: "ok" });
		const { rows } = await sql.query("select * from wai_reviews where subject_id = $1", [`${document.id}:1`]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			decision: "approved",
			reviewer: "operator:owner-1",
			reviewer_label: "Olivia Owner",
			note: "ok",
		});
	});

	it("keeps the old version current until a new one is approved, then supersedes it", async () => {
		const { document } = await createDocument(sql, owner, {
			...returns,
			title: "Versioned shipping",
			collection: "shipping",
			content: "Orders ship within two business days.",
		});
		await approveVersion(sql, owner, document.id, 1);
		const v2 = await addVersion(sql, staff, document.id, { content: "Orders ship within one business day." });
		expect(v2.version).toBe(2);

		let found = await search("how long until orders ship", { collection: "shipping" });
		expect(found.hits.find((h) => h.documentId === document.id)).toMatchObject({ version: 1 });
		expect((await getDocument(sql, document.id))?.document.pendingVersion).toBe(2);

		await approveVersion(sql, owner, document.id, 2);
		found = await search("how long until orders ship", { collection: "shipping" });
		expect(found.hits.find((h) => h.documentId === document.id)).toMatchObject({ version: 2 });
		const statuses = (await getDocument(sql, document.id))?.versions.map((v) => [v.version, v.status]);
		expect(statuses).toEqual([
			[2, "approved"],
			[1, "superseded"],
		]);
	});

	it("can't approve the same version twice or one that doesn't exist", async () => {
		const { document } = await createDocument(sql, owner, { ...returns, title: "Twice" });
		await approveVersion(sql, owner, document.id, 1);
		await expect(approveVersion(sql, owner, document.id, 1)).rejects.toMatchObject({ code: "conflict" });
		await expect(approveVersion(sql, owner, document.id, 9)).rejects.toMatchObject({ code: "not_found" });
		await expect(approveVersion(sql, owner, "00000000-0000-4000-8000-000000000000", 1)).rejects.toMatchObject(
			{ code: "not_found" },
		);
	});

	it("stops returning a retired document", async () => {
		const { document } = await createDocument(sql, owner, {
			...returns,
			title: "Retire me",
			content: "Quarantine zebra policy text.",
		});
		await approveVersion(sql, owner, document.id, 1);
		expect((await search("quarantine zebra")).hits.some((h) => h.documentId === document.id)).toBe(true);
		await expect(retireDocument(sql, staff, document.id)).rejects.toMatchObject({ code: "forbidden" });
		await retireDocument(sql, owner, document.id, "Superseded by the new site");
		expect((await search("quarantine zebra")).hits.some((h) => h.documentId === document.id)).toBe(false);
		await expect(addVersion(sql, owner, document.id, { content: "new" })).rejects.toMatchObject({
			code: "conflict",
		});
		await expect(retireDocument(sql, owner, document.id)).rejects.toMatchObject({ code: "conflict" });
	});

	it("rejects a draft version without it becoming a source", async () => {
		const { document } = await createDocument(sql, owner, {
			...returns,
			title: "Rejected",
			content: "Rejected walrus wording.",
		});
		await expect(rejectVersion(sql, staff, document.id, 1)).rejects.toMatchObject({ code: "forbidden" });
		await rejectVersion(sql, owner, document.id, 1, "Wrong");
		expect((await search("rejected walrus")).hits).toHaveLength(0);
		await expect(rejectVersion(sql, owner, document.id, 1)).rejects.toMatchObject({ code: "conflict" });
	});

	it("only searches the collections the caller may read", async () => {
		const { document } = await createDocument(sql, owner, {
			...returns,
			collection: "tax-rules",
			title: "GST rules",
			content: "Platypus remittance threshold for small suppliers.",
		});
		await approveVersion(sql, owner, document.id, 1);
		expect((await search("platypus remittance")).hits).toHaveLength(0);
		await expect(search("platypus remittance", { collection: "tax-rules" })).rejects.toMatchObject({
			code: "forbidden",
		});
		const asTally = await searchApproved(sql, {
			query: "platypus remittance",
			allowedCollections: ["tax-rules"],
			now,
		});
		expect(asTally.hits.map((h) => h.documentId)).toContain(document.id);
	});

	it("flags a stale source and skips an expired one, saying why", async () => {
		const stale = await createDocument(sql, owner, {
			...returns,
			title: "Stale shipping",
			collection: "shipping",
			content: "Narwhal freight uses ground service.",
			reviewDue: "2026-09-01",
		});
		await approveVersion(sql, owner, stale.document.id, 1, { reviewDue: "2026-09-01" });
		const expired = await createDocument(sql, owner, {
			...returns,
			title: "Expired holiday notice",
			collection: "shipping",
			content: "Narwhal holiday cutoff is December 15.",
			expiresAt: "2026-10-01",
		});
		await approveVersion(sql, owner, expired.document.id, 1);

		const result = await search("narwhal freight holiday", { collection: "shipping" });
		const staleHit = result.hits.find((h) => h.documentId === stale.document.id);
		expect(staleHit?.freshness.state).toBe("stale");
		expect(staleHit?.freshness.reasons[0]).toMatch(/review was due on 2026-09-01/i);
		expect(result.hits.some((h) => h.documentId === expired.document.id)).toBe(false);
		expect(result.skipped).toEqual([
			{ documentId: expired.document.id, title: "Expired holiday notice", reason: "Expired on 2026-10-01." },
		]);
	});

	it("ranks the better match first and respects the limit", async () => {
		for (const [title, content] of [
			["Unrelated", "Gizmo warranty covers manufacturing defects for one year."],
			["Gizmo returns", "Gizmo returns gizmo refund gizmo exchange gizmo process."],
		] as const) {
			const { document } = await createDocument(sql, owner, { ...returns, title, content });
			await approveVersion(sql, owner, document.id, 1);
		}
		const result = await search("gizmo returns refund", { limit: 1 });
		expect(result.hits).toHaveLength(1);
		expect(result.hits[0].title).toBe("Gizmo returns");
	});

	it("returns nothing, rather than guessing, when nothing matches or there is nothing to search for", async () => {
		expect((await search("xylophone quasar")).hits).toEqual([]);
		expect(await search("hi thanks")).toMatchObject({ hits: [], skipped: [] });
		expect(await searchApproved(sql, { query: "refund", allowedCollections: [], now })).toMatchObject({
			hits: [],
		});
	});

	it("survives hostile search text", async () => {
		const attempts = [
			"'); delete from wai_tasks; --",
			"refund & | ! ( ) <-> :*",
			"\u0000\u0001 refund",
			"a".repeat(5000),
		];
		for (const q of attempts) await expect(search(q)).resolves.toBeDefined();
		const { rows } = await sql.query("select count(*)::int as n from wai_documents");
		expect(rows[0].n).toBeGreaterThan(0);
	});

	it("checks a stored reference against what the document says now", async () => {
		const { document } = await createDocument(sql, owner, { ...returns, title: "Reference check" });
		expect(await versionStillMatches(sql, document.id, 1, sha256Hex(returns.content))).toBe(true);
		expect(await versionStillMatches(sql, document.id, 1, "0".repeat(64))).toBe(false);
		expect(await versionStillMatches(sql, document.id, 2, sha256Hex(returns.content))).toBe(false);
	});

	it("validates what is submitted", async () => {
		const bad = (over: Partial<typeof returns> & Record<string, unknown>) =>
			createDocument(sql, owner, { ...returns, ...over } as never);
		await expect(bad({ collection: "nope" })).rejects.toBeInstanceOf(AtlasError);
		await expect(bad({ title: " " })).rejects.toMatchObject({ code: "invalid" });
		await expect(bad({ owner: "" })).rejects.toMatchObject({ code: "invalid" });
		await expect(bad({ source: "" })).rejects.toMatchObject({ code: "invalid" });
		await expect(bad({ content: "   " })).rejects.toMatchObject({ code: "invalid" });
		await expect(bad({ content: "x".repeat(200_001) })).rejects.toMatchObject({ code: "invalid" });
		await expect(bad({ reviewDue: "next week" })).rejects.toMatchObject({ code: "invalid" });
		await expect(bad({ expiresAt: "2026-02-30" })).rejects.toMatchObject({ code: "invalid" });
	});

	it("updates owner and dates, and lists documents with their freshness", async () => {
		const { document } = await createDocument(sql, owner, {
			...returns,
			title: "Dated doc",
			content: "Dated aardvark text.",
		});
		await approveVersion(sql, owner, document.id, 1);
		const updated = await updateDocumentDetails(sql, staff, document.id, {
			owner: "New Owner",
			reviewDue: "2026-09-15",
			tags: ["Returns", " policy "],
		});
		expect(updated).toMatchObject({
			owner: "New Owner",
			reviewDue: "2026-09-15",
			tags: ["returns", "policy"],
		});
		const listed = (await listDocuments(sql, { status: "approved" }, { now, staleAfterDays: 180 })).find(
			(d) => d.id === document.id,
		);
		expect(listed?.freshness?.state).toBe("stale");
		await expect(
			updateDocumentDetails(sql, staff, "00000000-0000-4000-8000-000000000000", { owner: "x" }),
		).rejects.toMatchObject({ code: "not_found" });
		expect(
			(await listDocuments(sql, { collection: "returns" })).every((d) => d.collection === "returns"),
		).toBe(true);
	});
});
