import { logger, schedules } from "@trigger.dev/sdk";
import { loadSettings } from "@/lib/worldwide-ai/agents/settings";
import { OPS_TIME_ZONE } from "@/lib/worldwide-ai/time";
import { getRuntime } from "@/lib/worldwide-ai/runtime";
import { sweepStuckTasks } from "@/lib/worldwide-ai/tasks/repo";
import { runTask } from "@/lib/worldwide-ai/workflows";
import { requestScheduledTask } from "@/lib/worldwide-ai/workflows/scheduled";

/**
 * The business schedules, owned by Trigger.dev. Times are Winnipeg time. They run no more often than hourly so they are
 * accepted on every Trigger.dev plan (the free plan refuses anything faster); on a paid plan, change the health check's cron
 * pattern to run every ten minutes if you want faster alerts.
 *
 * Each schedule makes one task for its time slot, and the same slot can never make two (the task's idempotency key is the slot),
 * so a schedule that fires twice does the work once.
 */

const slotOf = (timestamp: Date, length: number) => timestamp.toISOString().slice(0, length);

/** Watch: check every integration, record the results, raise a finding for anything down. */
export const healthCheckSchedule = schedules.task({
	id: "worldwide-ai-health-check",
	cron: { pattern: "0 * * * *", timezone: OPS_TIME_ZONE },
	run: async (payload) => {
		const runtime = await getRuntime();
		const { task } = await requestScheduledTask(runtime, "watch.health_check", slotOf(payload.timestamp, 13));
		const outcome = await runTask(runtime, task.id);
		logger.info("Health check", { status: outcome.status });
		return { taskId: task.id, status: outcome.status };
	},
});

/** Review: scan the document library for reviews due, documents expiring and approvals waiting. Every morning. */
export const documentScanSchedule = schedules.task({
	id: "worldwide-ai-document-scan",
	cron: { pattern: "30 7 * * *", timezone: OPS_TIME_ZONE },
	run: async (payload) => {
		const runtime = await getRuntime();
		const { task } = await requestScheduledTask(
			runtime,
			"review.document_scan",
			slotOf(payload.timestamp, 10),
		);
		const outcome = await runTask(runtime, task.id);
		logger.info("Document scan", { status: outcome.status });
		return { taskId: task.id, status: outcome.status };
	},
});

/** Nexus: tasks that have been running past their limit are marked "outcome unknown" rather than left looking busy. */
export const sweepStuckTasksSchedule = schedules.task({
	id: "worldwide-ai-sweep-stuck-tasks",
	cron: { pattern: "15 * * * *", timezone: OPS_TIME_ZONE },
	run: async () => {
		const runtime = await getRuntime();
		const settings = await loadSettings(runtime.sql);
		const swept = await sweepStuckTasks(runtime.sql, {
			secondsFor: (role) => settings[role].limits.maxTaskSeconds,
			now: runtime.now(),
		});
		logger.info("Swept stuck tasks", { count: swept.length });
		return { swept: swept.map((t) => t.id) };
	},
});
