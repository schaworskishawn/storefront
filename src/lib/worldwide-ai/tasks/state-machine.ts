import { TASK_STATES, type TaskState } from "../types";

/**
 * Which state a task may move to from which. The rules, in words:
 * - A queued task starts running, or is cancelled.
 * - A running task ends one of five ways: waits for a person (needs review), completes, fails, is cancelled, or its outcome
 *   can't be confirmed.
 * - A task waiting for review is completed (a person approved and the result was verified), failed, cancelled, or becomes
 *   outcome unknown if the verification can't confirm it.
 * - A failed or unknown-outcome task can be re-queued to try again, or the unknown can be settled by checking what actually
 *   happened (completed, failed, cancelled).
 * - Completed and cancelled are final.
 */

const ALLOWED: Record<TaskState, readonly TaskState[]> = {
	queued: ["running", "cancelled", "failed"],
	running: ["needs_review", "completed", "failed", "cancelled", "outcome_unknown"],
	needs_review: ["completed", "failed", "cancelled", "outcome_unknown"],
	failed: ["queued"],
	outcome_unknown: ["queued", "completed", "failed", "cancelled"],
	completed: [],
	cancelled: [],
};

export const canTransition = (from: TaskState, to: TaskState): boolean => ALLOWED[from].includes(to);

export const isFinal = (state: TaskState): boolean => ALLOWED[state].length === 0;

/** States in which the task has stopped and has an outcome (or an honest "unknown"). */
export const isFinished = (state: TaskState): boolean =>
	state === "completed" || state === "failed" || state === "cancelled" || state === "outcome_unknown";

/** States in which a request for the same work should be answered with the existing task rather than a new one. */
export const isActive = (state: TaskState): boolean =>
	state === "queued" || state === "running" || state === "needs_review";

export class InvalidTransitionError extends Error {
	constructor(
		readonly from: TaskState,
		readonly to: TaskState,
	) {
		super(`A task can't go from ${from} to ${to}.`);
		this.name = "InvalidTransitionError";
	}
}

export function assertTransition(from: TaskState, to: TaskState): void {
	if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const nextStates = (from: TaskState): readonly TaskState[] => ALLOWED[from];

export const ALL_STATES = TASK_STATES;
