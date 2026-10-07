import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HEADER_SIGNATURE, HEADER_TIMESTAMP, MAX_SKEW_MS, signRequest, verifyRequest } from "./auth.mjs";
import { deriveFindings } from "./findings.mjs";
import { FILE_NAME, LIMITS, validateJobSpec, validateResult, validateTargetUrl } from "./job-spec.mjs";
import { findScreenshotPath, parseJson, readFailedRequests, readMessages, readTitle } from "./parse-cli.mjs";
import { RunnerError, createRunner } from "./runner.mjs";
import { createAdapter } from "./server.mjs";

const ALLOWED = ["www.worldwidevapor.com", "*.staging.worldwidevapor.com"];
const SECRET = "x".repeat(40);
const sessionId = () => `wai-${randomUUID()}`;
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("which pages the worker may open", () => {
	const ok = (url) => validateTargetUrl(url, ALLOWED);

	it("accepts an https page on an allowed host and drops the fragment", () => {
		expect(ok("https://www.worldwidevapor.com/shop?x=1#top")).toEqual({
			ok: true,
			url: "https://www.worldwidevapor.com/shop?x=1",
			host: "www.worldwidevapor.com",
		});
		expect(ok("https://pr-12.staging.worldwidevapor.com/")).toMatchObject({ ok: true });
	});

	it("refuses other hosts, lookalikes and the bare wildcard domain", () => {
		for (const url of [
			"https://evil.example.com/",
			"https://www.worldwidevapor.com.evil.com/",
			"https://worldwidevapor.com/",
			"https://staging.worldwidevapor.com/",
			"https://notstaging.worldwidevapor.com/",
		])
			expect(ok(url), url).toMatchObject({ ok: false });
	});

	it("refuses anything that isn't plain https", () => {
		for (const url of [
			"http://www.worldwidevapor.com/",
			"ftp://www.worldwidevapor.com/",
			"file:///etc/passwd",
			"javascript:alert(1)",
			"https://user:pw@www.worldwidevapor.com/",
			"https://www.worldwidevapor.com:8443/",
		])
			expect(ok(url), url).toMatchObject({ ok: false });
	});

	it("refuses IP addresses and local or internal hosts, even if someone put them on the list", () => {
		const list = ["127.0.0.1", "localhost", "metadata.internal", "printer.local", "[::1]", "169.254.169.254"];
		for (const host of list)
			for (const url of [`https://${host}/`, `https://${host}:443/`])
				expect(validateTargetUrl(url, list), url).toMatchObject({ ok: false });
	});

	it("refuses things that aren't addresses", () => {
		for (const value of [
			"",
			"not a url",
			42,
			null,
			undefined,
			`https://www.worldwidevapor.com/${"a".repeat(2100)}`,
		])
			expect(ok(value)).toMatchObject({ ok: false });
	});
});

describe("job specs", () => {
	const base = () => ({
		type: "site.inspect",
		sessionId: sessionId(),
		urls: ["https://www.worldwidevapor.com/", "https://www.worldwidevapor.com/shop"],
	});

	it("accepts a job and defaults to both widths", () => {
		const result = validateJobSpec(base(), { allowedHosts: ALLOWED });
		expect(result).toMatchObject({
			ok: true,
			value: { type: "site.inspect", viewports: ["desktop", "mobile"] },
		});
	});

	it("refuses an unknown job type, a bad session id, too many pages, and unknown widths", () => {
		const opts = { allowedHosts: ALLOWED };
		expect(validateJobSpec({ ...base(), type: "files.read" }, opts)).toMatchObject({ ok: false });
		expect(validateJobSpec({ ...base(), type: "shell" }, opts)).toMatchObject({ ok: false });
		expect(validateJobSpec({ ...base(), sessionId: "abc" }, opts)).toMatchObject({ ok: false });
		expect(validateJobSpec({ ...base(), urls: [] }, opts)).toMatchObject({ ok: false });
		expect(
			validateJobSpec(
				{
					...base(),
					urls: Array.from({ length: LIMITS.maxPages + 1 }, (_, i) => `https://www.worldwidevapor.com/${i}`),
				},
				opts,
			),
		).toMatchObject({ ok: false });
		expect(validateJobSpec({ ...base(), viewports: ["tablet"] }, opts)).toMatchObject({ ok: false });
		expect(validateJobSpec(null, opts)).toMatchObject({ ok: false });
	});

	it("refuses a job when any page is not allowed, naming why", () => {
		const result = validateJobSpec(
			{ ...base(), urls: ["https://www.worldwidevapor.com/", "https://evil.example.com/"] },
			{ allowedHosts: ALLOWED },
		);
		expect(result).toMatchObject({ ok: false });
		expect(JSON.stringify(result)).toMatch(/evil\.example\.com/);
	});

	it("de-duplicates pages", () => {
		const result = validateJobSpec(
			{ ...base(), urls: ["https://www.worldwidevapor.com/", "https://www.worldwidevapor.com/#a"] },
			{ allowedHosts: ALLOWED },
		);
		expect(result.ok && result.value.urls).toEqual(["https://www.worldwidevapor.com/"]);
	});
});

describe("request signing", () => {
	const request = { method: "POST", path: "/jobs", body: '{"a":1}', timestamp: Date.now() };

	it("accepts a request signed with the secret", () => {
		const signature = signRequest(SECRET, request);
		expect(verifyRequest(SECRET, { ...request, timestamp: String(request.timestamp), signature })).toEqual({
			ok: true,
		});
	});

	it("refuses a changed body, path, method, secret or timestamp", () => {
		const signature = signRequest(SECRET, request);
		const check = (over) =>
			verifyRequest(SECRET, { ...request, timestamp: String(request.timestamp), signature, ...over });
		expect(check({ body: '{"a":2}' })).toMatchObject({ ok: false });
		expect(check({ path: "/jobs?x=1" })).toMatchObject({ ok: false });
		expect(check({ method: "GET" })).toMatchObject({ ok: false });
		expect(check({ timestamp: String(request.timestamp + 1) })).toMatchObject({ ok: false });
		expect(
			verifyRequest("y".repeat(40), { ...request, timestamp: String(request.timestamp), signature }),
		).toMatchObject({ ok: false });
	});

	it("refuses a stale or future request, a missing or malformed signature, and an unconfigured secret", () => {
		const signature = signRequest(SECRET, request);
		const at = (now) =>
			verifyRequest(SECRET, { ...request, timestamp: String(request.timestamp), signature }, now);
		expect(at(request.timestamp + MAX_SKEW_MS + 1)).toMatchObject({ ok: false });
		expect(at(request.timestamp - MAX_SKEW_MS - 1)).toMatchObject({ ok: false });
		expect(at(request.timestamp + 1000)).toEqual({ ok: true });
		expect(
			verifyRequest(SECRET, { ...request, timestamp: String(request.timestamp), signature: undefined }),
		).toMatchObject({ ok: false });
		expect(
			verifyRequest(SECRET, { ...request, timestamp: String(request.timestamp), signature: "nope" }),
		).toMatchObject({ ok: false });
		expect(verifyRequest(SECRET, { ...request, timestamp: undefined, signature })).toMatchObject({
			ok: false,
		});
		expect(verifyRequest("", { ...request, timestamp: String(request.timestamp), signature })).toMatchObject({
			ok: false,
		});
	});
});

describe("reading OpenClaw's output", () => {
	it("finds a screenshot path in JSON, nested JSON, or plain text", () => {
		expect(findScreenshotPath('{"path":"/home/oc/.openclaw/media/a.png"}')).toBe(
			"/home/oc/.openclaw/media/a.png",
		);
		expect(findScreenshotPath('{"ok":true,"result":{"file":"/tmp/x/shot.jpg"}}')).toBe("/tmp/x/shot.jpg");
		expect(findScreenshotPath("/home/oc/.openclaw/media/browser/1.png\n")).toBe(
			"/home/oc/.openclaw/media/browser/1.png",
		);
		expect(findScreenshotPath("Saved: /srv/media/2.webp")).toBe("/srv/media/2.webp");
		expect(findScreenshotPath("C:\\Users\\oc\\media\\3.png")).toBe("C:\\Users\\oc\\media\\3.png");
	});

	it("says there is none rather than guessing", () => {
		expect(findScreenshotPath("")).toBeNull();
		expect(findScreenshotPath('{"ok":true}')).toBeNull();
		expect(findScreenshotPath("screenshot taken")).toBeNull();
		expect(findScreenshotPath('{"path":"relative/shot.png"}')).toBeNull();
		expect(findScreenshotPath('{"path":"/etc/passwd"}')).toBeNull();
	});

	it("reads JSON after log lines and survives junk", () => {
		expect(parseJson('starting…\n{"a":1}')).toEqual({ a: 1 });
		expect(parseJson("")).toBeNull();
		expect(parseJson("no json")).toBeNull();
	});

	it("reads console and page messages from arrays or wrapped lists, trimmed and capped", () => {
		expect(readMessages('[{"text":"Failed to load"},"plain"]')).toEqual([
			{ text: "Failed to load" },
			{ text: "plain" },
		]);
		expect(readMessages('{"messages":[{"message":"boom"}]}')).toEqual([{ text: "boom" }]);
		expect(readMessages("garbage")).toEqual([]);
		expect(
			readMessages(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ text: `e${i}` })))),
		).toHaveLength(LIMITS.maxEntriesPerList);
		expect(readMessages(JSON.stringify([{ text: "x".repeat(1000) }]))[0].text).toHaveLength(300);
	});

	it("keeps only failed requests", () => {
		const out = readFailedRequests(
			JSON.stringify({
				requests: [
					{ url: "https://a/ok.js", status: 200 },
					{ url: "https://a/missing.png", status: 404 },
					{ url: "https://a/api", status: 503 },
					{ url: "https://a/blocked", failed: true },
					{ status: 500 },
				],
			}),
		);
		expect(out).toEqual([
			{ url: "https://a/missing.png", status: 404 },
			{ url: "https://a/api", status: 503 },
			{ url: "https://a/blocked", status: null },
		]);
	});

	it("reads a page title when there is one", () => {
		expect(readTitle('{"title":"Worldwide Vapor"}')).toBe("Worldwide Vapor");
		expect(readTitle('{"tab":{"title":"Shop"}}')).toBe("Shop");
		expect(readTitle("{}")).toBeNull();
	});
});

describe("findings", () => {
	const viewport = (over = {}) => ({
		viewport: "mobile",
		title: "T",
		consoleErrors: [],
		pageErrors: [],
		failedRequests: [],
		...over,
	});

	it("raises none for a clean page", () => {
		expect(deriveFindings([{ url: "https://a/", viewports: [viewport()] }])).toEqual([]);
	});

	it("rates page errors and server errors high, many console errors medium, and says where", () => {
		const out = deriveFindings([
			{
				url: "https://a/",
				viewports: [
					viewport({
						pageErrors: [{ text: "TypeError" }],
						consoleErrors: Array.from({ length: 5 }, () => ({ text: "x" })),
						failedRequests: [
							{ url: "https://a/api", status: 502 },
							{ url: "https://a/img.png", status: 404 },
						],
					}),
				],
			},
		]);
		expect(out.map((f) => f.severity).sort()).toEqual(["high", "high", "medium", "medium"]);
		expect(out.every((f) => f.url === "https://a/" && f.viewport === "mobile")).toBe(true);
	});

	it("notes a missing title", () => {
		expect(deriveFindings([{ url: "https://a/", viewports: [viewport({ title: "" })] }])).toEqual([
			expect.objectContaining({ severity: "low", title: expect.stringMatching(/no title/) }),
		]);
		expect(deriveFindings([{ url: "https://a/", viewports: [viewport({ title: undefined })] }])).toEqual([]);
	});
});

describe("the runner", () => {
	let dir;
	let media;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "oc-runner-"));
		media = join(dir, "media");
		await mkdir(media, { recursive: true });
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	const job = (over = {}) => ({
		runId: "run_" + randomUUID(),
		spec: {
			sessionId: sessionId(),
			urls: ["https://www.worldwidevapor.com/"],
			viewports: ["desktop", "mobile"],
			...over,
		},
	});

	/** A pretend OpenClaw: records every command and answers like the CLI documents. */
	function fakeExec(handlers = {}) {
		const calls = [];
		let n = 0;
		const exec = async (bin, args) => {
			calls.push([bin, ...args]);
			const sub = args[4];
			if (handlers[sub]) return handlers[sub](args);
			switch (sub) {
				case "screenshot": {
					const file = join(media, `shot-${++n}.png`);
					await writeFile(file, Buffer.concat([png, Buffer.from(String(n))]));
					return { stdout: JSON.stringify({ path: file }), stderr: "" };
				}
				case "open":
					return { stdout: JSON.stringify({ title: "Worldwide Vapor" }), stderr: "" };
				case "console":
				case "errors":
				case "requests":
					return { stdout: "[]", stderr: "" };
				default:
					return { stdout: "{}", stderr: "" };
			}
		};
		return { exec, calls };
	}

	it("inspects each page at each width with fixed commands, no shell, and saves hashed screenshots", async () => {
		const { exec, calls } = fakeExec();
		const runner = createRunner({ exec, profile: "inspector", mediaDirs: [media] });
		const j = job();
		const result = await runner.inspect(j, join(dir, "job"));

		expect(validateResult(result, j.spec)).toEqual({ ok: true });
		expect(result).toMatchObject({ type: "site.inspect", runId: j.runId, sessionId: j.spec.sessionId });
		expect(result.pages[0].viewports.map((v) => [v.viewport, v.width, v.height])).toEqual([
			["desktop", 1440, 900],
			["mobile", 390, 844],
		]);
		const shot = result.pages[0].viewports[0].screenshot;
		expect(shot.file).toBe("1-desktop.png");
		const stored = await readFile(join(dir, "job", "screenshots", shot.file));
		expect(sha(stored)).toBe(shot.sha256);
		expect(stored.length).toBe(shot.bytes);

		// Only the documented browser commands, always on the dedicated profile, always JSON, never anything else.
		for (const call of calls) {
			expect(call.slice(0, 5)).toEqual(["openclaw", "browser", "--browser-profile", "inspector", "--json"]);
			expect([
				"start",
				"resize",
				"open",
				"screenshot",
				"console",
				"errors",
				"requests",
				"close",
				"stop",
			]).toContain(call[5]);
		}
		expect(calls.map((c) => c[5])).toEqual([
			"start",
			"resize",
			"open",
			"screenshot",
			"console",
			"errors",
			"requests",
			"close",
			"resize",
			"open",
			"screenshot",
			"console",
			"errors",
			"requests",
			"close",
			"stop",
		]);
		expect(calls.find((c) => c[5] === "open")).toEqual(
			[
				"openclaw",
				"browser",
				"--browser-profile",
				"inspector",
				"--json",
				"open",
				"https://www.worldwidevapor.com/",
				...[],
			].slice(0, 7),
		);
	});

	it("turns what the browser reported into findings", async () => {
		const { exec } = fakeExec({
			console: async () => ({
				stdout: JSON.stringify([{ text: "Uncaught ReferenceError: x is not defined" }]),
				stderr: "",
			}),
			requests: async () => ({
				stdout: JSON.stringify([{ url: "https://www.worldwidevapor.com/api/x", status: 500 }]),
				stderr: "",
			}),
		});
		const result = await createRunner({ exec, profile: "p", mediaDirs: [media] }).inspect(
			job({ viewports: ["mobile"] }),
			join(dir, "job"),
		);
		expect(result.findings.map((f) => f.severity).sort()).toEqual(["high", "low"]);
	});

	it("fails, rather than filling in, when OpenClaw doesn't say where the screenshot is", async () => {
		const { exec } = fakeExec({ screenshot: async () => ({ stdout: "{}", stderr: "" }) });
		await expect(
			createRunner({ exec, profile: "p", mediaDirs: [media] }).inspect(job(), join(dir, "job")),
		).rejects.toMatchObject({ kind: "failed" });
	});

	it("refuses a screenshot saved outside the folders it may read, including by a path trick", async () => {
		const outside = join(dir, "secret.png");
		await writeFile(outside, png);
		for (const reported of [outside, join(media, "..", "secret.png")]) {
			const { exec } = fakeExec({
				screenshot: async () => ({ stdout: JSON.stringify({ path: reported }), stderr: "" }),
			});
			await expect(
				createRunner({ exec, profile: "p", mediaDirs: [media] }).inspect(job(), join(dir, "job")),
			).rejects.toThrow(/outside the folders|doesn't exist/);
		}
	});

	it("fails when a command fails, and times out when the deadline passes or a command hangs", async () => {
		const failing = fakeExec({
			open: async () => Promise.reject(Object.assign(new Error("exit 1"), { code: 1 })),
		});
		await expect(
			createRunner({ exec: failing.exec, profile: "p", mediaDirs: [media] }).inspect(job(), join(dir, "job")),
		).rejects.toMatchObject({ kind: "failed" });

		const hanging = fakeExec({
			open: async () => Promise.reject(Object.assign(new Error("Command failed"), { killed: true })),
		});
		await expect(
			createRunner({ exec: hanging.exec, profile: "p", mediaDirs: [media] }).inspect(job(), join(dir, "job")),
		).rejects.toMatchObject({ kind: "timed_out" });

		let clock = 1_000_000;
		const slow = fakeExec();
		const runner = createRunner({
			exec: async (...args) => {
				clock += (LIMITS.maxSeconds / 4) * 1000;
				return slow.exec(...args);
			},
			profile: "p",
			mediaDirs: [media],
			now: () => clock,
		});
		await expect(runner.inspect(job(), join(dir, "job"))).rejects.toMatchObject({ kind: "timed_out" });
	});

	it("stops the browser even when the job fails", async () => {
		const { exec, calls } = fakeExec({ open: async () => Promise.reject(new Error("no")) });
		await createRunner({ exec, profile: "p", mediaDirs: [media] })
			.inspect(job(), join(dir, "job"))
			.catch(() => undefined);
		expect(calls.at(-1)[5]).toBe("stop");
	});

	it("says when a diagnostic couldn't be read instead of reporting no errors", async () => {
		const { exec } = fakeExec({ console: async () => Promise.reject(new Error("unsupported")) });
		const result = await createRunner({ exec, profile: "p", mediaDirs: [media] }).inspect(
			job({ viewports: ["desktop"] }),
			join(dir, "job"),
		);
		expect(result.pages[0].viewports[0].diagnostics).toEqual({
			console: false,
			pageErrors: true,
			requests: true,
		});
		expect(result.findings[0]).toMatchObject({
			title: expect.stringMatching(/diagnostics couldn't be read/),
			detail: expect.stringMatching(/not confirmed/),
		});
	});
});

describe("the adapter service", () => {
	let dir;
	let adapter;
	let base;

	const fakeResult = (spec, runId) => ({
		type: "site.inspect",
		sessionId: spec.sessionId,
		runId,
		pages: spec.urls.map((url, i) => ({
			url,
			viewports: spec.viewports.map((viewport) => ({
				viewport,
				screenshot: { file: `${i + 1}-${viewport}.png`, sha256: sha(png), bytes: png.length },
				consoleErrors: [],
				pageErrors: [],
				failedRequests: [],
			})),
		})),
		findings: [],
	});

	async function start(runner) {
		dir = await mkdtemp(join(tmpdir(), "oc-adapter-"));
		adapter = createAdapter({ secret: SECRET, allowedHosts: ALLOWED, jobsDir: join(dir, "jobs"), runner });
		await adapter.recover();
		const address = await adapter.listen(0, "127.0.0.1");
		base = `http://127.0.0.1:${address.port}`;
	}
	const call = async (method, path, body, { sign = true, secret = SECRET } = {}) => {
		const text = body === undefined ? "" : JSON.stringify(body);
		const timestamp = Date.now();
		const headers = sign
			? {
					[HEADER_TIMESTAMP]: String(timestamp),
					[HEADER_SIGNATURE]: signRequest(secret, { method, path, body: text, timestamp }),
				}
			: {};
		const response = await fetch(`${base}${path}`, {
			method,
			headers: { ...headers, ...(text ? { "Content-Type": "application/json" } : {}) },
			body: text || undefined,
		});
		const type = response.headers.get("content-type") ?? "";
		return {
			status: response.status,
			body: type.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer()),
			type,
		};
	};
	afterEach(async () => {
		await adapter?.close();
		await rm(dir, { recursive: true, force: true });
	});

	const okRunner = () => ({
		inspect: async (job, jobDir) => {
			await mkdir(join(jobDir, "screenshots"), { recursive: true });
			for (const [i] of job.spec.urls.entries())
				for (const viewport of job.spec.viewports)
					await writeFile(join(jobDir, "screenshots", `${i + 1}-${viewport}.png`), png);
			return fakeResult(job.spec, job.runId);
		},
	});
	const spec = () => ({
		type: "site.inspect",
		sessionId: sessionId(),
		urls: ["https://www.worldwidevapor.com/"],
	});

	it("answers only signed requests", async () => {
		await start(okRunner());
		expect((await call("GET", "/health", undefined, { sign: false })).status).toBe(401);
		expect((await call("GET", "/health", undefined, { secret: "z".repeat(40) })).status).toBe(401);
		expect((await call("POST", "/jobs", spec(), { sign: false })).status).toBe(401);
		const health = await call("GET", "/health");
		expect(health.status).toBe(200);
		expect(health.body).toMatchObject({ ok: true, version: "1" });
	});

	it("runs a job, keeps its run id, and serves the result and screenshots", async () => {
		await start(okRunner());
		const s = spec();
		const created = await call("POST", "/jobs", s);
		expect(created.status).toBe(202);
		expect(created.body.runId).toMatch(/^run_[0-9a-f-]{36}$/);
		expect(created.body.sessionId).toBe(s.sessionId);
		await adapter.idle();

		const done = await call("GET", `/jobs/${created.body.runId}`);
		expect(done.body).toMatchObject({ runId: created.body.runId, state: "succeeded", error: null });
		expect(done.body.result.runId).toBe(created.body.runId);
		const file = await call("GET", `/jobs/${created.body.runId}/files/1-desktop.png`);
		expect(file.status).toBe(200);
		expect(file.type).toBe("image/png");
		expect(sha(file.body)).toBe(sha(png));
	});

	it("returns the same job for the same session id, and finds a run by session id", async () => {
		await start(okRunner());
		const s = spec();
		const first = await call("POST", "/jobs", s);
		const again = await call("POST", "/jobs", s);
		expect(again.status).toBe(200);
		expect(again.body.runId).toBe(first.body.runId);
		expect(adapter.jobs.size).toBe(1);
		await adapter.idle();
		const found = await call("GET", `/jobs?sessionId=${s.sessionId}`);
		expect(found.body.runId).toBe(first.body.runId);
		expect((await call("GET", `/jobs?sessionId=${sessionId()}`)).status).toBe(404);
	});

	it("refuses jobs that aren't allowed, with reasons", async () => {
		await start(okRunner());
		const bad = await call("POST", "/jobs", { ...spec(), urls: ["https://evil.example.com/"] });
		expect(bad.status).toBe(422);
		expect(JSON.stringify(bad.body)).toMatch(/evil\.example\.com/);
		expect((await call("POST", "/jobs", { ...spec(), type: "shell" })).status).toBe(422);
		expect(adapter.jobs.size).toBe(0);
	});

	it("marks a job failed, with the reason, when the runner fails or times out", async () => {
		await start({
			inspect: async () => Promise.reject(new RunnerError("failed", 'OpenClaw\'s "open" command failed.')),
		});
		const failed = await call("POST", "/jobs", spec());
		await adapter.idle();
		expect((await call("GET", `/jobs/${failed.body.runId}`)).body).toMatchObject({
			state: "failed",
			error: 'OpenClaw\'s "open" command failed.',
			result: null,
		});

		await adapter.close();
		await rm(dir, { recursive: true, force: true });
		await start({ inspect: async () => Promise.reject(new RunnerError("timed_out", "Too slow.")) });
		const slow = await call("POST", "/jobs", spec());
		await adapter.idle();
		expect((await call("GET", `/jobs/${slow.body.runId}`)).body).toMatchObject({ state: "timed_out" });
	});

	it("fails a job whose result doesn't match what was asked for, instead of accepting part of it", async () => {
		await start({ inspect: async (job) => ({ ...fakeResult(job.spec, job.runId), pages: [] }) });
		const created = await call("POST", "/jobs", spec());
		await adapter.idle();
		const job = (await call("GET", `/jobs/${created.body.runId}`)).body;
		expect(job.state).toBe("failed");
		expect(job.error).toMatch(/didn't match what was asked for/);
		expect(job.result).toBeNull();
	});

	it("runs jobs one at a time", async () => {
		let active = 0;
		let peak = 0;
		await start({
			inspect: async (job) => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise((r) => setTimeout(r, 30));
				active -= 1;
				return fakeResult(job.spec, job.runId);
			},
		});
		await Promise.all([
			call("POST", "/jobs", spec()),
			call("POST", "/jobs", spec()),
			call("POST", "/jobs", spec()),
		]);
		await adapter.idle();
		expect(peak).toBe(1);
		expect([...adapter.jobs.values()].map((j) => j.state)).toEqual(["succeeded", "succeeded", "succeeded"]);
	});

	it("won't serve files that aren't screenshots of that run, or leave the job folder", async () => {
		await start(okRunner());
		const created = await call("POST", "/jobs", spec());
		await adapter.idle();
		const id = created.body.runId;
		for (const name of ["job.json", "..%2Fjob.json", "..%2F..%2Fother", "2-desktop.png", "UPPER.PNG"])
			expect((await call("GET", `/jobs/${id}/files/${name}`)).status, name).toBe(404);
		expect((await call("GET", `/jobs/run_${randomUUID()}/files/1-desktop.png`)).status).toBe(404);
	});

	it("keeps jobs across a restart, and marks one that was running as unknown", async () => {
		await start(okRunner());
		const done = await call("POST", "/jobs", spec());
		await adapter.idle();
		const mid = (await call("POST", "/jobs", { ...spec(), urls: ["https://www.worldwidevapor.com/shop"] }))
			.body;
		await adapter.idle();
		await adapter.close();

		// Pretend the second job was in the middle of running when the host went down.
		const jobFile = join(dir, "jobs", mid.runId, "job.json");
		const record = JSON.parse(await readFile(jobFile, "utf8"));
		await writeFile(jobFile, JSON.stringify({ ...record, state: "running", result: null, finishedAt: null }));

		adapter = createAdapter({
			secret: SECRET,
			allowedHosts: ALLOWED,
			jobsDir: join(dir, "jobs"),
			runner: okRunner(),
		});
		await adapter.recover();
		const address = await adapter.listen(0, "127.0.0.1");
		base = `http://127.0.0.1:${address.port}`;
		expect((await call("GET", `/jobs/${done.body.runId}`)).body).toMatchObject({ state: "succeeded" });
		const after = (await call("GET", `/jobs/${mid.runId}`)).body;
		expect(after.state).toBe("unknown");
		expect(after.error).toMatch(/restarted while this job was running/);
		expect(after.result).toBeNull();
	});

	it("rejects an oversized or invalid body", async () => {
		await start(okRunner());
		const big = await call("POST", "/jobs", { pad: "x".repeat(30_000) });
		expect(big.status).toBe(413);
		const text = "not json";
		const timestamp = Date.now();
		const response = await fetch(`${base}/jobs`, {
			method: "POST",
			headers: {
				[HEADER_TIMESTAMP]: String(timestamp),
				[HEADER_SIGNATURE]: signRequest(SECRET, { method: "POST", path: "/jobs", body: text, timestamp }),
			},
			body: text,
		});
		expect(response.status).toBe(400);
	});
});

describe("file names", () => {
	it("allows plain image names only", () => {
		for (const ok of ["1-desktop.png", "2-mobile.jpg", "a_b-c.webp"])
			expect(FILE_NAME.test(ok), ok).toBe(true);
		for (const bad of [
			"../x.png",
			"a/b.png",
			"x.exe",
			"x.png.exe",
			".png",
			"UP.png",
			"a b.png",
			`${"a".repeat(90)}.png`,
		])
			expect(FILE_NAME.test(bad), bad).toBe(false);
	});
});

describe("result validation", () => {
	const s = { sessionId: "wai-x", urls: ["https://a/"], viewports: ["desktop"] };
	const good = () => ({
		type: "site.inspect",
		sessionId: "wai-x",
		pages: [
			{
				url: "https://a/",
				viewports: [
					{ viewport: "desktop", screenshot: { file: "1-desktop.png", sha256: "a".repeat(64), bytes: 10 } },
				],
			},
		],
		findings: [],
	});

	it("accepts a complete result", () => expect(validateResult(good(), s)).toEqual({ ok: true }));

	it("refuses missing pages or widths, bad screenshots, a different session, and malformed findings", () => {
		const bad = (mutate) => {
			const r = good();
			mutate(r);
			return validateResult(r, s);
		};
		expect(bad((r) => (r.pages = []))).toMatchObject({ ok: false });
		expect(bad((r) => (r.pages[0].viewports = []))).toMatchObject({ ok: false });
		expect(bad((r) => (r.pages[0].viewports[0].screenshot.file = "../x.png"))).toMatchObject({ ok: false });
		expect(bad((r) => (r.pages[0].viewports[0].screenshot.sha256 = "short"))).toMatchObject({ ok: false });
		expect(
			bad((r) => (r.pages[0].viewports[0].screenshot.bytes = LIMITS.maxScreenshotBytes + 1)),
		).toMatchObject({ ok: false });
		expect(bad((r) => (r.sessionId = "wai-other"))).toMatchObject({ ok: false });
		expect(bad((r) => (r.findings = [{ severity: "urgent", title: 1 }]))).toMatchObject({ ok: false });
		expect(validateResult(null, s)).toMatchObject({ ok: false });
	});
});
