import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approveVersion, createDocument } from "../atlas/service";
import { recordFinding } from "../findings";
import { sha256Hex } from "../hash";
import { createCase } from "../support/cases";
import { createFolderStorage, createSupabaseStorage, safePath, type FileStorage } from "../storage/files";
import { createTask, transitionTask } from "../tasks/repo";
import { freshDb, mockModel, owner, staff, system, workflowDeps } from "../testing.test-util";
import { recordUsage } from "../usage";
import { requestRelayDraft, runRelayDraft } from "../workflows/relay";
import { reviewDraft } from "../workflows/relay-review";
import type { SqlClient } from "../db/sql";
import {
	BACKUP_TABLES,
	blobPath,
	createBackup,
	exportTable,
	listBackups,
	manifestPath,
	pruneBackups,
	readManifest,
	tablePath,
	toBytes,
} from "./backup";
import { RestoreError, restoreBackup, verifyRestore } from "./restore";

// Each test builds a few in-memory databases, which takes a moment.
vi.setConfig({ testTimeout: 60_000 });

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
	await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

const scratch = async () => {
	const dir = await mkdtemp(join(tmpdir(), "wai-backup-"));
	cleanup.push(() => rm(dir, { recursive: true, force: true }));
	return dir;
};
const database = async () => {
	const sql = await freshDb();
	cleanup.push(() => sql.close());
	return sql;
};

const shot = (label: string) => Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(label)]);

/** A database with the kinds of records the dashboard really makes: a reviewed draft, a verified inspection with files, findings, usage. */
async function seeded() {
	const sql = await database();
	const live = createFolderStorage(await scratch());

	const { document } = await createDocument(sql, owner, {
		collection: "returns",
		title: "Returns and refunds",
		owner: "Olivia",
		source: "Returns page",
		content:
			"Unopened items can be returned within 30 days of delivery for a refund. Opened coils cannot be returned.",
		reviewDue: "2027-01-01",
	});
	await approveVersion(sql, owner, document.id, 1, { reviewDue: "2027-01-01" });
	const c = (
		await createCase(sql, staff, {
			source: "manual",
			subject: "Return a coil",
			message: "Can I return an unopened coil for a refund?",
			customerName: "Jane",
			customerEmail: "jane@example.com",
		})
	).case;
	const model = mockModel({
		body: "Hi Jane, unopened items can be returned within 30 days of delivery for a refund.\n\nWorldwide Vapor Support",
		citations: ["S1"],
		needsFollowUp: false,
		uncertainties: [],
		instructionsInData: false,
	});
	const deps = { ...workflowDeps(sql, model.handle), storage: live };
	const requested = await requestRelayDraft(deps, staff, c.id);
	const outcome = await runRelayDraft(deps, requested.task.id);
	if (outcome.status !== "needs_review") throw new Error("setup");
	await reviewDraft(deps, staff, outcome.draftId, { action: "save", note: "Fine." });

	// A completed inspection whose evidence files are stored.
	const inspection = (
		await createTask(sql, {
			kind: "patch.site_inspection",
			title: "Inspect",
			expectedResult: "Screenshots",
			idempotencyKey: "seed-inspection",
			actor: staff,
			input: { urls: ["https://www.worldwidevapor.com/"] },
		})
	).task;
	await transitionTask(sql, inspection.id, "running", system);
	const screenshots = [];
	for (const viewport of ["desktop", "mobile"]) {
		const bytes = shot(viewport);
		const path = `evidence/${inspection.id}/1-${viewport}.png`;
		await live.put(path, bytes, "image/png");
		await sql.query(
			`insert into wai_files (bucket, path, sha256, bytes, mime, kind, task_id) values ('worldwide-ai', $1, $2, $3, 'image/png', 'evidence_screenshot', $4)`,
			[path, sha256Hex(bytes), bytes.length, inspection.id],
		);
		screenshots.push({
			path,
			sha256: sha256Hex(bytes),
			bytes: bytes.length,
			viewport,
			url: "https://www.worldwidevapor.com/",
		});
	}
	await transitionTask(sql, inspection.id, "completed", system, {
		completionEvidence: { runId: "run_x", screenshots },
	});
	await recordFinding(sql, {
		roleId: "patch",
		taskId: inspection.id,
		severity: "low",
		category: "site-inspection",
		title: "A console error",
		dedupeKey: "seed-finding",
	});
	await recordUsage(sql, { taskId: inspection.id, roleId: "patch", kind: "tool", tool: "openclaw.inspect" });
	return { sql, live, document, case: c, draftTaskId: requested.task.id, inspectionId: inspection.id };
}

describe("taking a backup", () => {
	it("writes every table, copies the stored files by checksum, and ends with a manifest", async () => {
		const { sql, live } = await seeded();
		const vault = createFolderStorage(await scratch());
		const manifest = await createBackup(sql, vault, { source: live, now: new Date("2026-10-07T08:30:00Z") });

		expect(manifest).toMatchObject({ version: 1, id: "2026-10-07T08-30-00-000Z", schemaVersion: "2" });
		expect(Object.keys(manifest.tables)).toEqual(BACKUP_TABLES.map((t) => t.name));
		expect(manifest.tables.wai_tasks.rows).toBe(2);
		expect(manifest.tables.wai_drafts.rows).toBe(1);
		expect(manifest.totals.files).toBe(2);
		expect(manifest.files.every((f) => f.blob === blobPath(f.sha256))).toBe(true);

		// What was written is what the manifest says.
		for (const [name, entry] of Object.entries(manifest.tables)) {
			const stored = await vault.get(tablePath(manifest.id, name));
			expect(stored && sha256Hex(stored)).toBe(entry.sha256);
		}
		for (const file of manifest.files)
			expect(sha256Hex((await vault.get(file.blob)) as Uint8Array)).toBe(file.sha256);
		expect(await listBackups(vault)).toEqual([manifest.id]);
		expect((await readManifest(vault, manifest.id)).totals).toEqual(manifest.totals);
	});

	it("doesn't copy a file twice: a second backup only adds what is new", async () => {
		const { sql, live } = await seeded();
		const vault = createFolderStorage(await scratch());
		await createBackup(sql, vault, { source: live, now: new Date("2026-10-07T08:30:00Z") });
		const blobsAfterFirst = (await vault.list("backups/blobs/")).length;
		const second = await createBackup(sql, vault, { source: live, now: new Date("2026-10-08T08:30:00Z") });
		expect((await vault.list("backups/blobs/")).length).toBe(blobsAfterFirst);
		expect(await listBackups(vault)).toEqual([second.id, "2026-10-07T08-30-00-000Z"]);
	});

	it("exports the same text for the same data, so checksums mean something", async () => {
		const { sql } = await seeded();
		const a = await exportTable(sql, "wai_tasks");
		const b = await exportTable(sql, "wai_tasks");
		expect(a.text).toBe(b.text);
		expect(a.text.split("\n")).toHaveLength(a.rows);
		expect(a.text).not.toContain('"search"');
	});

	it("fails, writing no manifest, when a stored file is missing or doesn't match its checksum", async () => {
		const { sql, live } = await seeded();
		const vault = createFolderStorage(await scratch());
		const [file] = (await sql.query<{ path: string }>("select path from wai_files order by path")).rows;
		await live.remove([file.path]);
		await expect(createBackup(sql, vault, { source: live })).rejects.toThrow(
			/missing, so the backup was not completed/,
		);
		expect(await listBackups(vault)).toEqual([]);

		await live.put(file.path, Buffer.from("something else"), "image/png");
		await expect(createBackup(sql, vault, { source: live })).rejects.toThrow(
			/doesn't match its recorded checksum/,
		);
		expect(await listBackups(vault)).toEqual([]);
	});

	it("refuses to back up registered files when there is no storage to read them from", async () => {
		const { sql } = await seeded();
		await expect(createBackup(sql, createFolderStorage(await scratch()), { source: null })).rejects.toThrow(
			/no file storage to read them from/,
		);
	});

	it("keeps the newest backups and retires the rest, manifest last", async () => {
		const { sql, live } = await seeded();
		const vault = createFolderStorage(await scratch());
		const ids: string[] = [];
		for (const day of ["05", "06", "07", "08"])
			ids.push(
				(await createBackup(sql, vault, { source: live, now: new Date(`2026-10-${day}T08:30:00Z`) })).id,
			);
		const removed = await pruneBackups(vault, 2);
		expect(removed).toEqual([ids[1], ids[0]]);
		expect(await listBackups(vault)).toEqual([ids[3], ids[2]]);
		expect(await vault.list(`backups/${ids[0]}/`)).toEqual([]);
		// The shared file copies are kept for the backups that remain.
		expect((await vault.list("backups/blobs/")).length).toBe(2);
		expect(await pruneBackups(vault, 5)).toEqual([]);
	});
});

describe("restoring into an isolated place", () => {
	async function backedUp() {
		const original = await seeded();
		const vault = createFolderStorage(await scratch());
		const manifest = await createBackup(original.sql, vault, {
			source: original.live,
			now: new Date("2026-10-07T08:30:00Z"),
		});
		const sql = await database();
		const files = createFolderStorage(await scratch());
		return { ...original, vault, manifest, restoredSql: sql, restoredFiles: files };
	}

	it("brings back every record and file, and proves it", async () => {
		const b = await backedUp();
		const manifest = await restoreBackup({
			backup: b.vault,
			backupId: b.manifest.id,
			sql: b.restoredSql,
			files: b.restoredFiles,
		});
		const report = await verifyRestore({ manifest, sql: b.restoredSql, files: b.restoredFiles });
		expect(report.checks.filter((c) => !c.ok)).toEqual([]);
		expect(report.ok).toBe(true);
		expect(report.restored).toEqual({ rows: manifest.totals.rows, files: 2 });
		expect(report.checks).toHaveLength(BACKUP_TABLES.length + 4);
		expect(report.checks.find((c) => c.name.startsWith("Completed tasks"))?.detail).toBe(
			"2 of 2 evidence files in the sample.",
		);
		expect(report.checks.find((c) => c.name.startsWith("Saved drafts"))?.detail).toBe(
			"1 of 1 drafts in the sample.",
		);
		expect(report.checks.find((c) => c.name.startsWith("Draft sources"))?.detail).toBe(
			"1 of 1 references resolve.",
		);
	});

	it("restores specific records exactly: the saved draft, its sources, the approval, the evidence", async () => {
		const b = await backedUp();
		await restoreBackup({
			backup: b.vault,
			backupId: b.manifest.id,
			sql: b.restoredSql,
			files: b.restoredFiles,
		});
		const draft = await b.restoredSql.query("select state, body, body_sha256, reviewed_by from wai_drafts");
		const original = await b.sql.query("select state, body, body_sha256, reviewed_by from wai_drafts");
		expect(draft.rows).toEqual(original.rows);
		expect(draft.rows[0]).toMatchObject({ state: "saved", reviewed_by: "operator:staff-1" });
		const task = await b.restoredSql.query(
			"select state, completion_evidence, finished_at from wai_tasks where id = $1",
			[b.inspectionId],
		);
		const was = await b.sql.query(
			"select state, completion_evidence, finished_at from wai_tasks where id = $1",
			[b.inspectionId],
		);
		expect(task.rows).toEqual(was.rows);
		expect(
			(await b.restoredSql.query("select count(*)::int as n from wai_reviews where decision = 'approved'"))
				.rows[0].n,
		).toBe(2);
		expect(
			sha256Hex((await b.restoredFiles.get(`evidence/${b.inspectionId}/1-mobile.png`)) as Uint8Array),
		).toBe(sha256Hex(shot("mobile")));
		// The search index was rebuilt by the database, so the restored library still finds its documents.
		const found = await b.restoredSql.query(
			`select 1 from wai_document_versions where search @@ to_tsquery('english', 'refund')`,
		);
		expect(found.rows).toHaveLength(1);
	});

	it("leaves the restored database ready to use: new rows get fresh ids", async () => {
		const b = await backedUp();
		await restoreBackup({
			backup: b.vault,
			backupId: b.manifest.id,
			sql: b.restoredSql,
			files: b.restoredFiles,
		});
		const before = Number((await b.restoredSql.query("select max(id) as m from wai_task_events")).rows[0].m);
		const { task } = await createTask(b.restoredSql, {
			kind: "relay.support_draft",
			title: "New",
			expectedResult: "e",
			idempotencyKey: "after-restore",
			actor: staff,
		});
		const after = (
			await b.restoredSql.query("select max(id) as m from wai_task_events where task_id = $1", [task.id])
		).rows[0].m;
		expect(Number(after)).toBeGreaterThan(before);
	});

	it("refuses to restore into a database that already has data", async () => {
		const b = await backedUp();
		await expect(
			restoreBackup({ backup: b.vault, backupId: b.manifest.id, sql: b.sql, files: b.restoredFiles }),
		).rejects.toThrow(/already has data/);
	});

	it("refuses a backup whose tables or files were altered, loading nothing", async () => {
		const b = await backedUp();
		await b.vault.remove([tablePath(b.manifest.id, "wai_tasks")]);
		await b.vault.put(tablePath(b.manifest.id, "wai_tasks"), toBytes('{"id":"tampered"}'), "text/plain");
		await expect(
			restoreBackup({ backup: b.vault, backupId: b.manifest.id, sql: b.restoredSql, files: b.restoredFiles }),
		).rejects.toThrow(/doesn't match the checksum/);
		expect((await b.restoredSql.query("select count(*)::int as n from wai_tasks")).rows[0].n).toBe(0);

		const c = await backedUp();
		await c.vault.remove([c.manifest.files[0].blob]);
		await expect(
			restoreBackup({ backup: c.vault, backupId: c.manifest.id, sql: c.restoredSql, files: c.restoredFiles }),
		).rejects.toThrow(/missing from the backup/);

		const d = await backedUp();
		await d.vault.remove([d.manifest.files[0].blob]);
		await d.vault.put(d.manifest.files[0].blob, toBytes("not the screenshot"), "image/png");
		await expect(
			restoreBackup({ backup: d.vault, backupId: d.manifest.id, sql: d.restoredSql, files: d.restoredFiles }),
		).rejects.toBeInstanceOf(RestoreError);
	});

	it("refuses a backup that doesn't exist or has no complete manifest", async () => {
		const b = await backedUp();
		await expect(
			restoreBackup({ backup: b.vault, backupId: "nope", sql: b.restoredSql, files: b.restoredFiles }),
		).rejects.toThrow(/no complete backup/);
		await b.vault.remove([manifestPath(b.manifest.id)]);
		expect(await listBackups(b.vault)).toEqual([]);
	});

	it("needs somewhere to put the files when the backup has them", async () => {
		const b = await backedUp();
		await expect(
			restoreBackup({ backup: b.vault, backupId: b.manifest.id, sql: b.restoredSql, files: null }),
		).rejects.toThrow(/no place to restore them/);
	});

	it("catches a restore that is wrong: a changed row, a missing file", async () => {
		const b = await backedUp();
		const manifest = await restoreBackup({
			backup: b.vault,
			backupId: b.manifest.id,
			sql: b.restoredSql,
			files: b.restoredFiles,
		});
		await b.restoredSql.query("update wai_drafts set body = 'tampered'");
		const damaged = await verifyRestore({ manifest, sql: b.restoredSql, files: b.restoredFiles });
		expect(damaged.ok).toBe(false);
		expect(damaged.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(
			expect.arrayContaining([
				"wai_drafts: every row came back unchanged",
				"Saved drafts: the text still matches its checksum",
			]),
		);

		await b.restoredFiles.remove([manifest.files[0].path]);
		const missing = await verifyRestore({ manifest, sql: b.restoredSql, files: b.restoredFiles });
		expect(missing.checks.find((c) => c.name.startsWith("Stored files"))).toMatchObject({
			ok: false,
			detail: "1 of 2 files match their checksums.",
		});
		expect(missing.checks.find((c) => c.name.startsWith("Completed tasks"))?.ok).toBe(false);
	});
});

describe("file storage", () => {
	it("accepts plain relative paths only", () => {
		for (const ok of [
			"evidence/abc/1-desktop.png",
			"backups/2026-10-07T08-30-00-000Z/manifest.json",
			"a b/c.txt",
		])
			expect(safePath(ok)).toBe(ok);
		for (const bad of [
			"",
			"/etc/passwd",
			"../x",
			"a/../b",
			"a//b",
			"a/./b",
			"a\\..\\b",
			"a/b?c",
			"a/%2e%2e/b",
			"..",
			"x/",
		])
			expect(() => safePath(bad), bad).toThrow();
	});

	it("keeps files in a folder, lists them by prefix, and can't be pointed outside it", async () => {
		const storage: FileStorage = createFolderStorage(await scratch());
		const stored = await storage.put("evidence/t1/a.png", Buffer.from("one"), "image/png");
		expect(stored).toEqual({ path: "evidence/t1/a.png", sha256: sha256Hex("one"), bytes: 3 });
		await storage.put("evidence/t2/b.png", Buffer.from("two"), "image/png");
		expect(Buffer.from((await storage.get("evidence/t1/a.png")) as Uint8Array).toString()).toBe("one");
		expect(await storage.get("evidence/t1/missing.png")).toBeNull();
		expect(await storage.list("evidence/t1/")).toEqual(["evidence/t1/a.png"]);
		expect(await storage.list("evidence/")).toHaveLength(2);
		await storage.remove(["evidence/t1/a.png", "evidence/never-existed.png"]);
		expect(await storage.list("evidence/")).toEqual(["evidence/t2/b.png"]);
		await expect(storage.put("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow();
		await expect(storage.get("../../etc/passwd"))
			.resolves.toBeNull()
			.catch(() => undefined);
	});

	it("talks to a Supabase Storage bucket over its REST API with the service key", async () => {
		const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			calls.push({
				url,
				method: init?.method ?? "GET",
				headers: init?.headers as Record<string, string>,
				body: init?.body,
			});
			if (url.includes("/object/list/")) {
				const { prefix } = JSON.parse(String(init?.body)) as { prefix: string };
				return new Response(
					JSON.stringify(
						prefix === "evidence"
							? [{ name: "t1", id: null }]
							: prefix === "evidence/t1"
								? [{ name: "a.png", id: "file-id" }]
								: [],
					),
				);
			}
			if (url.includes("/object/authenticated/"))
				return url.endsWith("missing.png")
					? new Response("{}", { status: 404 })
					: new Response(Buffer.from("bytes"));
			return new Response("{}", { status: 200 });
		}) as unknown as typeof fetch;
		const storage = createSupabaseStorage({
			url: "https://x.supabase.co/",
			serviceKey: "service-key",
			bucket: "wai",
			fetchImpl,
		});

		await storage.put("evidence/t1/a b.png", Buffer.from("bytes"), "image/png");
		expect(calls[0]).toMatchObject({
			method: "POST",
			url: "https://x.supabase.co/storage/v1/object/wai/evidence/t1/a%20b.png",
		});
		expect(calls[0].headers).toMatchObject({
			Authorization: "Bearer service-key",
			apikey: "service-key",
			"Content-Type": "image/png",
			"x-upsert": "false",
		});
		expect(Buffer.from((await storage.get("evidence/t1/a.png")) as Uint8Array).toString()).toBe("bytes");
		expect(await storage.get("evidence/t1/missing.png")).toBeNull();
		expect(await storage.list("evidence/")).toEqual(["evidence/t1/a.png"]);
		await storage.remove(["evidence/t1/a.png"]);
		expect(calls.at(-1)).toMatchObject({
			method: "DELETE",
			url: "https://x.supabase.co/storage/v1/object/wai",
		});
		expect(JSON.parse(String(calls.at(-1)?.body))).toEqual({ prefixes: ["evidence/t1/a.png"] });
		await expect(storage.put("../x", Buffer.from("x"), "text/plain")).rejects.toThrow();
	});

	it("reports a storage error without hiding it", async () => {
		const storage = createSupabaseStorage({
			url: "https://x.supabase.co",
			serviceKey: "k",
			bucket: "b",
			fetchImpl: (async () => new Response("no", { status: 500 })) as typeof fetch,
		});
		await expect(storage.put("a/b.png", Buffer.from("x"), "image/png")).rejects.toThrow(
			/refused the upload \(500\)/,
		);
		await expect(storage.get("a/b.png")).rejects.toThrow(/couldn't read the file \(500\)/);
		await expect(storage.list("a/")).rejects.toThrow(/couldn't list files \(500\)/);
		await expect(storage.remove(["a/b.png"])).rejects.toThrow(/couldn't delete files \(500\)/);
	});
});

export type { SqlClient };
