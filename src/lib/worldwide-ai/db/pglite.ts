import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { QueryResult, Row, Sql, SqlClient } from "./sql";

/**
 * An in-process Postgres (PGlite) that runs the same migration as Supabase. It backs the unit tests, the restore check, and
 * the local demonstration store. It is loaded lazily and only when asked for, so production never pulls it in.
 */

type PgliteLike = {
	query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
	exec: (script: string) => Promise<unknown>;
	transaction: <T>(fn: (tx: PgliteLike) => Promise<T>) => Promise<T>;
	close: () => Promise<void>;
};

function wrap(db: PgliteLike, inTransaction = false): Sql {
	const self: Sql = {
		async query<T extends Row = Row>(text: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
			const result = await db.query(text, params as unknown[]);
			return { rows: result.rows as T[], rowCount: result.affectedRows ?? result.rows.length };
		},
		// Inside a transaction, a nested one simply joins it (the outer commit or rollback decides for both).
		transaction: <T>(fn: (tx: Sql) => Promise<T>): Promise<T> =>
			inTransaction ? fn(self) : db.transaction((tx) => fn(wrap(tx, true))),
	};
	return self;
}

export async function createPglite(): Promise<SqlClient> {
	// A variable specifier keeps bundlers from trying to include the WASM build in the server bundle.
	const specifier = "@electric-sql/pglite";
	const { PGlite } = (await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)) as {
		PGlite: new () => PgliteLike & { waitReady?: Promise<void> };
	};
	const db = new PGlite();
	await db.waitReady;
	const sql = wrap(db);
	return {
		kind: "pglite",
		query: sql.query,
		transaction: sql.transaction,
		exec: async (script) => {
			await db.exec(script);
		},
		close: () => db.close(),
	};
}

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Applies every migration file, in name order, to a database. Used for PGlite; Supabase gets the same files from its CLI. */
export async function applyMigrations(sql: SqlClient, dir: string = MIGRATIONS_DIR): Promise<string[]> {
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".sql"))
		.sort();
	for (const file of files) await sql.exec(readFileSync(join(dir, file), "utf8"));
	return files;
}

/** A fresh in-memory database with the schema applied. */
export async function createMigratedPglite(): Promise<SqlClient> {
	const sql = await createPglite();
	await applyMigrations(sql);
	return sql;
}
