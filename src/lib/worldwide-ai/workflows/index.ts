import { getTask, TaskNotFoundError } from "../tasks/repo";
import { INSPECTION_KIND, runSiteInspection } from "./inspection";
import { RELAY_KIND, runRelayDraft } from "./relay";
import { runDocumentScan, runHealthCheck } from "./scheduled";
import { WorkflowError, type RunOutcome, type WorkflowDeps } from "./types";

/** Runs whatever kind of task this is. The one place a task id turns into work, used by the app and by Trigger.dev alike. */
export async function runTask(
	deps: WorkflowDeps,
	taskId: string,
	run: { externalRunId?: string; resume?: boolean; waitMs?: number } = {},
): Promise<RunOutcome> {
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
			throw new WorkflowError("invalid", `There is no workflow for "${task.kind}".`);
	}
}
