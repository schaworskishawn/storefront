import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdapter } from "../../../../openclaw-host/server.mjs";
import { updateRoleSettings } from "../agents/settings";
import type { SqlClient } from "../db/sql";
import { listFindings } from "../findings";
import { ConnectorError, createAdapterConnector, type OpenClawConnector } from "../openclaw/connector";
import { getRunForTask } from "../openclaw/runs";
import { createFolderStorage, type FileStorage } from "../storage/files";
import { getTask, getTaskEvents, transitionTask } from "../tasks/repo";
import { freshDb, owner, staff, workflowDeps } from "../testing.test-util";
import type { WorkflowDeps } from "./types";
import { INSPECTION_KIND, requestSiteInspection, runSiteInspection } from "./inspection";

const SECRET = "s".repeat(40);
const HOSTS = "www.worldwidevapor.com,*.staging.worldwidevapor.com";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const shot = (label: string) => Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(label)]);

type Behavior = {
	/** Wait for this before answering (to hold a job "running"). */
	hold?: Promise<void>;
	findings?: Array<{
		severity: string;
		title: string;
		detail: string;
		url: string;
		viewport: string;
		category: string;
	}>;
	tamperSha?: boolean;
	wrongRunId?: boolean;
	fail?: Error;
};

let sql: SqlClient;
let dir: string;
let adapter: ReturnType<typeof createAdapter>;
let base: string;
let behavior: Behavior;

beforeAll(async () => {
	sql = await freshDb();
}, 60_000);
afterAll(async () => {
	await sql.close();
});

beforeEach(async () => {
	behavior = {};
	dir = await mkdtemp(join(tmpdir(), "wai-inspect-"));
	adapter = createAdapter({
		secret: SECRET,
		allowedHosts: HOSTS.split(","),
		jobsDir: join(dir, "jobs"),
		runner: {
			inspect: async (
				job: { runId: string; spec: { sessionId: string; urls: string[]; viewports: string[] } },
				jobDir: string,
			) => {
				if (behavior.hold) await behavior.hold;
				if (behavior.fail) throw behavior.fail;
				await mkdir(join(jobDir, "screenshots"), { recursive: true });
				const pages = [];
				for (const [i, url] of job.spec.urls.entries()) {
					const viewports = [];
					for (const viewport of job.spec.viewports) {
						const bytes = shot(`${url}|${viewport}`);
						const file = `${i + 1}-${viewport}.png`;
						await writeFile(join(jobDir, "screenshots", file), bytes);
						viewports.push({
							viewport,
							width: viewport === "desktop" ? 1440 : 390,
							height: 900,
							screenshot: {
								file,
								sha256: behavior.tamperSha ? "0".repeat(64) : sha(bytes),
								bytes: bytes.length,
							},
							consoleErrors: [],
							pageErrors: [],
							failedRequests: [],
						});
					}
					pages.push({ url, viewports });
				}
				return {
					type: "site.inspect",
					sessionId: job.spec.sessionId,
					runId: behavior.wrongRunId ? "run_00000000-0000-4000-8000-000000000000" : job.runId,
					startedAt: "2026-10-07T15:00:00.000Z",
					finishedAt: "2026-10-07T15:00:09.000Z",
					pages,
					findings: behavior.findings ?? [],
				};
			},
		},
	});
	await adapter.recover();
	const address = await adapter.listen(0, "127.0.0.1");
	base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
	await adapter.close();
	await rm(dir, { recursive: true, force: true });
});

const env = () => ({
	OPENCLAW_ADAPTER_URL: base,
	OPENCLAW_ADAPTER_SECRET: SECRET,
	OPENCLAW_ALLOWED_HOSTS: HOSTS,
});

function deps(
	over: Partial<WorkflowDeps> = {},
	connector?: OpenClawConnector,
	storage?: FileStorage | null,
): WorkflowDeps {
	return {
		...workflowDeps(sql, null, env()),
		storage: storage === undefined ? createFolderStorage(join(dir, "evidence")) : storage,
		openclaw: connector ?? createAdapterConnector({ url: base, secret: SECRET }),
		sleep: async () => undefined,
		pollMs: 1,
		...over,
	};
}

const PAGES = ["https://www.worldwidevapor.com/", "https://www.worldwidevapor.com/shop"];
let urlCounter = 0;
const freshUrls = () => [`https://www.worldwidevapor.com/page-${++urlCounter}`];

async function start(d: WorkflowDeps, urls = PAGES) {
	const request = await requestSiteInspection(d, staff, { urls });
	return { request, task: request.task };
}

describe("asking Patch to inspect pages", () => {
	it("creates one task owned by Patch with the expected result written down", async () => {
		const { request, task } = await start(deps(), freshUrls());
		expect(request.kind).toBe("created");
		expect(task).toMatchObject({ kind: INSPECTION_KIND, ownerRole: "patch", state: "queued" });
		expect(task.expectedResult).toMatch(
			/Screenshots of each page at desktop \(1440×900\) and mobile \(390×844\)/,
		);
		expect(task.expectedResult).toMatch(/run id is kept/);
	});

	it("refuses pages that aren't on the allowed list, or that aren't plain https addresses", async () => {
		const d = deps();
		for (const url of [
			"https://evil.example.com/",
			"http://www.worldwidevapor.com/",
			"https://127.0.0.1/",
			"file:///etc/passwd",
			"https://user:pw@www.worldwidevapor.com/",
			"nonsense",
		])
			await expect(requestSiteInspection(d, staff, { urls: [url] }), url).rejects.toMatchObject({
				code: "invalid",
			});
		await expect(requestSiteInspection(d, staff, { urls: [] })).rejects.toMatchObject({ code: "invalid" });
		await expect(
			requestSiteInspection(d, staff, {
				urls: Array.from({ length: 6 }, (_, i) => `https://www.worldwidevapor.com/${i}`),
			}),
		).rejects.toMatchObject({ code: "invalid" });
		await expect(
			requestSiteInspection(d, staff, { urls: "https://www.worldwidevapor.com/" }),
		).rejects.toMatchObject({ code: "invalid" });
	});

	it("says the worker isn't configured instead of creating a task nobody can run", async () => {
		const d = { ...deps(), config: workflowDeps(sql, null, {}).config };
		await expect(requestSiteInspection(d, staff, { urls: freshUrls() })).rejects.toMatchObject({
			code: "not_configured",
		});
	});

	it("doesn't create a second task for the same pages while one is active, but allows a new run after it finishes", async () => {
		const d = deps();
		const urls = freshUrls();
		const first = await start(d, urls);
		const again = await requestSiteInspection(d, owner, { urls: [...urls] });
		expect(again).toMatchObject({ kind: "existing", reason: "already_active" });
		expect(again.task.id).toBe(first.task.id);
		await runSiteInspection(d, first.task.id);
		const next = await requestSiteInspection(d, staff, { urls });
		expect(next.kind).toBe("created");
		expect(next.task.input.attempt).toBe(2);
		expect(next.task.id).not.toBe(first.task.id);
	});

	it("is switched off when the owner turns Patch off", async () => {
		const db = await freshDb();
		try {
			await updateRoleSettings(db, owner, "patch", { enabled: false });
			await expect(
				requestSiteInspection({ ...deps(), sql: db }, staff, { urls: freshUrls() }),
			).rejects.toMatchObject({ code: "disabled" });
		} finally {
			await db.close();
		}
	});
});

describe("an inspection that works", () => {
	it("keeps the run id and session id, stores verified screenshots, records findings, and completes only then", async () => {
		behavior.findings = [
			{
				severity: "high",
				category: "site-inspection",
				title: "1 uncaught page error (mobile)",
				detail: "TypeError: x",
				url: PAGES[0],
				viewport: "mobile",
			},
		];
		const d = deps();
		const { task } = await start(d);
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome.status).toBe("completed");
		if (outcome.status !== "completed") return;

		// The session id was made on the server; the run id is the one the worker returned.
		const row = await getRunForTask(sql, task.id);
		expect(row?.sessionId).toMatch(/^wai-[0-9a-f-]{36}$/);
		expect(row?.runId).toMatch(/^run_[0-9a-f-]{36}$/);
		expect(row?.state).toBe("succeeded");
		expect([...adapter.jobs.values()].map((j) => [j.runId, j.sessionId])).toEqual([
			[row?.runId, row?.sessionId],
		]);
		expect(row?.result?.runId).toBe(row?.runId);

		// Four screenshots (two pages × two widths), stored, read back, and registered.
		expect(row?.evidence).toHaveLength(4);
		const storage = d.storage as FileStorage;
		for (const file of row?.evidence ?? []) {
			const bytes = await storage.get(file.path);
			expect(bytes && sha(bytes)).toBe(file.sha256);
			expect(file.path).toMatch(new RegExp(`^evidence/${task.id}/\\d-(desktop|mobile)\\.png$`));
		}
		const files = await sql.query(
			"select path, sha256, kind from wai_files where task_id = $1 order by path",
			[task.id],
		);
		expect(files.rows).toHaveLength(4);
		expect(files.rows.every((f) => f.kind === "evidence_screenshot")).toBe(true);

		// The completion evidence says what was verified.
		expect(outcome.task.state).toBe("completed");
		expect(outcome.task.completionEvidence).toMatchObject({
			runId: row?.runId,
			sessionId: row?.sessionId,
			findings: 1,
		});
		const evidence = outcome.task.completionEvidence as { screenshots: unknown[]; checks: string[] };
		expect(evidence.screenshots).toHaveLength(4);
		expect(evidence.checks).toContain("4 of 4 screenshots present");
		expect(outcome.task.sourceRefs).toEqual([
			expect.objectContaining({ system: "openclaw", id: row?.runId }),
		]);

		// Findings carry their source.
		const findings = await listFindings(sql, { taskId: task.id });
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			roleId: "patch",
			severity: "high",
			status: "open",
			evidence: { url: PAGES[0], viewport: "mobile" },
		});
		expect(findings[0].sourceRefs[0]).toMatchObject({ system: "openclaw", id: row?.runId });

		const kinds = (await getTaskEvents(sql, task.id)).map((e) => e.kind);
		expect(kinds).toEqual(expect.arrayContaining(["openclaw_submitted", "evidence_saved"]));
	});

	it("does nothing more for a finished task or one that is already running", async () => {
		const d = deps();
		const { task } = await start(d, freshUrls());
		await runSiteInspection(d, task.id);
		expect(await runSiteInspection(d, task.id)).toMatchObject({ status: "skipped" });
		const other = await start(d, freshUrls());
		await transitionTask(sql, other.task.id, "running", { kind: "system", label: "elsewhere" });
		expect(await runSiteInspection(d, other.task.id)).toMatchObject({
			status: "skipped",
			reason: "The task is already running.",
		});
		// Only the first task ever reached the worker.
		expect(adapter.jobs.size).toBe(1);
	});

	it("refuses a task that isn't an inspection", async () => {
		const { task } = await (
			await import("../tasks/repo")
		).createTask(sql, {
			kind: "relay.support_draft",
			title: "x",
			expectedResult: "y",
			idempotencyKey: "not-an-inspection",
			actor: staff,
		});
		await expect(runSiteInspection(deps(), task.id)).rejects.toMatchObject({ code: "invalid" });
	});
});

describe("an inspection that goes wrong, with nothing invented", () => {
	it("fails the task, with the worker's reason, when the job fails there", async () => {
		const { RunnerError } = await import("../../../../openclaw-host/runner.mjs");
		behavior.fail = new RunnerError("failed", 'OpenClaw\'s "open" command failed.');
		const d = deps();
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/failed on the worker: OpenClaw's "open" command failed/),
		});
		expect((await getRunForTask(sql, task.id))?.state).toBe("failed");
		expect(
			(await sql.query("select count(*)::int as n from wai_files where task_id = $1", [task.id])).rows[0].n,
		).toBe(0);
		expect(await listFindings(sql, { taskId: task.id })).toEqual([]);
	});

	it("fails the task when the job runs out of time on the worker", async () => {
		const { RunnerError } = await import("../../../../openclaw-host/runner.mjs");
		behavior.fail = new RunnerError("timed_out", "Too slow.");
		const d = deps();
		const { task } = await start(d, freshUrls());
		expect(await runSiteInspection(d, task.id)).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/time limit/),
		});
		expect((await getRunForTask(sql, task.id))?.state).toBe("timed_out");
	});

	it("fails, and keeps nothing, when a screenshot doesn't match its checksum", async () => {
		behavior.tamperSha = true;
		const d = deps();
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome.status).toBe("failed");
		expect(outcome.status === "failed" && outcome.error).toMatch(/didn't match its checksum/);
		expect(await (d.storage as FileStorage).list(`evidence/${task.id}`)).toEqual([]);
	});

	it("fails when the result carries a different run id than the run it came from", async () => {
		behavior.wrongRunId = true;
		const d = deps();
		const { task } = await start(d, freshUrls());
		expect(await runSiteInspection(d, task.id)).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/different run id/),
		});
	});

	it("refuses the worker's credentials without starting a job", async () => {
		const d = deps({}, createAdapterConnector({ url: base, secret: "w".repeat(40) }));
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/refused our credentials/),
		});
		expect(adapter.jobs.size).toBe(0);
	});

	it("says storage must be configured, and starts no job, rather than losing the screenshots", async () => {
		const d = deps({}, undefined, null);
		const { task } = await start(d, freshUrls());
		expect(await runSiteInspection(d, task.id)).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/storage isn't configured/),
		});
		expect(adapter.jobs.size).toBe(0);
	});

	it("says the worker isn't configured when there is no connector", async () => {
		const d = deps({ openclaw: null });
		const { task } = await start(d, freshUrls());
		expect(await runSiteInspection(d, task.id)).toMatchObject({
			status: "failed",
			error: expect.stringMatching(/OpenClaw worker isn't configured/),
		});
	});

	it("doesn't call evidence good when what was stored can't be read back intact", async () => {
		const real = createFolderStorage(join(dir, "evidence"));
		let puts = 0;
		const corrupting: FileStorage = {
			mode: "folder",
			put: async (path, data, mime) => {
				puts += 1;
				return real.put(path, data, mime);
			},
			get: async (path) => {
				const bytes = await real.get(path);
				return bytes && puts >= 2 ? Buffer.concat([Buffer.from(bytes), Buffer.from("!")]) : bytes;
			},
			list: real.list,
			remove: real.remove,
		};
		const d = deps({}, undefined, corrupting);
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome.status).toBe("failed");
		expect(outcome.status === "failed" && outcome.error).toMatch(/could not be read back intact/);
		expect((await getTask(sql, task.id))?.state).toBe("failed");
		expect((await getTask(sql, task.id))?.completionEvidence).toBeNull();
	});
});

describe("network trouble and the run id", () => {
	/** A connector whose requests go through `wrap`, which can make a request time out before or after it reaches the adapter. */
	const flaky = (wrap: (path: string, method: string, real: () => Promise<Response>) => Promise<Response>) =>
		createAdapterConnector({
			url: base,
			secret: SECRET,
			fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => {
				const path = String(input).replace(base, "");
				return wrap(path, init?.method ?? "GET", () => fetch(input, init));
			}) as typeof fetch,
		});
	const timeout = () => Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });

	it("finds the job it already started, instead of starting another, when the answer to a submission was lost", async () => {
		let lost = false;
		const connector = flaky(async (path, method, real) => {
			if (method === "POST" && path === "/jobs" && !lost) {
				lost = true;
				await real(); // The adapter got it and made the job…
				throw timeout(); // …but we never heard back.
			}
			return real();
		});
		const d = deps({}, connector);
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome.status).toBe("completed");
		expect(lost).toBe(true);
		expect(adapter.jobs.size).toBe(1);
		const row = await getRunForTask(sql, task.id);
		expect(row?.runId).toBe([...adapter.jobs.values()][0].runId);
	});

	it("marks the outcome unknown when it can't tell whether the worker got the job, and a retry reuses the same session", async () => {
		let reachable = false;
		const connector = flaky(async (_path, _method, real) => {
			if (!reachable) throw timeout();
			return real();
		});
		const d = deps({}, connector);
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome.status).toBe("failed");
		const after = await getTask(sql, task.id);
		expect(after?.state).toBe("outcome_unknown");
		expect(after?.error).toMatch(/Couldn't confirm whether the OpenClaw worker received the job/);
		const row = await getRunForTask(sql, task.id);
		expect(row?.state).toBe("unknown");
		expect(row?.runId).toBeNull();
		expect(adapter.jobs.size).toBe(0);

		// The worker is back. Retrying reuses the session id, so at most one job can exist for it.
		reachable = true;
		await transitionTask(sql, task.id, "queued", staff);
		const retried = await runSiteInspection(d, task.id);
		expect(retried.status).toBe("completed");
		expect(adapter.jobs.size).toBe(1);
		expect((await getRunForTask(sql, task.id))?.sessionId).toBe(row?.sessionId);
		expect([...adapter.jobs.values()][0].sessionId).toBe(row?.sessionId);
	});

	it("leaves a long job running and carries on with the same run later", async () => {
		let release: () => void = () => undefined;
		behavior.hold = new Promise<void>((resolve) => (release = resolve));
		const d = deps();
		const { task } = await start(d, freshUrls());
		const first = await runSiteInspection(d, task.id, { waitMs: 3 });
		expect(first).toMatchObject({ status: "deferred", reason: expect.stringMatching(/still running/) });
		expect((await getTask(sql, task.id))?.state).toBe("running");
		const row = await getRunForTask(sql, task.id);
		expect(row?.runId).toMatch(/^run_/);

		release();
		await adapter.idle();
		const resumed = await runSiteInspection(d, task.id, { resume: true });
		expect(resumed.status).toBe("completed");
		expect(adapter.jobs.size).toBe(1);
		expect((await getRunForTask(sql, task.id))?.runId).toBe(row?.runId);
	});

	it("defers, with the run saved, when the worker can't be reached while waiting", async () => {
		let down = false;
		const connector = flaky(async (path, _method, real) => {
			if (down && path.startsWith("/jobs/run_")) throw timeout();
			return real();
		});
		let release: () => void = () => undefined;
		behavior.hold = new Promise<void>((resolve) => (release = resolve));
		const d = deps({}, connector);
		const { task } = await start(d, freshUrls());
		down = true;
		const outcome = await runSiteInspection(d, task.id);
		expect(outcome).toMatchObject({
			status: "deferred",
			reason: expect.stringMatching(/couldn't be reached/),
		});
		expect((await getTask(sql, task.id))?.state).toBe("running");
		expect((await getRunForTask(sql, task.id))?.runId).toMatch(/^run_/);
		release();
		await adapter.idle();
		down = false;
		expect((await runSiteInspection(d, task.id, { resume: true })).status).toBe("completed");
		expect(adapter.jobs.size).toBe(1);
	});

	it("marks the outcome unknown if the worker no longer knows the run", async () => {
		const real = createAdapterConnector({ url: base, secret: SECRET });
		const forgetful: OpenClawConnector = {
			...real,
			getRun: async () => {
				throw new ConnectorError("not_found", "The adapter doesn't know that run.");
			},
		};
		const d = deps({}, forgetful);
		const { task } = await start(d, freshUrls());
		const outcome = await runSiteInspection(d, task.id);
		await adapter.idle();
		expect(outcome.status).toBe("failed");
		const after = await getTask(sql, task.id);
		expect(after?.state).toBe("outcome_unknown");
		expect(after?.error).toMatch(/no longer knows this run/);
		expect((await getRunForTask(sql, task.id))?.state).toBe("unknown");
		expect(after?.completionEvidence).toBeNull();
	});
});
