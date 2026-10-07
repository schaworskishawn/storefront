import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db/sql";
import { latestHealth } from "../integrations/health";
import { createTask, getTask, getTaskEvents } from "../tasks/repo";
import { freshDb, staff, workflowDeps } from "../testing.test-util";

const trigger = vi.fn();
const createKey = vi.fn(
	async (key: string | string[], options?: { scope?: string }) =>
		`key:${Array.isArray(key) ? key.join("|") : key}:${options?.scope ?? "run"}`,
);
vi.mock("@trigger.dev/sdk", () => ({
	tasks: { trigger: (...args: unknown[]) => trigger(...args) },
	idempotencyKeys: { create: (...args: [string | string[], { scope?: string }?]) => createKey(...args) },
}));

import { dispatchTask } from "./dispatch";

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
}, 60_000);
afterAll(async () => {
	await sql.close();
});
beforeEach(() => {
	trigger.mockReset();
	createKey.mockClear();
});

let n = 0;
const queued = async () =>
	(
		await createTask(sql, {
			kind: "relay.support_draft",
			title: "t",
			expectedResult: "e",
			idempotencyKey: `dispatch-${++n}`,
			actor: staff,
		})
	).task;
const withTrigger = { TRIGGER_SECRET_KEY: "tr_dev_abcdefghijkl" };

describe("handing a task to a background runner", () => {
	it("gives it to Trigger.dev with an idempotency key made from the task's own, and remembers the run id", async () => {
		trigger.mockResolvedValue({ id: "run_trigger_123" });
		const task = await queued();
		const result = await dispatchTask(workflowDeps(sql, null, withTrigger), task);
		expect(result).toEqual({ via: "trigger", runId: "run_trigger_123" });
		expect(trigger).toHaveBeenCalledWith(
			"worldwide-ai-run-task",
			{ taskId: task.id },
			expect.objectContaining({
				idempotencyKey: `key:worldwide-ai-task:${task.idempotencyKey}:global`,
				tags: expect.arrayContaining([`wai-role_relay`]),
			}),
		);
		expect(createKey).toHaveBeenCalledWith(`worldwide-ai-task:${task.idempotencyKey}`, { scope: "global" });
		expect((await getTask(sql, task.id))?.externalRunId).toBe("run_trigger_123");
		expect((await getTaskEvents(sql, task.id)).at(-1)).toMatchObject({
			kind: "dispatched",
			detail: { via: "trigger.dev", runId: "run_trigger_123" },
		});
		expect((await latestHealth(sql)).find((h) => h.integration === "trigger")?.status).toBe("healthy");
	});

	it("uses the same key when the same task is handed over again, so a lost answer can't start a second run", async () => {
		trigger.mockResolvedValue({ id: "run_same" });
		const task = await queued();
		const deps = workflowDeps(sql, null, withTrigger);
		await dispatchTask(deps, task);
		await dispatchTask(deps, task);
		const keys = trigger.mock.calls.map((call) => (call[2] as { idempotencyKey: string }).idempotencyKey);
		expect(new Set(keys).size).toBe(1);
	});

	it("leaves the task queued, says why, and records Trigger.dev as unhealthy when the hand-over fails", async () => {
		trigger.mockRejectedValue(new Error("401 Unauthorized tr_dev_secretsecret"));
		const task = await queued();
		const result = await dispatchTask(workflowDeps(sql, null, withTrigger), task);
		expect(result).toMatchObject({ via: "none", reason: expect.stringMatching(/still queued/) });
		expect((await getTask(sql, task.id))?.state).toBe("queued");
		expect((await getTask(sql, task.id))?.externalRunId).toBeNull();
		const event = (await getTaskEvents(sql, task.id)).at(-1);
		expect(event).toMatchObject({ kind: "dispatch_failed" });
		expect(JSON.stringify(event)).not.toContain("secretsecret");
		expect((await latestHealth(sql)).find((h) => h.integration === "trigger")?.status).toBe("unhealthy");
	});

	it("runs a short job inline when Trigger.dev isn't configured and a runner is offered", async () => {
		const inline = vi.fn();
		const task = await queued();
		const result = await dispatchTask(workflowDeps(sql, null, {}), task, { inline });
		expect(result).toEqual({ via: "inline" });
		expect(inline).toHaveBeenCalledWith(task.id);
		expect(trigger).not.toHaveBeenCalled();
		expect((await getTaskEvents(sql, task.id)).at(-1)).toMatchObject({
			kind: "dispatched",
			detail: { via: "inline" },
		});
	});

	it("leaves the task waiting, and says so, when nothing can run it", async () => {
		const task = await queued();
		const result = await dispatchTask(workflowDeps(sql, null, {}), task);
		expect(result).toMatchObject({ via: "none", reason: expect.stringMatching(/waiting in the queue/) });
		expect((await getTask(sql, task.id))?.state).toBe("queued");
	});

	it("prefers Trigger.dev over inline when both are possible", async () => {
		trigger.mockResolvedValue({ id: "run_pref" });
		const inline = vi.fn();
		const result = await dispatchTask(workflowDeps(sql, null, withTrigger), await queued(), { inline });
		expect(result.via).toBe("trigger");
		expect(inline).not.toHaveBeenCalled();
	});
});
