import { describe, expect, it, vi } from "vitest";
import { RedisError, communityRedis, createRedis } from "./redis";

vi.mock("server-only", () => ({}));

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("createRedis", () => {
	it("sends one command with the token and returns its result", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(reply({ result: "PONG" }));
		const redis = createRedis({ url: "https://r.example.io/", token: "t0k", fetchImpl });
		expect(await redis.run(["PING"])).toBe("PONG");

		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("https://r.example.io");
		expect(init.headers.Authorization).toBe("Bearer t0k");
		expect(JSON.parse(init.body)).toEqual(["PING"]);
	});

	it("sends a pipeline in one request and returns the results in order", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(reply([{ result: 1 }, { result: "a" }]));
		const redis = createRedis({ url: "https://r.example.io", token: "t", fetchImpl });
		expect(
			await redis.pipeline([
				["INCR", "k"],
				["GET", "j"],
			]),
		).toEqual([1, "a"]);
		expect(fetchImpl.mock.calls[0][0]).toBe("https://r.example.io/pipeline");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("doesn't call out for an empty pipeline", async () => {
		const fetchImpl = vi.fn();
		const redis = createRedis({ url: "https://r.example.io", token: "t", fetchImpl });
		expect(await redis.pipeline([])).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("throws when Redis reports an error, for one command or inside a pipeline", async () => {
		const redis = createRedis({
			url: "https://r.example.io",
			token: "t",
			fetchImpl: vi
				.fn()
				.mockResolvedValueOnce(reply({ error: "ERR nope" }))
				.mockResolvedValueOnce(reply([{ result: 1 }, { error: "WRONGTYPE" }])),
		});
		await expect(redis.run(["X"])).rejects.toThrow("ERR nope");
		await expect(redis.pipeline([["A"], ["B"]])).rejects.toThrow("WRONGTYPE");
	});

	it("throws on a bad status without leaking the token", async () => {
		const redis = createRedis({
			url: "https://r.example.io",
			token: "secret-token",
			fetchImpl: vi.fn().mockResolvedValue(reply({ error: "Unauthorized" }, 401)),
		});
		const error = await redis.run(["GET", "k"]).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(RedisError);
		expect((error as Error).message).toContain("401");
		expect((error as Error).message).not.toContain("secret-token");
	});

	it("throws a plain message when it can't connect", async () => {
		const redis = createRedis({
			url: "https://r.example.io",
			token: "t",
			fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
		});
		await expect(redis.run(["GET", "k"])).rejects.toThrow("Couldn't reach Redis.");
	});

	it("rejects a pipeline reply of the wrong size", async () => {
		const redis = createRedis({
			url: "https://r.example.io",
			token: "t",
			fetchImpl: vi.fn().mockResolvedValue(reply([{ result: 1 }])),
		});
		await expect(redis.pipeline([["A"], ["B"]])).rejects.toThrow(/unexpected/);
	});
});

describe("communityRedis", () => {
	it("is null when not set up and reuses one client otherwise", () => {
		expect(communityRedis({})).toBeNull();
		const env = { KV_REST_API_URL: "https://a", KV_REST_API_TOKEN: "t" };
		expect(communityRedis(env)).toBe(communityRedis(env));
		expect(communityRedis({ ...env, KV_REST_API_TOKEN: "other" })).not.toBe(communityRedis(env));
	});
});
