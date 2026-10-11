import { resolve } from "node:path";
import { resolveModel } from "./ai/model";
import { readConfig, type WorldwideAiConfig } from "./config";
import { seedDemoData } from "./db/demo-seed";
import { createMigratedPglite } from "./db/pglite";
import { createPostgres } from "./db/postgres";
import { DatabaseNotConfiguredError, type SqlClient } from "./db/sql";
import { createAdapterConnector, type OpenClawConnector } from "./openclaw/connector";
import { createFolderStorage, createSupabaseStorage, type FileStorage } from "./storage/files";
import type { WorkflowDeps } from "./workflows/types";

/**
 * Builds the pieces the app and the background jobs share: the database connection, file storage, and the dependencies a
 * workflow takes. One database connection pool per process (kept on `globalThis` so a dev server reload doesn't leak pools).
 * This file has no Next.js imports, so Trigger.dev jobs can use it too.
 */

type Cache = { sql?: Promise<SqlClient>; key?: string };
const globalCache = globalThis as typeof globalThis & { __worldwideAi?: Cache };
const cache = (globalCache.__worldwideAi ??= {});

/** The database for this configuration. Throws `DatabaseNotConfiguredError` when there isn't one. */
export function getSql(config: WorldwideAiConfig = readConfig()): Promise<SqlClient> {
	if (config.database.mode === "none") return Promise.reject(new DatabaseNotConfiguredError());
	const key = `${config.database.mode}:${config.database.url ?? ""}`;
	if (!cache.sql || cache.key !== key) {
		cache.key = key;
		cache.sql =
			config.database.mode === "postgres"
				? Promise.resolve(createPostgres(config.database.url as string))
				: createMigratedPglite().then(async (db) => {
						await seedDemoData(db);
						return db;
					});
		// If creating it failed, try again next time instead of caching the failure.
		cache.sql.catch(() => {
			cache.sql = undefined;
		});
	}
	return cache.sql;
}

export function getStorage(config: WorldwideAiConfig = readConfig()): FileStorage | null {
	if (config.storage.mode === "supabase")
		return createSupabaseStorage({
			url: config.storage.url as string,
			serviceKey: config.storage.serviceKey as string,
			bucket: config.storage.bucket,
		});
	if (config.storage.mode === "demo")
		return createFolderStorage(resolve(process.cwd(), ".worldwide-ai-demo-files"));
	return null;
}

/** The OpenClaw adapter's connector, or null until its address, secret and allowed hosts are all set. */
export function getOpenClaw(config: WorldwideAiConfig = readConfig()): OpenClawConnector | null {
	const { adapterUrl, secret, allowedHosts } = config.openclaw;
	return adapterUrl && secret && allowedHosts.length
		? createAdapterConnector({ url: adapterUrl, secret })
		: null;
}

export type Runtime = WorkflowDeps & { storage: FileStorage | null };

export async function getRuntime(env: Record<string, string | undefined> = process.env): Promise<Runtime> {
	const config = readConfig(env);
	return {
		sql: await getSql(config),
		config,
		now: () => new Date(),
		model: resolveModel(config, env),
		storage: getStorage(config),
		openclaw: getOpenClaw(config),
	};
}
