/**
 * Whether the community is set up. This lives apart from the Redis client because the footer asks it, and the footer is
 * bundled into pages that also run in the browser, where the client (which is `server-only`) can't be imported. Only the
 * server ever has the variables, so in the browser this simply answers "no".
 */

type Env = Record<string, string | undefined>;

/** The connection settings, or null when Redis hasn't been connected (or the community has been switched off). */
export function readRedisConfig(env: Env = process.env): { url: string; token: string } | null {
	if (/^(false|0|off|no)$/i.test(env.COMMUNITY_ENABLED?.trim() ?? "")) return null;
	const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL)?.trim();
	const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN)?.trim();
	return url && token ? { url, token } : null;
}

/** Whether the community is available: Redis is connected and it hasn't been switched off with COMMUNITY_ENABLED=false. */
export const isCommunityEnabled = (env: Env = process.env): boolean => readRedisConfig(env) !== null;
