import { LIMITS, VIEWPORTS, validateResult, validateTargetUrl } from "../../../../openclaw-host/job-spec.mjs";
import { requireTool } from "../agents/registry";
import { loadRoleSettings } from "../agents/settings";
import { audit } from "../audit";
import { iso, type Sql } from "../db/sql";
import { recordFinding } from "../findings";
import { keyFrom, newId, sha256Hex } from "../hash";
import { ConnectorError, type InspectionSpec, type RemoteRun } from "../openclaw/connector";
import {
	ensureRunRow,
	getRunForTask,
	updateRunRow,
	type EvidenceFile,
	type OpenClawRunRow,
} from "../openclaw/runs";
import type { FileStorage } from "../storage/files";
import { InvalidTransitionError, isFinished } from "../tasks/state-machine";
import {
	TaskNotFoundError,
	addTaskEvent,
	claimTask,
	createTask,
	findLatestTask,
	getTask,
	setExternalRunId,
	transitionTask,
	type TaskRecord,
} from "../tasks/repo";
import { recordUsage } from "../usage";
import type { Actor, OperatorActor } from "../types";
import type { RequestOutcome } from "./relay";
import { WorkflowError, type RunOutcome, type WorkflowDeps } from "./types";

/**
 * Patch's website inspection: open chosen pages at desktop and phone widths on the OpenClaw worker, bring back a screenshot
 * of each and what the browser reported, and keep it all as evidence.
 *
 * What makes it trustworthy: the session id is made here, on the server, before anything is sent; the run id the worker
 * returns is saved as it came; after a network timeout the worker is asked whether it already has a run for that session
 * before a second is started; screenshots are fetched, checked against their checksums, stored, and read back; and the task
 * is completed only when every page at every width has verified evidence.
 */

export const INSPECTION_KIND = "patch.site_inspection" as const;
const patchActor: Actor = { kind: "agent", roleId: "patch" };

const EXPECTED_RESULT = `Screenshots of each page at desktop (${VIEWPORTS.desktop.width}×${VIEWPORTS.desktop.height}) and mobile (${VIEWPORTS.mobile.width}×${VIEWPORTS.mobile.height}) widths are saved as evidence with their checksums, the findings from what the browser reported are recorded, and the OpenClaw run id is kept.`;

const mimeFor = (file: string) =>
	file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";

/** Asks Patch to inspect pages. The same pages again while one is queued or running return that task. */
export async function requestSiteInspection(
	deps: WorkflowDeps,
	operator: OperatorActor,
	input: { urls: unknown },
): Promise<RequestOutcome> {
	const settings = await loadRoleSettings(deps.sql, "patch");
	if (!settings.enabled)
		throw new WorkflowError(
			"disabled",
			"Patch is switched off. The owner can switch it on from the Team page.",
		);
	const { adapterUrl, secret, allowedHosts } = deps.config.openclaw;
	if (!adapterUrl || !secret || allowedHosts.length === 0)
		throw new WorkflowError(
			"not_configured",
			"The OpenClaw worker isn't configured yet (OPENCLAW_ADAPTER_URL, OPENCLAW_ADAPTER_SECRET and OPENCLAW_ALLOWED_HOSTS).",
		);

	const raw = Array.isArray(input.urls) ? input.urls : [];
	if (raw.length < 1 || raw.length > LIMITS.maxPages)
		throw new WorkflowError("invalid", `Choose between 1 and ${LIMITS.maxPages} pages.`);
	const urls: string[] = [];
	for (const candidate of raw) {
		const checked = validateTargetUrl(
			typeof candidate === "string" ? candidate.trim() : candidate,
			allowedHosts,
		);
		if (!checked.ok) throw new WorkflowError("invalid", checked.reason);
		if (!urls.includes(checked.url)) urls.push(checked.url);
	}

	const urlsKey = sha256Hex(JSON.stringify([...urls].sort()));
	const latest = await findLatestTask(deps.sql, INSPECTION_KIND, "urlsKey", urlsKey);
	if (latest && (latest.state === "queued" || latest.state === "running"))
		return { kind: "existing", task: latest, reason: "already_active" };
	const attempt = latest ? Number(latest.input.attempt ?? 1) + 1 : 1;
	const { task, created } = await createTask(deps.sql, {
		kind: INSPECTION_KIND,
		title: `Inspect ${urls.length === 1 ? new URL(urls[0]).pathname || "/" : `${urls.length} pages`} on ${new URL(urls[0]).hostname}`,
		expectedResult: EXPECTED_RESULT,
		idempotencyKey: keyFrom(INSPECTION_KIND, urlsKey, attempt),
		actor: operator,
		input: { urls, urlsKey, attempt, viewports: ["desktop", "mobile"] },
	});
	await audit(deps.sql, {
		actor: operator,
		action: "patch.inspection_requested",
		subject: task.id,
		outcome: "allowed",
		detail: { pages: urls.length, attempt },
	});
	return created ? { kind: "created", task } : { kind: "existing", task, reason: "duplicate_request" };
}

class UncertainSubmit extends Error {}

/**
 * Runs (or carries on running) an inspection. Safe to call again for a task that is already running (pass `resume`), for one
 * that finished, or after a crash: it picks up the same run instead of starting another.
 */
export async function runSiteInspection(
	deps: WorkflowDeps,
	taskId: string,
	run: { externalRunId?: string; resume?: boolean; waitMs?: number } = {},
): Promise<RunOutcome> {
	const { sql } = deps;
	const task = await getTask(sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	if (task.kind !== INSPECTION_KIND)
		throw new WorkflowError("invalid", `Task ${taskId} isn't a site inspection.`);
	if (isFinished(task.state))
		return { status: "skipped", task, reason: `The task is already ${task.state}.` };
	if (task.state === "running" && !run.resume)
		return { status: "skipped", task, reason: "The task is already running." };

	const settings = await loadRoleSettings(sql, "patch");
	let current = task;
	if (task.state === "queued") {
		if (!settings.enabled) return fail(deps, task, "Patch is switched off.");
		const claim = await claimTask(sql, task.id, patchActor, {
			maxConcurrent: settings.limits.maxConcurrentTasks,
		});
		if (!claim.claimed)
			return claim.reason === "busy"
				? { status: "deferred", task, reason: "Patch is at its limit of tasks running at once." }
				: {
						status: "skipped",
						task: (await getTask(sql, task.id)) ?? task,
						reason: "Another run already took this task.",
					};
		current = claim.task;
	}
	if (run.externalRunId) await setExternalRunId(sql, current.id, run.externalRunId);

	const connector = deps.openclaw;
	const storage = deps.storage;
	if (!connector)
		return fail(deps, current, "The OpenClaw worker isn't configured, so nothing was inspected.");
	if (!storage)
		return fail(
			deps,
			current,
			"File storage isn't configured, so screenshots can't be saved as evidence. Nothing was inspected.",
		);

	try {
		requireTool("patch", "openclaw.inspect");
		requireTool("patch", "openclaw.get_run");
		// The session id is made here, before anything is sent. A retry finds the run record already made and keeps its session id.
		const prior = await getRunForTask(sql, current.id);
		const sessionId = prior?.sessionId ?? `wai-${newId()}`;
		const built = specFor(current, deps.config.openclaw.allowedHosts, sessionId);
		if (!built.ok) return fail(deps, current, built.message);
		let row = prior ?? (await ensureRunRow(sql, current.id, sessionId, built.value));
		const spec = row.spec;
		if (current.input.sessionId !== row.sessionId)
			await sql.query(
				`update wai_tasks set input = input || jsonb_build_object('sessionId', $2::text) where id = $1`,
				[current.id, row.sessionId],
			);

		let remote: RemoteRun | null = null;
		if (!row.runId) {
			try {
				remote = await submitOrAdopt(deps, row);
			} catch (error) {
				if (error instanceof UncertainSubmit)
					return unknown(
						deps,
						current,
						row,
						"Couldn't confirm whether the OpenClaw worker received the job. Trying again uses the same session, so it won't start a second job if the first arrived.",
					);
				if (error instanceof ConnectorError)
					return fail(
						deps,
						current,
						`The OpenClaw worker refused or couldn't take the job: ${error.message}`,
					);
				throw error;
			}
			row = await updateRunRow(sql, row.id, {
				runId: remote.runId,
				state: "submitted",
				submittedAt: deps.now(),
			});
			await addTaskEvent(sql, current.id, {
				kind: "openclaw_submitted",
				actor: patchActor,
				roleId: "patch",
				tool: "openclaw.inspect",
				detail: { runId: remote.runId, sessionId: row.sessionId },
			});
			await recordUsage(sql, { taskId: current.id, roleId: "patch", kind: "tool", tool: "openclaw.inspect" });
		}
		const runId = row.runId as string;

		// Wait for it, within this invocation's budget. A job that is still running is left running and picked up again.
		const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
		const pollMs = deps.pollMs ?? 3000;
		const maxPolls = Math.max(1, Math.ceil((run.waitMs ?? 45_000) / pollMs));
		let misses = 0;
		let lastState = row.state;
		for (let poll = 0; ; poll += 1) {
			try {
				remote = await connector.getRun(runId);
				misses = 0;
			} catch (error) {
				if (error instanceof ConnectorError && error.uncertain && (misses += 1) < 3) {
					await sleep(pollMs);
					continue;
				}
				if (error instanceof ConnectorError && error.uncertain)
					return {
						status: "deferred",
						task: current,
						reason: "The OpenClaw worker couldn't be reached. The run is saved and will be checked again.",
					};
				if (error instanceof ConnectorError && error.kind === "not_found")
					return unknown(
						deps,
						current,
						row,
						"The worker no longer knows this run (it may have lost its records).",
					);
				throw error;
			}
			await recordUsage(sql, { taskId: current.id, roleId: "patch", kind: "tool", tool: "openclaw.get_run" });
			if (remote.sessionId !== row.sessionId)
				return fail(deps, current, "The worker's answer was for a different session, so it wasn't used.");
			if (remote.state !== lastState) {
				await addTaskEvent(sql, current.id, {
					kind: "openclaw_state",
					actor: patchActor,
					roleId: "patch",
					detail: { runId, state: remote.state },
				});
				lastState = remote.state as typeof lastState;
			}
			if (["succeeded", "failed", "timed_out", "unknown"].includes(remote.state)) break;
			row = await updateRunRow(sql, row.id, { state: "running", lastPolledAt: deps.now() });
			if (poll >= maxPolls)
				return {
					status: "deferred",
					task: current,
					reason: "The inspection is still running on the worker.",
				};
			await sleep(pollMs);
		}

		if (remote.state === "failed") {
			await updateRunRow(sql, row.id, { state: "failed", error: remote.error, finishedAt: deps.now() });
			return fail(
				deps,
				current,
				`The inspection failed on the worker: ${remote.error ?? "no reason was given"}`,
			);
		}
		if (remote.state === "timed_out") {
			await updateRunRow(sql, row.id, { state: "timed_out", error: remote.error, finishedAt: deps.now() });
			return fail(deps, current, "The inspection ran past its time limit on the worker.");
		}
		if (remote.state === "unknown") {
			await updateRunRow(sql, row.id, { state: "unknown", error: remote.error, finishedAt: deps.now() });
			return unknown(deps, current, row, remote.error ?? "The worker couldn't say how the run ended.");
		}
		return await finalize(deps, current, row, remote, spec, storage);
	} catch (error) {
		if (error instanceof InvalidTransitionError) {
			const now = await getTask(sql, current.id);
			return {
				status: "skipped",
				task: now ?? current,
				reason: `The task was ${now?.state ?? "changed"} while it ran.`,
			};
		}
		console.error(
			"[worldwide-ai] inspection failed:",
			current.id,
			error instanceof Error ? `${error.name}: ${error.message}` : error,
		);
		return fail(
			deps,
			current,
			error instanceof WorkflowError
				? error.message
				: "Something went wrong during the inspection. Check the run before trying again.",
		);
	}
}

function specFor(
	task: TaskRecord,
	allowedHosts: string[],
	sessionId: string,
): { ok: true; value: InspectionSpec } | { ok: false; message: string } {
	const urls = Array.isArray(task.input.urls) ? (task.input.urls as unknown[]) : [];
	const checked: string[] = [];
	for (const candidate of urls) {
		const result = validateTargetUrl(candidate, allowedHosts);
		if (!result.ok) return { ok: false, message: `Page not allowed: ${result.reason}` };
		checked.push(result.url);
	}
	if (!checked.length) return { ok: false, message: "The task has no pages to inspect." };
	return {
		ok: true,
		value: { type: "site.inspect", sessionId, urls: checked, viewports: ["desktop", "mobile"] },
	};
}

/** Finds the run for this session if the worker already has one, otherwise starts it; a timeout is followed by a look before giving up. */
async function submitOrAdopt(deps: WorkflowDeps, row: OpenClawRunRow): Promise<RemoteRun> {
	const connector = deps.openclaw as NonNullable<WorkflowDeps["openclaw"]>;
	try {
		const found = await connector.findRunBySession(row.sessionId);
		if (found) return found;
	} catch (error) {
		if (!(error instanceof ConnectorError && error.uncertain)) throw error;
	}
	try {
		return await connector.submit(row.spec);
	} catch (error) {
		if (error instanceof ConnectorError && error.uncertain) {
			try {
				const found = await connector.findRunBySession(row.sessionId);
				if (found) return found;
			} catch {
				// Still can't tell.
			}
			throw new UncertainSubmit();
		}
		throw error;
	}
}

async function storeVerified(
	storage: FileStorage,
	path: string,
	bytes: Uint8Array,
	mime: string,
): Promise<void> {
	const digest = sha256Hex(bytes);
	const existing = await storage.get(path);
	if (existing) {
		if (sha256Hex(existing) !== digest) throw new Error("A different file is already stored at that path.");
		return;
	}
	await storage.put(path, bytes, mime);
}

async function recordFile(sql: Sql, taskId: string, bucket: string, file: EvidenceFile): Promise<void> {
	await sql.query(
		`insert into wai_files (bucket, path, sha256, bytes, mime, kind, task_id) values ($1,$2,$3,$4,$5,'evidence_screenshot',$6) on conflict (path) do nothing`,
		[bucket, file.path, file.sha256, file.bytes, file.mime, taskId],
	);
}

/** Turns a finished run into evidence, verifies it, and only then completes the task. */
async function finalize(
	deps: WorkflowDeps,
	task: TaskRecord,
	row: OpenClawRunRow,
	remote: RemoteRun,
	spec: InspectionSpec,
	storage: FileStorage,
): Promise<RunOutcome> {
	const { sql } = deps;
	const connector = deps.openclaw as NonNullable<WorkflowDeps["openclaw"]>;
	const result = remote.result;
	const checked = validateResult(result, spec);
	if (!checked.ok || !result)
		return fail(
			deps,
			task,
			`The worker's result couldn't be accepted: ${checked.ok ? "it was empty" : checked.errors.join(" ")}`,
		);
	if (result.runId !== remote.runId)
		return fail(
			deps,
			task,
			"The result carried a different run id than the run it came from, so it wasn't used.",
		);

	const evidence: EvidenceFile[] = [];
	try {
		for (const page of result.pages)
			for (const viewport of page.viewports) {
				const shot = viewport.screenshot;
				const bytes = await connector.fetchFile(remote.runId, shot.file);
				if (sha256Hex(bytes) !== shot.sha256 || bytes.byteLength !== shot.bytes)
					return fail(
						deps,
						task,
						`The ${viewport.viewport} screenshot of ${page.url} didn't match its checksum, so it wasn't kept.`,
					);
				const path = `evidence/${task.id}/${shot.file}`;
				const mime = mimeFor(shot.file);
				await storeVerified(storage, path, bytes, mime);
				const file: EvidenceFile = {
					kind: "screenshot",
					path,
					sha256: shot.sha256,
					bytes: shot.bytes,
					url: page.url,
					viewport: viewport.viewport,
					mime,
				};
				await recordFile(sql, task.id, deps.config.storage.bucket, file);
				evidence.push(file);
			}
	} catch (error) {
		if (error instanceof ConnectorError && !error.uncertain)
			return fail(deps, task, `A screenshot couldn't be fetched from the worker: ${error.message}`);
		return unknown(
			deps,
			task,
			row,
			"The screenshots couldn't all be fetched and stored, so the evidence can't be confirmed.",
		);
	}
	await addTaskEvent(sql, task.id, {
		kind: "evidence_saved",
		actor: patchActor,
		roleId: "patch",
		detail: { files: evidence.length },
	});

	// Findings, each pointing back at the run they came from.
	requireTool("patch", "finding.record");
	let recorded = 0;
	for (const [index, finding] of result.findings.slice(0, 50).entries()) {
		const { created } = await recordFinding(sql, {
			roleId: "patch",
			taskId: task.id,
			severity: finding.severity,
			category: finding.category || "site-inspection",
			title: finding.title,
			detail: finding.detail,
			evidence: { url: finding.url, viewport: finding.viewport },
			sourceRefs: [
				{ system: "openclaw", id: remote.runId, retrievedAt: deps.now().toISOString(), label: finding.url },
			],
			dedupeKey: `inspect:${task.id}:${index}`,
		});
		if (created) recorded += 1;
	}
	row = await updateRunRow(sql, row.id, {
		state: "succeeded",
		result,
		evidence,
		finishedAt: deps.now(),
		error: null,
	});

	// Verify: read every file back from storage, and check the run and the counts.
	const failures: string[] = [];
	try {
		for (const file of evidence) {
			const back = await storage.get(file.path);
			if (!back || sha256Hex(back) !== file.sha256)
				failures.push(`${file.viewport} screenshot of ${file.url} could not be read back intact`);
		}
	} catch {
		return unknown(deps, task, row, "The stored screenshots couldn't be read back to confirm them.");
	}
	const expected = spec.urls.length * spec.viewports.length;
	if (evidence.length !== expected)
		failures.push(`expected ${expected} screenshots, stored ${evidence.length}`);
	if (row.runId !== remote.runId || row.sessionId !== spec.sessionId)
		failures.push("the saved run and session ids don't match the worker's");
	if (failures.length) return fail(deps, task, `The evidence couldn't be confirmed: ${failures.join("; ")}.`);

	const finished = await transitionTask(sql, task.id, "completed", patchActor, {
		completionEvidence: {
			runId: remote.runId,
			sessionId: spec.sessionId,
			screenshots: evidence.map(({ path, sha256, bytes, url, viewport }) => ({
				path,
				sha256,
				bytes,
				url,
				viewport,
			})),
			findings: result.findings.length,
			findingsRecorded: recorded,
			verifiedAt: deps.now().toISOString(),
			checks: [
				"files read back with matching checksums",
				"run id and session id match",
				`${expected} of ${expected} screenshots present`,
			],
		},
		result: {
			runId: remote.runId,
			pages: spec.urls.length,
			screenshots: evidence.length,
			findings: result.findings.length,
		},
		sourceRefs: [
			{
				system: "openclaw",
				id: remote.runId,
				retrievedAt: iso(deps.now()) as string,
				label: "Inspection run",
			},
		],
		note: "Every screenshot was fetched, checked against its checksum, stored and read back.",
		onlyFrom: ["running"],
	});
	return { status: "completed", task: finished };
}

async function fail(deps: WorkflowDeps, task: TaskRecord, message: string): Promise<RunOutcome> {
	const failed = await transitionTask(deps.sql, task.id, "failed", patchActor, {
		error: message,
		onlyFrom: ["queued", "running"],
	});
	return { status: "failed", task: failed, error: message };
}

async function unknown(
	deps: WorkflowDeps,
	task: TaskRecord,
	row: OpenClawRunRow | null,
	message: string,
): Promise<RunOutcome> {
	if (row && row.state !== "succeeded")
		await updateRunRow(deps.sql, row.id, { state: "unknown", error: message });
	const moved = await transitionTask(deps.sql, task.id, "outcome_unknown", patchActor, {
		error: message,
		onlyFrom: ["queued", "running"],
	});
	return { status: "failed", task: moved, error: message };
}
