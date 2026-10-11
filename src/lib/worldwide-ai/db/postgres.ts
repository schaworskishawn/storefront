import { Pool, type PoolClient, type QueryResult as PgResult } from "pg";
import type { QueryResult, Row, Sql, SqlClient } from "./sql";

/**
 * Supabase Postgres over `pg`. Use the pooled connection string (the "transaction pooler", port 6543) from serverless
 * functions so each invocation doesn't open its own connection. Supabase requires TLS, which is switched on for any host
 * that isn't local.
 */

const isLocal = (url: string) => /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const toResult = <T extends Row>(result: PgResult): QueryResult<T> => ({
	rows: result.rows as T[],
	rowCount: result.rowCount ?? 0,
});

function wrap(runner: Pool | PoolClient): Sql {
	return {
		async query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
			return toResult<T>(await runner.query(text, params as unknown[]));
		},
		async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
			// Already inside a transaction (a PoolClient): nest by reusing it.
			if (!("totalCount" in runner)) return fn(wrap(runner));
			const client = await (runner as Pool).connect();
			try {
				await client.query("begin");
				const value = await fn(wrap(client));
				await client.query("commit");
				return value;
			} catch (error) {
				await client.query("rollback").catch(() => undefined);
				throw error;
			} finally {
				client.release();
			}
		},
	};
}

export function createPostgres(url: string, options: { max?: number } = {}): SqlClient {
	const pool = new Pool({
		connectionString: url,
		max: options.max ?? 3,
		ssl: isLocal(url) ? undefined : { rejectUnauthorized: false },
		connectionTimeoutMillis: 8_000,
		idleTimeoutMillis: 10_000,
		statement_timeout: 20_000,
	});
	// A dropped idle connection shouldn't crash the process.
	pool.on("error", (error) => console.error("[worldwide-ai] database pool error:", error.message));
	const sql = wrap(pool);
	return {
		kind: "postgres",
		query: sql.query,
		transaction: sql.transaction,
		async exec(script) {
			await pool.query(script);
		},
		close: () => pool.end(),
	};
}
