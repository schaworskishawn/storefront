import { saleorGraphqlUrl } from "@/lib/saleor-endpoint";
import { iso, type Row, type Sql } from "../db/sql";
import type { WorkflowDeps } from "../workflows/types";
import { INTEGRATION_IDS, INTEGRATIONS, configStatus, type IntegrationId } from "./catalog";

/**
 * Whether each integration actually answers, as measured. Every probe is read-only and has a short time limit. Where a probe
 * would cost money or has no safe call (the model provider, Trigger.dev), the status comes from what really happened the last
 * time the system used it, and says so; nothing is reported healthy that wasn't observed.
 */

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "not_configured" | "unknown";

export type HealthResult = {
	integration: IntegrationId;
	status: HealthStatus;
	detail: string;
	latencyMs: number | null;
};

const PROBE_TIMEOUT_MS = 6000;

async function timed(
	work: () => Promise<{ status: HealthStatus; detail: string }>,
	timeoutMs: number,
): Promise<{ status: HealthStatus; detail: string; latencyMs: number }> {
	const started = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = await Promise.race([
			work(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
			}),
		]);
		return { ...result, latencyMs: Date.now() - started };
	} catch (error) {
		return {
			status: "unhealthy",
			detail:
				error instanceof Error && error.message === "timed out"
					? `No answer within ${Math.round(timeoutMs / 1000)} seconds.`
					: "The check failed.",
			latencyMs: Date.now() - started,
		};
	} finally {
		clearTimeout(timer);
	}
}

const ago = (value: unknown, now: Date): string => {
	const at = iso(value);
	if (!at) return "never";
	const hours = Math.round((now.getTime() - new Date(at).getTime()) / 3_600_000);
	return hours < 1
		? "within the last hour"
		: hours < 48
			? `${hours} hours ago`
			: `${Math.round(hours / 24)} days ago`;
};

/** The state of the model provider from the last real call, since a probe would cost tokens. */
async function modelFromUsage(sql: Sql, now: Date): Promise<{ status: HealthStatus; detail: string }> {
	const { rows } = await sql.query(
		`select status, at from wai_usage where kind = 'model' order by id desc limit 1`,
	);
	const last = rows[0];
	if (!last)
		return {
			status: "unknown",
			detail:
				"The key is set, but no model call has been made yet. It is not probed because a probe costs tokens.",
		};
	return last.status === "ok"
		? { status: "healthy", detail: `The last model call succeeded ${ago(last.at, now)}.` }
		: { status: "degraded", detail: `The last model call failed ${ago(last.at, now)}.` };
}

/** The state of the background job runner from the last time a job was handed to it. */
async function triggerFromDispatch(sql: Sql, now: Date): Promise<{ status: HealthStatus; detail: string }> {
	const { rows } = await sql.query(
		`select status, detail, checked_at from wai_integration_health where integration = 'trigger' order by id desc limit 1`,
	);
	const last = rows[0];
	if (!last)
		return { status: "unknown", detail: "The key is set, but no job has been handed to Trigger.dev yet." };
	return {
		status: last.status as HealthStatus,
		detail: `${last.detail as string} (${ago(last.checked_at, now)})`,
	};
}

export type HealthDeps = Pick<WorkflowDeps, "sql" | "config" | "now" | "storage" | "openclaw"> & {
	fetchImpl?: typeof fetch;
	env?: Record<string, string | undefined>;
	/** How long each probe may take (default 6 seconds). */
	probeTimeoutMs?: number;
};

export async function checkIntegrations(deps: HealthDeps): Promise<HealthResult[]> {
	const { sql, config } = deps;
	const now = deps.now();
	const fetcher = deps.fetchImpl ?? fetch;
	const env = deps.env ?? process.env;
	const configured = new Map(configStatus(config, env).map((c) => [c.id, c]));
	const results: HealthResult[] = [];
	const time = (work: () => Promise<{ status: HealthStatus; detail: string }>) =>
		timed(work, deps.probeTimeoutMs ?? PROBE_TIMEOUT_MS);

	const add = (
		integration: IntegrationId,
		outcome: { status: HealthStatus; detail: string; latencyMs?: number | null },
	) =>
		results.push({
			integration,
			status: outcome.status,
			detail: outcome.detail,
			latencyMs: outcome.latencyMs ?? null,
		});
	const notConfigured = (id: IntegrationId) => {
		const c = configured.get(id);
		add(id, {
			status: "not_configured",
			detail: INTEGRATIONS[id].hasConnector
				? `Missing: ${c?.missing.join(", ") || "settings"}.`
				: "No Phase 1 connector yet.",
		});
	};

	for (const id of INTEGRATION_IDS) {
		const c = configured.get(id);
		if (!c?.configured && id !== "playwright") {
			notConfigured(id);
			continue;
		}
		switch (id) {
			case "database":
				add(
					id,
					await time(async () => {
						const { rows } = await sql.query(`select value from wai_meta where key = 'schema_version'`);
						return rows[0]
							? { status: "healthy", detail: `Answering. Schema version ${rows[0].value as string}.` }
							: {
									status: "degraded",
									detail:
										"Answering, but the Worldwide AI tables aren't there. Apply the migration in supabase/migrations.",
								};
					}),
				);
				break;
			case "storage":
				add(
					id,
					await time(async () => {
						if (!deps.storage) return { status: "not_configured", detail: "No storage configured." };
						await deps.storage.get("healthcheck/does-not-exist");
						return {
							status: "healthy",
							detail:
								deps.storage.mode === "folder"
									? "Local folder (development only) is readable."
									: "The bucket answers.",
						};
					}),
				);
				break;
			case "model":
				add(id, await time(() => modelFromUsage(sql, now)));
				break;
			case "trigger":
				add(id, await time(() => triggerFromDispatch(sql, now)));
				break;
			case "openclaw":
				add(
					id,
					await time(async () => {
						if (!deps.openclaw) return { status: "not_configured", detail: "No connector." };
						const health = await deps.openclaw.health();
						return { status: health.ok ? "healthy" : "unhealthy", detail: health.detail };
					}),
				);
				break;
			case "langfuse":
				add(
					id,
					await time(async () => {
						const response = await fetcher(
							`${config.langfuse.baseUrl.replace(/\/+$/, "")}/api/public/health`,
							{ cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
						);
						return response.ok
							? { status: "healthy", detail: "Langfuse answers." }
							: { status: "unhealthy", detail: `Langfuse answered ${response.status}.` };
					}),
				);
				break;
			case "saleor":
				add(
					id,
					await time(async () => {
						const endpoint = saleorGraphqlUrl(env.NEXT_PUBLIC_SALEOR_API_URL);
						if (!endpoint) return { status: "not_configured", detail: "No Saleor API address." };
						const response = await fetcher(endpoint, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ query: "{ shop { name } }" }),
							cache: "no-store",
							signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
						});
						return response.ok
							? { status: "healthy", detail: "The store API answers." }
							: { status: "unhealthy", detail: `The store API answered ${response.status}.` };
					}),
				);
				break;
			case "playwright":
				add(id, {
					status: "unknown",
					detail:
						"The acceptance tests run from the repository (pnpm test:e2e). Their results aren't recorded here yet.",
				});
				break;
			default:
				notConfigured(id);
		}
	}
	return results;
}

export async function recordHealth(sql: Sql, results: readonly HealthResult[]): Promise<void> {
	for (const r of results)
		await sql.query(
			`insert into wai_integration_health (integration, status, detail, latency_ms) values ($1,$2,$3,$4)`,
			[r.integration, r.status, r.detail.slice(0, 500), r.latencyMs],
		);
}

export type LatestHealth = HealthResult & { checkedAt: string };

/** The newest result for every integration. */
export async function latestHealth(sql: Sql): Promise<LatestHealth[]> {
	const { rows } = await sql.query(
		`select distinct on (integration) integration, status, detail, latency_ms, checked_at from wai_integration_health order by integration, id desc`,
	);
	return rows.map((r: Row) => ({
		integration: r.integration as IntegrationId,
		status: r.status as HealthStatus,
		detail: (r.detail as string | null) ?? "",
		latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
		checkedAt: iso(r.checked_at) as string,
	}));
}

export async function healthHistory(
	sql: Sql,
	integration: IntegrationId,
	limit = 20,
): Promise<LatestHealth[]> {
	const { rows } = await sql.query(
		`select integration, status, detail, latency_ms, checked_at from wai_integration_health where integration = $1 order by id desc limit $2`,
		[integration, limit],
	);
	return rows.map((r: Row) => ({
		integration: r.integration as IntegrationId,
		status: r.status as HealthStatus,
		detail: (r.detail as string | null) ?? "",
		latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
		checkedAt: iso(r.checked_at) as string,
	}));
}
