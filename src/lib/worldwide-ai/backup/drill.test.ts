import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approveVersion, createDocument } from "../atlas/service";
import { listAudit } from "../audit";
import { listFindings } from "../findings";
import { sha256Hex } from "../hash";
import { createFolderStorage } from "../storage/files";
import { createTask, transitionTask } from "../tasks/repo";
import { freshDb, owner, staff, system } from "../testing.test-util";
import { listBackups, tablePath, toBytes } from "./backup";
import { BACKUPS_TO_KEEP, runBackup, runRestoreDrill } from "./drill";

vi.setConfig({ testTimeout: 60_000 });

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
	await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

const scratch = async () => {
	const dir = await mkdtemp(join(tmpdir(), "wai-drill-"));
	cleanup.push(() => rm(dir, { recursive: true, force: true }));
	return dir;
};

/** A live database with a document, a finished task and one stored evidence file; live files and backups share one store. */
async function live() {
	const sql = await freshDb();
	cleanup.push(() => sql.close());
	const storage = createFolderStorage(await scratch());
	const { document } = await createDocument(sql, owner, {
		collection: "shipping",
		title: "Shipping times",
		owner: "Olivia",
		source: "Shipping page",
		content: "Orders ship within two business days.",
		reviewDue: "2027-01-01",
	});
	await approveVersion(sql, owner, document.id, 1, { reviewDue: "2027-01-01" });
	const { task } = await createTask(sql, {
		kind: "patch.site_inspection",
		title: "Inspect",
		expectedResult: "Screenshots",
		idempotencyKey: "drill-inspection",
		actor: staff,
	});
	await transitionTask(sql, task.id, "running", system);
	const bytes = Buffer.from("89504e470d0a1a0a", "hex");
	const path = `evidence/${task.id}/1-desktop.png`;
	await storage.put(path, bytes, "image/png");
	await sql.query(
		`insert into wai_files (bucket, path, sha256, bytes, mime, kind, task_id) values ('worldwide-ai', $1, $2, $3, 'image/png', 'evidence_screenshot', $4)`,
		[path, sha256Hex(bytes), bytes.length, task.id],
	);
	await transitionTask(sql, task.id, "completed", system, {
		completionEvidence: {
			runId: "run_1",
			screenshots: [{ path, sha256: sha256Hex(bytes), bytes: bytes.length, viewport: "desktop" }],
		},
	});
	return { sql, storage };
}

describe("the backup job", () => {
	it("takes a backup, keeps only the newest ones, and logs it", async () => {
		const { sql, storage } = await live();
		const first = await runBackup({
			sql,
			storage,
			actor: system,
			now: new Date("2026-10-05T07:30:00Z"),
			keep: 2,
		});
		expect(first.manifest.totals.files).toBe(1);
		expect(first.pruned).toEqual([]);
		await runBackup({ sql, storage, actor: system, now: new Date("2026-10-06T07:30:00Z"), keep: 2 });
		const third = await runBackup({
			sql,
			storage,
			actor: system,
			now: new Date("2026-10-07T07:30:00Z"),
			keep: 2,
		});
		expect(third.pruned).toEqual([first.manifest.id]);
		expect(await listBackups(storage)).toHaveLength(2);
		expect((await listAudit(sql)).filter((a) => a.action === "backup.created")).toHaveLength(3);
		expect(BACKUPS_TO_KEEP).toBe(14);
	});

	it("raises a finding, once a day, when the backup fails", async () => {
		const { sql, storage } = await live();
		const [file] = (await sql.query<{ path: string }>("select path from wai_files")).rows;
		await storage.remove([file.path]);
		const now = new Date("2026-10-07T07:30:00Z");
		await expect(runBackup({ sql, storage, actor: system, now })).rejects.toThrow(/missing/);
		await expect(runBackup({ sql, storage, actor: system, now })).rejects.toThrow(/missing/);
		const findings = (await listFindings(sql)).filter((f) => f.category === "backup");
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ roleId: "watch", severity: "high", title: "A backup failed" });
		expect(await listBackups(storage)).toEqual([]);
	});
});

describe("the restore check", () => {
	it("restores the newest backup somewhere isolated, proves it, and leaves the live database untouched", async () => {
		const { sql, storage } = await live();
		await runBackup({ sql, storage, actor: system, now: new Date("2026-10-06T07:30:00Z") });
		const { manifest } = await runBackup({
			sql,
			storage,
			actor: system,
			now: new Date("2026-10-07T07:30:00Z"),
		});
		const before = (await sql.query("select count(*)::int as n from wai_tasks")).rows[0].n;

		const result = await runRestoreDrill({
			backup: storage,
			sql,
			actor: owner,
			now: new Date("2026-10-07T15:00:00Z"),
		});
		expect(result.checks.filter((c) => !c.ok)).toEqual([]);
		expect(result).toMatchObject({ ok: true, backupId: manifest.id, ranAt: "2026-10-07T15:00:00.000Z" });
		expect(result.restored).toEqual({ rows: manifest.totals.rows, files: 1 });
		expect(result.durationMs).toBeGreaterThanOrEqual(0);

		expect((await sql.query("select count(*)::int as n from wai_tasks")).rows[0].n).toBe(before);
		expect((await listAudit(sql)).find((a) => a.action === "backup.restore_check")).toMatchObject({
			actor: "operator:owner-1",
			outcome: "allowed",
			subject: manifest.id,
		});
		expect((await listFindings(sql)).filter((f) => f.category === "backup")).toEqual([]);
	});

	it("can check a named older backup", async () => {
		const { sql, storage } = await live();
		const older = await runBackup({ sql, storage, actor: system, now: new Date("2026-10-06T07:30:00Z") });
		await runBackup({ sql, storage, actor: system, now: new Date("2026-10-07T07:30:00Z") });
		const result = await runRestoreDrill({ backup: storage, backupId: older.manifest.id });
		expect(result).toMatchObject({ ok: true, backupId: older.manifest.id });
	});

	it("says so when there is nothing to check, and fails loudly on a damaged backup", async () => {
		const { sql, storage } = await live();
		await expect(runRestoreDrill({ backup: storage })).rejects.toThrow(/no backup to check yet/);
		const { manifest } = await runBackup({
			sql,
			storage,
			actor: system,
			now: new Date("2026-10-07T07:30:00Z"),
		});
		await storage.remove([tablePath(manifest.id, "wai_tasks")]);
		await storage.put(tablePath(manifest.id, "wai_tasks"), toBytes('{"id":"tampered"}'), "text/plain");
		await expect(runRestoreDrill({ backup: storage, sql, actor: owner })).rejects.toThrow(
			/doesn't match the checksum/,
		);
	});
});
