import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit } from "../audit";
import { createMigratedPglite } from "../db/pglite";
import type { Sql } from "../db/sql";
import { recordFinding } from "../findings";
import { createFolderStorage, type FileStorage } from "../storage/files";
import type { Actor } from "../types";
import { createBackup, listBackups, pruneBackups, type BackupManifest } from "./backup";
import { restoreBackup, verifyRestore, type RestoreReport } from "./restore";

/**
 * The two backup jobs as they are actually run: take a backup of the live database into storage, and the restore check, which
 * restores a backup into a brand-new in-memory database and a scratch folder (nothing shared with the live system), verifies
 * it, and throws the scratch copy away. A failed backup or a failed check raises a finding, so it can't pass unnoticed.
 */

export const BACKUPS_TO_KEEP = 14;

export type BackupRun = { manifest: BackupManifest; pruned: string[] };

export async function runBackup(args: {
	sql: Sql;
	storage: FileStorage;
	actor: Actor;
	now?: Date;
	keep?: number;
}): Promise<BackupRun> {
	const now = args.now ?? new Date();
	try {
		const manifest = await createBackup(args.sql, args.storage, { source: args.storage, now });
		const pruned = await pruneBackups(args.storage, args.keep ?? BACKUPS_TO_KEEP);
		await audit(args.sql, {
			actor: args.actor,
			action: "backup.created",
			subject: manifest.id,
			outcome: "allowed",
			detail: { rows: manifest.totals.rows, files: manifest.totals.files, pruned: pruned.length },
		});
		return { manifest, pruned };
	} catch (error) {
		const reason = error instanceof Error ? error.message : "The backup failed.";
		await recordFinding(args.sql, {
			roleId: "watch",
			severity: "high",
			category: "backup",
			title: "A backup failed",
			detail: reason,
			dedupeKey: `backup-failed:${now.toISOString().slice(0, 10)}`,
		}).catch(() => undefined);
		throw error;
	}
}

export type DrillResult = RestoreReport & { durationMs: number; ranAt: string };

/** Restores a backup (the newest unless one is named) somewhere isolated and checks it. Nothing touches the live database. */
export async function runRestoreDrill(args: {
	backup: FileStorage;
	backupId?: string;
	sql?: Sql;
	actor?: Actor;
	now?: Date;
}): Promise<DrillResult> {
	const started = Date.now();
	const now = args.now ?? new Date();
	const backupId = args.backupId ?? (await listBackups(args.backup))[0];
	if (!backupId) throw new Error("There is no backup to check yet. Take one first.");

	const scratchDb = await createMigratedPglite();
	const scratchDir = await mkdtemp(join(tmpdir(), "wai-restore-check-"));
	try {
		const files = createFolderStorage(scratchDir);
		const manifest = await restoreBackup({ backup: args.backup, backupId, sql: scratchDb, files });
		const report = await verifyRestore({ manifest, sql: scratchDb, files });
		const result: DrillResult = { ...report, durationMs: Date.now() - started, ranAt: now.toISOString() };
		if (args.sql) {
			if (args.actor)
				await audit(args.sql, {
					actor: args.actor,
					action: "backup.restore_check",
					subject: backupId,
					outcome: report.ok ? "allowed" : "denied",
					detail: { ok: report.ok, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) },
				});
			if (!report.ok)
				await recordFinding(args.sql, {
					roleId: "watch",
					severity: "critical",
					category: "backup",
					title: "A backup could not be restored correctly",
					detail: report.checks
						.filter((c) => !c.ok)
						.map((c) => `${c.name}: ${c.detail}`)
						.join("\n"),
					evidence: { backupId },
					dedupeKey: `restore-check-failed:${backupId}`,
				});
		}
		return result;
	} finally {
		await scratchDb.close().catch(() => undefined);
		await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
	}
}
