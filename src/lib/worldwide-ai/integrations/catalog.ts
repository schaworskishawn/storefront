import { type Env, type WorldwideAiConfig, readConfig } from "../config";

/**
 * The outside systems Worldwide AI depends on, and whether each is set up. "Configured" only means the settings are there;
 * `health.ts` finds out whether it answers. A system with no Phase 1 connector is listed too, as awaiting configuration,
 * so the dashboard shows what is missing rather than hiding it.
 */

export const INTEGRATION_IDS = [
	"database",
	"storage",
	"model",
	"trigger",
	"openclaw",
	"langfuse",
	"saleor",
	"playwright",
	"accounting",
	"carrier",
	"bank",
	"processor",
	"logs",
] as const;

export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export type IntegrationDefinition = {
	id: IntegrationId;
	name: string;
	purpose: string;
	/** The environment variables that configure it (names only). */
	envVars: string[];
	/** Whether Phase 1 ships code that talks to it. When false it is always "awaiting configuration". */
	hasConnector: boolean;
};

export const INTEGRATIONS: Record<IntegrationId, IntegrationDefinition> = {
	database: {
		id: "database",
		name: "Supabase database",
		purpose: "Tasks, drafts, findings, approved knowledge, review decisions and activity.",
		envVars: ["POSTGRES_URL (or WORLDWIDE_AI_DATABASE_URL)"],
		hasConnector: true,
	},
	storage: {
		id: "storage",
		name: "Supabase Storage",
		purpose: "Document uploads, inspection screenshots and backups.",
		envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
		hasConnector: true,
	},
	model: {
		id: "model",
		name: "Model provider (Anthropic)",
		purpose: "Writes drafts and reports through the Vercel AI SDK.",
		envVars: ["ANTHROPIC_API_KEY", "WORLDWIDE_AI_MODEL (optional)"],
		hasConnector: true,
	},
	trigger: {
		id: "trigger",
		name: "Trigger.dev",
		purpose: "Owns schedules and background job execution.",
		envVars: ["TRIGGER_SECRET_KEY"],
		hasConnector: true,
	},
	openclaw: {
		id: "openclaw",
		name: "OpenClaw worker",
		purpose: "Predefined browser inspections on a separate private host.",
		envVars: ["OPENCLAW_ADAPTER_URL", "OPENCLAW_ADAPTER_SECRET", "OPENCLAW_ALLOWED_HOSTS"],
		hasConnector: true,
	},
	langfuse: {
		id: "langfuse",
		name: "Langfuse",
		purpose: "Redacted agent tracing and evaluation.",
		envVars: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL (optional)"],
		hasConnector: true,
	},
	saleor: {
		id: "saleor",
		name: "Saleor store API",
		purpose: "Sign-in for staff and the owner. The store's orders and customers stay in Saleor.",
		envVars: ["NEXT_PUBLIC_SALEOR_API_URL"],
		hasConnector: true,
	},
	playwright: {
		id: "playwright",
		name: "Playwright acceptance tests",
		purpose: "Repeatable website acceptance checks (run from the repository or CI).",
		envVars: ["PLAYWRIGHT_BASE_URL (optional)"],
		hasConnector: true,
	},
	accounting: {
		id: "accounting",
		name: "Accounting system",
		purpose: "Ledger and Tally need read access to the books. Not connected in Phase 1.",
		envVars: [],
		hasConnector: false,
	},
	carrier: {
		id: "carrier",
		name: "Carrier tracking and invoices",
		purpose: "Route and Trace need shipment events and carrier invoices. Not connected in Phase 1.",
		envVars: [],
		hasConnector: false,
	},
	bank: {
		id: "bank",
		name: "Bank records",
		purpose: "Vault needs authorized bank transactions. Not connected in Phase 1.",
		envVars: [],
		hasConnector: false,
	},
	processor: {
		id: "processor",
		name: "Payment processor settlements",
		purpose: "Vault matches settlements to bank records. Not connected in Phase 1.",
		envVars: [],
		hasConnector: false,
	},
	logs: {
		id: "logs",
		name: "Application error logs",
		purpose: "Patch investigates errors from the hosting platform's logs. Not connected in Phase 1.",
		envVars: [],
		hasConnector: false,
	},
};

export type ConfigStatus = {
	id: IntegrationId;
	configured: boolean;
	/** What is missing, in words, when it isn't configured. */
	missing: string[];
	/** Extra context shown beside the status ("demo store", "model claude-…"). */
	note?: string;
};

/** Whether each integration's settings are present. Pure: it only reads the configuration it is given. */
export function configStatus(config: WorldwideAiConfig, env: Env = process.env): ConfigStatus[] {
	const missingIf = (cond: boolean, what: string) => (cond ? [what] : []);
	const make = (id: IntegrationId, missing: string[], note?: string): ConfigStatus => ({
		id,
		configured: missing.length === 0 && INTEGRATIONS[id].hasConnector,
		missing: INTEGRATIONS[id].hasConnector ? missing : ["No Phase 1 connector yet"],
		note,
	});
	const openclawMissing = [
		...missingIf(!config.openclaw.adapterUrl, "OPENCLAW_ADAPTER_URL"),
		...missingIf(!config.openclaw.secret, "OPENCLAW_ADAPTER_SECRET"),
		...missingIf(config.openclaw.allowedHosts.length === 0, "OPENCLAW_ALLOWED_HOSTS"),
	];
	return [
		make(
			"database",
			missingIf(config.database.mode === "none", "POSTGRES_URL"),
			config.database.mode === "demo" ? "In-memory demonstration store (development only)" : undefined,
		),
		make(
			"storage",
			config.storage.mode === "none"
				? [
						...missingIf(!config.storage.url, "SUPABASE_URL"),
						...missingIf(!config.storage.serviceKey, "SUPABASE_SERVICE_ROLE_KEY"),
					]
				: [],
			config.storage.mode === "demo" ? "Local folder (development only)" : undefined,
		),
		make("model", missingIf(!config.model.apiKeySet, "ANTHROPIC_API_KEY"), `Model ${config.model.modelId}`),
		make(
			"trigger",
			missingIf(!config.trigger.secretSet, "TRIGGER_SECRET_KEY"),
			config.trigger.secretSet ? undefined : "Background work runs inline, limited to short jobs",
		),
		make("openclaw", openclawMissing),
		make("langfuse", [
			...missingIf(!config.langfuse.publicKeySet, "LANGFUSE_PUBLIC_KEY"),
			...missingIf(!config.langfuse.secretKeySet, "LANGFUSE_SECRET_KEY"),
		]),
		make("saleor", missingIf(!env.NEXT_PUBLIC_SALEOR_API_URL, "NEXT_PUBLIC_SALEOR_API_URL")),
		make("playwright", []),
		make("accounting", []),
		make("carrier", []),
		make("bank", []),
		make("processor", []),
		make("logs", []),
	];
}

export const configStatusFor = (env: Env = process.env): ConfigStatus[] => configStatus(readConfig(env), env);
