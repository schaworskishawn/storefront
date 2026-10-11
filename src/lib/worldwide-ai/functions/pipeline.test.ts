import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ROLES, requireTool } from "../agents/registry";
import { updateRoleSettings } from "../agents/settings";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { configStatus } from "../integrations/catalog";
import { createFolderStorage } from "../storage/files";
import { countTasksByState, getTask, getTaskEvents, listTasks, transitionTask } from "../tasks/repo";
import { freshDb, mockModel, owner, staff, system, workflowDeps } from "../testing.test-util";
import { ROLE_COUNT, TASK_KINDS, type OperatorActor } from "../types";
import { summarizeUsage, usageForTask } from "../usage";
import { runTask } from "../workflows";
import { WorkflowError } from "../workflows/types";
import { FunctionInputError, loadProductView, requestFunction, reviewProduct, runFunction } from "./pipeline";
import { countPendingProducts, getProductByTask, hashOf, listProducts } from "./products";
import { READINESS_LABELS, functionReadiness, teamReadiness } from "./readiness";
import {
	ALL_FUNCTIONS,
	FUNCTIONS,
	capabilityMatrix,
	functionsOf,
	lookupFunction,
	primaryFunctionOf,
	registryProblems,
} from "./registry";

vi.setConfig({ testTimeout: 60_000 });

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

/** A configuration in which the database and the model are set up (the tests supply both themselves). */
const env = { POSTGRES_URL: "postgres://test", ANTHROPIC_API_KEY: "sk-ant-test" };
const deps = (model: Parameters<typeof workflowDeps>[1] = null, extra: Record<string, string> = {}) =>
	workflowDeps(sql, model, { ...env, ...extra });
const lookup = lookupFunction;
const other: OperatorActor = { kind: "operator", id: "staff-2", label: "Robin Other", role: "staff" };

let serial = 0;
const records = (label = "") =>
	`lot,name,quantity\nL-${++serial}${label},PG base,100\nL-${++serial}${label},VG base,250`;
const checkInput = (table = records()) => ({
	dataset: "Lots",
	keyColumn: "lot",
	numericColumns: "quantity",
	records: table,
});
const vaultInput = (suffix = `${++serial}`) => ({
	currency: "CAD",
	bank: `id,date,amount,reference\nB-${suffix},2026-09-03,100.00,PAYOUT P-${suffix}`,
	settlements: `id,date,net\nP-${suffix},2026-09-02,100.00`,
});

async function request(
	id: string,
	input: Record<string, unknown>,
	by: OperatorActor = staff,
	options: Partial<Parameters<typeof requestFunction>[4]> = {},
	d = deps(),
) {
	return requestFunction(d, by, id, input, { lookup, ...options });
}

describe("the function registry", () => {
	it("has a real handler for every kind of task and one baseline function for each of the 49 agents", () => {
		expect(registryProblems()).toEqual([]);
		expect(ALL_FUNCTIONS).toHaveLength(TASK_KINDS.length);
		expect(FUNCTIONS.size).toBe(52);
		expect(ROLES.map((role) => primaryFunctionOf(role.id)?.agent)).toEqual(ROLES.map((role) => role.id));
		const actions = ROLES.map((role) => primaryFunctionOf(role.id)?.action);
		expect(new Set(actions).size).toBe(ROLE_COUNT);
		const outputs = ROLES.map((role) => primaryFunctionOf(role.id)?.outputType);
		expect(new Set(outputs).size).toBe(ROLE_COUNT);
	});

	it("says for each function what it produces, what it needs and what it does not do", () => {
		for (const definition of ALL_FUNCTIONS) {
			expect(definition.purpose.length, definition.id).toBeGreaterThan(60);
			expect(definition.expectedResult.length, definition.id).toBeGreaterThan(60);
			expect(definition.notThis.length, definition.id).toBeGreaterThan(40);
			expect(definition.version, definition.id).toBeGreaterThanOrEqual(1);
			if (!definition.external) {
				expect(definition.fields.length, definition.id).toBeGreaterThan(0);
				expect(new Set(definition.fields.map((f) => f.key)).size, definition.id).toBe(
					definition.fields.length,
				);
			}
		}
		expect(lookupFunction("ledger.post_entry")).toBeUndefined();
		expect(lookupFunction("__proto__")).toBeUndefined();
		expect(
			functionsOf("patch")
				.map((f) => f.id)
				.sort(),
		).toEqual(["patch.issue-diagnosis", "patch.site_inspection"]);
	});

	it("generates the capability matrix from the registry: 49 rows, one per agent", () => {
		const matrix = capabilityMatrix();
		expect(matrix).toHaveLength(49);
		expect(matrix.map((row) => row.number)).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
		expect(matrix[0]).toMatchObject({
			agent: "Nexus",
			functionId: "nexus.goal-plan",
			outputType: "CoordinationBrief",
			store: "wai_work_products",
		});
		expect(matrix[2]).toMatchObject({
			agent: "Relay",
			functionId: "relay.support_draft",
			store: "wai_drafts, wai_draft_sources",
			handler: "src/lib/worldwide-ai/workflows/relay.ts",
		});
		expect(matrix.every((row) => row.handler.endsWith(".ts") && row.inputs.length > 0)).toBe(true);
		expect(matrix.find((row) => row.agentId === "vault")).toMatchObject({
			uses: "code only",
			requires: "database",
			review: "a person must accept",
		});
		expect(matrix.find((row) => row.agentId === "script")).toMatchObject({
			uses: "model writes, code checks",
			requires: "database, model",
		});
	});
});

describe("readiness", () => {
	const statuses = (extra: Record<string, string> = {}) =>
		configStatus(deps(null, extra).config, { ...env, ...extra });

	it("is ready only when everything the function needs is configured, and names what is missing", () => {
		const check = FUNCTIONS.get("check.record-validation")!;
		const script = FUNCTIONS.get("script.copy-draft")!;
		expect(functionReadiness(check, { statuses: statuses(), enabled: true })).toEqual({
			id: "check.record-validation",
			status: "ready",
			reasons: [],
			missing: [],
		});
		expect(functionReadiness(script, { statuses: statuses(), enabled: true }).status).toBe("ready");
		const bare = configStatus(workflowDeps(sql, null, { POSTGRES_URL: "postgres://test" }).config, {});
		expect(functionReadiness(script, { statuses: bare, enabled: true })).toMatchObject({
			status: "awaiting_configuration",
			missing: ["ANTHROPIC_API_KEY"],
		});
		expect(functionReadiness(check, { statuses: bare, enabled: true }).status).toBe("ready");
		expect(
			functionReadiness(FUNCTIONS.get("patch.site_inspection")!, { statuses: statuses(), enabled: true }),
		).toMatchObject({
			status: "awaiting_configuration",
			missing: expect.arrayContaining(["OPENCLAW_ADAPTER_URL", "SUPABASE_URL"]),
		});
	});

	it("keeps switched off, unhealthy and planned apart from each other", () => {
		const check = FUNCTIONS.get("check.record-validation")!;
		expect(functionReadiness(check, { statuses: statuses(), enabled: false }).status).toBe("disabled");
		expect(
			functionReadiness(check, {
				statuses: statuses(),
				enabled: true,
				health: [{ integration: "database", status: "unhealthy", detail: "No answer within 6 seconds." }],
			}),
		).toMatchObject({ status: "unhealthy", reasons: ["Supabase database: No answer within 6 seconds."] });
		expect(Object.keys(READINESS_LABELS).sort()).toEqual([
			"awaiting_configuration",
			"blocked",
			"disabled",
			"planned",
			"ready",
			"unhealthy",
		]);
	});

	it("counts 49 agents separately from how many are enabled and how many functions can run", () => {
		const team = teamReadiness(FUNCTIONS, {
			statuses: configStatus(workflowDeps(sql, null, { POSTGRES_URL: "postgres://test" }).config, {}),
			enabled: (role) => role !== "pulse",
		});
		expect(team.totals).toMatchObject({ agents: 49, enabled: 48, functionsRequired: 52 });
		// Without a model, every code-only baseline is ready and every model-written one is waiting for the key.
		expect(team.totals.baselinesReady).toBe(
			ROLES.filter((r) => primaryFunctionOf(r.id)?.uses === "code").length,
		);
		expect(team.totals.baselinesReady).toBe(31);
		expect(team.agents.find((a) => a.role.id === "pulse")?.primary.status).toBe("disabled");
		expect(team.agents.find((a) => a.role.id === "relay")?.primary.status).toBe("awaiting_configuration");
		expect(team.agents.find((a) => a.role.id === "build")?.planned[0].readiness).toMatchObject({
			status: "planned",
			id: "build.change-proposal",
		});
		expect(team.totals.planned).toBeGreaterThanOrEqual(5);
	});
});

describe("running a function", () => {
	it("validates, runs the handler, stores the result, reads it back and only then completes the task", async () => {
		const asked = await request("check.record-validation", checkInput());
		expect(asked.kind).toBe("created");
		expect(asked.task).toMatchObject({
			kind: "check.record-validation",
			ownerRole: "check",
			state: "queued",
			scope: "business",
			demo: false,
		});
		expect(asked.task.expectedResult).toMatch(/A data quality report is stored/);

		const outcome = await runFunction(deps(), asked.task.id, { lookup });
		expect(outcome.status).toBe("completed");
		const product = await getProductByTask(sql, asked.task.id);
		expect(product).toMatchObject({
			functionId: "check.record-validation",
			agentId: "check",
			outputType: "DataQualityReport",
			reviewRequired: false,
			reviewState: "not_required",
		});
		expect(product?.payloadSha256).toBe(hashOf(product?.payload));
		expect(product?.inputSha256).toBe(asked.task.input.inputSha256);
		expect(product?.sourceRefs[0]).toMatchObject({
			system: "supplied-input",
			id: asked.task.id,
			sha256: asked.task.input.inputSha256,
		});

		const task = await getTask(sql, asked.task.id);
		expect(task?.state).toBe("completed");
		expect(task?.completionEvidence).toMatchObject({
			productId: product?.id,
			payloadSha256: product?.payloadSha256,
			inputSha256: product?.inputSha256,
		});
		expect((task?.completionEvidence?.checks as Array<{ ok: boolean }>).every((c) => c.ok)).toBe(true);
		expect((await getTaskEvents(sql, asked.task.id)).map((e) => e.kind)).toEqual([
			"created",
			"state_change",
			"result_stored",
			"state_change",
		]);
		expect((await usageForTask(sql, asked.task.id)).map((u) => u.tool)).toEqual([
			"source.read_supplied",
			"product.store",
		]);
		expect(
			(await listAudit(sql)).find((a) => a.action === "function.requested" && a.subject === asked.task.id),
		).toMatchObject({ actor: "operator:staff-1", outcome: "allowed" });
	});

	it("goes through the same runner the background jobs use", async () => {
		const asked = await request("check.record-validation", checkInput());
		expect((await runTask(deps(), asked.task.id)).status).toBe("completed");
	});

	it("refuses bad input with every specific problem, and creates nothing", async () => {
		const before = (await listTasks(sql, { limit: 200 })).length;
		const attempt = request("check.record-validation", { dataset: "", keyColumn: "lot", records: "" });
		await expect(attempt).rejects.toBeInstanceOf(FunctionInputError);
		await expect(attempt).rejects.toMatchObject({
			code: "invalid",
			problems: ["Dataset name is required.", expect.stringMatching(/^Records is empty/)],
		});
		await expect(
			request("vault.settlement-match", {
				currency: "CAD",
				bank: "id,date,amount\nB1,not-a-date,ten",
				settlements: "id,date,net\nP1,2026-09-02,5",
			}),
		).rejects.toMatchObject({
			problems: [
				'Bank lines, row 1: "date" (not-a-date) isn\'t a date like 2026-10-31.',
				'Bank lines, row 1: "amount" (ten) isn\'t a number.',
			],
		});
		expect((await listTasks(sql, { limit: 200 })).length).toBe(before);
	});

	it("refuses a function that doesn't exist, however it is spelled", async () => {
		for (const id of ["ledger.post_entry", "check", "constructor", "relay.support_draft; drop table"])
			await expect(request(id, {})).rejects.toMatchObject({
				code: id === "relay.support_draft; drop table" ? "not_found" : "not_found",
			});
		await expect(request("relay.support_draft", {})).rejects.toMatchObject({
			code: "invalid",
			message: expect.stringMatching(/has its own screen/),
		});
	});

	it("fails the task, storing nothing, when the handler finds the input can't support a result", async () => {
		const asked = await request("check.record-validation", { ...checkInput(), keyColumn: "serial" });
		const outcome = await runFunction(deps(), asked.task.id, { lookup });
		expect(outcome).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/The key column "serial" isn't a column in the records/),
		});
		expect(await getProductByTask(sql, asked.task.id)).toBeNull();
		expect((await getTask(sql, asked.task.id))?.state).toBe("failed");
	});

	it("does the work once however often it is asked for or run", async () => {
		const input = checkInput();
		const first = await request("check.record-validation", input);
		const again = await request("check.record-validation", input);
		expect(again).toMatchObject({ kind: "existing", reason: "already_active" });
		expect(again.task.id).toBe(first.task.id);

		const [a, b] = await Promise.all([
			runFunction(deps(), first.task.id, { lookup }),
			runFunction(deps(), first.task.id, { lookup }),
		]);
		expect([a.status, b.status].sort()).toEqual(["completed", "skipped"]);
		expect((await runFunction(deps(), first.task.id, { lookup })).status).toBe("skipped");
		expect(
			(
				await sql.query("select count(*)::int as n from wai_work_products where task_id = $1", [
					first.task.id,
				])
			).rows[0].n,
		).toBe(1);

		expect(await request("check.record-validation", input)).toMatchObject({
			kind: "existing",
			reason: "already_completed",
		});
		const rerun = await request("check.record-validation", input, staff, { again: true });
		expect(rerun.kind).toBe("created");
		expect(rerun.task.input.attempt).toBe(2);
	});

	it("carries on from a stored result after a crash instead of producing a second one", async () => {
		const asked = await request("check.record-validation", checkInput());
		await runFunction(deps(), asked.task.id, { lookup });
		const product = await getProductByTask(sql, asked.task.id);
		// Put the task back to "running", as if the process died right after the result was stored.
		await sql.query(
			"update wai_tasks set state = 'running', completion_evidence = null, finished_at = null where id = $1",
			[asked.task.id],
		);
		const resumed = await runFunction(deps(), asked.task.id, { lookup, resume: true });
		expect(resumed).toMatchObject({ status: "completed", productId: product?.id });
		expect((await getTask(sql, asked.task.id))?.result).toMatchObject({ resumed: true });
	});

	it("marks the outcome unknown, never completed, when the stored result doesn't match what was produced", async () => {
		const asked = await request("check.record-validation", checkInput());
		await runFunction(deps(), asked.task.id, { lookup });
		await sql.query(
			"update wai_tasks set state = 'running', completion_evidence = null, finished_at = null where id = $1",
			[asked.task.id],
		);
		await sql.query(
			`update wai_work_products set payload = jsonb_set(payload, '{rowsChecked}', '999') where task_id = $1`,
			[asked.task.id],
		);
		const outcome = await runFunction(deps(), asked.task.id, { lookup, resume: true });
		expect(outcome.status).toBe("failed");
		const task = await getTask(sql, asked.task.id);
		expect(task?.state).toBe("outcome_unknown");
		expect(task?.error).toMatch(/could not be confirmed: The stored record is exactly what was produced/);
	});

	it("won't start for an agent the owner has switched off, and won't run one that was queued before", async () => {
		const queued = await request("stock.replenishment-plan", { snapshot: "S", stock: "sku,on_hand\nA,1" });
		await updateRoleSettings(sql, owner, "stock", { enabled: false });
		try {
			await expect(
				request("stock.replenishment-plan", { snapshot: "T", stock: "sku,on_hand\nB,1" }),
			).rejects.toMatchObject({ code: "disabled", message: expect.stringMatching(/Stock is switched off/) });
			expect(await runFunction(deps(), queued.task.id, { lookup })).toMatchObject({
				status: "failed",
				error: "Stock is switched off.",
			});
		} finally {
			await updateRoleSettings(sql, owner, "stock", { enabled: true });
		}
	});

	it("says exactly what is missing when the model isn't configured, instead of pretending", async () => {
		const noModel = workflowDeps(sql, null, { POSTGRES_URL: "postgres://test" });
		await expect(
			requestFunction(
				noModel,
				staff,
				"script.copy-draft",
				{ subject: "x", copyFields: "a", brief: "b", facts: "c" },
				{ lookup },
			),
		).rejects.toMatchObject({
			code: "not_configured",
			message: expect.stringMatching(
				/Model provider \(Anthropic\) isn't configured\. Missing: ANTHROPIC_API_KEY/,
			),
		});
		// A key that is set but a provider that isn't there at run time fails the task, with nothing stored.
		const asked = await request("script.copy-draft", {
			subject: "x",
			copyFields: "a",
			brief: "b",
			facts: "c",
		});
		expect(await runFunction(deps(null), asked.task.id, { lookup })).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/No model provider is configured/),
		});
		expect(await getProductByTask(sql, asked.task.id)).toBeNull();
	});

	it("enforces each role's tool list in code", () => {
		expect(() => requireTool("check", "product.store")).not.toThrow();
		expect(() => requireTool("focus", "finding.record")).toThrow(
			/Focus is not permitted to use finding\.record/,
		);
		expect(() => requireTool("vault", "draft.save")).toThrow(/not permitted/);
		expect(() => requireTool("check", "task.create")).toThrow(/not permitted/);
	});
});

describe("reviewing a result", () => {
	const ready = async () => {
		const asked = await request("vault.settlement-match", vaultInput());
		const outcome = await runFunction(deps(), asked.task.id, { lookup });
		if (outcome.status !== "needs_review") throw new Error(`setup: ${outcome.status}`);
		return { taskId: asked.task.id, productId: outcome.productId };
	};

	it("waits in needs_review until a person accepts it, then completes only after reading the decision back", async () => {
		const { taskId, productId } = await ready();
		expect((await getTask(sql, taskId))?.state).toBe("needs_review");
		expect((await getTask(sql, taskId))?.completionEvidence).toBeNull();
		expect(await countPendingProducts(sql)).toBeGreaterThanOrEqual(1);

		const reviewed = await reviewProduct(deps(), staff, productId, {
			action: "accept",
			note: "Matches the bank portal.",
		});
		expect(reviewed.product).toMatchObject({
			reviewState: "accepted",
			reviewedBy: "operator:staff-1",
			reviewNote: "Matches the bank portal.",
		});
		expect(reviewed.checks.map((c) => c.ok)).toEqual([true, true, true, true]);
		expect(reviewed.task.state).toBe("completed");
		expect(reviewed.task.completionEvidence).toMatchObject({
			productId,
			reviewer: "operator:staff-1",
			payloadSha256: reviewed.product.payloadSha256,
		});
		const view = await loadProductView(deps(), productId, "operator:staff-1");
		expect(view?.decisions).toEqual([
			expect.objectContaining({ decision: "approved", reviewerLabel: "Sam Staff" }),
		]);
	});

	it("rejecting needs a reason and cancels the task", async () => {
		const { taskId, productId } = await ready();
		await expect(reviewProduct(deps(), staff, productId, { action: "reject" })).rejects.toMatchObject({
			code: "invalid",
			message: expect.stringMatching(/Say why/),
		});
		const rejected = await reviewProduct(deps(), staff, productId, {
			action: "reject",
			note: "Wrong period.",
		});
		expect(rejected.product.reviewState).toBe("rejected");
		expect(rejected.task.state).toBe("cancelled");
		expect((await getTask(sql, taskId))?.completionEvidence).toBeNull();
		await expect(reviewProduct(deps(), staff, productId, { action: "accept" })).rejects.toMatchObject({
			code: "conflict",
		});
	});

	it("can't be decided twice, or for a task that isn't waiting", async () => {
		const { productId } = await ready();
		const [first, second] = await Promise.allSettled([
			reviewProduct(deps(), staff, productId, { action: "accept" }),
			reviewProduct(deps(), owner, productId, { action: "accept" }),
		]);
		expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
		expect(
			(
				await sql.query(
					"select count(*)::int as n from wai_reviews where subject_type = 'work_product' and subject_id = $1",
					[productId],
				)
			).rows[0].n,
		).toBe(1);
		await expect(
			reviewProduct(deps(), staff, "00000000-0000-4000-8000-000000000000", { action: "accept" }),
		).rejects.toMatchObject({ code: "not_found" });
		await expect(reviewProduct(deps(), staff, "not-an-id", { action: "accept" })).rejects.toMatchObject({
			code: "not_found",
		});
	});

	it("is something only a person can do: the database refuses an agent or the system as reviewer", async () => {
		const { productId } = await ready();
		for (const reviewer of ["agent:vault", "system:schedule", "agent:nexus"]) {
			await expect(
				sql.query(
					"update wai_work_products set review_state = 'accepted', reviewed_by = $2, reviewed_at = now() where id = $1",
					[productId, reviewer],
				),
			).rejects.toThrow();
			await expect(
				sql.query(
					"insert into wai_reviews (subject_type, subject_id, decision, reviewer) values ('work_product', $1, 'approved', $2)",
					[productId, reviewer],
				),
			).rejects.toThrow();
		}
		// And accepted without any reviewer at all is refused too.
		await expect(
			sql.query("update wai_work_products set review_state = 'accepted' where id = $1", [productId]),
		).rejects.toThrow();
		// A task can't be completed without evidence, whoever asks.
		const { taskId } = await ready();
		await expect(transitionTask(sql, taskId, "completed", system)).rejects.toThrow(
			/without completion evidence/,
		);
	});

	it("ends as outcome unknown when the accepted record was changed underneath the reviewer", async () => {
		const { taskId, productId } = await ready();
		await sql.query(
			`update wai_work_products set payload = jsonb_set(payload, '{currency}', '"USD"') where id = $1`,
			[productId],
		);
		const reviewed = await reviewProduct(deps(), staff, productId, { action: "accept" });
		expect(reviewed.task.state).toBe("outcome_unknown");
		expect(reviewed.checks.find((c) => c.name === "The accepted record is unchanged")?.ok).toBe(false);
		expect((await getTask(sql, taskId))?.error).toMatch(/accepted but could not be confirmed/);
	});
});

describe("personal work (Focus)", () => {
	const plan = {
		priorities: [
			{
				action: "Walk at lunch",
				goalId: "G1",
				why: "It fits the day",
				suggestedTiming: "Weekdays after lunch",
			},
		],
		leaveForLater: [],
		note: "Keep it small.",
		instructionsInData: false,
	};
	const ask = async (by: OperatorActor) => {
		const model = mockModel(plan);
		const asked = await request(
			"focus.personal-plan",
			{ horizon: "today", goals: `Walk every day ${++serial}` },
			by,
			{},
			deps(model.handle),
		);
		const outcome = await runFunction(deps(model.handle), asked.task.id, { lookup });
		if (outcome.status !== "needs_review") throw new Error(`setup: ${outcome.status}`);
		return { taskId: asked.task.id, productId: outcome.productId, model };
	};

	it("is visible to the person who asked and to nobody else", async () => {
		const { taskId, productId } = await ask(staff);
		expect((await getTask(sql, taskId))?.scope).toBe("personal:operator:staff-1");
		expect((await getProductByTask(sql, taskId))?.scope).toBe("personal:operator:staff-1");

		const ids = async (viewer?: string) => (await listTasks(sql, { viewer, limit: 200 })).map((t) => t.id);
		expect(await ids("operator:staff-1")).toContain(taskId);
		expect(await ids("operator:staff-2")).not.toContain(taskId);
		expect(await ids("operator:owner-1")).not.toContain(taskId);
		expect(await ids()).not.toContain(taskId);
		expect(
			(await listProducts(sql, { viewer: "operator:staff-2", limit: 200 })).map((p) => p.id),
		).not.toContain(productId);
		expect((await listProducts(sql, { viewer: "operator:staff-1", limit: 200 })).map((p) => p.id)).toContain(
			productId,
		);

		expect(await loadProductView(deps(), productId, "operator:staff-2")).toBeNull();
		expect(await loadProductView(deps(), productId, "operator:owner-1")).toBeNull();
		expect(await loadProductView(deps(), productId, "operator:staff-1")).not.toBeNull();
		await expect(reviewProduct(deps(), other, productId, { action: "accept" })).rejects.toMatchObject({
			code: "not_found",
		});
		await expect(reviewProduct(deps(), owner, productId, { action: "accept" })).rejects.toMatchObject({
			code: "not_found",
		});
		expect((await reviewProduct(deps(), staff, productId, { action: "accept" })).task.state).toBe(
			"completed",
		);
	});

	it("never shows up in shared counts, and two people asking the same thing get separate plans", async () => {
		const before = await countTasksByState(sql);
		const pendingBefore = await countPendingProducts(sql);
		const model = mockModel(plan);
		const input = { horizon: "today", goals: "Walk every day (shared wording)" };
		const mine = await request("focus.personal-plan", input, staff, {}, deps(model.handle));
		const theirs = await request("focus.personal-plan", input, other, {}, deps(model.handle));
		expect(theirs.kind).toBe("created");
		expect(theirs.task.id).not.toBe(mine.task.id);
		await runFunction(deps(model.handle), mine.task.id, { lookup });
		expect(await countTasksByState(sql)).toEqual(before);
		expect(await countPendingProducts(sql)).toBe(pendingBefore);
	});

	it("can't be pulled into one of Nexus's shared plans", async () => {
		const planTask = await request("nexus.goal-plan", {
			goal: "g",
			expectedResult: "e",
			mode: "plan",
			steps: "function\nfocus.personal-plan",
		});
		expect(await runFunction(deps(), planTask.task.id, { lookup })).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/is personal and can't be part of a shared plan/),
		});
	});
});

describe("demonstration runs", () => {
	it("are labelled, kept out of live lists and counts, and never confused with the same request made for real", async () => {
		const input = checkInput();
		const before = await countTasksByState(sql);
		const demo = await request("check.record-validation", input, staff, { demo: true });
		expect(demo.task).toMatchObject({ demo: true, title: expect.stringMatching(/^\[DEMO\] /) });
		await runFunction(deps(), demo.task.id, { lookup });
		expect((await getProductByTask(sql, demo.task.id))?.demo).toBe(true);
		expect(await countTasksByState(sql)).toEqual(before);
		expect((await listTasks(sql, { limit: 200 })).map((t) => t.id)).not.toContain(demo.task.id);
		expect((await listTasks(sql, { limit: 200, demo: "only" })).map((t) => t.id)).toContain(demo.task.id);
		expect((await listProducts(sql, { limit: 200 })).some((p) => p.taskId === demo.task.id)).toBe(false);

		const live = await request("check.record-validation", input);
		expect(live.kind).toBe("created");
		expect(live.task.id).not.toBe(demo.task.id);
		expect(live.task.demo).toBe(false);
	});
});

describe("work under one of Nexus's plans", () => {
	const makePlan = async (steps: string, demo = false) => {
		const asked = await request(
			"nexus.goal-plan",
			{ goal: `Close the month ${++serial}`, expectedResult: "Accepted reconciliation", mode: "plan", steps },
			staff,
			{ demo },
		);
		const outcome = await runFunction(deps(), asked.task.id, { lookup });
		if (outcome.status !== "completed") throw new Error(`setup: ${outcome.status}`);
		return asked.task.id;
	};

	it("links a child to the plan only when the plan names its function", async () => {
		const plan = await makePlan("function,depends_on\nvault.settlement-match,\ncheck.record-validation,1");
		const child = await request("vault.settlement-match", vaultInput(), staff, { parentTaskId: plan });
		expect(child.task).toMatchObject({ parentTaskId: plan, delegationDepth: 1, ownerRole: "vault" });
		await expect(
			request("stock.replenishment-plan", { snapshot: "S", stock: "sku,on_hand\nA,1" }, staff, {
				parentTaskId: plan,
			}),
		).rejects.toMatchObject({
			code: "forbidden",
			message: "That plan doesn't include Calculate replenishment needs.",
		});
	});

	it("lets nothing but a plan be a parent, so a specialist can't start a chain of its own", async () => {
		const ordinary = await request("check.record-validation", checkInput());
		await expect(
			request("vault.settlement-match", vaultInput(), staff, { parentTaskId: ordinary.task.id }),
		).rejects.toMatchObject({
			code: "forbidden",
			message: "A task can only be started under one of Nexus's plans.",
		});
		await expect(
			request("vault.settlement-match", vaultInput(), staff, {
				parentTaskId: "00000000-0000-4000-8000-000000000000",
			}),
		).rejects.toMatchObject({ code: "forbidden" });
		const demoPlan = await makePlan("function\nvault.settlement-match", true);
		await expect(
			request("vault.settlement-match", vaultInput(), staff, { parentTaskId: demoPlan }),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	it("consolidates what the children actually returned, keeping failures and waiting work visible", async () => {
		const plan = await makePlan(
			"function\nvault.settlement-match\ncheck.record-validation\nstock.replenishment-plan",
		);
		const vault = await request("vault.settlement-match", vaultInput(), staff, { parentTaskId: plan });
		await runFunction(deps(), vault.task.id, { lookup });
		const check = await request("check.record-validation", checkInput(), staff, { parentTaskId: plan });
		await runFunction(deps(), check.task.id, { lookup });

		const asked = await request("nexus.goal-plan", {
			goal: "Close the month",
			expectedResult: "e",
			mode: "consolidate",
			planTask: plan,
		});
		expect((await runFunction(deps(), asked.task.id, { lookup })).status).toBe("completed");
		const brief = (await getProductByTask(sql, asked.task.id))?.payload as {
			complete: boolean;
			counts: Record<string, number>;
			children: Array<{ functionId: string; state: string; verified: boolean }>;
			blockers: string[];
		};
		expect(brief.counts).toMatchObject({
			steps: 3,
			childrenStarted: 2,
			childrenCompleted: 1,
			childrenUnresolved: 1,
		});
		expect(brief.complete).toBe(false);
		expect(brief.children.find((c) => c.functionId === "check.record-validation")).toMatchObject({
			state: "Completed",
			verified: true,
		});
		expect(brief.children.find((c) => c.functionId === "vault.settlement-match")).toMatchObject({
			state: "Needs review",
			verified: false,
		});
		expect(brief.blockers).toEqual([
			expect.stringMatching(/^Vault, .*Needs review/),
			"stock.replenishment-plan was planned but never started.",
		]);
	});
});

describe("attached images", () => {
	const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("screenshot")]);
	const dirs: string[] = [];
	afterEach(async () => {
		for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
	});
	const input = { screen: `Review screen ${++serial}`, viewport: "desktop", goal: "Decide whether to save" };
	const reply = {
		observations: [
			{
				area: "Buttons",
				observation: "Save and Reject look the same.",
				category: "hierarchy",
				severity: "high",
				refinement: "Make Save the primary button.",
			},
		],
		workingWell: [],
		couldNotAssess: ["Contrast ratios"],
		instructionsInData: false,
	};

	it("are stored by checksum, given to the model, and named in the result's basis", async () => {
		const dir = await mkdtemp(join(tmpdir(), "wai-upload-"));
		dirs.push(dir);
		const storage = createFolderStorage(dir);
		const model = mockModel(reply);
		const d = { ...deps(model.handle), storage };
		const asked = await requestFunction(d, staff, "prism.design-review", input, {
			lookup,
			files: [{ field: "screenshots", name: "../../review screen.png", mime: "text/html", bytes: png }],
		});
		const uploads = asked.task.input.uploads as Array<{
			path: string;
			name: string;
			mime: string;
			sha256: string;
		}>;
		expect(uploads).toHaveLength(1);
		expect(uploads[0]).toMatchObject({ mime: "image/png", name: ".._.._review screen.png" });
		expect(uploads[0].path).toBe(`uploads/${uploads[0].sha256}.png`);
		expect(Buffer.from((await storage.get(uploads[0].path)) as Uint8Array).equals(png)).toBe(true);
		expect(
			(await sql.query("select kind, task_id from wai_files where path = $1", [uploads[0].path])).rows[0],
		).toEqual({ kind: "task_upload", task_id: asked.task.id });

		expect((await runFunction(d, asked.task.id, { lookup })).status).toBe("needs_review");
		const payload = (await getProductByTask(sql, asked.task.id))?.payload as {
			basis: string;
			computed: { screenshotsReviewed: number };
		};
		expect(payload.basis).toBe("Reviewed 1 attached screenshot.");
		expect(payload.computed.screenshotsReviewed).toBe(1);
	});

	it("are refused when they aren't images, are too many, or there is nowhere to keep them", async () => {
		const dir = await mkdtemp(join(tmpdir(), "wai-upload-"));
		dirs.push(dir);
		const d = { ...deps(mockModel(reply).handle), storage: createFolderStorage(dir) };
		const file = (name: string, bytes: Uint8Array) => ({
			field: "screenshots",
			name,
			mime: "image/png",
			bytes,
		});
		await expect(
			requestFunction(d, staff, "prism.design-review", input, {
				lookup,
				files: [file("page.html", Buffer.from("<script>alert(1)</script>"))],
			}),
		).rejects.toMatchObject({
			problems: ['Screenshots: "page.html" isn\'t a PNG, JPEG or WebP image.'],
		});
		await expect(
			requestFunction(d, staff, "prism.design-review", input, {
				lookup,
				files: [1, 2, 3, 4].map((n) => file(`${n}.png`, Buffer.concat([png, Buffer.from([n])]))),
			}),
		).rejects.toMatchObject({
			problems: ["Screenshots: at most 3 images."],
		});
		await expect(
			requestFunction(deps(mockModel(reply).handle), staff, "prism.design-review", input, {
				lookup,
				files: [file("a.png", png)],
			}),
		).rejects.toMatchObject({
			code: "not_configured",
			message: expect.stringMatching(/File storage isn't configured/),
		});
		await expect(requestFunction(d, staff, "prism.design-review", input, { lookup })).resolves.toMatchObject({
			kind: "created",
		});
	});

	it("says so when there is neither a screenshot nor a description", async () => {
		const model = mockModel(reply);
		const asked = await request(
			"prism.design-review",
			{ ...input, screen: "Nothing to look at" },
			staff,
			{},
			deps(model.handle),
		);
		expect(await runFunction(deps(model.handle), asked.task.id, { lookup })).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/Attach a screenshot or describe the screen/),
		});
		expect(model.calls()).toBe(0);
	});
});

describe("usage", () => {
	it("is recorded per agent for model and tool calls alike", async () => {
		const usage = await summarizeUsage(sql, new Date("2020-01-01T00:00:00Z"));
		expect(usage.find((u) => u.roleId === "check")?.toolCalls).toBeGreaterThanOrEqual(2);
		expect(usage.find((u) => u.roleId === "focus")).toMatchObject({
			modelCalls: expect.any(Number),
			inputTokens: expect.any(Number),
		});
		expect(usage.find((u) => u.roleId === "focus")?.modelCalls).toBeGreaterThanOrEqual(1);
	});

	it("is something a failed request never invents", async () => {
		await expect(request("check.record-validation", {})).rejects.toBeInstanceOf(WorkflowError);
	});
});
