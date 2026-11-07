import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import {
	addRecipeVersion,
	approveRecipeVersion,
	cancelBatch,
	completeBatch,
	createRecipe,
	planBatch,
	reserveBatch,
} from "../lab/batches";
import { listHolds, recordPackagingRun } from "../lab/finished";
import { createIngredient, createLot, postMovement } from "../lab/inventory";
import { freshDb, owner, staff } from "../testing.test-util";
import {
	answerLicenceQuestion,
	changeLicence,
	getLicence,
	licenceStanding,
	listLicences,
	raiseLicenceQuestion,
	recordLicence,
	type Licence,
	type LicenceInput,
} from "./licences";
import { NOT_LINKED, getRecallCheck, listRecallChecks, saveRecallCheck, traceRecall } from "./recall";
import {
	STARTING_SOURCES,
	applicableRules,
	createRule,
	draftRuleVersion,
	getRule,
	listRules,
	queueStartingSources,
	reviewRuleVersion,
	ruleStanding,
	withdrawRule,
	type NewRule,
} from "./rules";
import {
	getStampStock,
	moveStamps,
	receiveStamps,
	recordStampEvent,
	replayStampEvents,
	stampReconciliation,
	type NewStampStock,
} from "./stamps";

let sql: SqlClient;
const TODAY = "2026-10-14";
let serial = 0;
const key = () => `compliance-test-${++serial}-${Math.random().toString(36).slice(2)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

// ---- The rule register ---------------------------------------------------------------------------------

const rule = (changes: Partial<NewRule> = {}): NewRule => ({
	code: `TEST-${++serial}`,
	title: "Monthly excise return",
	jurisdiction: "Canada (federal)",
	ownerLabel: "Duty",
	kind: "guidance",
	sourceTitle: "CRA, Reporting and remitting the excise duty on vaping products",
	sourceUrl: "https://www.canada.ca/en/services/taxes.html",
	retrievedOn: "2026-10-08",
	effectiveFrom: "2026-01-01",
	summary: "A licensee files a return for each reporting period.",
	reviewEveryDays: "365",
	...changes,
});

describe("the rule register", () => {
	it("starts a rule as a draft that guides nothing", async () => {
		const { rule: made, version } = await createRule(sql, staff, rule());
		expect(version).toMatchObject({ version: 1, status: "draft", applicability: "undecided" });
		const summary = (await listRules(sql, TODAY)).find((r) => r.id === made.id);
		expect(summary?.standing).toBe("awaiting_review");
		expect(summary?.current).toBeNull();
		expect((await applicableRules(sql, TODAY)).some((a) => a.rule.id === made.id)).toBe(false);
	});

	it("is approved by the owner only, with a decision, a reason, a start date and a review date", async () => {
		const { rule: made, version } = await createRule(sql, staff, rule());
		await expect(
			reviewRuleVersion(sql, staff, { versionId: version.id, decision: "approve", note: "Read it." }, TODAY),
		).rejects.toThrow("Only the owner can approve or reject a version of a rule.");
		expect((await listAudit(sql, 1))[0]).toMatchObject({
			action: "compliance.rule.approve",
			outcome: "denied",
		});
		await expect(
			reviewRuleVersion(sql, owner, { versionId: version.id, decision: "approve", note: "Read it." }, TODAY),
		).rejects.toThrow("Decide whether it applies here before approving it.");
		await expect(
			reviewRuleVersion(
				sql,
				owner,
				{ versionId: version.id, decision: "approve", note: "Read it.", applicability: "applies" },
				TODAY,
			),
		).rejects.toThrow("Say why it applies here, or why it doesn't.");
		const approved = await reviewRuleVersion(
			sql,
			owner,
			{
				versionId: version.id,
				decision: "approve",
				note: "Read the current page on 2026-10-08.",
				applicability: "applies",
				applicabilityReason: "We hold a vaping excise licence and make product here.",
			},
			TODAY,
		);
		expect(approved).toMatchObject({
			status: "approved",
			nextReviewOn: "2027-10-14",
			reviewedBy: "operator:owner-1",
		});
		const applicable = await applicableRules(sql, TODAY);
		expect(applicable.find((a) => a.rule.id === made.id)?.version.id).toBe(version.id);
		await expect(
			reviewRuleVersion(sql, owner, { versionId: version.id, decision: "reject", note: "Again." }, TODAY),
		).rejects.toThrow("That version is already approved. Only a draft can be decided.");
	});

	it("can't approve a draft that doesn't say when it takes effect", async () => {
		const { version } = await createRule(sql, staff, rule({ effectiveFrom: "" }));
		await expect(
			reviewRuleVersion(
				sql,
				owner,
				{
					versionId: version.id,
					decision: "approve",
					note: "x",
					applicability: "applies",
					applicabilityReason: "y",
				},
				TODAY,
			),
		).rejects.toThrow("The draft doesn't say when it takes effect.");
	});

	it("supersedes the approved version with a new one, and keeps the old one", async () => {
		const { rule: made, version } = await createRule(
			sql,
			staff,
			rule({ applicability: "applies", applicabilityReason: "We make product." }),
		);
		await reviewRuleVersion(
			sql,
			owner,
			{ versionId: version.id, decision: "approve", note: "First reading." },
			TODAY,
		);
		const second = await draftRuleVersion(sql, staff, {
			ruleId: made.id,
			kind: "guidance",
			sourceTitle: "CRA, the same page, updated",
			effectiveFrom: "2026-07-01",
			summary: "The return is due by the end of the following month.",
			applicability: "applies",
			applicabilityReason: "We make product.",
			reviewEveryDays: "180",
		});
		expect(second.version).toBe(2);
		// The first reading goes on guiding until the second is approved.
		expect((await listRules(sql, TODAY)).find((r) => r.id === made.id)?.current?.version).toBe(1);
		await reviewRuleVersion(
			sql,
			owner,
			{ versionId: second.id, decision: "approve", note: "Updated page." },
			TODAY,
		);
		const found = await getRule(sql, made.id);
		expect(found?.versions.map((v) => [v.version, v.status])).toEqual([
			[2, "approved"],
			[1, "superseded"],
		]);
	});

	it("leaves out a rule that doesn't apply, isn't in effect yet, or was withdrawn", async () => {
		const notHere = await createRule(
			sql,
			staff,
			rule({ applicability: "does_not_apply", applicabilityReason: "We sell no cartridges." }),
		);
		await reviewRuleVersion(
			sql,
			owner,
			{ versionId: notHere.version.id, decision: "approve", note: "Read." },
			TODAY,
		);
		const later = await createRule(
			sql,
			staff,
			rule({ effectiveFrom: "2027-01-01", applicability: "applies", applicabilityReason: "Yes." }),
		);
		await reviewRuleVersion(
			sql,
			owner,
			{ versionId: later.version.id, decision: "approve", note: "Read." },
			TODAY,
		);
		const gone = await createRule(
			sql,
			staff,
			rule({ applicability: "applies", applicabilityReason: "Yes." }),
		);
		await reviewRuleVersion(
			sql,
			owner,
			{ versionId: gone.version.id, decision: "approve", note: "Read." },
			TODAY,
		);
		await expect(withdrawRule(sql, staff, { ruleId: gone.rule.id, reason: "Replaced." })).rejects.toThrow(
			"Only the owner can withdraw a rule.",
		);
		await withdrawRule(sql, owner, { ruleId: gone.rule.id, reason: "Replaced by a provincial rule." });
		const applicable = (await applicableRules(sql, TODAY)).map((a) => a.rule.id);
		expect(applicable).not.toContain(notHere.rule.id);
		expect(applicable).not.toContain(later.rule.id);
		expect(applicable).not.toContain(gone.rule.id);
		const standings = new Map((await listRules(sql, TODAY)).map((r) => [r.id, r.standing]));
		expect(standings.get(later.rule.id)).toBe("not_in_effect");
		expect(standings.get(gone.rule.id)).toBe("withdrawn");
		await expect(
			draftRuleVersion(sql, staff, { ruleId: gone.rule.id, kind: "law", sourceTitle: "x", summary: "y" }),
		).rejects.toThrow("That rule was withdrawn.");
	});

	it("says a review is due on its date", async () => {
		const { rule: made, version } = await createRule(
			sql,
			staff,
			rule({ applicability: "applies", applicabilityReason: "Yes." }),
		);
		const approved = await reviewRuleVersion(
			sql,
			owner,
			{ versionId: version.id, decision: "approve", note: "Read." },
			TODAY,
		);
		expect(ruleStanding(made, approved, null, "2027-10-13")).toBe("approved");
		expect(ruleStanding(made, approved, null, "2027-10-14")).toBe("review_due");
	});

	it("refuses what isn't a code, a plain https source, or dates in order", async () => {
		await expect(createRule(sql, staff, rule({ code: "!" }))).rejects.toThrow("Give the rule a short code");
		await expect(createRule(sql, staff, rule({ sourceUrl: "http://example.com" }))).rejects.toThrow(
			"must be a plain https:// address",
		);
		await expect(createRule(sql, staff, rule({ effectiveTo: "2025-01-01" }))).rejects.toThrow(
			"It can't stop applying before it takes effect.",
		);
		await expect(createRule(sql, staff, rule({ kind: "opinion" }))).rejects.toThrow(
			"Say what kind of source this is",
		);
		await expect(createRule(sql, staff, rule({ retrievedOn: "2026-02-30" }))).rejects.toThrow(
			"must be a date",
		);
	});

	it("adds the brief's starting sources as unread drafts, once, and only for the owner", async () => {
		await expect(queueStartingSources(sql, staff)).rejects.toThrow(
			"Only the owner can add the starting sources",
		);
		expect(await queueStartingSources(sql, owner)).toBe(STARTING_SOURCES.length);
		expect(await queueStartingSources(sql, owner)).toBe(0);
		const queued = (await listRules(sql, TODAY)).filter((r) =>
			STARTING_SOURCES.some((s) => s.code === r.code),
		);
		expect(queued).toHaveLength(STARTING_SOURCES.length);
		for (const summary of queued) {
			expect(summary.standing).toBe("awaiting_review");
			expect(summary.draft?.applicability).toBe("undecided");
			expect(summary.draft?.summary).toMatch(/^Not read yet\./);
		}
	});

	it("can't hold an approved reading that is undecided, even written directly", async () => {
		const { version } = await createRule(sql, staff, rule());
		await expect(
			sql.query(
				`update wai_compliance_rule_versions set status = 'approved', reviewed_by = 'operator:x', reviewed_at = now(),
					review_note = 'n', next_review_on = '2027-01-01' where id = $1`,
				[version.id],
			),
		).rejects.toThrow(/wai_rule_versions_approved_is_decided/);
	});
});

// ---- The licence calendar ------------------------------------------------------------------------------

const licence = (changes: Partial<LicenceInput> = {}): LicenceInput => ({
	name: "Vaping product licence",
	authority: "Canada Revenue Agency",
	reference: "VL-0001",
	scope: "Manufacture and stamp vaping products at the approved premises.",
	premises: "Unit 4, Winnipeg",
	responsible: "The owner",
	issuedOn: "2025-11-01",
	expiresOn: "2027-10-31",
	renewBy: "2027-09-30",
	remindDays: "60",
	...changes,
});

describe("the licence calendar", () => {
	it("is recorded by the owner, as the licence reads", async () => {
		await expect(recordLicence(sql, staff, licence())).rejects.toThrow(
			"Only the owner can record a licence.",
		);
		const made = await recordLicence(sql, owner, licence());
		expect(made).toMatchObject({ status: "held", renewBy: "2027-09-30", remindDays: 60 });
		const found = await getLicence(sql, made.id);
		expect(found?.events.map((e) => e.kind)).toEqual(["recorded"]);
		await expect(recordLicence(sql, owner, licence({ expiresOn: "2025-01-01" }))).rejects.toThrow(
			"It can't expire before it was issued.",
		);
	});

	it("reminds from its own dates, and assumes none", () => {
		const base = { status: "held", expiresOn: null, renewBy: null, remindDays: 30 } as unknown as Licence;
		expect(licenceStanding({ ...base, renewBy: "2026-12-31" }, TODAY)).toEqual({
			standing: "current",
			daysLeft: 78,
		});
		expect(licenceStanding({ ...base, renewBy: "2026-11-10" }, TODAY)).toEqual({
			standing: "renewal_due",
			daysLeft: 27,
		});
		expect(licenceStanding({ ...base, renewBy: "2026-10-01", expiresOn: "2026-12-01" }, TODAY).standing).toBe(
			"renewal_overdue",
		);
		expect(licenceStanding({ ...base, expiresOn: "2026-10-13" }, TODAY).standing).toBe("expired");
		// Without a renewal date the expiry is what it counts down to.
		expect(licenceStanding({ ...base, expiresOn: "2026-10-20" }, TODAY)).toEqual({
			standing: "renewal_due",
			daysLeft: 6,
		});
		expect(licenceStanding(base, TODAY).standing).toBe("no_dates");
		expect(licenceStanding({ ...base, status: "applied_for" }, TODAY).standing).toBe("applied_for");
		expect(licenceStanding({ ...base, status: "surrendered", expiresOn: "2020-01-01" }, TODAY).standing).toBe(
			"ended",
		);
	});

	it("keeps what it said before a renewal or a change, and a renewal has to move a date on", async () => {
		const made = await recordLicence(sql, owner, licence());
		await expect(
			changeLicence(sql, owner, { ...licence(), licenceId: made.id, kind: "renewed", note: "Renewed." }),
		).rejects.toThrow("A renewal moves the expiry or the renewal date on.");
		await expect(
			changeLicence(sql, owner, { ...licence(), licenceId: made.id, kind: "changed", note: "Nothing." }),
		).rejects.toThrow("Nothing was changed.");
		await expect(
			changeLicence(sql, staff, { ...licence(), licenceId: made.id, kind: "changed", note: "x" }),
		).rejects.toThrow("Only the owner can change a licence.");
		const renewed = await changeLicence(sql, owner, {
			...licence({ expiresOn: "2029-10-31", renewBy: "2029-09-30" }),
			licenceId: made.id,
			kind: "renewed",
			note: "Renewal letter of 2027-09-12 on file.",
		});
		expect(renewed.expiresOn).toBe("2029-10-31");
		const found = await getLicence(sql, made.id);
		expect(found?.events[0]).toMatchObject({
			kind: "renewed",
			note: "Renewal letter of 2027-09-12 on file.",
		});
		expect(found?.events[0].before).toMatchObject({ expiresOn: "2027-10-31" });
		expect(found?.events[0].after).toMatchObject({ expiresOn: "2029-10-31" });
	});

	it("keeps a question about its scope open until the owner answers it", async () => {
		const made = await recordLicence(sql, owner, licence({ name: "Provincial retail permit" }));
		const question = await raiseLicenceQuestion(sql, staff, {
			licenceId: made.id,
			question: "Does this cover sales at a pop-up market?",
		});
		expect((await listLicences(sql, TODAY)).find((l) => l.id === made.id)?.openQuestions).toBe(1);
		await expect(
			answerLicenceQuestion(sql, staff, { questionId: question.id, answer: "Yes." }),
		).rejects.toThrow("Only the owner can answer a question about a licence.");
		await answerLicenceQuestion(sql, owner, {
			questionId: question.id,
			answer: "No: the permit names the premises only. Asked the province on 2026-10-10.",
		});
		await expect(
			answerLicenceQuestion(sql, owner, { questionId: question.id, answer: "Again." }),
		).rejects.toThrow("That question was already answered.");
		expect((await listLicences(sql, TODAY)).find((l) => l.id === made.id)?.openQuestions).toBe(0);
	});
});

// ---- Batches and packaging runs, for the stamp ledger and the recall trace ------------------------------

async function stock(
	name: string,
	ingredient: Parameters<typeof createIngredient>[2],
	lotCode: string,
	unit: "mL" | "each",
	quantity: string,
) {
	const made = ids[name] ? { id: ids[name] } : await createIngredient(sql, staff, ingredient);
	ids[name] = made.id;
	const lot = await createLot(sql, staff, { ingredientId: made.id, lotCode, unit });
	await postMovement(sql, staff, { lotId: lot.id, kind: "receipt", quantity, idempotencyKey: key() }, TODAY);
	ids[`lot:${lotCode}`] = lot.id;
}

async function made(actualYieldMl = "990"): Promise<string> {
	const batch = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
	await reserveBatch(sql, staff, batch.id, TODAY);
	await completeBatch(sql, staff, batch.id, { actualYieldMl }, TODAY);
	return batch.id;
}

async function packaged(batchId: string, units: string, bottles: string, sku = "MANGO-12-30") {
	return recordPackagingRun(
		sql,
		staff,
		{
			batchId,
			sku,
			bottleMl: "30",
			unitsFilled: units,
			bulkUsedMl: String(Number(units) * 30 + 2),
			labelVersion: "Mango 12 label, revision 3",
			lineClearance: "Line cleared.",
			components: [{ lotId: ids[`lot:${bottles}`], quantity: units }],
			idempotencyKey: key(),
		},
		TODAY,
	);
}

describe("with batches made and packaged", () => {
	beforeAll(async () => {
		await stock("pg", { name: "PG USP", category: "pg" }, "PG-1", "mL", "20000");
		await stock("vg", { name: "VG USP", category: "vg" }, "VG-1", "mL", "20000");
		await stock(
			"base",
			{
				name: "Nic base 100",
				category: "nicotine_base",
				nicotineMgPerMl: "100",
				pgPercent: "90",
				vgPercent: "0",
			},
			"N-1",
			"mL",
			"5000",
		);
		await stock(
			"mango",
			{ name: "Mango concentrate", category: "flavour", pgPercent: "100", vgPercent: "0" },
			"M-1",
			"mL",
			"5000",
		);
		await stock("bottles", { name: "30 mL bottle", category: "packaging" }, "BTL-1", "each", "100");
		await stock("bottles", { name: "30 mL bottle", category: "packaging" }, "BTL-2", "each", "100");
		const recipe = await createRecipe(sql, staff, { name: "Mango 12" });
		const version = await addRecipeVersion(sql, staff, {
			recipeId: recipe.id,
			batchMl: "1000",
			targetNicotineMgPerMl: "12",
			targetPgPercent: "50",
			baseIngredientId: ids.base,
			pgIngredientId: ids.pg,
			vgIngredientId: ids.vg,
			flavours: [{ ingredientId: ids.mango, percent: "10" }],
		});
		await approveRecipeVersion(sql, owner, version.id);
		ids.version = version.id;
		ids.batchA = await made();
		ids.runA1 = (await packaged(ids.batchA, "10", "BTL-1")).id;
		ids.runA2 = (await packaged(ids.batchA, "5", "BTL-2", "MANGO-12-30-B")).id;
		ids.batchB = await made();
		ids.runB1 = (await packaged(ids.batchB, "8", "BTL-2")).id;
		const reserved = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
		await reserveBatch(sql, staff, reserved.id, TODAY);
		ids.batchC = reserved.id;
		const cancelled = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
		await reserveBatch(sql, staff, cancelled.id, TODAY);
		await cancelBatch(sql, staff, cancelled.id, "Planned twice.", TODAY);
		ids.batchD = cancelled.id;
	});

	const receipt = (changes: Partial<NewStampStock> = {}): NewStampStock => ({
		jurisdiction: "Canada (federal)",
		authorizedEntity: "Worldwide Vapor, licence VL-0001",
		sourceDocument: "CRA shipment 2026-118",
		serialPrefix: "VX",
		serialFrom: "1000",
		serialTo: "1099",
		receivedOn: TODAY,
		location: "Stamp safe",
		idempotencyKey: key(),
		...changes,
	});

	describe("the excise stamp ledger", () => {
		it("records a receipt once, with its identifiers, and refuses the same identifiers again", async () => {
			const request = receipt();
			const stock = await receiveStamps(sql, staff, request);
			expect(stock).toMatchObject({ quantity: 100, serialFrom: 1000, serialTo: 1099, serialPrefix: "VX" });
			expect(stock.counts.available).toBe(100);
			expect((await receiveStamps(sql, staff, request)).id).toBe(stock.id);
			await expect(
				receiveStamps(sql, staff, receipt({ serialFrom: "1050", serialTo: "1149" })),
			).rejects.toThrow(/overlaps ST-20261014-01, which was already received for Canada \(federal\)/);
			// The same numbers in another jurisdiction's series are a different set of stamps.
			const other = await receiveStamps(sql, staff, receipt({ jurisdiction: "Manitoba" }));
			expect(other.quantity).toBe(100);
			await expect(
				receiveStamps(sql, staff, receipt({ serialFrom: "5000", serialTo: "5009", quantity: "11" })),
			).rejects.toThrow("5000 to 5009 is 10 stamps, not 11.");
			await expect(
				receiveStamps(sql, staff, receipt({ serialFrom: "", serialTo: "", quantity: "10" })),
			).rejects.toThrow("A prefix goes with a run of identifiers.");
			ids.stock = stock.id;
		});

		it("applies identifiers to a packaging run once, and never more stamps than it filled units", async () => {
			const apply = (changes: Record<string, string>) =>
				recordStampEvent(sql, staff, {
					stockId: ids.stock,
					kind: "applied",
					packagingRunId: ids.runA1,
					idempotencyKey: key(),
					...changes,
				});
			await expect(apply({ quantity: "5" })).rejects.toThrow("These stamps carry identifiers.");
			await expect(apply({ serialFrom: "990", serialTo: "994" })).rejects.toThrow(
				"isn't within this stock's VX1000 to VX1099",
			);
			const first = await apply({ serialFrom: "1000", serialTo: "1005" });
			expect(first).toMatchObject({
				quantity: 6,
				fromState: "available",
				toState: "applied",
				packagingRunCode: expect.any(String),
			});
			await expect(apply({ serialFrom: "1005", serialTo: "1006" })).rejects.toThrow(
				/were already applied \(VX1000 to VX1005\)/,
			);
			await expect(apply({ serialFrom: "1010", serialTo: "1014" })).rejects.toThrow(
				/filled 10 units and already has 6 stamps applied. 5 more would be more stamps than units./,
			);
			// Reserved first, then applied from the reservation.
			await recordStampEvent(sql, staff, {
				stockId: ids.stock,
				kind: "reserved",
				quantity: "4",
				idempotencyKey: key(),
			});
			await apply({ from: "reserved", serialFrom: "1006", serialTo: "1009" });
			const found = await getStampStock(sql, ids.stock);
			expect(found?.stock.counts).toMatchObject({ available: 90, reserved: 0, applied: 10 });
			const reconciliation = await stampReconciliation(sql);
			expect(reconciliation.runs.find((r) => r.id === ids.runA1)).toMatchObject({
				unitsFilled: 10,
				applied: 10,
			});
			expect(reconciliation.unstamped.map((r) => r.id)).toEqual(
				expect.arrayContaining([ids.runA2, ids.runB1]),
			);
		});

		it("keeps damaged stamps damaged until the owner records a disposal with its authorization", async () => {
			await recordStampEvent(sql, staff, {
				stockId: ids.stock,
				kind: "damaged",
				quantity: "3",
				reason: "Torn when the roll jammed.",
				idempotencyKey: key(),
			});
			let reconciliation = await stampReconciliation(sql);
			expect(reconciliation.exceptions).toContainEqual(
				expect.objectContaining({
					stockId: ids.stock,
					kind: "damaged",
					detail: "3 damaged, with no return or disposal recorded.",
				}),
			);
			const dispose = (actor: typeof owner, changes: Record<string, string> = {}) =>
				recordStampEvent(sql, actor, {
					stockId: ids.stock,
					kind: "disposed",
					quantity: "3",
					evidence: "Witnessed destruction, photo on file.",
					authorization: "CRA approval 2026-77",
					idempotencyKey: key(),
					...changes,
				});
			await expect(dispose(staff)).rejects.toThrow("Only the owner can record a disposal of stamps.");
			await expect(dispose(owner, { authorization: "" })).rejects.toThrow(
				"Name the authorization the disposal was done under.",
			);
			await expect(dispose(owner, { from: "available" })).rejects.toThrow(
				"Record a disposal takes stamps that are damaged.",
			);
			await dispose(owner);
			reconciliation = await stampReconciliation(sql);
			expect(reconciliation.exceptions.some((e) => e.stockId === ids.stock && e.kind === "damaged")).toBe(
				false,
			);
			expect((await getStampStock(sql, ids.stock))?.stock.counts).toMatchObject({ damaged: 0, disposed: 3 });
		});

		it("keeps a loss open until stamps are found, and can't find more than were lost", async () => {
			await recordStampEvent(sql, staff, {
				stockId: ids.stock,
				kind: "lost",
				quantity: "2",
				reason: "Count came up short.",
				idempotencyKey: key(),
			});
			expect((await stampReconciliation(sql)).exceptions).toContainEqual(
				expect.objectContaining({ stockId: ids.stock, kind: "lost" }),
			);
			await expect(
				recordStampEvent(sql, staff, {
					stockId: ids.stock,
					kind: "found",
					quantity: "3",
					reason: "Found.",
					idempotencyKey: key(),
				}),
			).rejects.toThrow("Only 2 of these stamps are lost, not found, not 3.");
			await recordStampEvent(sql, staff, {
				stockId: ids.stock,
				kind: "found",
				quantity: "2",
				reason: "Behind the drawer.",
				idempotencyKey: key(),
			});
			expect((await stampReconciliation(sql)).exceptions.some((e) => e.stockId === ids.stock)).toBe(false);
		});

		it("records the same event once, a move without changing a count, and a ledger that adds up", async () => {
			const request = { stockId: ids.stock, kind: "reserved", quantity: "1", idempotencyKey: key() };
			const first = await recordStampEvent(sql, staff, request);
			expect((await recordStampEvent(sql, staff, request)).id).toBe(first.id);
			const before = (await getStampStock(sql, ids.stock))?.stock.counts;
			const moved = await moveStamps(sql, staff, {
				stockId: ids.stock,
				location: "Packaging bench",
				idempotencyKey: key(),
			});
			expect(moved.location).toBe("Packaging bench");
			expect(moved.counts).toEqual(before);
			await expect(
				moveStamps(sql, staff, { stockId: ids.stock, location: "Packaging bench", idempotencyKey: key() }),
			).rejects.toThrow("They are already at Packaging bench.");
			const found = await getStampStock(sql, ids.stock);
			expect(replayStampEvents(found?.events ?? [])).toEqual(found?.stock.counts);
			expect((await stampReconciliation(sql)).exceptions.some((e) => e.kind === "ledger")).toBe(false);
			// Counts that don't add up to what was received can't be stored, whatever writes them.
			await expect(
				sql.query(`update wai_stamp_stocks set available = available + 1 where id = $1`, [ids.stock]),
			).rejects.toThrow(/wai_stamp_stocks_adds_up/);
		});
	});

	describe("a recall trace", () => {
		it("follows an ingredient lot to every batch set to use it and every run packaged from them", async () => {
			const trace = await traceRecall(sql, "ingredient_lot", ids["lot:M-1"]);
			expect(trace.start.label).toBe("Mango concentrate, lot M-1");
			expect(trace.batches.map((b) => b.id).sort()).toEqual([ids.batchA, ids.batchB, ids.batchC].sort());
			expect(trace.runs.map((r) => r.id).sort()).toEqual([ids.runA1, ids.runA2, ids.runB1].sort());
			expect(trace.totals).toEqual({ batches: 3, runs: 3, unitsFilled: 23 });
			expect(trace.runs.find((r) => r.id === ids.runA1)?.stampsApplied).toBe(10);
			const uses = trace.lots.find((l) => l.id === ids["lot:M-1"])?.uses ?? [];
			expect(uses.filter((u) => u.basis === "used")).toHaveLength(2);
			expect(uses.filter((u) => u.basis === "reserved, not yet used")).toHaveLength(1);
			// Only the lot it started from: a downstream trace doesn't list the other lots.
			expect(trace.lots).toHaveLength(1);
			expect(trace.gaps).toContain(NOT_LINKED);
			expect(trace.gaps).toContain(
				`Batch ${trace.batches.find((b) => b.id === ids.batchC)?.code} hasn't been made (reserved), so nothing from it has been packaged yet. It is set to use the lot this trace started from.`,
			);
			expect(trace.batches.some((b) => b.id === ids.batchD)).toBe(false);
		});

		it("follows a packaging lot to the runs it went into", async () => {
			const trace = await traceRecall(sql, "ingredient_lot", ids["lot:BTL-2"]);
			expect(trace.runs.map((r) => r.id).sort()).toEqual([ids.runA2, ids.runB1].sort());
			expect(trace.lots[0].uses.every((u) => u.basis === "component")).toBe(true);
		});

		it("follows a packaging run back to what went into it", async () => {
			const trace = await traceRecall(sql, "packaging_run", ids.runB1);
			expect(trace.batches.map((b) => b.id)).toEqual([ids.batchB]);
			expect(trace.runs.map((r) => r.id)).toEqual([ids.runB1]);
			const lots = trace.lots.map((l) => l.code).sort();
			expect(lots).toEqual(["BTL-2", "M-1", "N-1", "PG-1", "VG-1"]);
		});

		it("is saved as it stood, and only the owner holds everything it reaches", async () => {
			await expect(
				saveRecallCheck(sql, staff, {
					startKind: "ingredient_lot",
					startId: ids["lot:M-1"],
					reason: "Supplier notice.",
					hold: true,
				}),
			).rejects.toThrow("Only the owner can hold everything a trace reaches.");
			const practice = await saveRecallCheck(sql, staff, {
				startKind: "batch",
				startId: ids.batchB,
				reason: "A practice run.",
			});
			expect(practice.holdsPlaced).toBe(0);
			expect(practice.resultSha256).toMatch(/^[0-9a-f]{64}$/);
			const held = await saveRecallCheck(sql, owner, {
				startKind: "ingredient_lot",
				startId: ids["lot:M-1"],
				reason: "Supplier notice about lot M-1.",
				hold: true,
			});
			expect(held.holdsPlaced).toBe(3);
			expect(held.result.batches.every((batch) => batch.openHolds === 1)).toBe(true);
			expect((await listHolds(sql, ids.batchC))[0].reason).toBe(
				"Recall check from Mango concentrate, lot M-1: Supplier notice about lot M-1.",
			);
			// Holding again places nothing more: every batch it reaches is already held.
			const again = await saveRecallCheck(sql, owner, {
				startKind: "ingredient_lot",
				startId: ids["lot:M-1"],
				reason: "Again.",
				hold: true,
			});
			expect(again.holdsPlaced).toBe(0);
			expect((await getRecallCheck(sql, held.id))?.result.totals.runs).toBe(3);
			expect((await listRecallChecks(sql)).map((c) => c.id)).toEqual(
				expect.arrayContaining([practice.id, held.id, again.id]),
			);
			// A held batch can't be packaged.
			await expect(packaged(ids.batchA, "1", "BTL-1")).rejects.toThrow(/is on hold/);
		});

		it("refuses a starting point that isn't one", async () => {
			await expect(traceRecall(sql, "shipment", ids.batchA)).rejects.toThrow(
				"Choose what the trace starts from.",
			);
			await expect(traceRecall(sql, "batch", "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
				"That batch doesn't exist.",
			);
		});
	});
});
