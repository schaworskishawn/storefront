import { logger, schedules } from "@trigger.dev/sdk";
import { loadSettings } from "@/lib/worldwide-ai/agents/settings";
import { runBackup, runRestoreDrill } from "@/lib/worldwide-ai/backup/drill";
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

const scheduleActor = { kind: "system", label: "schedule" } as const;

/** A backup of every table and stored file, each night, keeping the last fourteen. A failure raises a finding. */
export const nightlyBackupSchedule = schedules.task({
	id: "worldwide-ai-nightly-backup",
	cron: { pattern: "30 2 * * *", timezone: OPS_TIME_ZONE },
	run: async () => {
		const runtime = await getRuntime();
		if (!runtime.storage) {
			logger.warn("Backup skipped: file storage is not configured.");
			return { skipped: "File storage is not configured." };
		}
		const { manifest, pruned } = await runBackup({
			sql: runtime.sql,
			storage: runtime.storage,
			actor: scheduleActor,
			now: runtime.now(),
		});
		logger.info("Backup taken", {
			id: manifest.id,
			rows: manifest.totals.rows,
			files: manifest.totals.files,
			pruned: pruned.length,
		});
		return { backupId: manifest.id, rows: manifest.totals.rows, files: manifest.totals.files };
	},
});

/** Every Sunday, restore the newest backup into a scratch database and folder and check it came back intact. */
export const weeklyRestoreCheckSchedule = schedules.task({
	id: "worldwide-ai-weekly-restore-check",
	cron: { pattern: "30 3 * * 0", timezone: OPS_TIME_ZONE },
	run: async () => {
		const runtime = await getRuntime();
		if (!runtime.storage) return { skipped: "File storage is not configured." };
		const result = await runRestoreDrill({
			backup: runtime.storage,
			sql: runtime.sql,
			actor: scheduleActor,
			now: runtime.now(),
		});
		logger.info("Restore check", { ok: result.ok, backupId: result.backupId, ms: result.durationMs });
		return {
			ok: result.ok,
			backupId: result.backupId,
			failed: result.checks.filter((c) => !c.ok).map((c) => c.name),
		};
	},
});
