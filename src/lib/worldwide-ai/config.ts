/**
 * What Worldwide AI is configured with, read from the environment. Reading never throws and never returns a secret to a
 * caller that only wanted to know "is it set": the dashboard shows names and statuses, not values.
 */

export type Env = Record<string, string | undefined>;

const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;
const flag = (value: string | undefined): boolean => /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
const list = (value: string | undefined): string[] =>
	(value ?? "")
		.split(/[\s,;]+/)
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);

export type DatabaseMode = "postgres" | "demo" | "none";
export type StorageMode = "supabase" | "demo" | "none";

export type WorldwideAiConfig = {
	/** Who may sign in to the dashboard, by account email. Both must also be Saleor staff accounts. */
	ownerEmails: string[];
	staffEmails: string[];
	database: { mode: DatabaseMode; url: string | null };
	storage: { mode: StorageMode; url: string | null; serviceKey: string | null; bucket: string };
	model: { provider: "anthropic"; modelId: string; apiKeySet: boolean };
	trigger: { secretSet: boolean };
	openclaw: { adapterUrl: string | null; secret: string | null; allowedHosts: string[] };
	langfuse: { publicKeySet: boolean; secretKeySet: boolean; baseUrl: string };
	/** Whether redacted prompt and output text may be kept in traces and task history. Off unless asked for. */
	recordRaw: boolean;
	/** Whether the public contact form also files its messages as support cases. Off unless asked for. */
	ingestContactForm: boolean;
	/** An approved document counts as stale this long after it was approved, unless it carries its own review date. */
	staleAfterDays: number;
};

export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";
export const DEFAULT_BUCKET = "worldwide-ai";
export const DEFAULT_STALE_AFTER_DAYS = 180;

/**
 * `WORLDWIDE_AI_STORE=demo` keeps everything in an in-memory database seeded with clearly labelled sample data. It exists for
 * local development and is refused in production, where an in-memory store would silently lose everything.
 */
export function readConfig(env: Env = process.env): WorldwideAiConfig {
	const production = env.NODE_ENV === "production";
	const databaseUrl = clean(env.WORLDWIDE_AI_DATABASE_URL) ?? clean(env.POSTGRES_URL);
	const demo = !production && env.WORLDWIDE_AI_STORE === "demo";
	const supabaseUrl = clean(env.SUPABASE_URL) ?? clean(env.NEXT_PUBLIC_SUPABASE_URL);
	const serviceKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
	const staleDays = Number(env.WORLDWIDE_AI_STALE_AFTER_DAYS);

	return {
		ownerEmails: list(env.WORLDWIDE_AI_OWNER_EMAILS),
		staffEmails: list(env.WORLDWIDE_AI_STAFF_EMAILS),
		database: demo
			? { mode: "demo", url: null }
			: databaseUrl
				? { mode: "postgres", url: databaseUrl }
				: { mode: "none", url: null },
		// The demonstration store keeps its files in a local folder even when real Supabase settings are present, so that
		// fictional records can never be written into the real bucket.
		storage: demo
			? { mode: "demo", url: null, serviceKey: null, bucket: DEFAULT_BUCKET }
			: supabaseUrl && serviceKey
				? {
						mode: "supabase",
						url: supabaseUrl,
						serviceKey,
						bucket: clean(env.WORLDWIDE_AI_BUCKET) ?? DEFAULT_BUCKET,
					}
				: {
						mode: "none",
						url: null,
						serviceKey: null,
						bucket: clean(env.WORLDWIDE_AI_BUCKET) ?? DEFAULT_BUCKET,
					},
		model: {
			provider: "anthropic",
			modelId: clean(env.WORLDWIDE_AI_MODEL) ?? DEFAULT_MODEL_ID,
			apiKeySet: Boolean(clean(env.ANTHROPIC_API_KEY)),
		},
		// A background job runs in another process, which could not see the in-memory demonstration store: so in the
		// demonstration store work always runs inside the web application.
		trigger: { secretSet: !demo && Boolean(clean(env.TRIGGER_SECRET_KEY)) },
		openclaw: {
			adapterUrl: clean(env.OPENCLAW_ADAPTER_URL) ?? null,
			secret: clean(env.OPENCLAW_ADAPTER_SECRET) ?? null,
			allowedHosts: list(env.OPENCLAW_ALLOWED_HOSTS),
		},
		langfuse: {
			publicKeySet: Boolean(clean(env.LANGFUSE_PUBLIC_KEY)),
			secretKeySet: Boolean(clean(env.LANGFUSE_SECRET_KEY)),
			baseUrl: clean(env.LANGFUSE_BASE_URL) ?? "https://cloud.langfuse.com",
		},
		recordRaw: flag(env.WORLDWIDE_AI_RECORD_RAW),
		ingestContactForm: flag(env.WORLDWIDE_AI_INGEST_CONTACT_FORM),
		staleAfterDays:
			Number.isFinite(staleDays) && staleDays > 0 ? Math.floor(staleDays) : DEFAULT_STALE_AFTER_DAYS,
	};
}

/** Whether the dashboard can be used at all: someone is allowed in, and there is a database for it to read. */
export function isDashboardConfigured(config: WorldwideAiConfig): boolean {
	return config.ownerEmails.length > 0 && config.database.mode !== "none";
}

export const isDemoStore = (config: WorldwideAiConfig): boolean => config.database.mode === "demo";
