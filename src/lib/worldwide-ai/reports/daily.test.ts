import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveVersion, createDocument } from "../atlas/service";
import { listAudit } from "../audit";
import { readConfig } from "../config";
import type { Sql, SqlClient } from "../db/sql";
import { recordFinding } from "../findings";
import { requestFunction, runFunction } from "../functions/pipeline";
import { hashOf } from "../functions/products";
import { FUNCTIONS, lookupFunction } from "../functions/registry";
import { recordHealth } from "../integrations/health";
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
			"Manufacturing and quality",
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
