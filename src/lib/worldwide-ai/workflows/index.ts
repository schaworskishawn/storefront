import { runFunction, type FunctionOutcome } from "../functions/pipeline";
import { lookupFunction } from "../functions/registry";
import { getTask, TaskNotFoundError } from "../tasks/repo";
import { INSPECTION_KIND, runSiteInspection } from "./inspection";
import { RELAY_KIND, runRelayDraft } from "./relay";
import { runDocumentScan, runHealthCheck } from "./scheduled";
import { WorkflowError, type RunOutcome, type WorkflowDeps } from "./types";

/**
 * Runs whatever kind of task this is. The one place a task id turns into work, used by the app and by Trigger.dev alike.
 * The four workflows built first keep their own runners; every other kind goes through the shared function pipeline, and a
 * kind with no registered function is refused: there is no generic fallback.
 */
export async function runTask(
	deps: WorkflowDeps,
	taskId: string,
	run: { externalRunId?: string; resume?: boolean; waitMs?: number } = {},
): Promise<RunOutcome | FunctionOutcome> {
	const task = await getTask(deps.sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	switch (task.kind) {
		case RELAY_KIND:
			return runRelayDraft(deps, taskId, run);
		case INSPECTION_KIND:
			return runSiteInspection(deps, taskId, run);
		case "watch.health_check":
			return runHealthCheck(deps, taskId, run);
		case "review.document_scan":
			return runDocumentScan(deps, taskId, run);
		default:
			if (!lookupFunction(task.kind))
				throw new WorkflowError("invalid", `There is no workflow for "${task.kind}".`);
			return runFunction(deps, taskId, {
				externalRunId: run.externalRunId,
				resume: run.resume,
				lookup: lookupFunction,
			});
	}
}
