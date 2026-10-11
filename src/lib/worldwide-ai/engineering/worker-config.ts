import { CHECK_RUNNERS, type RunnerId } from "./coding";

/**
 * The coding worker's settings, read from the server's environment. This is the "reviewed configuration" the contract talks
 * about: where a registered repository lives, how it is set up, and what each check runs. A request can name a repository
 * and a check by id; only this file turns an id into an address or a command.
 *
 * WORLDWIDE_AI_CODING=vercel-sandbox switches the worker on. WORLDWIDE_AI_CODING_REPOSITORIES is JSON, one entry per
 * registered repository id:
 *
 *   { "storefront": { "url": "https://github.com/owner/repo.git",
 *                     "setup": ["corepack enable", "pnpm install --frozen-lockfile"],
 *                     "checks": { "typecheck": "pnpm exec tsc --noEmit -p ." } } }
 *
 * The Anthropic key is read here only so it can be put in the firewall rule that adds it to requests on their way out of
 * the machine. It is never written into a machine, a command, a file or a record.
 */

/** The version of the Agent SDK installed inside each machine. Pinned, so a run doesn't change under a job. */
export const AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
export const AGENT_SDK_VERSION = "0.3.296";

/** Hosts a repository may be cloned from. A public https address only: this worker holds no repository credential. */
const REPOSITORY_HOSTS: readonly string[] = ["github.com"];

export type RepositoryConfig = {
	url: string;
	/** Commands that prepare a checkout for the checks, run once, in order, before the network is closed. */
	setup: string[];
	/** What each check runs, by its id. A check with no command here can't be run, and is reported as not run. */
	checks: Partial<Record<RunnerId, string>>;
};

export type CodingConfig = {
	enabled: boolean;
	/** The key for the firewall rule. Null when it isn't set. Never logged, stored or sent into a machine. */
	anthropicApiKey: string | null;
	/** The model the agent uses, when one is named. Null leaves the Agent SDK's own default. */
	model: string | null;
	repositories: Record<string, RepositoryConfig>;
	/** Whether this process can create machines on Vercel: it runs there, or a token for it is set. */
	canReachVercel: boolean;
	/** Anything wrong with the repositories setting, in words. A broken setting configures nothing. */
	problems: string[];
};

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined): string => (value ?? "").trim();

const isCommand = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0 && value.length <= 500 && !/[\r\n\u0000]/.test(value);

function repositoryOf(id: string, raw: unknown, problems: string[]): RepositoryConfig | null {
	if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) {
		problems.push(`"${id}" isn't a repository id.`);
		return null;
	}
	if (typeof raw !== "object" || raw === null) {
		problems.push(`${id}: its entry isn't an object.`);
		return null;
	}
	const entry = raw as Record<string, unknown>;
	let url: URL;
	try {
		url = new URL(typeof entry.url === "string" ? entry.url : "");
	} catch {
		problems.push(`${id}: "url" isn't an address.`);
		return null;
	}
	if (url.protocol !== "https:" || !REPOSITORY_HOSTS.includes(url.hostname) || url.username || url.password) {
		problems.push(
			`${id}: the address must be a plain https address on ${REPOSITORY_HOSTS.join(" or ")}, with no sign-in in it.`,
		);
		return null;
	}
	const setup = entry.setup === undefined ? [] : entry.setup;
	if (!Array.isArray(setup) || setup.length > 10 || !setup.every(isCommand)) {
		problems.push(`${id}: "setup" must be up to ten one-line commands.`);
		return null;
	}
	const checks: Partial<Record<RunnerId, string>> = {};
	const rawChecks = entry.checks === undefined ? {} : entry.checks;
	if (typeof rawChecks !== "object" || rawChecks === null || Array.isArray(rawChecks)) {
		problems.push(`${id}: "checks" must be an object of check id to command.`);
		return null;
	}
	for (const [runnerId, command] of Object.entries(rawChecks as Record<string, unknown>)) {
		if (!(runnerId in CHECK_RUNNERS)) {
			problems.push(`${id}: "${runnerId}" isn't a registered check.`);
			return null;
		}
		if (!isCommand(command)) {
			problems.push(`${id}: the command for ${runnerId} must be one line.`);
			return null;
		}
		checks[runnerId as RunnerId] = command.trim();
	}
	return { url: url.toString(), setup: setup.map((command) => command.trim()), checks };
}

export function readCodingConfig(env: Env): CodingConfig {
	const problems: string[] = [];
	const repositories: Record<string, RepositoryConfig> = {};
	const raw = clean(env.WORLDWIDE_AI_CODING_REPOSITORIES);
	if (raw) {
		let parsed: unknown = null;
		try {
			parsed = JSON.parse(raw);
		} catch {
			problems.push("WORLDWIDE_AI_CODING_REPOSITORIES isn't valid JSON.");
		}
		if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed)))
			problems.push("WORLDWIDE_AI_CODING_REPOSITORIES must be an object keyed by repository id.");
		else if (parsed !== null)
			for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
				const repository = repositoryOf(id, entry, problems);
				if (repository) repositories[id] = repository;
			}
	}
	return {
		enabled: clean(env.WORLDWIDE_AI_CODING) === "vercel-sandbox",
		anthropicApiKey: clean(env.ANTHROPIC_API_KEY) || null,
		model: clean(env.WORLDWIDE_AI_CODING_MODEL) || null,
		// A broken setting configures nothing, rather than half of what was meant.
		repositories: problems.length ? {} : repositories,
		canReachVercel:
			clean(env.VERCEL) === "1" ||
			clean(env.VERCEL_OIDC_TOKEN).length > 0 ||
			(clean(env.VERCEL_TOKEN).length > 0 &&
				clean(env.VERCEL_TEAM_ID).length > 0 &&
				clean(env.VERCEL_PROJECT_ID).length > 0),
		problems,
	};
}

/**
 * What stands between a job on this repository and a machine to run it, by the name of each missing setting. Empty means
 * the settings are in place. It does not mean a run has ever worked: only a run shows that.
 */
export function missingForRun(config: CodingConfig, repositoryId: string): string[] {
	const missing: string[] = [];
	if (!config.enabled)
		missing.push("WORLDWIDE_AI_CODING is not set to vercel-sandbox, so the worker is switched off");
	if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY is not set");
	if (!config.canReachVercel)
		missing.push(
			"this isn't running on Vercel and no VERCEL_OIDC_TOKEN is set, so no machine can be created",
		);
	missing.push(...config.problems);
	if (config.problems.length === 0 && !config.repositories[repositoryId])
		missing.push(`WORLDWIDE_AI_CODING_REPOSITORIES has no entry for ${repositoryId}`);
	return missing;
}
