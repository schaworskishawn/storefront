import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HEADER_SIGNATURE, HEADER_TIMESTAMP, verifyRequest } from "./auth.mjs";
import { FILE_NAME, LIMITS, validateJobSpec, validateResult } from "./job-spec.mjs";
import { RunnerError } from "./runner.mjs";

/**
 * The adapter: the only thing on the OpenClaw host the storefront talks to. It accepts signed requests for one kind of job,
 * validates it again against its own allowed-hosts list, keeps a record of every job on disk (so a restart loses nothing),
 * runs jobs one at a time, and hands back the run id, the result and the screenshots. It never passes anything on to
 * OpenClaw except the fixed browser commands in runner.mjs.
 *
 * Idempotent: the storefront's session id identifies a job, so asking again with the same session id returns the job already
 * made instead of making a second. That is also how the storefront finds a run after a network timeout.
 */

const JOB_STATES = ["queued", "running", "succeeded", "failed", "timed_out", "unknown"];

/**
 * @typedef {{
 *   runId: string, sessionId: string, state: string, spec: any,
 *   createdAt: string, startedAt: string | null, finishedAt: string | null,
 *   result: any | null, error: string | null
 * }} Job
 */

/**
 * @param {{
 *   secret: string,
 *   allowedHosts: string[],
 *   jobsDir: string,
 *   runner: { inspect: (job: Job, jobDir: string) => Promise<any> },
 *   now?: () => number,
 *   version?: string,
 *   healthCheck?: () => Promise<{ ok: boolean, detail: string }>,
 * }} options
 */
export function createAdapter({
	secret,
	allowedHosts,
	jobsDir,
	runner,
	now = Date.now,
	version = "1",
	healthCheck,
}) {
	/** @type {Map<string, Job>} */
	const jobs = new Map();
	/** @type {string[]} */
	const queue = [];
	let working = false;
	let stopped = false;

	const jobDir = (runId) => join(jobsDir, runId);

	async function persist(job) {
		await mkdir(jobDir(job.runId), { recursive: true });
		const file = join(jobDir(job.runId), "job.json");
		await writeFile(`${file}.tmp`, JSON.stringify(job, null, 2));
		await rename(`${file}.tmp`, file);
	}

	/** Loads jobs written before a restart. A job that was running then can't be trusted to have finished: it becomes "unknown". */
	async function recover() {
		await mkdir(jobsDir, { recursive: true });
		for (const entry of await readdir(jobsDir)) {
			let job;
			try {
				job = JSON.parse(await readFile(join(jobsDir, entry, "job.json"), "utf8"));
			} catch {
				continue;
			}
			if (!job?.runId || !JOB_STATES.includes(job.state)) continue;
			if (job.state === "running") {
				job.state = "unknown";
				job.error =
					"The adapter restarted while this job was running, so the result can't be trusted. Start a new inspection.";
				job.finishedAt = new Date(now()).toISOString();
				await persist(job);
			}
			jobs.set(job.runId, job);
			if (job.state === "queued") queue.push(job.runId);
		}
		void drain();
	}

	async function drain() {
		if (working || stopped) return;
		working = true;
		try {
			while (queue.length && !stopped) {
				const job = jobs.get(/** @type {string} */ (queue.shift()));
				if (!job || job.state !== "queued") continue;
				job.state = "running";
				job.startedAt = new Date(now()).toISOString();
				await persist(job);
				try {
					const result = await runner.inspect(job, jobDir(job.runId));
					const checked = validateResult(result, job.spec);
					if (checked.ok) {
						job.result = result;
						job.state = "succeeded";
					} else {
						job.state = "failed";
						job.error = `The result didn't match what was asked for: ${checked.errors.join(" ")}`;
					}
				} catch (error) {
					const timedOut = error instanceof RunnerError && error.kind === "timed_out";
					job.state = timedOut ? "timed_out" : "failed";
					job.error = error instanceof RunnerError ? error.message : "The inspection failed.";
					if (!(error instanceof RunnerError)) console.error("[adapter] job failed", job.runId, error);
				}
				job.finishedAt = new Date(now()).toISOString();
				await persist(job);
			}
		} finally {
			working = false;
		}
	}

	const publicJob = (job) => ({
		runId: job.runId,
		sessionId: job.sessionId,
		state: job.state,
		createdAt: job.createdAt,
		startedAt: job.startedAt,
		finishedAt: job.finishedAt,
		result: job.result,
		error: job.error,
	});

	const send = (res, status, body, headers = {}) => {
		const text = typeof body === "string" ? body : JSON.stringify(body);
		res.writeHead(status, {
			"Content-Type": typeof body === "string" ? "text/plain" : "application/json",
			"Cache-Control": "no-store",
			...headers,
		});
		res.end(text);
	};

	async function readBody(req) {
		const chunks = [];
		let size = 0;
		for await (const chunk of req) {
			size += chunk.length;
			if (size > 20_000) throw Object.assign(new Error("Request body too large."), { status: 413 });
			chunks.push(chunk);
		}
		return Buffer.concat(chunks).toString("utf8");
	}

	async function handle(req, res) {
		try {
			const url = new URL(req.url ?? "/", "http://adapter");
			const path = `${url.pathname}${url.search}`;
			const body = req.method === "POST" ? await readBody(req) : "";
			const auth = verifyRequest(secret, {
				method: req.method ?? "GET",
				path,
				body,
				timestamp: String(req.headers[HEADER_TIMESTAMP] ?? ""),
				signature: String(req.headers[HEADER_SIGNATURE] ?? ""),
			});
			if (!auth.ok) return send(res, 401, { error: auth.reason });

			if (req.method === "GET" && url.pathname === "/health") {
				const checked = healthCheck
					? await healthCheck().catch(() => ({ ok: false, detail: "The health check itself failed." }))
					: { ok: true, detail: "No browser check configured." };
				return send(res, 200, {
					ok: checked.ok,
					detail: checked.detail,
					version,
					queued: queue.length,
					running: [...jobs.values()].filter((j) => j.state === "running").length,
				});
			}

			if (req.method === "POST" && url.pathname === "/jobs") {
				let parsed;
				try {
					parsed = JSON.parse(body || "{}");
				} catch {
					return send(res, 400, { error: "The body isn't JSON." });
				}
				const spec = validateJobSpec(parsed, { allowedHosts });
				if (!spec.ok) return send(res, 422, { error: "The job isn't allowed.", reasons: spec.errors });
				const existing = [...jobs.values()].find((j) => j.sessionId === spec.value.sessionId);
				if (existing) return send(res, 200, publicJob(existing));
				/** @type {Job} */
				const job = {
					runId: `run_${randomUUID()}`,
					sessionId: spec.value.sessionId,
					state: "queued",
					spec: spec.value,
					createdAt: new Date(now()).toISOString(),
					startedAt: null,
					finishedAt: null,
					result: null,
					error: null,
				};
				jobs.set(job.runId, job);
				await persist(job);
				queue.push(job.runId);
				void drain();
				return send(res, 202, publicJob(job));
			}

			if (req.method === "GET" && url.pathname === "/jobs") {
				const sessionId = url.searchParams.get("sessionId");
				const found = sessionId ? [...jobs.values()].find((j) => j.sessionId === sessionId) : undefined;
				return found
					? send(res, 200, publicJob(found))
					: send(res, 404, { error: "No job for that session." });
			}

			const file = /^\/jobs\/(run_[0-9a-f-]{36})\/files\/([^/]+)$/.exec(url.pathname);
			if (req.method === "GET" && file) {
				const job = jobs.get(file[1]);
				const name = decodeURIComponent(file[2]);
				const listed = job?.result?.pages?.some((/** @type {any} */ p) =>
					p.viewports.some((/** @type {any} */ v) => v.screenshot?.file === name),
				);
				if (!job || !FILE_NAME.test(name) || !listed) return send(res, 404, { error: "No such file." });
				try {
					const bytes = await readFile(join(jobDir(job.runId), "screenshots", name));
					res.writeHead(200, {
						"Content-Type": name.endsWith(".png")
							? "image/png"
							: name.endsWith(".webp")
								? "image/webp"
								: "image/jpeg",
						"Content-Length": bytes.length,
						"Cache-Control": "no-store",
					});
					return res.end(bytes);
				} catch {
					return send(res, 404, { error: "The file is gone." });
				}
			}

			const one = /^\/jobs\/(run_[0-9a-f-]{36})$/.exec(url.pathname);
			if (req.method === "GET" && one) {
				const job = jobs.get(one[1]);
				return job ? send(res, 200, publicJob(job)) : send(res, 404, { error: "No such run." });
			}
			return send(res, 404, { error: "Not found." });
		} catch (error) {
			const status = /** @type {any} */ (error)?.status ?? 500;
			if (status === 500) console.error("[adapter] request failed", error);
			return send(res, status, {
				error: status === 500 ? "Something went wrong." : /** @type {Error} */ (error).message,
			});
		}
	}

	const server = createServer((req, res) => void handle(req, res));
	return {
		server,
		jobs,
		recover,
		/** @param {number} port @param {string} host */
		listen: (port, host) =>
			new Promise((resolve) =>
				server.listen(port, host, () =>
					resolve(/** @type {import("node:net").AddressInfo} */ (server.address())),
				),
			),
		close: async () => {
			stopped = true;
			await new Promise((resolve) => server.close(() => resolve(undefined)));
		},
		/** Resolves when no job is queued or running (for tests). */
		idle: async () => {
			while (working || queue.length) await new Promise((r) => setTimeout(r, 10));
		},
		limits: LIMITS,
	};
}
