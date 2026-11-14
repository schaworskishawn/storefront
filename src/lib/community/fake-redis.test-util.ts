import type { Redis, RedisCommand } from "./redis";

/**
 * An in-memory stand-in for Redis that understands the commands the community uses, so the store's rules (rate limits,
 * moderation, reactions, polling) are tested against real behaviour instead of mocks. Only imported by tests.
 */
export function createFakeRedis(now: () => number = Date.now) {
	const strings = new Map<string, { value: string; expiresAt: number | null }>();
	const hashes = new Map<string, Map<string, string>>();
	const zsets = new Map<string, Map<string, number>>();
	const lists = new Map<string, string[]>();
	const streams = new Map<string, { id: string; fields: string[] }[]>();
	let seq = 0;
	const log: string[][] = [];

	const live = (key: string) => {
		const entry = strings.get(key);
		if (entry && entry.expiresAt !== null && entry.expiresAt <= now()) {
			strings.delete(key);
			return undefined;
		}
		return entry;
	};
	const idParts = (id: string): [number, number] => {
		const [ms, n = "0"] = id.split("-");
		return [Number(ms), Number(n)];
	};
	const cmp = (a: string, b: string) => {
		const [am, an] = idParts(a);
		const [bm, bn] = idParts(b);
		return am - bm || an - bn;
	};
	/** Resolves a stream range bound: "-" / "+" / "(id" (exclusive) / "id". */
	const inRange = (id: string, min: string, max: string) => {
		const lo = min === "-" ? true : min.startsWith("(") ? cmp(id, min.slice(1)) > 0 : cmp(id, min) >= 0;
		const hi = max === "+" ? true : max.startsWith("(") ? cmp(id, max.slice(1)) < 0 : cmp(id, max) <= 0;
		return lo && hi;
	};

	function exec(command: RedisCommand): unknown {
		const [name, ...rest] = command.map(String);
		const op = name.toUpperCase();
		log.push([op, ...rest]);
		switch (op) {
			case "GET":
				return live(rest[0])?.value ?? null;
			case "MGET":
				return rest.map((key) => live(key)?.value ?? null);
			case "SET": {
				const [key, value, ...flags] = rest;
				const upper = flags.map((f) => f.toUpperCase());
				if (upper.includes("NX") && live(key)) return null;
				const ex = upper.indexOf("EX");
				const px = upper.indexOf("PX");
				const expiresAt =
					ex >= 0 ? now() + Number(flags[ex + 1]) * 1000 : px >= 0 ? now() + Number(flags[px + 1]) : null;
				strings.set(key, { value, expiresAt });
				return "OK";
			}
			case "INCR": {
				const current = Number(live(rest[0])?.value ?? 0) + 1;
				strings.set(rest[0], { value: String(current), expiresAt: live(rest[0])?.expiresAt ?? null });
				return current;
			}
			case "DEL": {
				let n = 0;
				for (const key of rest) if (strings.delete(key)) n++;
				return n;
			}
			case "PTTL": {
				const entry = live(rest[0]);
				if (!entry) return -2;
				return entry.expiresAt === null ? -1 : entry.expiresAt - now();
			}
			case "HGET":
				return hashes.get(rest[0])?.get(rest[1]) ?? null;
			case "HMGET":
				return rest.slice(1).map((field) => hashes.get(rest[0])?.get(field) ?? null);
			case "HSET": {
				const hash = hashes.get(rest[0]) ?? new Map();
				hashes.set(rest[0], hash);
				let added = 0;
				for (let i = 1; i < rest.length; i += 2) {
					if (!hash.has(rest[i])) added++;
					hash.set(rest[i], rest[i + 1]);
				}
				return added;
			}
			case "HSETNX": {
				const hash = hashes.get(rest[0]) ?? new Map();
				hashes.set(rest[0], hash);
				if (hash.has(rest[1])) return 0;
				hash.set(rest[1], rest[2]);
				return 1;
			}
			case "HDEL": {
				const hash = hashes.get(rest[0]);
				let n = 0;
				for (const field of rest.slice(1)) if (hash?.delete(field)) n++;
				return n;
			}
			case "HLEN":
				return hashes.get(rest[0])?.size ?? 0;
			case "ZADD": {
				const zset = zsets.get(rest[0]) ?? new Map();
				zsets.set(rest[0], zset);
				const had = zset.has(rest[2]);
				zset.set(rest[2], Number(rest[1]));
				return had ? 0 : 1;
			}
			case "ZREMRANGEBYSCORE": {
				const zset = zsets.get(rest[0]);
				if (!zset) return 0;
				const lo = rest[1] === "-inf" ? -Infinity : Number(rest[1]);
				const hi = rest[2] === "+inf" ? Infinity : Number(rest[2]);
				let n = 0;
				for (const [member, score] of zset) if (score >= lo && score <= hi && zset.delete(member)) n++;
				return n;
			}
			case "ZRANGEBYSCORE": {
				const zset = zsets.get(rest[0]) ?? new Map<string, number>();
				const lo = rest[1] === "-inf" ? -Infinity : Number(rest[1]);
				const hi = rest[2] === "+inf" ? Infinity : Number(rest[2]);
				const members = [...zset]
					.filter(([, score]) => score >= lo && score <= hi)
					.sort((a, b) => a[1] - b[1])
					.map(([member]) => member);
				const limit = rest.findIndex((token) => token.toUpperCase() === "LIMIT");
				return limit >= 0
					? members.slice(Number(rest[limit + 1]), Number(rest[limit + 1]) + Number(rest[limit + 2]))
					: members;
			}
			case "LPUSH": {
				const list = lists.get(rest[0]) ?? [];
				lists.set(rest[0], [...rest.slice(1).reverse(), ...list]);
				return lists.get(rest[0])?.length;
			}
			case "LTRIM": {
				const list = lists.get(rest[0]) ?? [];
				lists.set(rest[0], list.slice(Number(rest[1]), Number(rest[2]) + 1));
				return "OK";
			}
			case "LRANGE":
				return (lists.get(rest[0]) ?? []).slice(
					Number(rest[1]),
					rest[2] === "-1" ? undefined : Number(rest[2]) + 1,
				);
			case "XADD": {
				const key = rest[0];
				let i = 1;
				let maxLen = Infinity;
				if (rest[i].toUpperCase() === "MAXLEN") {
					i++;
					if (rest[i] === "~" || rest[i] === "=") i++;
					maxLen = Number(rest[i++]);
				}
				const requested = rest[i++];
				const stream = streams.get(key) ?? [];
				streams.set(key, stream);
				seq++;
				const id = requested === "*" ? `${now()}-${seq}` : requested;
				stream.push({ id, fields: rest.slice(i) });
				while (stream.length > maxLen) stream.shift();
				return id;
			}
			case "XRANGE": {
				const [key, min, max, , count] = rest;
				const hits = (streams.get(key) ?? []).filter((e) => inRange(e.id, min, max));
				return (count ? hits.slice(0, Number(count)) : hits).map((e) => [e.id, e.fields]);
			}
			case "XREVRANGE": {
				const [key, max, min, , count] = rest;
				const hits = (streams.get(key) ?? []).filter((e) => inRange(e.id, min, max)).reverse();
				return (count ? hits.slice(0, Number(count)) : hits).map((e) => [e.id, e.fields]);
			}
			case "XDEL": {
				const stream = streams.get(rest[0]) ?? [];
				const before = stream.length;
				streams.set(
					rest[0],
					stream.filter((e) => !rest.slice(1).includes(e.id)),
				);
				return before - (streams.get(rest[0])?.length ?? 0);
			}
			default:
				throw new Error(`FakeRedis doesn't know ${op}`);
		}
	}

	const redis: Redis = {
		async run<T>(command: RedisCommand) {
			return exec(command) as T;
		},
		async pipeline(commands) {
			return commands.map(exec);
		},
	};

	return {
		redis,
		/** Every command received so far, uppercased, in order. */
		log,
		/** The raw lists, for assertions about what was written. */
		list: (key: string) => lists.get(key) ?? [],
	};
}
