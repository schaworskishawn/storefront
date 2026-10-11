import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveVersion, createDocument } from "../atlas/service";
import { listAudit } from "../audit";
import { readConfig } from "../config";
import type { Sql, SqlClient } from "../db/sql";
import { acceptPackage, registerRepository, requestCodingJob, reviewPackage } from "../engineering/coding";
import { recordFinding } from "../findings";
import { requestFunction, reviewProduct, runFunction } from "../functions/pipeline";
import { getProductByTask, hashOf } from "../functions/products";
import { FUNCTIONS, lookupFunction } from "../functions/registry";
import { recordHealth } from "../integrations/health";
import {
	addRecipeVersion,
	approveRecipeVersion,
	completeBatch,
	createRecipe,
	planBatch,
	reserveBatch,
} from "../lab/batches";
import { addEquipment, recordCalibration } from "../lab/equipment";
import { RELEASE_CONFIRMATIONS, decideRelease, placeHold } from "../lab/finished";
import { addCorrectiveAction, enterResult, openDeviation, verifyResult } from "../lab/quality";
import { recordTraining, verifyTraining } from "../lab/training";
import { recordScan, registerTags, resolveException } from "../rfid/registry";
import { SKILL_BY_ID } from "../skills/catalog";
import { evaluateSkills } from "../skills/evaluate";
import { approveRelease, listProposals } from "../skills/store";
import type { SkillDefinition } from "../skills/types";
import { createIngredient, createLot, postMovement } from "../lab/inventory";
import { personalScopeOf } from "../tasks/repo";
import { freshDb, owner, staff, system, workflowDeps } from "../testing.test-util";
import { formatDay, formatOpsDate, opsDayKey } from "../time";
import { generateDailyReport, getReport, listReports, type DailyReport, type SavedReport } from "./daily";

const env = { POSTGRES_URL: "postgres://test" };
const config = readConfig(env);
const schedule = { kind: "system", label: "schedule" } as const;

/** A workspace with its own clock, so a test can move the day on. */
async function workspace(startAt: string) {
	const sql = await freshDb();
	let clock = new Date(startAt);
	const deps = { sql, config, env, now: () => clock };
	return {
		sql,
		deps,
		at: (when: string) => {
			clock = new Date(when);
		},
		generate: (
			input: { kind?: "morning" | "evening"; again?: boolean; actor?: typeof schedule | typeof staff } = {},
		) =>
			generateDailyReport(deps, {
				kind: input.kind ?? "morning",
				actor: input.actor ?? schedule,
				again: input.again,
			}),
	};
}

const sample = (id: string) => FUNCTIONS.get(id as never)?.sample?.() ?? {};

/** Runs one of the code-only functions on its sample, as real business work or as a labelled demonstration. */
async function run(sql: SqlClient, now: () => Date, id: string, options: { demo?: boolean } = {}) {
	const deps = { ...workflowDeps(sql, null, env), now };
	const asked = await requestFunction(deps, staff, id, sample(id), {
		lookup: lookupFunction,
		demo: options.demo,
	});
	const outcome = await runFunction(deps, asked.task.id, { lookup: lookupFunction });
	return { taskId: asked.task.id, title: asked.task.title, status: outcome.status };
}

/**
 * The database stamps records with the real time, not the test's clock. This moves everything recorded so far to one moment
 * on the test's clock, so "what happened in this period" means the same thing on every run.
 */
async function stamp(sql: Sql, at: string) {
	await sql.query(
		`update wai_tasks set created_at = $1, updated_at = $1, started_at = case when started_at is null then null else $1::timestamptz end,
			finished_at = case when finished_at is null then null else $1::timestamptz end`,
		[at],
	);
	await sql.query(`update wai_work_products set created_at = $1`, [at]);
	await sql.query(`update wai_document_versions set approved_at = $1 where approved_at is not null`, [at]);
	await sql.query(`update wai_findings set created_at = $1`, [at]);
	await sql.query(`update wai_integration_health set checked_at = $1`, [at]);
	await sql.query(`update wai_usage set at = $1`, [at]);
}

const reportOf = (saved: SavedReport): DailyReport => {
	if (!saved.report) throw new Error("no report was saved");
	return saved.report;
};

const databases: SqlClient[] = [];
const open = async (startAt: string) => {
	const made = await workspace(startAt);
	databases.push(made.sql);
	return made;
};
afterAll(async () => {
	for (const sql of databases) await sql.close();
});

describe("a report on an empty workspace", () => {
	let w: Awaited<ReturnType<typeof workspace>>;
	beforeAll(async () => {
		w = await open("2026-10-13T13:00:00Z");
	});

	it("is saved, read back intact, and says plainly that there is nothing and what it can't see", async () => {
		const outcome = await w.generate();
		expect(outcome.status).toBe("completed");
		const saved = outcome.report;
		expect(saved).toMatchObject({
			kind: "morning",
			day: "2026-10-13",
			attempt: 1,
			status: "completed",
			intact: true,
			requestedBy: "system:schedule",
			periodStart: "2026-10-12T13:00:00.000Z",
			periodEnd: "2026-10-13T13:00:00.000Z",
		});
		const report = reportOf(saved);
		expect(saved.payloadSha256).toBe(hashOf(report));
		expect(report.period.basis).toBe(
			"The 24 hours before this report. There is no earlier report to start from.",
		);
		expect(report.counts).toEqual({ completed: 0, failed: 0, unknown: 0, waitingReview: 0, inProgress: 0 });
		expect(report.actions).toEqual([]);
		expect(report.summary).toEqual([
			"0 tasks completed and verified, 0 failed, and 0 ended with an unknown outcome in this period.",
			"Nothing is waiting on anyone.",
			"0 results are waiting for review and 0 tasks carried over from before this period.",
			"0 of 61 skills are approved and in use.",
			"7 areas the workspace has no records for are listed as unavailable, not as zero.",
		]);
		// What has no source is named, with the reason. It is never reported as a zero.
		expect(report.unavailable.map((item) => item.area)).toEqual([
			"Shipments",
			"Inventory",
			"Purchasing",
			"Accounting and banking",
			"Equipment and training",
			"Business goals",
			"Engineering changes",
		]);
		// A service that isn't set up is "Awaiting configuration", and one never checked is "Not checked": never healthy.
		expect(report.integrations.find((item) => item.name === "Model provider (Anthropic)")).toMatchObject({
			status: "Awaiting configuration",
			detail: "Missing: ANTHROPIC_API_KEY.",
			checkedAt: null,
		});
		expect(report.integrations.find((item) => item.name === "Supabase database")).toMatchObject({
			status: "Not checked",
		});
		expect(report.integrations.some((item) => item.status === "Healthy")).toBe(false);
		expect((await listAudit(w.sql, 3))[0]).toMatchObject({ action: "report.generate", subject: saved.id });
	});

	it("is made once a day by the schedule, however often the schedule fires", async () => {
		const first = (await listReports(w.sql))[0];
		w.at("2026-10-13T13:00:05Z");
		const again = await w.generate();
		expect(again).toMatchObject({
			status: "skipped",
			reason: "The morning report for Oct 13, 2026 already exists.",
		});
		expect(again.report.id).toBe(first.id);
		expect(await listReports(w.sql)).toHaveLength(1);
	});

	it("keeps the earlier report when a person asks for another, and starts the new one where the last ended", async () => {
		w.at("2026-10-13T16:30:00Z");
		const second = await w.generate({ again: true, actor: staff });
		expect(second.status).toBe("completed");
		expect(second.report).toMatchObject({
			attempt: 2,
			requestedBy: "operator:staff-1",
			periodStart: "2026-10-13T13:00:00.000Z",
			periodEnd: "2026-10-13T16:30:00.000Z",
		});
		expect(reportOf(second.report).period.basis).toBe(
			"Since the last morning report, generated Oct 13, 2026.",
		);
		expect((await listReports(w.sql)).map((r) => [r.attempt, r.status])).toEqual([
			[2, "completed"],
			[1, "completed"],
		]);
	});

	it("has its own report for each Winnipeg day, on either side of the clocks changing", async () => {
		// 8:00 a.m. in Winnipeg is 13:00 UTC in daylight time and 14:00 UTC in standard time (from 1 November 2026).
		expect(opsDayKey("2026-10-31T13:00:00Z")).toBe("2026-10-31");
		expect(opsDayKey("2026-11-01T14:00:00Z")).toBe("2026-11-01");
		// Late evening in Winnipeg is already the next day in UTC: it still belongs to the Winnipeg day.
		expect(opsDayKey("2026-11-02T03:30:00Z")).toBe("2026-11-01");
		w.at("2026-11-01T14:00:00Z");
		const next = await w.generate();
		expect(next.report).toMatchObject({ day: "2026-11-01", attempt: 1, status: "completed" });
		w.at("2026-11-02T03:30:00Z");
		expect((await w.generate()).status).toBe("skipped");
	});

	it("includes what to pick up first tomorrow in an evening recap, and keeps it apart from the morning report", async () => {
		w.at("2026-11-01T23:30:00Z");
		const evening = await w.generate({ kind: "evening" });
		expect(evening.status).toBe("completed");
		expect(evening.report).toMatchObject({ kind: "evening", day: "2026-11-01", attempt: 1 });
		expect(reportOf(evening.report).tomorrow).toEqual([]);
		expect(reportOf(evening.report).period.basis).toBe(
			"The 24 hours before this report. There is no earlier report to start from.",
		);
	});
});

describe("two runs for the same day", () => {
	it("can't overlap, and a run that died doesn't block the day", async () => {
		const w = await open("2026-10-13T13:00:00Z");
		await w.sql.query(
			`insert into wai_daily_reports (kind, report_day, attempt, period_start, period_end, status, requested_by, started_at)
			 values ('morning', '2026-10-13', 1, '2026-10-12T13:00:00Z', '2026-10-13T12:59:00Z', 'generating', 'system:schedule', '2026-10-13T12:59:00Z')`,
		);
		const blocked = await w.generate({ again: true, actor: staff });
		expect(blocked).toMatchObject({
			status: "skipped",
			reason: "A report for today is already being generated.",
		});
		// The database itself refuses a second run in progress for the day, whatever the application thinks.
		await expect(
			w.sql.query(
				`insert into wai_daily_reports (kind, report_day, attempt, period_start, period_end, status, requested_by)
				 values ('morning', '2026-10-13', 2, now(), now(), 'generating', 'system:schedule')`,
			),
		).rejects.toThrow();

		// Sixteen minutes later the first run is taken to have died: it is marked failed and a new attempt goes ahead.
		w.at("2026-10-13T13:15:30Z");
		const after = await w.generate();
		expect(after.status).toBe("completed");
		expect(after.report.attempt).toBe(2);
		expect((await listReports(w.sql)).map((r) => [r.attempt, r.status, r.error])).toEqual([
			[2, "completed", null],
			[1, "failed", "The run stopped before it finished."],
		]);
	});
});

describe("a report on a workspace with work in it", () => {
	let w: Awaited<ReturnType<typeof workspace>>;
	let report: DailyReport;
	const made: Record<string, { taskId: string; title: string }> = {};

	beforeAll(async () => {
		w = await open("2026-10-13T09:00:00Z");
		const now = w.deps.now;
		// Real business work: one verified and complete, one waiting for a person, one that failed.
		made.check = await run(w.sql, now, "check.record-validation");
		made.vault = await run(w.sql, now, "vault.settlement-match");
		made.trace = await run(w.sql, now, "trace.shipment-timeline");
		await w.sql.query(
			`update wai_tasks set state = 'failed', error = 'The carrier export was unreadable.', completion_evidence = null where id = $1`,
			[made.trace.taskId],
		);
		// A demonstration run and one person's own work: neither is business news.
		made.demo = await run(w.sql, now, "insight.metric-analysis", { demo: true });
		made.personal = await run(w.sql, now, "review.deadline-register");
		await w.sql.query(
			`update wai_tasks set scope = $2, title = 'PRIVATE plan for the weekend' where id = $1`,
			[made.personal.taskId, personalScopeOf("operator:staff-1")],
		);
		await w.sql.query(`update wai_work_products set scope = $2 where task_id = $1`, [
			made.personal.taskId,
			personalScopeOf("operator:staff-1"),
		]);
		// One task whose outcome the application couldn't establish.
		made.unknown = await run(w.sql, now, "stock.replenishment-plan");
		await w.sql.query(
			`update wai_tasks set state = 'outcome_unknown', error = 'The stored result could not be confirmed.', completion_evidence = null where id = $1`,
			[made.unknown.taskId],
		);

		// Knowledge: one version waiting for the owner, one document expired, one past its review date.
		await createDocument(w.sql, staff, {
			collection: "shipping",
			title: "Shipping times",
			owner: "Olivia",
			source: "Shipping page",
			content: "Orders ship within two business days from Winnipeg.",
		});
		const expired = await createDocument(w.sql, owner, {
			collection: "returns",
			title: "Holiday returns",
			owner: "Olivia",
			source: "Holiday notice",
			content: "Holiday purchases can be returned until January 15.",
			expiresAt: "2026-10-01",
		});
		await approveVersion(w.sql, owner, expired.document.id, 1, {});
		const overdue = await createDocument(w.sql, owner, {
			collection: "faq",
			title: "Battery care",
			owner: "Olivia",
			source: "FAQ page",
			content: "Charge with the supplied cable only.",
		});
		await approveVersion(w.sql, owner, overdue.document.id, 1, { reviewDue: "2026-09-30" });

		await recordFinding(w.sql, {
			roleId: "guard",
			severity: "critical",
			category: "access",
			title: "An account granted itself admin access",
			detail: "The grant has no recorded approver.",
		});
		await recordFinding(w.sql, {
			roleId: "insight",
			taskId: made.demo.taskId,
			severity: "high",
			category: "demo",
			title: "A finding from a demonstration run",
		});
		await recordHealth(w.sql, [
			{ integration: "database", status: "healthy", detail: "Answering. Schema version 4.", latencyMs: 12 },
			{ integration: "storage", status: "unhealthy", detail: "The bucket didn't answer.", latencyMs: null },
		]);

		await stamp(w.sql, "2026-10-13T09:00:00Z");
		w.at("2026-10-13T13:00:00Z");
		const outcome = await w.generate();
		if (outcome.status !== "completed") throw new Error(`setup: ${outcome.status}`);
		report = reportOf(outcome.report);
	}, 120_000);

	it("counts verified completions, failures and unknown outcomes from the records", () => {
		expect(report.counts).toEqual({ completed: 1, failed: 1, unknown: 1, waitingReview: 1, inProgress: 0 });
		expect(report.completed.map((line) => [line.taskId, line.agent, line.state])).toEqual([
			[made.check.taskId, "Check", "completed"],
		]);
		expect(report.unresolved.map((line) => [line.taskId, line.state, line.error]).sort()).toEqual(
			[
				[made.trace.taskId, "failed", "The carrier export was unreadable."],
				[made.unknown.taskId, "outcome_unknown", "The stored result could not be confirmed."],
			].sort(),
		);
		expect(report.agents).toEqual([
			{ agent: "Check", completed: 1, failed: 0, waiting: 0 },
			{ agent: "Stock", completed: 0, failed: 1, waiting: 0 },
			{ agent: "Trace", completed: 0, failed: 1, waiting: 0 },
			{ agent: "Vault", completed: 0, failed: 0, waiting: 1 },
		]);
		expect(report.summary[0]).toBe(
			"1 task completed and verified, 1 failed, and 1 ended with an unknown outcome in this period.",
		);
	});

	it("turns each thing waiting on someone into an action with an owner, steps, a link and its source", () => {
		expect(report.actions.map((a) => [a.priority, a.title.replace(/: .*/, ""), a.responsible])).toEqual([
			["urgent", "Outcome unknown", "A person in the workspace"],
			["urgent", "Finding (critical)", "A person in the workspace"],
			["urgent", "Unhealthy", "The owner"],
			["high", "Approve or reject", "The owner"],
			["high", "Failed", "The person who asked for it"],
			["high", "Expired document", "The owner"],
			["normal", "Review", "A person in the workspace"],
			["normal", "Document past its review date", "The owner"],
		]);
		const review = report.actions.find((a) => a.title.startsWith("Review: "));
		expect(review).toMatchObject({
			reason: "Vault stored this in the last day and it can't be used until a person accepts or rejects it.",
			nextSteps: [
				"Open the result.",
				"Check its sources, what is missing and any warning.",
				"Accept or reject it.",
			],
			due: null,
			expectedResult: "The result is accepted or rejected, with who decided and when recorded.",
			sources: [{ label: "Stored results waiting for review", retrievedAt: "2026-10-13T13:00:00.000Z" }],
		});
		expect(review?.links[1]).toEqual({
			label: `Task ${made.vault.taskId.slice(0, 8)}`,
			href: `/worldwide-ai/tasks/${made.vault.taskId}`,
		});
		expect(report.actions.find((a) => a.title.startsWith("Unhealthy"))).toMatchObject({
			title: "Unhealthy: Supabase Storage",
			reason: "The bucket didn't answer.",
		});
		expect(report.summary[1]).toBe("8 items need someone to act, 3 of them urgent.");
	});

	it("keeps a recorded expiry apart from a suggested review date", () => {
		expect(report.actions.find((a) => a.title === "Expired document: Holiday returns")?.due).toEqual({
			date: "2026-10-01",
			confirmed: true,
		});
		expect(
			report.actions.find((a) => a.title === "Document past its review date: Battery care")?.due,
		).toEqual({
			date: "2026-09-30",
			confirmed: false,
		});
		expect(report.knowledge).toMatchObject({ waitingApproval: 1, expired: 1, reviewOverdue: 1 });
		expect(report.knowledge.approved.map((doc) => doc.title).sort()).toEqual([
			"Battery care",
			"Holiday returns",
		]);
	});

	it("shows a calendar day as that day, not the evening before", () => {
		// An expiry date is a day, not a moment. Read as midnight UTC and shown in Winnipeg it would land a day early.
		expect(formatDay("2026-10-01")).toBe("Oct 1, 2026");
		expect(formatOpsDate("2026-10-01")).toBe("Sep 30, 2026");
		expect(formatDay("2026-02-30")).toBe("—");
		expect(formatDay(null)).toBe("—");
	});

	it("never reads a demonstration run or one person's own work into the shared report", () => {
		const text = JSON.stringify(report);
		expect(text).not.toContain(made.demo.taskId);
		expect(text).not.toContain(made.personal.taskId);
		expect(text).not.toContain("PRIVATE plan for the weekend");
		expect(text).not.toContain("A finding from a demonstration run");
		expect(text).not.toContain(made.demo.title);
		expect(report.coverage[0]).toMatchObject({ records: 4 });
	});

	it("shows only what was checked as healthy, and says what read the report's figures", () => {
		const by = Object.fromEntries(report.integrations.map((item) => [item.name, item.status]));
		expect(by["Supabase database"]).toBe("Healthy");
		expect(by["Supabase Storage"]).toBe("Awaiting configuration");
		expect(by["Trigger.dev"]).toBe("Awaiting configuration");
		expect(report.usage).toEqual({ modelCalls: 0, inputTokens: 0, outputTokens: 0 });
		expect(report.coverage.map((row) => row.source)).toContain("Open findings");
	});

	it("carries what is still open into the next day's report by its existing task id", async () => {
		w.at("2026-10-14T13:00:00Z");
		const next = await w.generate();
		const tomorrow = reportOf(next.report);
		expect(tomorrow.period).toMatchObject({
			start: "2026-10-13T13:00:00.000Z",
			basis: "Since the last morning report, generated Oct 13, 2026.",
		});
		// Nothing new happened: no completion is repeated, and the result still waiting is carried over by its own task id.
		expect(tomorrow.completed).toEqual([]);
		expect(tomorrow.unresolved).toEqual([]);
		expect(tomorrow.carryover.map((line) => [line.taskId, line.state])).toEqual([
			[made.vault.taskId, "needs_review"],
		]);
		const waiting = tomorrow.actions.find((a) => a.title.startsWith("Review: "));
		expect(waiting).toMatchObject({ priority: "high" });
		expect(waiting?.reason).toMatch(/^Vault stored this 1 day ago/);
	});
});

describe("when a report can't be generated", () => {
	it("saves the failure with its reason, and a later attempt for the same day goes ahead", async () => {
		const w = await open("2026-10-13T13:00:00Z");
		const failing: Sql = {
			query: ((text: string, params?: readonly unknown[]) =>
				text.includes("from wai_work_products p")
					? Promise.reject(new Error("the connection was reset"))
					: w.sql.query(text, params)) as Sql["query"],
			transaction: (fn) => w.sql.transaction(fn),
		};
		const failed = await generateDailyReport(
			{ ...w.deps, sql: failing },
			{ kind: "morning", actor: schedule },
		);
		expect(failed).toMatchObject({ status: "failed", error: "the connection was reset" });
		expect(failed.report).toMatchObject({ status: "failed", report: null, attempt: 1, intact: false });

		const retried = await w.generate();
		expect(retried.status).toBe("completed");
		expect(retried.report.attempt).toBe(2);
		expect((await listReports(w.sql)).map((r) => r.status)).toEqual(["completed", "failed"]);
	});

	it("notices a saved report that was altered afterwards", async () => {
		const w = await open("2026-10-13T13:00:00Z");
		const { report } = await w.generate();
		expect((await getReport(w.sql, report.id))?.intact).toBe(true);
		await w.sql.query(
			`update wai_daily_reports set payload = jsonb_set(payload::jsonb, '{summary}', '["All is well."]')::json where id = $1`,
			[report.id],
		);
		expect((await getReport(w.sql, report.id))?.intact).toBe(false);
	});

	it("is never requested as anyone but a person or the schedule", async () => {
		const w = await open("2026-10-13T13:00:00Z");
		await expect(
			generateDailyReport(w.deps, { kind: "morning", actor: { kind: "agent", roleId: "nexus" } }),
		).rejects.toThrow();
		expect(await listReports(w.sql)).toEqual([]);
		expect((await generateDailyReport(w.deps, { kind: "morning", actor: system })).status).toBe("completed");
	});
});

describe("a report on a workspace whose Lab holds stock", () => {
	it("reads the ingredient inventory instead of calling it unavailable, and turns what is flagged into actions", async () => {
		const w = await open("2026-10-13T13:00:00Z");
		const base = await createIngredient(w.sql, staff, {
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			pgPercent: "90",
			vgPercent: "0",
			minStock: "500",
			minStockUnit: "mL",
		});
		const lot = await createLot(w.sql, staff, {
			ingredientId: base.id,
			lotCode: "N-1",
			unit: "mL",
			expiresOn: "2026-11-01",
			densityGPerMl: "1.035",
			densitySource: "CoA N-1",
		});
		await postMovement(
			w.sql,
			staff,
			{ lotId: lot.id, kind: "receipt", quantity: "300", idempotencyKey: "report-receipt-1" },
			"2026-10-13",
		);
		const fine = await createIngredient(w.sql, staff, { name: "VG USP", category: "vg" });
		const vg = await createLot(w.sql, staff, {
			ingredientId: fine.id,
			lotCode: "V-1",
			unit: "g",
			densityGPerMl: "1.261",
			densitySource: "CoA V-1",
		});
		await postMovement(
			w.sql,
			staff,
			{ lotId: vg.id, kind: "receipt", quantity: "5000", idempotencyKey: "report-receipt-2" },
			"2026-10-13",
		);

		const report = reportOf((await w.generate()).report);
		expect(report.unavailable.map((item) => item.area)).not.toContain("Inventory");
		expect(report.summary[4]).toBe(
			"6 areas the workspace has no records for are listed as unavailable, not as zero.",
		);
		expect(report.coverage.find((row) => row.source === "Ingredient lots")).toMatchObject({ records: 2 });
		// Only the ingredient with something flagged becomes an action. The one in good order is not mentioned.
		expect(report.actions.map((a) => a.title)).toEqual(["Stock: Nic base 100"]);
		expect(report.actions[0]).toMatchObject({
			priority: "high",
			responsible: "A person in the Lab",
			reason: "Low stock: 300 mL usable, below the minimum of 500. Lot N-1 expires on 2026-11-01.",
			due: { date: "2026-11-01", confirmed: true },
			links: [{ label: "Ingredient", href: `/worldwide-ai/lab/ingredients/${base.id}` }],
		});
	});
});

describe("a report on a workspace with batches that have been made", () => {
	/** A workspace with stock, an approved recipe, and a way to make a batch of it. */
	async function lab(startAt: string, day: string) {
		const w = await open(startAt);
		let n = 0;
		const stocked = async (input: Parameters<typeof createIngredient>[2], lotCode: string) => {
			const ingredient = await createIngredient(w.sql, staff, input);
			const lot = await createLot(w.sql, staff, { ingredientId: ingredient.id, lotCode, unit: "mL" });
			await postMovement(
				w.sql,
				staff,
				{ lotId: lot.id, kind: "receipt", quantity: "20000", idempotencyKey: `report-made-${++n}` },
				day,
			);
			return ingredient.id;
		};
		const base = await stocked(
			{
				name: "Nic base 100",
				category: "nicotine_base",
				nicotineMgPerMl: "100",
				pgPercent: "90",
				vgPercent: "0",
			},
			"N-1",
		);
		const pg = await stocked({ name: "PG USP", category: "pg" }, "PG-1");
		const vg = await stocked({ name: "VG USP", category: "vg" }, "VG-1");
		const mango = await stocked(
			{ name: "Mango concentrate", category: "flavour", pgPercent: "100", vgPercent: "0" },
			"M-1",
		);
		const recipe = await createRecipe(w.sql, staff, { name: "Mango 12" });
		const version = await addRecipeVersion(w.sql, staff, {
			recipeId: recipe.id,
			batchMl: "1000",
			targetNicotineMgPerMl: "12",
			targetPgPercent: "50",
			baseIngredientId: base,
			pgIngredientId: pg,
			vgIngredientId: vg,
			flavours: [{ ingredientId: mango, percent: "10" }],
		});
		await approveRecipeVersion(w.sql, owner, version.id);
		const make = async (actualYieldMl: string) => {
			const batch = await planBatch(w.sql, staff, { recipeVersionId: version.id, batchMl: "1000" }, day);
			await reserveBatch(w.sql, staff, batch.id, day);
			return completeBatch(w.sql, staff, batch.id, { actualYieldMl }, day);
		};
		return { w, make };
	}

	it("asks the owner for each release decision that is waiting, and puts an open hold first", async () => {
		const { w, make } = await lab("2026-10-14T13:00:00Z", "2026-10-14");
		const waiting = await make("990");
		const held = await make("985");
		await placeHold(w.sql, staff, held.id, "Cloudy retained sample.");

		const about = (report: DailyReport) =>
			report.actions.filter((a) => a.title.startsWith("Release decision") || a.title.startsWith("On hold"));
		const first = about(reportOf((await w.generate()).report));
		// A batch on hold is not also asked for a decision: the hold comes first.
		expect(first.map((a) => a.title).sort()).toEqual([
			`On hold: batch ${held.code}`,
			`Release decision: batch ${waiting.code}`,
		]);
		expect(first.find((a) => a.title.startsWith("On hold"))).toMatchObject({
			priority: "high",
			responsible: "The owner",
			reason: "Cloudy retained sample. While the hold is open the batch can't be packaged or released.",
			links: [{ label: `Batch ${held.code}`, href: `/worldwide-ai/lab/batches/${held.id}` }],
		});
		expect(first.find((a) => a.title.startsWith("Release decision"))).toMatchObject({
			priority: "normal",
			responsible: "The owner",
			reason: "Mango 12, made with a measured yield of 990 mL, is waiting for a release decision.",
			links: [{ label: `Batch ${waiting.code}`, href: `/worldwide-ai/lab/batches/${waiting.id}` }],
		});

		// Once the owner has decided, the report stops asking. The hold is still open, so it is still there.
		await decideRelease(w.sql, owner, {
			batchId: waiting.id,
			decision: "released",
			note: "Batch record read.",
			confirmations: RELEASE_CONFIRMATIONS.map((item) => item.id),
		});
		const second = about(reportOf((await w.generate({ again: true, actor: staff })).report));
		expect(second.map((a) => a.title)).toEqual([`On hold: batch ${held.code}`]);
	});

	it("asks for results to be verified, raises open deviations by how serious they are, and gives a dated action to whoever has it", async () => {
		const { w, make } = await lab("2026-10-15T13:00:00Z", "2026-10-15");
		const batch = await make("990");
		const entered = await enterResult(
			w.sql,
			staff,
			{
				batchId: batch.id,
				analyte: "Nicotine",
				reportedAs: "12.1",
				unit: "mg/mL",
				lab: "Prairie Analytical",
				reportRef: "PA-1001",
				reportedOn: "2026-10-14",
			},
			"2026-10-15",
		);
		const deviation = await openDeviation(
			w.sql,
			staff,
			{
				batchId: batch.id,
				title: "Label roll mix-up",
				description: "Two label rolls on the bench.",
				severity: "critical",
			},
			"2026-10-15",
		);
		await addCorrectiveAction(
			w.sql,
			staff,
			{
				deviationId: deviation.id,
				action: "Add the label roll to the clearance checklist",
				responsible: "Sam",
				dueOn: "2026-10-12",
			},
			"2026-10-15",
		);
		// An action with no agreed date is not given one.
		await addCorrectiveAction(
			w.sql,
			staff,
			{ deviationId: deviation.id, action: "Review label storage", responsible: "Olivia" },
			"2026-10-15",
		);

		const report = reportOf((await w.generate()).report);
		const find = (start: string) => report.actions.find((a) => a.title.startsWith(start));
		expect(find("Verify results")).toMatchObject({
			title: `Verify results: batch ${batch.code}`,
			responsible: "The owner",
			priority: "normal",
			reason:
				"1 result entered from report PA-1001 is waiting to be verified. Until then it doesn't count, and the batch can't be released.",
			links: [{ label: `Batch ${batch.code}`, href: `/worldwide-ai/lab/batches/${batch.id}/quality` }],
		});
		expect(find("Deviation")).toMatchObject({
			title: `Deviation ${deviation.code}: Label roll mix-up`,
			priority: "urgent",
			responsible: "The owner",
			reason: `Critical deviation against batch ${batch.code}, which can't be released while it is open. 2 actions open, 0 done and waiting to be verified.`,
			links: [
				{ label: `Deviation ${deviation.code}`, href: `/worldwide-ai/quality/deviations/${deviation.id}` },
			],
		});
		expect(report.actions.filter((a) => a.title.startsWith("Corrective action"))).toMatchObject([
			{
				title: `Corrective action for ${deviation.code}: Add the label roll to the clearance checklist`,
				responsible: "Sam",
				priority: "high",
				reason: "Due on 2026-10-12 and still open.",
				due: { date: "2026-10-12", confirmed: true },
			},
		]);
		expect(report.unavailable.map((item) => item.area)).toContain("Equipment and training");
		expect(report.coverage.find((row) => row.source === "Results waiting to be verified")?.records).toBe(1);
		expect(report.coverage.find((row) => row.source === "Open deviations")?.records).toBe(1);

		// Once the result is verified the report stops asking for it.
		await verifyResult(w.sql, owner, entered.id);
		const next = reportOf((await w.generate({ again: true, actor: staff })).report);
		expect(next.actions.some((a) => a.title.startsWith("Verify results"))).toBe(false);
		expect(next.coverage.find((row) => row.source === "Results waiting to be verified")?.records).toBe(0);
	});
});

describe("a report on a workspace with equipment and training on record", () => {
	it("raises equipment that can't be used or is about to lapse, and training to verify or renew", async () => {
		const w = await open("2026-10-20T13:00:00Z");
		const day = "2026-10-20";
		// Nothing recorded: the area is listed as unavailable, not as zero.
		expect(reportOf((await w.generate()).report).unavailable.map((item) => item.area)).toContain(
			"Equipment and training",
		);

		const never = await addEquipment(w.sql, staff, {
			code: "SC-1",
			name: "Bench scale",
			kind: "scale",
			calibrationIntervalDays: "180",
		});
		const soon = await addEquipment(w.sql, staff, {
			code: "SC-2",
			name: "Floor scale",
			kind: "scale",
			calibrationIntervalDays: "180",
		});
		await recordCalibration(
			w.sql,
			staff,
			{
				equipmentId: soon.id,
				performedOn: "2026-05-01",
				result: "pass",
				certificate: "CERT-1",
				performedBy: "Service",
				dueOn: "2026-10-28",
			},
			day,
		);
		// In calibration with months to run: not mentioned.
		const fine = await addEquipment(w.sql, staff, { code: "MX-1", name: "Mixer", kind: "mixer" });
		const waiting = await recordTraining(
			w.sql,
			staff,
			{ forSelf: true, topic: "Packaging SOP-PK-01", completedOn: "2026-10-01", evidence: "Signed sheet" },
			day,
		);
		const lapsing = await recordTraining(
			w.sql,
			staff,
			{
				forSelf: true,
				topic: "Batch manufacturing SOP-MF-01",
				completedOn: "2025-11-01",
				validUntil: "2026-11-01",
				evidence: "Signed sheet",
			},
			day,
		);
		await verifyTraining(w.sql, owner, lapsing.id);

		const report = reportOf((await w.generate({ again: true, actor: staff })).report);
		const about = report.actions.filter(
			(a) => a.title.startsWith("Equipment") || a.title.includes("raining"),
		);
		expect(about.map((a) => [a.title, a.priority, a.responsible])).toEqual(
			expect.arrayContaining([
				["Equipment: SC-1 Bench scale", "high", "A person in the Lab"],
				["Equipment: SC-2 Floor scale", "normal", "A person in the Lab"],
				["Verify training: 1 record", "normal", "The owner"],
				["Training: Sam Staff, Batch manufacturing SOP-MF-01", "normal", "Sam Staff"],
			]),
		);
		expect(about).toHaveLength(4);
		expect(about.find((a) => a.title.startsWith("Equipment: SC-1"))).toMatchObject({
			reason:
				"It can't be recorded against a batch. It needs calibrating and no calibration is on record. One is never assumed.",
			due: null,
			links: [{ label: "Equipment SC-1", href: `/worldwide-ai/manufacturing/equipment/${never.id}` }],
		});
		expect(about.find((a) => a.title.startsWith("Equipment: SC-2"))).toMatchObject({
			reason: "Its calibration is due on 2026-10-28.",
			due: { date: "2026-10-28", confirmed: true },
		});
		expect(about.find((a) => a.title.startsWith("Training: Sam"))).toMatchObject({
			reason: "It lapses on 2026-11-01.",
			due: { date: "2026-11-01", confirmed: true },
		});
		expect(report.actions.some((a) => a.title.includes(fine.code))).toBe(false);
		expect(report.unavailable.map((item) => item.area)).not.toContain("Equipment and training");
		expect(report.coverage.find((row) => row.source === "Equipment")?.records).toBe(3);
		expect(report.coverage.find((row) => row.source === "Training records")?.records).toBe(2);

		// Verified, the first record is no longer waiting.
		await verifyTraining(w.sql, owner, waiting.id);
		const next = reportOf((await w.generate({ again: true, actor: staff })).report);
		expect(next.actions.some((a) => a.title.startsWith("Verify training"))).toBe(false);
	});
});

describe("a report on a workspace with tags on record", () => {
	it("raises a scan the registry can't account for, once, until a person resolves it", async () => {
		const w = await open("2026-10-21T13:00:00Z");
		const [known] = await registerTags(w.sql, staff, {
			technology: "nfc",
			security: "plain",
			uids: "04A22BC19D3F80\n04A22BC19D3F81",
		});
		const at = new Date("2026-10-21T12:00:00Z");
		const scan = (uid: string, eventId: string) =>
			recordScan(
				w.sql,
				staff,
				{ eventId, technology: "nfc", uid, station: "Bench reader", workflow: "lookup", source: "simulated" },
				at,
			);
		// A registered tag read twice and a stranger read twice: one exception, for the stranger.
		await scan(known.uid, "r:1");
		await scan(known.uid, "r:2");
		const first = await scan("04FFFFFFFFFF01", "r:3");
		await scan("04FFFFFFFFFF01", "r:4");

		const report = reportOf((await w.generate()).report);
		const about = report.actions.filter((a) => a.title.includes("04FFFFFFFFFF01"));
		expect(about).toMatchObject([
			{
				title: "Tag not in the registry: 04FFFFFFFFFF01",
				responsible: "A person in the warehouse",
				priority: "normal",
				reason:
					"Read at Bench reader. No tag with this identifier is registered. Seen 2 times. A scan is an observation: it doesn't show whose the tag is or that anything is genuine.",
				links: [{ label: "Scans and exceptions", href: "/worldwide-ai/rfid/scans" }],
			},
		]);
		expect(report.actions.some((a) => a.title.includes(known.uid))).toBe(false);
		expect(report.coverage.find((row) => row.source === "Registered tags")?.records).toBe(2);
		expect(report.coverage.find((row) => row.source === "Tags in use attached to nothing")?.records).toBe(2);

		await resolveException(w.sql, staff, {
			exceptionId: first.exception?.id ?? "",
			resolution: "A visitor's transit card.",
		});
		const next = reportOf((await w.generate({ again: true, actor: staff })).report);
		expect(next.actions.some((a) => a.title.includes("04FFFFFFFFFF01"))).toBe(false);
	});
});

describe("a report on a workspace with coding work asked for", () => {
	it("says plainly that nothing has run, and asks for a decision once a change is frozen", async () => {
		const w = await open("2026-10-22T13:00:00Z");
		const base = "a".repeat(40);
		await registerRepository(w.sql, owner, {
			id: "storefront",
			label: "The storefront",
			defaultBranch: "main",
			changeScope: "src/ui/**",
		});
		const job = await requestCodingJob(
			w.sql,
			staff,
			{
				jobType: "change_proposal",
				repositoryId: "storefront",
				baseCommit: base,
				goal: "Fix the filter drawer.",
				expectedResult: "The drawer opens at phone width.",
				checks: ["typecheck"],
				idempotencyKey: "report-coding-1",
			},
			new Date("2026-10-22T12:00:00Z"),
		);
		const first = reportOf((await w.generate()).report);
		expect(first.actions.find((a) => a.title.startsWith("Coding work is waiting"))).toMatchObject({
			title: "Coding work is waiting: 1 job",
			responsible: "The owner",
			reason:
				"No coding backend is connected, so nothing has run. Waiting on: storefront. No patch or check result exists for it.",
			links: [{ label: "Coding work", href: "/worldwide-ai/engineering/coding" }],
		});
		expect(first.coverage.find((row) => row.source === "Coding jobs")?.records).toBe(1);

		// A worker (stood in for here) returns a change. The job is no longer waiting; the change needs a decision.
		const file = "src/ui/filters.tsx";
		const pkg = await acceptPackage(
			w.sql,
			{ kind: "system", label: "coding-worker" },
			{
				jobId: job.id,
				envelopeSha256: job.envelopeSha256,
				baseCommit: base,
				diff: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new\n`,
				files: [{ path: file, change: "modified" }],
				summary: "The drawer's open state was reset on every render.",
			},
		);
		const second = reportOf((await w.generate({ again: true, actor: staff })).report);
		expect(second.actions.some((a) => a.title.startsWith("Coding work is waiting"))).toBe(false);
		expect(second.actions.find((a) => a.title.startsWith("Decide on a change"))).toMatchObject({
			title: "Decide on a change: storefront",
			responsible: "The owner",
			reason:
				"The drawer's open state was reset on every render. 1 file changed. It can be approved only once Verify has passed every check on this exact candidate.",
			links: [{ label: "The change", href: `/worldwide-ai/engineering/coding/${job.id}` }],
		});

		await reviewPackage(w.sql, owner, {
			packageId: pkg.id,
			candidateSha256: pkg.candidateSha256,
			decision: "rejected",
			note: "Not the fix we want.",
		});
		const third = reportOf((await w.generate({ again: true, actor: staff })).report);
		expect(third.actions.some((a) => a.title.startsWith("Decide on a change"))).toBe(false);
	});
});

describe("a report on a workspace where reviewers keep correcting the same procedure", () => {
	it("reads the reviews as it is generated and asks the owner about the lesson, once", async () => {
		const w = await open("2026-10-23T13:00:00Z");
		const vault = SKILL_BY_ID.get("vault-bank-reconciliation") as SkillDefinition;
		const [evaluation] = await evaluateSkills(w.sql, [vault], { ranBy: "operator:owner-1" });
		await approveRelease(w.sql, owner, { skill: vault, evaluationId: evaluation.id });
		const deps = workflowDeps(w.sql, null, env);
		const reject = async (tolerance: string, note: string) => {
			const asked = await requestFunction(
				deps,
				staff,
				"vault.settlement-match",
				{ ...sample("vault.settlement-match"), toleranceDays: tolerance },
				{ lookup: lookupFunction },
			);
			await runFunction(deps, asked.task.id, { lookup: lookupFunction });
			const product = await getProductByTask(w.sql, asked.task.id);
			await reviewProduct(deps, owner, product?.id ?? "", { action: "reject", note });
		};
		await reject("1", "Two deposits matched to the wrong payouts.");
		// One correction: nothing is raised.
		expect(
			reportOf((await w.generate()).report).actions.some((a) => a.title.startsWith("Lesson to consider")),
		).toBe(false);

		await reject("2", "A refund reversal was treated as a payout.");
		// Nobody ran the learning step by hand: generating the report did.
		const report = reportOf((await w.generate({ again: true, actor: staff })).report);
		expect(report.actions.filter((a) => a.title.startsWith("Lesson to consider"))).toMatchObject([
			{
				title: `Lesson to consider: ${vault.title}`,
				responsible: "The owner",
				priority: "normal",
				reason: `Reviewers corrected or rejected 2 of 2 reviewed results that followed version ${vault.version} of this procedure. The workspace proposes no wording and has changed nothing.`,
				links: [{ label: "Lessons from reviews", href: "/worldwide-ai/improvement/lessons" }],
			},
		]);
		// It isn't also counted among the proposals people wrote.
		expect(report.actions.some((a) => a.title.includes("improvement proposal"))).toBe(false);
		// Generating again raises nothing more.
		await w.generate({ again: true, actor: staff });
		expect(
			(await listProposals(w.sql, { state: "open" })).filter((p) => p.origin === "reviews"),
		).toHaveLength(1);
	}, 240_000);
});
