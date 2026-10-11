import type { Sql } from "../db/sql";
import { json } from "../db/sql";
import { sha256Hex } from "../hash";
import type { FileStorage } from "../storage/files";
import { BACKUP_TABLES, dataColumns, exportTable, readManifest, toText, type BackupManifest } from "./backup";

/**
 * Restores a backup into an EMPTY database and storage, and then checks that what came back is what was backed up. It is
 * written to be run in an isolated place (a fresh in-memory database and a scratch folder), never against the live
 * database: it refuses to load into a database that already has data.
 *
 * The checks are not "it ran without errors": every table's content is exported again from the restored database and its
 * checksum compared with the manifest's, every file is read back and compared, and a sample of real records is followed
 * through (a completed task's evidence files exist, a saved draft's text still matches its checksum).
 */

export class RestoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RestoreError";
	}
}

export type RestoreCheck = { name: string; ok: boolean; detail: string };
export type RestoreReport = {
	ok: boolean;
	backupId: string;
	checks: RestoreCheck[];
	restored: { rows: number; files: number };
};

async function readVerified(
	storage: FileStorage,
	path: string,
	sha256: string,
	what: string,
): Promise<Uint8Array> {
	const bytes = await storage.get(path);
	if (!bytes) throw new RestoreError(`${what} is missing from the backup.`);
	if (sha256Hex(bytes) !== sha256)
		throw new RestoreError(`${what} doesn't match the checksum in the manifest, so it was not restored.`);
	return bytes;
}

/** Loads a backup's tables and files into an empty database and storage. Throws, loading nothing further, if anything is wrong. */
export async function restoreBackup(args: {
	backup: FileStorage;
	backupId: string;
	sql: Sql;
	/** Where to put the stored files. Required if the backup has any. */
	files?: FileStorage | null;
}): Promise<BackupManifest> {
	const { backup, backupId, sql } = args;
	const manifest = await readManifest(backup, backupId);

	// Read and check everything before changing anything.
	const texts = new Map<string, string>();
	for (const { name } of BACKUP_TABLES) {
		const entry = manifest.tables[name];
		if (!entry) throw new RestoreError(`The backup has no ${name}.`);
		texts.set(name, toText(await readVerified(backup, entry.file, entry.sha256, name)));
	}
	const blobs = new Map<string, Uint8Array>();
	for (const file of manifest.files)
		blobs.set(file.path, await readVerified(backup, file.blob, file.sha256, `The file ${file.path}`));
	if (manifest.files.length && !args.files)
		throw new RestoreError("The backup has files but no place to restore them to.");

	// Only an empty database is acceptable.
	for (const { name } of BACKUP_TABLES) {
		const { rows } = await sql.query<{ n: number }>(`select count(*)::int as n from ${name}`);
		// wai_meta gets its schema row from the migration itself.
		if (name !== "wai_meta" && Number(rows[0].n) > 0)
			throw new RestoreError(`${name} already has data. Restore only into an empty database.`);
	}

	await sql.transaction(async (tx) => {
		await tx.query("delete from wai_meta");
		for (const { name } of BACKUP_TABLES) {
			const text = texts.get(name) as string;
			const lines = text ? text.split("\n") : [];
			const columns = await dataColumns(tx, name);
			const list = columns.map((c) => `"${c}"`).join(", ");
			for (const line of lines)
				await tx.query(
					`insert into ${name} (${list}) select ${list} from jsonb_populate_record(null::${name}, $1::jsonb)`,
					[json(JSON.parse(line))],
				);
			// Keep ids that count up (events, usage, history, audit) counting from where they were.
			if (columns.includes("id")) {
				const sequence = await tx.query<{ seq: string | null }>(
					`select pg_get_serial_sequence('${name}', 'id') as seq`,
				);
				const seq = sequence.rows[0]?.seq;
				if (seq)
					await tx.query(`select setval($1, greatest((select coalesce(max(id), 0) from ${name}), 1))`, [seq]);
			}
		}
	});

	if (args.files)
		for (const file of manifest.files)
			await args.files.put(file.path, blobs.get(file.path) as Uint8Array, "application/octet-stream");
	return manifest;
}

/** Checks a restored database and storage against the manifest, and follows a sample of real records through. */
export async function verifyRestore(args: {
	manifest: BackupManifest;
	sql: Sql;
	files?: FileStorage | null;
}): Promise<RestoreReport> {
	const { manifest, sql } = args;
	const checks: RestoreCheck[] = [];
	const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

	for (const { name } of BACKUP_TABLES) {
		const expected = manifest.tables[name];
		const again = await exportTable(sql, name);
		check(
			`${name}: every row came back unchanged`,
			again.rows === expected.rows && sha256Hex(again.text) === expected.sha256,
			`${again.rows} of ${expected.rows} rows; ${sha256Hex(again.text) === expected.sha256 ? "content identical" : "content differs"}.`,
		);
	}

	let filesOk = 0;
	for (const file of manifest.files) {
		const bytes = args.files ? await args.files.get(file.path) : null;
		if (bytes && sha256Hex(bytes) === file.sha256 && bytes.byteLength === file.bytes) filesOk += 1;
	}
	check(
		"Stored files: every file came back intact",
		filesOk === manifest.files.length,
		`${filesOk} of ${manifest.files.length} files match their checksums.`,
	);

	// A sample of real records, followed through.
	const completed = await sql.query<{
		id: string;
		completion_evidence: { screenshots?: Array<{ path: string; sha256: string }> };
	}>(
		`select id, completion_evidence from wai_tasks where state = 'completed' and completion_evidence is not null order by finished_at desc limit 25`,
	);
	let evidenceChecked = 0;
	let evidenceOk = 0;
	for (const task of completed.rows)
		for (const shot of task.completion_evidence.screenshots ?? []) {
			evidenceChecked += 1;
			const bytes = args.files ? await args.files.get(shot.path) : null;
			if (bytes && sha256Hex(bytes) === shot.sha256) evidenceOk += 1;
		}
	check(
		"Completed tasks: their evidence files exist and match",
		evidenceOk === evidenceChecked,
		`${evidenceOk} of ${evidenceChecked} evidence files in the sample.`,
	);

	const saved = await sql.query<{ id: string; body: string; body_sha256: string; sources: number }>(
		`select d.id, d.body, d.body_sha256, (select count(*)::int from wai_draft_sources s where s.draft_id = d.id) as sources from wai_drafts d where d.state = 'saved' order by d.saved_at desc limit 25`,
	);
	const draftsOk = saved.rows.filter((d) => sha256Hex(d.body) === d.body_sha256).length;
	check(
		"Saved drafts: the text still matches its checksum",
		draftsOk === saved.rows.length,
		`${draftsOk} of ${saved.rows.length} drafts in the sample.`,
	);

	const linked = await sql.query<{ n: number }>(
		`select count(*)::int as n from wai_draft_sources s join wai_document_versions v on v.document_id = s.document_id and v.version = s.version and v.content_sha256 = s.content_sha256`,
	);
	const total = await sql.query<{ n: number }>(`select count(*)::int as n from wai_draft_sources`);
	check(
		"Draft sources: each still points at the exact document version",
		Number(linked.rows[0].n) === Number(total.rows[0].n),
		`${linked.rows[0].n} of ${total.rows[0].n} references resolve.`,
	);

	return {
		ok: checks.every((c) => c.ok),
		backupId: manifest.id,
		checks,
		restored: { rows: manifest.totals.rows, files: manifest.totals.files },
	};
}
