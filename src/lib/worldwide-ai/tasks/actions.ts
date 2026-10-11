import { audit } from "../audit";
import type { Sql } from "../db/sql";
import { actorKey, actorLabel, type OperatorActor } from "../types";
import { InvalidTransitionError } from "./state-machine";
import { TaskNotFoundError, getTask, transitionTask, type TaskRecord } from "./repo";

/**
 * What a person can do to a task from the dashboard besides reviewing its result: cancel it, try it again, or (owner only)
 * settle one whose outcome couldn't be confirmed after checking what really happened.
 */

export class TaskActionError extends Error {
	constructor(
		readonly code: "forbidden" | "invalid" | "conflict",
		message: string,
	) {
		super(message);
		this.name = "TaskActionError";
	}
}

const CANCELLABLE = ["queued", "running", "needs_review", "outcome_unknown"] as const;

/** Cancels a task that hasn't finished. A draft that was waiting for review is withdrawn with it. */
export async function cancelTask(
	sql: Sql,
	operator: OperatorActor,
	taskId: string,
	note?: string,
): Promise<TaskRecord> {
	const task = await getTask(sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	// (`.some`, not `.includes`: this repo types `includes` as a type guard, which would narrow `task.state` to never below.)
	if (!CANCELLABLE.some((state) => state === task.state))
		throw new TaskActionError("conflict", `A ${task.state.replace("_", " ")} task can't be cancelled.`);
	const cancelled = await transitionTask(sql, taskId, "cancelled", operator, {
		note: note ? `Cancelled: ${note.slice(0, 200)}` : "Cancelled.",
		onlyFrom: [...CANCELLABLE],
	});
	await sql.query(
		`update wai_drafts set state = 'superseded', updated_at = now() where task_id = $1 and state = 'pending_review'`,
		[taskId],
	);
	await audit(sql, {
		actor: operator,
		action: "task.cancelled",
		subject: taskId,
		outcome: "allowed",
		detail: { from: task.state },
	});
	return cancelled;
}

/** Puts a failed task, or one whose outcome is unknown, back in the queue. The same task keeps its history (and, for OpenClaw, its session id). */
export async function retryTask(sql: Sql, operator: OperatorActor, taskId: string): Promise<TaskRecord> {
	const task = await getTask(sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	if (task.state !== "failed" && task.state !== "outcome_unknown")
		throw new TaskActionError(
			"conflict",
			`Only a failed task, or one whose outcome is unknown, can be retried. This one is ${task.state.replace("_", " ")}.`,
		);
	const queued = await transitionTask(sql, taskId, "queued", operator, {
		note: "Retried.",
		onlyFrom: ["failed", "outcome_unknown"],
	});
	await audit(sql, {
		actor: operator,
		action: "task.retried",
		subject: taskId,
		outcome: "allowed",
		detail: { from: task.state },
	});
	return queued;
}

/**
 * The owner settling a task whose outcome the system couldn't confirm, after looking for themselves. They say what they found;
 * that statement becomes the task's evidence and is attributed to them. Only the owner can, and only for this state.
 */
export async function settleUnknownTask(
	sql: Sql,
	operator: OperatorActor,
	taskId: string,
	input: { resolution: "completed" | "failed"; note: string },
	now: Date = new Date(),
): Promise<TaskRecord> {
	if (operator.role !== "owner") {
		await audit(sql, {
			actor: operator,
			action: "task.settled",
			subject: taskId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new TaskActionError("forbidden", "Only the owner can settle a task whose outcome is unknown.");
	}
	const note = input.note.trim();
	if (note.length < 10)
		throw new TaskActionError("invalid", "Say what you checked and what you found (at least a sentence).");
	if (input.resolution !== "completed" && input.resolution !== "failed")
		throw new TaskActionError("invalid", "Choose completed or failed.");
	try {
		const settled = await transitionTask(
			sql,
			taskId,
			input.resolution,
			operator,
			input.resolution === "completed"
				? {
						completionEvidence: {
							settledBy: actorKey(operator),
							settledByName: actorLabel(operator),
							settledAt: now.toISOString(),
							method: "checked by hand after the outcome was unknown",
							note: note.slice(0, 1000),
						},
						note: "Settled by the owner after checking.",
						onlyFrom: ["outcome_unknown"],
					}
				: {
						error: `Settled as failed by ${actorLabel(operator)}: ${note.slice(0, 300)}`,
						onlyFrom: ["outcome_unknown"],
					},
		);
		await audit(sql, {
			actor: operator,
			action: "task.settled",
			subject: taskId,
			outcome: "allowed",
			detail: { resolution: input.resolution },
		});
		return settled;
	} catch (error) {
		if (error instanceof InvalidTransitionError)
			throw new TaskActionError("conflict", "Only a task whose outcome is unknown can be settled.");
		throw error;
	}
}
