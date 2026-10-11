/**
 * The small database interface the rest of Worldwide AI is written against. Production is Supabase Postgres (through `pg`);
 * development and the tests run the very same SQL on PGlite, an in-process Postgres, so what the tests prove about the
 * constraints and queries is true of the real database too.
 *
 * Conventions that keep both behaving the same: values go in as `$n` parameters, JSON as `JSON.stringify(x)` with a
 * `$n::jsonb` cast, dates are selected as text, counts are cast to int.
 */

/**
 * The schema version this code is written against: the number the newest file in supabase/migrations leaves in wai_meta.
 * Bump it with every migration. The database health check compares the two, so code deployed ahead of its migration says
 * exactly that instead of failing with a missing table.
 */
export const SCHEMA_VERSION = 13;

export type Row = Record<string, unknown>;

export type QueryResult<T extends Row = Row> = { rows: T[]; rowCount: number };

export interface Sql {
	query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
	/** Runs `fn` in one transaction: everything it does is committed together, or none of it is. */
	transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export interface SqlClient extends Sql {
	kind: "postgres" | "pglite";
	/** Runs a script of several statements (migrations). */
	exec(script: string): Promise<void>;
	close(): Promise<void>;
}

export class DatabaseNotConfiguredError extends Error {
	constructor() {
		super("The database isn't configured. Set POSTGRES_URL (see docs/worldwide-ai.md).");
		this.name = "DatabaseNotConfiguredError";
	}
}

/** A timestamp from either driver (a Date, or text) as an ISO 8601 UTC string; null stays null. */
export function iso(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const json = (value: unknown): string => JSON.stringify(value ?? null);
