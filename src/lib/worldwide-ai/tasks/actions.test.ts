import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { createCase } from "../support/cases";
import { getDraftByTask } from "../support/drafts";
import { freshDb, mockModel, owner, staff, system, uniqueKey, workflowDeps } from "../testing.test-util";
import { requestRelayDraft, runRelayDraft } from "../workflows/relay";
import { TaskActionError, cancelTask, retryTask, settleUnknownTask } from "./actions";
import { TaskNotFoundError, createTask, getTask, transitionTask } from "./repo";

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
}, 60_000);
afterAll(async () => {
	await sql.close();
});

const make = async () =>
	(
		await createTask(sql, {
			kind: "patch.site_inspection",
			title: "i",
			expectedResult: "e",
			idempotencyKey: uniqueKey(),
			actor: staff,
		})
	).task;
const inState = async (state: "running" | "failed" | "outcome_unknown") => {
	const task = await make();
	await transitionTask(sql, task.id, "running", system);
	if (state !== "running") await transitionTask(sql, task.id, state, system, { error: "x" });
	return task;
};

describe("cancelling a task", () => {
	it("cancels a queued, running or unknown-outcome task and logs who did it", async () => {
		for (const state of ["queued", "running", "outcome_unknown"] as const) {
			const task = state === "queued" ? await make() : await inState(state);
			const cancelled = await cancelTask(sql, staff, task.id, "Not needed");
			expect(cancelled.state).toBe("cancelled");
			expect(cancelled.finishedAt).not.toBeNull();
		}
		expect((await listAudit(sql)).find((a) => a.action === "task.cancelled")).toMatchObject({
			actor: "operator:staff-1",
			outcome: "allowed",
		});
	});

	it("withdraws a draft that was waiting for review", async () => {
		const c = (
			await createCase(sql, staff, {
				source: "manual",
				subject: "Pallet pricing",
				message: "What is your wholesale pallet pricing?",
			})
		).case;
		const deps = workflowDeps(sql, mockModel({}).handle);
		const requested = await requestRelayDraft(deps, staff, c.id);
		await runRelayDraft(deps, requested.task.id);
		expect((await getDraftByTask(sql, requested.task.id))?.state).toBe("pending_review");
		await cancelTask(sql, staff, requested.task.id);
		expect((await getDraftByTask(sql, requested.task.id))?.state).toBe("superseded");
	});

	it("won't cancel a finished task, or one that doesn't exist", async () => {
		const done = await inState("failed");
		await expect(cancelTask(sql, staff, done.id)).rejects.toMatchObject({ code: "conflict" });
		await expect(cancelTask(sql, staff, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(
			TaskNotFoundError,
		);
	});
});

describe("retrying a task", () => {
	it("re-queues a failed task or one with an unknown outcome, keeping the same task", async () => {
		for (const state of ["failed", "outcome_unknown"] as const) {
			const task = await inState(state);
			const queued = await retryTask(sql, staff, task.id);
			expect(queued).toMatchObject({ id: task.id, state: "queued", error: null, finishedAt: null });
		}
	});

	it("refuses a task that is queued, running, cancelled or completed", async () => {
		const queued = await make();
		await expect(retryTask(sql, staff, queued.id)).rejects.toBeInstanceOf(TaskActionError);
		const running = await inState("running");
		await expect(retryTask(sql, staff, running.id)).rejects.toMatchObject({ code: "conflict" });
		await cancelTask(sql, staff, running.id);
		await expect(retryTask(sql, staff, running.id)).rejects.toMatchObject({ code: "conflict" });
	});
});

describe("settling an unknown outcome", () => {
	it("lets the owner complete it, attributing the evidence to them", async () => {
		const task = await inState("outcome_unknown");
		const settled = await settleUnknownTask(
			sql,
			owner,
			task.id,
			{ resolution: "completed", note: "Checked the worker's folder: all four screenshots are there." },
			new Date("2026-10-07T15:00:00Z"),
		);
		expect(settled.state).toBe("completed");
		expect(settled.completionEvidence).toMatchObject({
			settledBy: "operator:owner-1",
			settledAt: "2026-10-07T15:00:00.000Z",
			method: expect.stringMatching(/by hand/),
		});
	});

	it("lets the owner settle it as failed", async () => {
		const task = await inState("outcome_unknown");
		const settled = await settleUnknownTask(sql, owner, task.id, {
			resolution: "failed",
			note: "The worker never received the job.",
		});
		expect(settled).toMatchObject({ state: "failed" });
		expect(settled.error).toMatch(/Settled as failed by Olivia Owner/);
	});

	it("refuses staff, logging the attempt, and refuses a vague note or the wrong state", async () => {
		const task = await inState("outcome_unknown");
		await expect(
			settleUnknownTask(sql, staff, task.id, { resolution: "completed", note: "I looked and it is fine." }),
		).rejects.toMatchObject({ code: "forbidden" });
		expect(
			(await listAudit(sql)).find((a) => a.action === "task.settled" && a.outcome === "denied"),
		).toMatchObject({ actor: "operator:staff-1" });
		await expect(
			settleUnknownTask(sql, owner, task.id, { resolution: "completed", note: "ok" }),
		).rejects.toMatchObject({ code: "invalid" });
		await expect(
			settleUnknownTask(sql, owner, task.id, {
				resolution: "maybe" as never,
				note: "Long enough note here.",
			}),
		).rejects.toMatchObject({ code: "invalid" });
		const running = await inState("running");
		await expect(
			settleUnknownTask(sql, owner, running.id, { resolution: "completed", note: "Long enough note here." }),
		).rejects.toMatchObject({ code: "conflict" });
		expect((await getTask(sql, task.id))?.state).toBe("outcome_unknown");
	});
});
