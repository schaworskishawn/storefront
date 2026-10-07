import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { approveVersion, createDocument } from "../atlas/service";
import { buildBriefing } from "../briefing";
import { readConfig } from "../config";
import type { SqlClient } from "../db/sql";
import { listFindings } from "../findings";
import { configStatus, INTEGRATION_IDS } from "../integrations/catalog";
import { checkIntegrations, healthHistory, latestHealth, recordHealth } from "../integrations/health";
import type { OpenClawConnector } from "../openclaw/connector";
import { createFolderStorage } from "../storage/files";
import { getTask, transitionTask } from "../tasks/repo";
import { freshDb, owner, staff, workflowDeps } from "../testing.test-util";
import { recordUsage } from "../usage";
import {
	findDocumentIssues,
	requestScheduledTask,
	runDocumentScan,
	runHealthCheck,
	summarizeHealth,
} from "./scheduled";
import { runTask } from "./index";
import { createCase } from "../support/cases";
import { requestRelayDraft } from "./relay";

const dbs: SqlClient[] = [];
const db = async () => {
	const d = await freshDb();
	dbs.push(d);
	return d;
};
afterEach(async () => {
	await Promise.all(dbs.splice(0).map((d) => d.close()));
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const okFetch = (async (input: RequestInfo | URL) =>
	String(input).includes("langfuse") || String(input).includes("/api/public/health")
		? json({ status: "OK" })
		: json({ data: { shop: { name: "Store" } } })) as typeof fetch;

const fullEnv = {
	POSTGRES_URL: "postgres://x",
	SUPABASE_URL: "https://x.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-key",
	ANTHROPIC_API_KEY: "sk-ant-test-key-123456789",
	TRIGGER_SECRET_KEY: "tr_dev_abc123456789",
	OPENCLAW_ADAPTER_URL: "https://oc.internal.example.com",
	OPENCLAW_ADAPTER_SECRET: "s".repeat(40),
	OPENCLAW_ALLOWED_HOSTS: "www.worldwidevapor.com",
	LANGFUSE_PUBLIC_KEY: "pk-lf-123",
	LANGFUSE_SECRET_KEY: "sk-lf-123",
	NEXT_PUBLIC_SALEOR_API_URL: "https://store.saleor.cloud/graphql/",
};

const connector = (health: { ok: boolean; detail: string }): OpenClawConnector => ({
	health: async () => ({ ...health, latencyMs: 12 }),
	findRunBySession: async () => null,
	submit: async () => Promise.reject(new Error("unused")),
	getRun: async () => Promise.reject(new Error("unused")),
	fetchFile: async () => Promise.reject(new Error("unused")),
});

describe("integration status", () => {
	it("lists every integration, and says what is missing for each one that isn't set up", () => {
		const status = configStatus(readConfig({}), {});
		expect(status.map((s) => s.id)).toEqual([...INTEGRATION_IDS]);
		const byId = Object.fromEntries(status.map((s) => [s.id, s]));
		expect(byId.database).toMatchObject({ configured: false, missing: ["POSTGRES_URL"] });
		expect(byId.model).toMatchObject({ configured: false, missing: ["ANTHROPIC_API_KEY"] });
		expect(byId.openclaw.missing).toEqual([
			"OPENCLAW_ADAPTER_URL",
			"OPENCLAW_ADAPTER_SECRET",
			"OPENCLAW_ALLOWED_HOSTS",
		]);
		expect(byId.trigger.note).toMatch(/inline/);
		for (const id of ["accounting", "carrier", "bank", "processor", "logs"])
			expect(byId[id]).toMatchObject({ configured: false, missing: ["No Phase 1 connector yet"] });
	});

	it("shows an integration as configured only when every setting is there", () => {
		const status = Object.fromEntries(configStatus(readConfig(fullEnv), fullEnv).map((s) => [s.id, s]));
		for (const id of [
			"database",
			"storage",
			"model",
			"trigger",
			"openclaw",
			"langfuse",
			"saleor",
			"playwright",
		])
			expect(status[id].configured, id).toBe(true);
		const partial = { ...fullEnv, OPENCLAW_ALLOWED_HOSTS: "" };
		expect(
			Object.fromEntries(configStatus(readConfig(partial), partial).map((s) => [s.id, s])).openclaw,
		).toMatchObject({ configured: false, missing: ["OPENCLAW_ALLOWED_HOSTS"] });
	});

	it("labels the in-memory demo store, and refuses it in production", () => {
		const demo = readConfig({ WORLDWIDE_AI_STORE: "demo" });
		expect(demo.database.mode).toBe("demo");
		expect(configStatus(demo, {}).find((s) => s.id === "database")).toMatchObject({
			configured: true,
			note: expect.stringMatching(/demonstration/),
		});
		expect(readConfig({ WORLDWIDE_AI_STORE: "demo", NODE_ENV: "production" }).database.mode).toBe("none");
	});
});

describe("health checks", () => {
	it("reports what is not configured as not configured, and checks nothing it can't", async () => {
		const sql = await db();
		const results = await checkIntegrations({ ...workflowDeps(sql, null, {}), env: {} });
		expect(results.map((r) => r.integration)).toEqual([...INTEGRATION_IDS]);
		expect(results.filter((r) => r.status === "not_configured").length).toBeGreaterThanOrEqual(12);
		expect(results.find((r) => r.integration === "playwright")?.status).toBe("unknown");
		expect(results.find((r) => r.integration === "model")?.status).toBe("not_configured");
	});

	it("measures the database, the store, OpenClaw and Langfuse by asking them", async () => {
		const sql = await db();
		const dir = await mkdtemp(join(tmpdir(), "wai-health-"));
		try {
			const results = await checkIntegrations({
				...workflowDeps(sql, null, fullEnv),
				env: fullEnv,
				storage: createFolderStorage(dir),
				openclaw: connector({ ok: true, detail: "OpenClaw's browser answered." }),
				fetchImpl: okFetch,
			});
			const by = Object.fromEntries(results.map((r) => [r.integration, r]));
			expect(by.database).toMatchObject({
				status: "healthy",
				detail: expect.stringMatching(/Schema version 1/),
			});
			expect(by.storage.status).toBe("healthy");
			expect(by.openclaw).toMatchObject({ status: "healthy", detail: "OpenClaw's browser answered." });
			expect(by.langfuse.status).toBe("healthy");
			expect(by.saleor.status).toBe("healthy");
			expect(by.database.latencyMs).not.toBeNull();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("reports a failing integration as unhealthy with a plain reason, without inventing a result", async () => {
		const sql = await db();
		const failing = (async () => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
		const results = await checkIntegrations({
			...workflowDeps(sql, null, fullEnv),
			env: fullEnv,
			openclaw: connector({ ok: false, detail: "The OpenClaw adapter couldn't be reached." }),
			fetchImpl: failing,
		});
		const by = Object.fromEntries(results.map((r) => [r.integration, r]));
		expect(by.openclaw).toMatchObject({
			status: "unhealthy",
			detail: "The OpenClaw adapter couldn't be reached.",
		});
		expect(by.langfuse).toMatchObject({ status: "unhealthy", detail: "The check failed." });
		expect(by.saleor.status).toBe("unhealthy");
	});

	it("marks a probe that never answers as unhealthy instead of waiting forever", async () => {
		const sql = await db();
		const hanging = (() => new Promise(() => undefined)) as unknown as typeof fetch;
		const results = await checkIntegrations({
			...workflowDeps(sql, null, fullEnv),
			env: fullEnv,
			fetchImpl: hanging,
			probeTimeoutMs: 30,
		});
		expect(results.find((r) => r.integration === "langfuse")).toMatchObject({
			status: "unhealthy",
			detail: expect.stringMatching(/No answer within/),
		});
	});

	it("says the database has no tables yet when the migration hasn't been applied", async () => {
		const sql = await db();
		await sql.query("delete from wai_meta");
		const results = await checkIntegrations({
			...workflowDeps(sql, null, fullEnv),
			env: fullEnv,
			fetchImpl: okFetch,
		});
		expect(results.find((r) => r.integration === "database")).toMatchObject({
			status: "degraded",
			detail: expect.stringMatching(/Apply the migration/),
		});
	});

	it("takes the model's health from the last real call, not from a guess", async () => {
		const sql = await db();
		const check = async () =>
			(
				await checkIntegrations({ ...workflowDeps(sql, null, fullEnv), env: fullEnv, fetchImpl: okFetch })
			).find((r) => r.integration === "model");
		expect(await check()).toMatchObject({
			status: "unknown",
			detail: expect.stringMatching(/no model call has been made yet/),
		});
		await recordUsage(sql, { taskId: null, roleId: "relay", kind: "model", model: "m", status: "ok" });
		expect(await check()).toMatchObject({ status: "healthy", detail: expect.stringMatching(/succeeded/) });
		await recordUsage(sql, { taskId: null, roleId: "relay", kind: "model", model: "m", status: "error" });
		expect(await check()).toMatchObject({ status: "degraded", detail: expect.stringMatching(/failed/) });
	});

	it("takes Trigger.dev's health from the last time a job was handed to it", async () => {
		const sql = await db();
		const check = async () =>
			(
				await checkIntegrations({ ...workflowDeps(sql, null, fullEnv), env: fullEnv, fetchImpl: okFetch })
			).find((r) => r.integration === "trigger");
		expect((await check())?.status).toBe("unknown");
		await recordHealth(sql, [
			{
				integration: "trigger",
				status: "unhealthy",
				detail: "Trigger.dev refused the job.",
				latencyMs: null,
			},
		]);
		expect(await check()).toMatchObject({
			status: "unhealthy",
			detail: expect.stringMatching(/refused the job/),
		});
	});

	it("keeps history and returns the newest result per integration", async () => {
		const sql = await db();
		await recordHealth(sql, [
			{ integration: "database", status: "unhealthy", detail: "down", latencyMs: null },
		]);
		await recordHealth(sql, [{ integration: "database", status: "healthy", detail: "up", latencyMs: 5 }]);
		expect((await latestHealth(sql)).find((h) => h.integration === "database")).toMatchObject({
			status: "healthy",
			detail: "up",
		});
		expect((await healthHistory(sql, "database")).map((h) => h.status)).toEqual(["healthy", "unhealthy"]);
	});

	it("counts the results", () => {
		expect(
			summarizeHealth([
				{ integration: "database", status: "healthy", detail: "", latencyMs: 1 },
				{ integration: "model", status: "unhealthy", detail: "", latencyMs: 1 },
				{ integration: "bank", status: "not_configured", detail: "", latencyMs: null },
			]),
		).toEqual({ checked: 3, healthy: 1, degraded: 0, unhealthy: 1, unknown: 0, notConfigured: 1 });
	});
});

describe("Watch: the scheduled health check", () => {
	it("makes one task per schedule slot and no more", async () => {
		const sql = await db();
		const deps = workflowDeps(sql, null, fullEnv);
		const a = await requestScheduledTask(deps, "watch.health_check", "2026-10-07T15:00");
		const b = await requestScheduledTask(deps, "watch.health_check", "2026-10-07T15:00");
		const c = await requestScheduledTask(deps, "watch.health_check", "2026-10-07T15:05");
		expect([a.created, b.created, c.created]).toEqual([true, false, true]);
		expect(b.task.id).toBe(a.task.id);
		expect(a.task).toMatchObject({ ownerRole: "watch", requestedBy: "system:schedule" });
	});

	it("saves every result, raises a finding for what is down, and completes with evidence it read back", async () => {
		const sql = await db();
		const deps = {
			...workflowDeps(sql, null, fullEnv),
			openclaw: connector({ ok: false, detail: "The OpenClaw adapter couldn't be reached." }),
			fetchImpl: okFetch,
		};
		const { task } = await requestScheduledTask(deps, "watch.health_check", "slot-1");
		const outcome = await runHealthCheck(deps, task.id);
		expect(outcome.status).toBe("completed");
		if (outcome.status !== "completed") return;
		expect(outcome.task.completionEvidence).toMatchObject({
			checked: INTEGRATION_IDS.length,
			unhealthy: 1,
			findingsRaised: 1,
			savedResults: INTEGRATION_IDS.length,
		});
		const open = await listFindings(sql, { status: "open" });
		expect(open).toHaveLength(1);
		expect(open[0]).toMatchObject({
			roleId: "watch",
			severity: "high",
			category: "integration-health",
			title: "openclaw is unhealthy",
		});
		expect(open[0].sourceRefs[0]).toMatchObject({ system: "health-check", id: "openclaw" });
		expect((await latestHealth(sql)).find((h) => h.integration === "openclaw")?.status).toBe("unhealthy");
	});

	it("doesn't raise the same finding twice in a day, and settles it once the integration recovers", async () => {
		const sql = await db();
		let up = false;
		const deps = {
			...workflowDeps(sql, null, fullEnv),
			fetchImpl: okFetch,
			get openclaw() {
				return connector(up ? { ok: true, detail: "fine" } : { ok: false, detail: "down" });
			},
		} as ReturnType<typeof workflowDeps> & { openclaw: OpenClawConnector };
		const run = async (slot: string) =>
			runHealthCheck(deps, (await requestScheduledTask(deps, "watch.health_check", slot)).task.id);
		await run("a");
		await run("b");
		expect(await listFindings(sql, { status: "open" })).toHaveLength(1);
		up = true;
		await run("c");
		expect(await listFindings(sql, { status: "open" })).toHaveLength(0);
		expect(await listFindings(sql, { status: "resolved" })).toHaveLength(1);
	});

	it("fails the task, saying so, when the database can't be written", async () => {
		const sql = await db();
		const deps = workflowDeps(sql, null, fullEnv);
		const { task } = await requestScheduledTask(deps, "watch.health_check", "broken");
		await sql.query("drop table wai_integration_health");
		const outcome = await runHealthCheck(deps, task.id);
		expect(outcome.status).toBe("failed");
		expect((await getTask(sql, task.id))?.state).toBe("failed");
		expect((await getTask(sql, task.id))?.completionEvidence).toBeNull();
	});

	it("skips a finished or running task, and respects a switched-off role", async () => {
		const sql = await db();
		const deps = workflowDeps(sql, null, fullEnv);
		const { task } = await requestScheduledTask(deps, "watch.health_check", "x");
		await runHealthCheck(deps, task.id);
		expect(await runHealthCheck(deps, task.id)).toMatchObject({ status: "skipped" });
		const other = await requestScheduledTask(deps, "watch.health_check", "y");
		await transitionTask(sql, other.task.id, "running", { kind: "system", label: "z" });
		expect(await runHealthCheck(deps, other.task.id)).toMatchObject({
			status: "skipped",
			reason: "The task is already running.",
		});
		const off = await db();
		await (await import("../agents/settings")).updateRoleSettings(off, owner, "watch", { enabled: false });
		const offDeps = workflowDeps(off, null, fullEnv);
		const t = await requestScheduledTask(offDeps, "watch.health_check", "off");
		expect(await runHealthCheck(offDeps, t.task.id)).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/switched off/),
		});
	});
});

describe("Review: the document scan", () => {
	const now = new Date("2026-10-07T15:00:00Z");
	const make = async (
		sql: SqlClient,
		title: string,
		extra: { reviewDue?: string; expiresAt?: string } = {},
		approve = true,
	) => {
		const { document } = await createDocument(sql, owner, {
			collection: "shipping",
			title,
			owner: "Olivia",
			source: "page",
			content: `${title} text`,
			...extra,
		});
		if (approve)
			await approveVersion(sql, owner, document.id, 1, extra.reviewDue ? { reviewDue: extra.reviewDue } : {});
		return document;
	};

	it("finds expired, overdue and soon-due documents, and leaves healthy ones alone", async () => {
		const sql = await db();
		await make(sql, "Fine", { reviewDue: "2027-06-01" });
		const expired = await make(sql, "Expired", { expiresAt: "2026-10-01" });
		const overdue = await make(sql, "Overdue", { reviewDue: "2026-09-01" });
		const soon = await make(sql, "Soon", { reviewDue: "2026-10-12" });
		const expiring = await make(sql, "Expiring", { expiresAt: "2026-10-10" });
		const { scanned, issues } = await findDocumentIssues({ sql, config: readConfig({}), now: () => now });
		expect(scanned).toBe(5);
		expect(Object.fromEntries(issues.map((i) => [i.documentId, i.kind]))).toEqual({
			[expired.id]: "expired",
			[overdue.id]: "review_overdue",
			[soon.id]: "review_soon",
			[expiring.id]: "expiring_soon",
		});
	});

	it("flags a draft that has waited too long for approval, and ignores a retired document", async () => {
		const sql = await db();
		const waiting = await make(sql, "Waiting", {}, false);
		await sql.query("update wai_documents set created_at = $2 where id = $1", [
			waiting.id,
			"2026-09-20T12:00:00Z",
		]);
		const retired = await make(sql, "Retired", { expiresAt: "2026-01-01" });
		await sql.query("update wai_documents set status = 'retired' where id = $1", [retired.id]);
		const { issues } = await findDocumentIssues({ sql, config: readConfig({}), now: () => now });
		expect(issues).toEqual([expect.objectContaining({ documentId: waiting.id, kind: "unapproved" })]);
	});

	it("records a finding for each problem once, and completes with evidence that every one was saved", async () => {
		const sql = await db();
		await make(sql, "Expired", { expiresAt: "2026-10-01" });
		await make(sql, "Overdue", { reviewDue: "2026-09-01" });
		const deps = { ...workflowDeps(sql, null, {}), now: () => now };
		const first = await runDocumentScan(
			deps,
			(await requestScheduledTask(deps, "review.document_scan", "d1")).task.id,
		);
		expect(first.status).toBe("completed");
		if (first.status !== "completed") return;
		expect(first.task.completionEvidence).toMatchObject({
			scanned: 2,
			issues: 2,
			findingsRaised: 2,
			alreadyKnown: 0,
		});
		const findings = await listFindings(sql, { status: "open" });
		expect(findings.map((f) => f.title).sort()).toEqual([
			'"Expired" has expired',
			'"Overdue" is past its review date',
		]);
		expect(findings.every((f) => f.roleId === "review" && f.sourceRefs[0].system === "atlas")).toBe(true);

		const second = await runDocumentScan(
			deps,
			(await requestScheduledTask(deps, "review.document_scan", "d2")).task.id,
		);
		expect(second.status === "completed" && second.task.completionEvidence).toMatchObject({
			issues: 2,
			findingsRaised: 0,
			alreadyKnown: 2,
		});
		expect(await listFindings(sql, { status: "open" })).toHaveLength(2);
	});
});

describe("running a task by kind", () => {
	it("sends each kind of task to its own workflow, and refuses an unknown kind", async () => {
		const sql = await db();
		const deps = workflowDeps(sql, null, fullEnv);
		const watch = await requestScheduledTask(deps, "watch.health_check", "k1");
		expect((await runTask({ ...deps, fetchImpl: okFetch }, watch.task.id)).status).toBe("completed");
		const scan = await requestScheduledTask(deps, "review.document_scan", "k2");
		expect((await runTask(deps, scan.task.id)).status).toBe("completed");

		const c = (
			await createCase(sql, staff, {
				source: "manual",
				subject: "Pallet pricing",
				message: "What is wholesale pallet pricing?",
			})
		).case;
		const relay = await requestRelayDraft(deps, staff, c.id);
		expect((await runTask(deps, relay.task.id)).status).toBe("needs_review");

		await sql.query("alter table wai_tasks drop constraint if exists wai_tasks_requester_is_known");
		const { rows } = await sql.query<{ id: string }>(
			`insert into wai_tasks (kind, title, owner_role, idempotency_key, requested_by, expected_result) values ('ledger.post_entry','x','ledger','k-unknown','system:x','y') returning id`,
		);
		await expect(runTask(deps, rows[0].id)).rejects.toMatchObject({ code: "invalid" });
	});
});

describe("Nexus: the briefing", () => {
	it("counts what needs a person, puts that first, and says plainly when nothing does", async () => {
		const sql = await db();
		const now = new Date("2026-10-07T15:00:00Z");
		const empty = await buildBriefing(sql, { staleAfterDays: 180 }, now);
		expect(empty.items).toEqual([{ level: "info", text: "Nothing is waiting on you.", href: "/ops/tasks" }]);

		const deps = { ...workflowDeps(sql, null, {}), now: () => now };
		const c = (
			await createCase(sql, staff, {
				source: "manual",
				subject: "Pallet pricing",
				message: "What is wholesale pallet pricing?",
			})
		).case;
		const req = await requestRelayDraft(deps, staff, c.id);
		await runTask(deps, req.task.id);
		await createDocument(sql, staff, {
			collection: "faq",
			title: "Pending doc",
			owner: "Pat",
			source: "s",
			content: "pending text",
		});
		await createDocument(sql, owner, {
			collection: "faq",
			title: "Old doc",
			owner: "Pat",
			source: "s",
			content: "old text",
			expiresAt: "2026-10-01",
		}).then(({ document }) => approveVersion(sql, owner, document.id, 1));
		await recordHealth(sql, [
			{ integration: "openclaw", status: "unhealthy", detail: "down", latencyMs: null },
		]);

		const briefing = await buildBriefing(sql, { staleAfterDays: 180 }, now);
		expect(briefing).toMatchObject({
			pendingDrafts: 1,
			pendingDocuments: 1,
			documentIssues: { expired: 1, overdue: 0 },
			integrations: { unhealthy: ["openclaw"] },
		});
		expect(briefing.tasks.needs_review).toBe(1);
		expect(briefing.items.map((i) => i.level)).toEqual(["action", "action", "attention", "attention"]);
		expect(briefing.items[0].text).toBe("1 support draft waiting for your review.");
		expect(briefing.items[1].text).toBe("1 document version waiting for the owner's approval.");
		expect(briefing.generatedAt).toBe(now.toISOString());
	});
});
