import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SqlClient } from "../db/sql";
import { freshDb, nexusAgent, relayAgent, staff, system, uniqueKey } from "../testing.test-util";
import { TASK_STATES, type TaskState } from "../types";
import {
	InvalidTransitionError,
	canTransition,
	isActive,
	isFinal,
	isFinished,
	nextStates,
} from "./state-machine";
import {
	DelegationLimitError,
	TaskNotFoundError,
	claimTask,
	countTasksByState,
	createTask,
	getTask,
	getTaskEvents,
	listTasks,
	sweepStuckTasks,
	transitionTask,
} from "./repo";

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
}, 60_000);
afterAll(async () => {
	await sql.close();
});

const make = (overrides: Partial<Parameters<typeof createTask>[1]> = {}) =>
	createTask(sql, {
		kind: "relay.support_draft",
		title: "Draft a reply",
		expectedResult: "A reviewed reply is saved to the case.",
		idempotencyKey: uniqueKey(),
		actor: staff,
		...overrides,
	});

describe("the task state machine", () => {
	it("allows exactly the moves described", () => {
		const moves = (from: TaskState) => TASK_STATES.filter((to) => canTransition(from, to));
		expect(moves("queued")).toEqual(["running", "failed", "cancelled"]);
		expect(moves("running")).toEqual(["needs_review", "completed", "failed", "cancelled", "outcome_unknown"]);
		expect(moves("needs_review")).toEqual(["completed", "failed", "cancelled", "outcome_unknown"]);
		expect(moves("failed")).toEqual(["queued"]);
		expect(moves("outcome_unknown")).toEqual(["queued", "completed", "failed", "cancelled"]);
		expect(moves("completed")).toEqual([]);
		expect(moves("cancelled")).toEqual([]);
	});

	it("never goes from queued straight to completed or needs review", () => {
		expect(canTransition("queued", "completed")).toBe(false);
		expect(canTransition("queued", "needs_review")).toBe(false);
	});

	it("classifies states", () => {
		expect(isFinal("completed")).toBe(true);
		expect(isFinal("failed")).toBe(false);
		expect(isFinished("outcome_unknown")).toBe(true);
		expect(isFinished("needs_review")).toBe(false);
		expect(isActive("needs_review")).toBe(true);
		expect(isActive("failed")).toBe(false);
		expect(nextStates("completed")).toEqual([]);
	});
});

describe("creating tasks", () => {
	it("makes one queued task owned by the role that does that kind of work, and says what done means", async () => {
		const { task, created } = await make();
		expect(created).toBe(true);
		expect(task.state).toBe("queued");
		expect(task.ownerRole).toBe("relay");
		expect(task.expectedResult).toMatch(/saved to the case/);
		expect(task.completionEvidence).toBeNull();
		expect(task.requestedBy).toBe("operator:staff-1");
		const events = await getTaskEvents(sql, task.id);
		expect(events.map((e) => e.kind)).toEqual(["created"]);
	});

	it("returns the existing task for a repeated request instead of making another", async () => {
		const key = uniqueKey("dup");
		const first = await make({ idempotencyKey: key });
		const second = await make({ idempotencyKey: key, title: "A different title" });
		expect(second.created).toBe(false);
		expect(second.task.id).toBe(first.task.id);
		expect(second.task.title).toBe("Draft a reply");
		const { rows } = await sql.query("select count(*)::int as n from wai_tasks where idempotency_key = $1", [
			key,
		]);
		expect(rows[0].n).toBe(1);
		expect((await getTaskEvents(sql, first.task.id)).filter((e) => e.kind === "created")).toHaveLength(1);
	});

	it("survives two identical requests arriving at once", async () => {
		const key = uniqueKey("race");
		const results = await Promise.all(Array.from({ length: 5 }, () => make({ idempotencyKey: key })));
		expect(new Set(results.map((r) => r.task.id)).size).toBe(1);
		expect(results.filter((r) => r.created)).toHaveLength(1);
	});

	it("limits delegation depth", async () => {
		const root = (await make()).task;
		const child = (await make({ actor: nexusAgent, parentTaskId: root.id, maxDelegationDepth: 2 })).task;
		expect(child.delegationDepth).toBe(1);
		const grandchild = (await make({ actor: nexusAgent, parentTaskId: child.id, maxDelegationDepth: 2 }))
			.task;
		expect(grandchild.delegationDepth).toBe(2);
		await expect(
			make({ actor: nexusAgent, parentTaskId: grandchild.id, maxDelegationDepth: 2 }),
		).rejects.toBeInstanceOf(DelegationLimitError);
	});

	it("uses the delegating role's own limit by default", async () => {
		const root = (await make()).task;
		// Relay's registry limit is 1 level.
		const child = (await make({ actor: relayAgent, parentTaskId: root.id })).task;
		await expect(make({ actor: relayAgent, parentTaskId: child.id })).rejects.toBeInstanceOf(
			DelegationLimitError,
		);
	});

	it("refuses a parent that doesn't exist", async () => {
		await expect(make({ parentTaskId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(
			TaskNotFoundError,
		);
	});
});

describe("changing state", () => {
	it("runs, waits for review, and completes with evidence, recording each step", async () => {
		const { task } = await make();
		const running = await transitionTask(sql, task.id, "running", { kind: "system", label: "runner" });
		expect(running.state).toBe("running");
		expect(running.attempts).toBe(1);
		expect(running.startedAt).not.toBeNull();
		expect(running.finishedAt).toBeNull();

		const review = await transitionTask(sql, task.id, "needs_review", relayAgent, {
			result: { draftId: "d1" },
		});
		expect(review.result).toEqual({ draftId: "d1" });

		const done = await transitionTask(sql, task.id, "completed", staff, {
			completionEvidence: { verified: true },
		});
		expect(done.state).toBe("completed");
		expect(done.completionEvidence).toEqual({ verified: true });
		expect(done.finishedAt).not.toBeNull();

		const events = await getTaskEvents(sql, task.id);
		expect(events.map((e) => [e.fromState, e.toState])).toEqual([
			[null, "queued"],
			["queued", "running"],
			["running", "needs_review"],
			["needs_review", "completed"],
		]);
		expect(events.map((e) => e.actor)).toEqual([
			"operator:staff-1",
			"system:runner",
			"agent:relay",
			"operator:staff-1",
		]);
	});

	it("refuses to complete without evidence, and leaves the task as it was", async () => {
		const { task } = await make();
		await transitionTask(sql, task.id, "running", system);
		await expect(transitionTask(sql, task.id, "completed", staff)).rejects.toThrow(/completion evidence/);
		expect((await getTask(sql, task.id))?.state).toBe("running");
	});

	it("refuses a move the state machine doesn't allow", async () => {
		const { task } = await make();
		await expect(
			transitionTask(sql, task.id, "completed", staff, { completionEvidence: { x: 1 } }),
		).rejects.toBeInstanceOf(InvalidTransitionError);
		await transitionTask(sql, task.id, "cancelled", staff);
		await expect(transitionTask(sql, task.id, "running", system)).rejects.toBeInstanceOf(
			InvalidTransitionError,
		);
	});

	it("can be told to move only from certain states, so a double click does nothing twice", async () => {
		const { task } = await make();
		await transitionTask(sql, task.id, "running", system);
		await expect(
			transitionTask(sql, task.id, "failed", system, { onlyFrom: ["queued"] }),
		).rejects.toBeInstanceOf(InvalidTransitionError);
	});

	it("records a failure with its reason, and a retry clears it", async () => {
		const { task } = await make();
		await transitionTask(sql, task.id, "running", system);
		const failed = await transitionTask(sql, task.id, "failed", system, {
			error: "Model provider timed out",
		});
		expect(failed.error).toBe("Model provider timed out");
		expect(failed.finishedAt).not.toBeNull();
		const retried = await transitionTask(sql, task.id, "queued", staff);
		expect(retried.error).toBeNull();
		expect(retried.finishedAt).toBeNull();
		expect(retried.attempts).toBe(1);
		const again = await transitionTask(sql, task.id, "running", system);
		expect(again.attempts).toBe(2);
	});

	it("keeps outcome unknown distinct from failed, and lets it be settled later", async () => {
		const { task } = await make();
		await transitionTask(sql, task.id, "running", system);
		const unknown = await transitionTask(sql, task.id, "outcome_unknown", system, { error: "Lost contact" });
		expect(unknown.state).toBe("outcome_unknown");
		const settled = await transitionTask(sql, task.id, "completed", staff, {
			completionEvidence: { checkedBy: "hand" },
		});
		expect(settled.state).toBe("completed");
	});

	it("redacts personal details in history", async () => {
		const { task } = await make();
		await transitionTask(sql, task.id, "running", system, {
			note: "Customer jane@example.com called +1 204 555 0142",
		});
		const events = await getTaskEvents(sql, task.id);
		const detail = JSON.stringify(events.at(-1)?.detail);
		expect(detail).not.toContain("jane@example.com");
		expect(detail).not.toContain("555 0142");
		expect(detail).toContain("[email]");
	});

	it("says when a task doesn't exist", async () => {
		await expect(
			transitionTask(sql, "00000000-0000-4000-8000-000000000000", "running", system),
		).rejects.toBeInstanceOf(TaskNotFoundError);
	});
});

describe("claiming a task for a role", () => {
	it("starts a queued task when the role has a free slot, and holds the next one back", async () => {
		const db = await freshDb();
		try {
			const mk = () =>
				createTask(db, {
					kind: "patch.site_inspection",
					title: "Inspect",
					expectedResult: "Screenshots and findings",
					idempotencyKey: uniqueKey(),
					actor: staff,
				});
			const a = (await mk()).task;
			const b = (await mk()).task;
			const first = await claimTask(db, a.id, system, { maxConcurrent: 1 });
			expect(first).toMatchObject({ claimed: true });
			const second = await claimTask(db, b.id, system, { maxConcurrent: 1 });
			expect(second).toEqual({ claimed: false, reason: "busy" });
			expect((await getTask(db, b.id))?.state).toBe("queued");

			await transitionTask(db, a.id, "needs_review", system);
			expect(await claimTask(db, b.id, system, { maxConcurrent: 1 })).toMatchObject({ claimed: true });
		} finally {
			await db.close();
		}
	});

	it("won't start a task that isn't queued", async () => {
		const { task } = await make();
		await claimTask(sql, task.id, system, { maxConcurrent: 5 });
		expect(await claimTask(sql, task.id, system, { maxConcurrent: 5 })).toEqual({
			claimed: false,
			reason: "not_queued",
		});
	});

	it("doesn't over-commit when several start at once", async () => {
		const db = await freshDb();
		try {
			const tasks = await Promise.all(
				Array.from({ length: 4 }, () =>
					createTask(db, {
						kind: "patch.site_inspection",
						title: "i",
						expectedResult: "e",
						idempotencyKey: uniqueKey(),
						actor: staff,
					}),
				),
			);
			const results = await Promise.all(
				tasks.map((t) => claimTask(db, t.task.id, system, { maxConcurrent: 2 })),
			);
			expect(results.filter((r) => r.claimed)).toHaveLength(2);
		} finally {
			await db.close();
		}
	});
});

describe("stuck tasks", () => {
	it("marks a task that ran past its limit as outcome unknown, not failed and not completed", async () => {
		const db = await freshDb();
		try {
			const { task } = await createTask(db, {
				kind: "patch.site_inspection",
				title: "i",
				expectedResult: "e",
				idempotencyKey: uniqueKey(),
				actor: staff,
			});
			await transitionTask(db, task.id, "running", system);
			const later = new Date(Date.now() + 10 * 60_000);
			const swept = await sweepStuckTasks(db, { secondsFor: () => 120, now: later });
			expect(swept.map((t) => t.id)).toEqual([task.id]);
			const after = await getTask(db, task.id);
			expect(after?.state).toBe("outcome_unknown");
			expect(after?.error).toMatch(/may or may not have finished/);
		} finally {
			await db.close();
		}
	});

	it("leaves a recent running task alone", async () => {
		const db = await freshDb();
		try {
			const { task } = await createTask(db, {
				kind: "patch.site_inspection",
				title: "i",
				expectedResult: "e",
				idempotencyKey: uniqueKey(),
				actor: staff,
			});
			await transitionTask(db, task.id, "running", system);
			expect(await sweepStuckTasks(db, { secondsFor: () => 120 })).toEqual([]);
			expect((await getTask(db, task.id))?.state).toBe("running");
		} finally {
			await db.close();
		}
	});
});

describe("listing", () => {
	it("filters by state and owner, and counts by state", async () => {
		const db = await freshDb();
		try {
			const mk = (kind: "relay.support_draft" | "patch.site_inspection") =>
				createTask(db, { kind, title: kind, expectedResult: "e", idempotencyKey: uniqueKey(), actor: staff });
			const a = (await mk("relay.support_draft")).task;
			await mk("relay.support_draft");
			await mk("patch.site_inspection");
			await transitionTask(db, a.id, "running", system);

			expect(await listTasks(db, { ownerRole: "patch" })).toHaveLength(1);
			expect(await listTasks(db, { state: ["queued", "running"] })).toHaveLength(3);
			expect(await listTasks(db, { state: "running" })).toHaveLength(1);
			expect(await listTasks(db, { kind: "relay.support_draft", limit: 1 })).toHaveLength(1);
			const counts = await countTasksByState(db);
			expect(counts).toMatchObject({ queued: 2, running: 1, completed: 0 });
		} finally {
			await db.close();
		}
	});
});
