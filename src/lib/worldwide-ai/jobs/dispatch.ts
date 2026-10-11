import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { runWorldwideAiTask } from "@/trigger/run-task";
import { recordHealth } from "../integrations/health";
import { addTaskEvent, setExternalRunId, type TaskRecord } from "../tasks/repo";
import type { Actor } from "../types";
import type { WorkflowDeps } from "../workflows/types";

/**
 * Hands a queued task to whatever runs background work. Trigger.dev owns that when it is configured: the task goes to it with
 * an idempotency key made from the task's own, so handing the same task over twice (a retry after a lost answer) can't start
 * two runs. When Trigger.dev isn't configured, the caller may pass an `inline` runner (the dashboard uses Next's `after`) so
 * short jobs still work, and the Integrations page says plainly that it is running that way.
 *
 * If the hand-over fails, the task stays queued and says so; nothing is reported as running that isn't.
 */

export type DispatchResult =
	| { via: "trigger"; runId: string }
	| { via: "inline" }
	| { via: "none"; reason: string };

const dispatcher: Actor = { kind: "system", label: "dispatcher" };

export async function dispatchTask(
	deps: WorkflowDeps,
	task: TaskRecord,
	options: { inline?: (taskId: string) => void } = {},
): Promise<DispatchResult> {
	if (deps.config.trigger.secretSet) {
		try {
			const key = await idempotencyKeys.create(`worldwide-ai-task:${task.idempotencyKey}`, {
				scope: "global",
			});
			const handle = await tasks.trigger<typeof runWorldwideAiTask>(
				"worldwide-ai-run-task",
				{ taskId: task.id },
				{ idempotencyKey: key, tags: [`wai-task_${task.id.slice(0, 8)}`, `wai-role_${task.ownerRole}`] },
			);
			await setExternalRunId(deps.sql, task.id, handle.id);
			await addTaskEvent(deps.sql, task.id, {
				kind: "dispatched",
				actor: dispatcher,
				detail: { via: "trigger.dev", runId: handle.id },
			});
			await recordHealth(deps.sql, [
				{ integration: "trigger", status: "healthy", detail: "The last job was accepted.", latencyMs: null },
			]);
			return { via: "trigger", runId: handle.id };
		} catch (error) {
			const reason = "Trigger.dev didn't accept the job.";
			await addTaskEvent(deps.sql, task.id, {
				kind: "dispatch_failed",
				actor: dispatcher,
				detail: { via: "trigger.dev", reason, error: error instanceof Error ? error.name : "error" },
			});
			await recordHealth(deps.sql, [
				{ integration: "trigger", status: "unhealthy", detail: reason, latencyMs: null },
			]).catch(() => undefined);
			return { via: "none", reason: `${reason} The task is still queued; you can start it again.` };
		}
	}
	if (options.inline) {
		options.inline(task.id);
		await addTaskEvent(deps.sql, task.id, {
			kind: "dispatched",
			actor: dispatcher,
			detail: { via: "inline" },
		});
		return { via: "inline" };
	}
	return {
		via: "none",
		reason: "No background runner is configured (TRIGGER_SECRET_KEY), so the task is waiting in the queue.",
	};
}
