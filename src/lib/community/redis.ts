import "server-only";

/**
 * A small client for Upstash Redis over its REST API, which is what works from serverless functions (no sockets, nothing to
 * keep open). It is the community's only storage. The Vercel integration for Upstash sets `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN`; Upstash's own console calls them `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Either pair
 * works. See docs/community.md.
 */

import { readRedisConfig } from "./config";

export type RedisCommand = ReadonlyArray<string | number>;

export interface Redis {
	/** Run one command and return its reply. Throws `RedisError` if Redis refuses it or can't be reached. */
	run<T = unknown>(command: RedisCommand): Promise<T>;
	/** Run commands in one round trip. Replies come back in order; the first failure throws. */
	pipeline(commands: readonly RedisCommand[]): Promise<unknown[]>;
}

export class RedisError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RedisError";
	}
}

type Options = { url: string; token: string; fetchImpl?: typeof fetch; timeoutMs?: number };
type Reply = { result?: unknown; error?: string };

export function createRedis({ url, token, fetchImpl = fetch, timeoutMs = 5000 }: Options): Redis {
	const base = url.replace(/\/+$/, "");

	async function send(path: string, body: unknown): Promise<unknown> {
		let response: Response;
		try {
			response = await fetchImpl(`${base}${path}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
				body: JSON.stringify(body),
				cache: "no-store",
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch {
			throw new RedisError("Couldn't reach Redis.");
		}
		const payload = (await response.json().catch(() => null)) as unknown;
		if (!response.ok) {
			const detail = (payload as Reply | null)?.error;
			throw new RedisError(`Redis answered ${response.status}${detail ? `: ${detail}` : "."}`);
		}
		return payload;
	}

	return {
		async run<T>(command: RedisCommand): Promise<T> {
			const reply = (await send("", command)) as Reply | null;
			if (!reply || reply.error) throw new RedisError(reply?.error ?? "Redis returned nothing.");
			return reply.result as T;
		},
		async pipeline(commands) {
			if (commands.length === 0) return [];
			const replies = (await send("/pipeline", commands)) as Reply[] | null;
			if (!Array.isArray(replies) || replies.length !== commands.length)
				throw new RedisError("Redis returned an unexpected pipeline reply.");
			return replies.map((reply) => {
				if (reply.error) throw new RedisError(reply.error);
				return reply.result;
			});
		},
	};
}

type Env = Record<string, string | undefined>;

let cached: { key: string; redis: Redis } | null = null;

/** The shared Redis client, or null when the community isn't set up. */
export function communityRedis(env: Env = process.env): Redis | null {
	const config = readRedisConfig(env);
	if (!config) return null;
	const key = `${config.url}|${config.token}`;
	if (cached?.key !== key) cached = { key, redis: createRedis(config) };
	return cached.redis;
}
