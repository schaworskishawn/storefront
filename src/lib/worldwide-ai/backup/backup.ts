import type { Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import type { FileStorage } from "../storage/files";

/**
 * A logical backup of everything Worldwide AI keeps: every table (as one JSON line per row), the list of every stored file
 * with its checksum, and the files themselves (kept by checksum, so a file already backed up isn't copied again). It is taken
 * from one consistent snapshot of the database and ends with a manifest recording each table's row count and checksum.
 *
 * It sits beside Supabase's own backups, not in place of them (see docs/worldwide-ai.md): its job is to be restorable by
 * this code into an empty database in an isolated place, and to prove that it was (restore.ts).
 */

/** Tables in the order they can be loaded: a table after the ones it points at. */
export const BACKUP_TABLES = [
	{ name: "wai_meta", order: "key" },
	{ name: "wai_agent_settings", order: "role_id" },
	{ name: "wai_tasks", order: "delegation_depth, created_at, id" },
	{ name: "wai_task_events", order: "id" },
	{ name: "wai_work_products", order: "created_at, id" },
	{ name: "wai_documents", order: "created_at, id" },
	{ name: "wai_document_versions", order: "document_id, version" },
	{ name: "wai_cases", order: "created_at, id" },
	{ name: "wai_drafts", order: "created_at, id" },
	{ name: "wai_draft_sources", order: "draft_id, document_id, version" },
	{ name: "wai_reviews", order: "at, id" },
	{ name: "wai_findings", order: "created_at, id" },
	{ name: "wai_usage", order: "id" },
	{ name: "wai_integration_health", order: "id" },
	{ name: "wai_openclaw_runs", order: "created_at, id" },
	{ name: "wai_files", order: "created_at, id" },
	{ name: "wai_audit_log", order: "id" },
	{ name: "wai_skill_evaluations", order: "ran_at, id" },
	// An earlier release before the one that names it as its predecessor.
	{ name: "wai_skill_releases", order: "approved_at, id" },
	{ name: "wai_skill_invocations", order: "id" },
	{ name: "wai_skill_proposals", order: "created_at, id" },
	{ name: "wai_daily_reports", order: "started_at, id" },
	{ name: "wai_ingredients", order: "created_at, id" },
	{ name: "wai_ingredient_lots", order: "created_at, id" },
	{ name: "wai_stock_movements", order: "at, id" },
	{ name: "wai_recipes", order: "created_at, id" },
	{ name: "wai_recipe_versions", order: "recipe_id, version" },
	{ name: "wai_batches", order: "planned_at, id" },
	{ name: "wai_batch_allocations", order: "batch_id, line_key, lot_id" },
	{ name: "wai_action_items", order: "created_at, id" },
	{ name: "wai_bulk_movements", order: "at, id" },
	{ name: "wai_quality_holds", order: "placed_at, id" },
	{ name: "wai_packaging_runs", order: "run_at, id" },
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number]["name"];

export type BackupManifest = {
	version: 1;
	id: string;
	createdAt: string;
	schemaVersion: string;
	tables: Record<string, { rows: number; sha256: string; file: string }>;
	files: Array<{ path: string; sha256: string; bytes: number; blob: string }>;
	totals: { rows: number; files: number; fileBytes: number };
};

export const BACKUP_ROOT = "backups";
export const manifestPath = (id: string) => `${BACKUP_ROOT}/${id}/manifest.json`;
export const tablePath = (id: string, table: string) => `${BACKUP_ROOT}/${id}/${table}.ndjson`;
export const blobPath = (sha256: string) => `${BACKUP_ROOT}/blobs/${sha256}`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const toBytes = (text: string) => encoder.encode(text);
export const toText = (bytes: Uint8Array) => decoder.decode(bytes);

/** The columns that hold real data (not generated ones such as the search index), in table order. */
export async function dataColumns(sql: Sql, table: string): Promise<string[]> {
	const { rows } = await sql.query<{ column_name: string }>(
		`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
		[table],
	);
	return rows.map((r) => r.column_name);
}

/** One table as text: one JSON object per line, in a fixed order, with only the data columns, so the same data always gives the same text. */
export async function exportTable(sql: Sql, table: BackupTableName): Promise<{ text: string; rows: number }> {
	const spec = BACKUP_TABLES.find((t) => t.name === table);
	if (!spec) throw new Error(`${table} isn't a backed-up table.`);
	const columns = await dataColumns(sql, table);
	const picked = columns.map((c) => `'${c}', t."${c}"`).join(", ");
	const { rows } = await sql.query<{ row: unknown }>(
		`select jsonb_build_object(${picked}) as row from ${table} t order by ${spec.order}`,
	);
	return { text: rows.map((r) => JSON.stringify(r.row)).join("\n"), rows: rows.length };
}

const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, "-");

/**
 * Takes a backup into `storage` under backups/<id>/. Every table is read inside one repeatable-read transaction, so they all
 * describe the same moment. Files are copied by checksum; a file whose stored copy can't be read, or doesn't match the
 * checksum recorded for it, makes the whole backup fail rather than leave a hole.
 */
export async function createBackup(
	sql: Sql,
	storage: FileStorage,
	options: { source?: FileStorage | null; now?: Date } = {},
): Promise<BackupManifest> {
	const now = options.now ?? new Date();
	const id = stamp(now);
	const tables: BackupManifest["tables"] = {};
	const exported: Array<{ name: string; text: string }> = [];
	let files: BackupManifest["files"] = [];

	const schemaVersion = await sql.transaction(async (tx) => {
		await tx.query("set transaction isolation level repeatable read");
		for (const { name } of BACKUP_TABLES) {
			const { text, rows } = await exportTable(tx, name);
			exported.push({ name, text });
			tables[name] = { rows, sha256: sha256Hex(text), file: tablePath(id, name) };
		}
		const version = await tx.query<{ value: string }>(
			`select value from wai_meta where key = 'schema_version'`,
		);
		const registry = await tx.query<{ path: string; sha256: string; bytes: number }>(
			`select path, sha256, bytes from wai_files order by path`,
		);
		files = registry.rows.map((r) => ({
			path: r.path,
			sha256: r.sha256,
			bytes: Number(r.bytes),
			blob: blobPath(r.sha256),
		}));
		return version.rows[0]?.value ?? "unknown";
	});

	// Files first, so a manifest is only ever written for a backup whose files are all there.
	const source = options.source ?? null;
	for (const file of files) {
		if (await storage.get(file.blob)) continue;
		if (!source)
			throw new Error(
				"There are stored files but no file storage to read them from, so they can't be backed up.",
			);
		const bytes = await source.get(file.path);
		if (!bytes) throw new Error(`The stored file ${file.path} is missing, so the backup was not completed.`);
		if (sha256Hex(bytes) !== file.sha256)
			throw new Error(
				`The stored file ${file.path} doesn't match its recorded checksum, so the backup was not completed.`,
			);
		await storage.put(file.blob, bytes, "application/octet-stream");
	}
	for (const { name, text } of exported)
		await storage.put(tablePath(id, name), toBytes(text), "application/x-ndjson");

	const manifest: BackupManifest = {
		version: 1,
		id,
		createdAt: now.toISOString(),
		schemaVersion,
		tables,
		files,
		totals: {
			rows: Object.values(tables).reduce((n, t) => n + t.rows, 0),
			files: files.length,
			fileBytes: files.reduce((n, f) => n + f.bytes, 0),
		},
	};
	// The manifest goes last: its presence means the backup is complete.
	await storage.put(manifestPath(id), toBytes(JSON.stringify(manifest, null, 2)), "application/json");
	return manifest;
}

/** The ids of the complete backups in `storage`, newest first. */
export async function listBackups(storage: FileStorage): Promise<string[]> {
	const paths = await storage.list(`${BACKUP_ROOT}/`);
	return paths
		.map((p) => /^backups\/([^/]+)\/manifest\.json$/.exec(p)?.[1])
		.filter((id): id is string => Boolean(id) && id !== "blobs")
		.sort()
		.reverse();
}

export async function readManifest(storage: FileStorage, id: string): Promise<BackupManifest> {
	const bytes = await storage.get(manifestPath(id));
	if (!bytes) throw new Error(`There is no complete backup called ${id}.`);
	const manifest = JSON.parse(toText(bytes)) as BackupManifest;
	if (manifest.version !== 1 || manifest.id !== id)
		throw new Error("That backup's manifest isn't in a form this version can read.");
	return manifest;
}

/**
 * Deletes all but the newest `keep` backups (their tables and manifests). File copies are kept by checksum and shared between
 * backups, so they stay; clearing unreferenced ones is a manual job for now (docs/worldwide-ai.md). Returns the ids removed.
 */
export async function pruneBackups(storage: FileStorage, keep: number): Promise<string[]> {
	const ids = await listBackups(storage);
	const doomed = ids.slice(Math.max(keep, 1));
	for (const id of doomed) {
		const paths = (await storage.list(`${BACKUP_ROOT}/${id}/`)).filter((p) => !p.endsWith("/manifest.json"));
		// Tables first, the manifest last: a half-deleted backup then looks incomplete, never complete.
		await storage.remove(paths);
		await storage.remove([manifestPath(id)]);
	}
	return doomed;
}
