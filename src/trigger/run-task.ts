import { logger, task } from "@trigger.dev/sdk";
import { getRuntime } from "@/lib/worldwide-ai/runtime";
import { runTask } from "@/lib/worldwide-ai/workflows";

/**
 * The background job for every kind of Worldwide AI task. The dashboard queues a task in the database, then hands its id to
 * this job; this job loads the task and runs the workflow for its kind. The workflows are written to be run again safely
 * (a retried attempt carries on the task it finds instead of starting another), so a retry here can't double up work.
 *
 * A workflow that finishes badly records that on the task itself and returns normally: only an unexpected error (the database
 * was unreachable, say) is thrown, which is what makes Trigger.dev retry.
 *
 * It needs the same environment variables as the storefront (POSTGRES_URL, ANTHROPIC_API_KEY, SUPABASE_*, OPENCLAW_*, …) set
 * in the Trigger.dev project's environment. See docs/worldwide-ai.md.
 */

/** An inspection can outlast one wait, so keep checking the same run, up to this long. */
const INSPECTION_BUDGET_MS = 250_000;

export const runWorldwideAiTask = task({
	id: "worldwide-ai-run-task",
	maxDuration: 330,
	retry: { maxAttempts: 3, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
	run: async (payload: { taskId: string }, { ctx }) => {
		const runtime = await getRuntime();
		const resume = ctx.attempt.number > 1;
		const started = Date.now();
		for (let round = 0; ; round += 1) {
			const outcome = await runTask(runtime, payload.taskId, {
				externalRunId: ctx.run.id,
				resume: resume || round > 0,
				waitMs: 60_000,
			});
			logger.info("Worldwide AI task", {
				taskId: payload.taskId,
				status: outcome.status,
				state: outcome.task.state,
			});
			// "Deferred" because a job is still running somewhere else: look again, within the budget.
			if (
				outcome.status === "deferred" &&
				outcome.task.state === "running" &&
				Date.now() - started < INSPECTION_BUDGET_MS
			)
				continue;
			return { taskId: payload.taskId, status: outcome.status, state: outcome.task.state };
		}
	},
});
