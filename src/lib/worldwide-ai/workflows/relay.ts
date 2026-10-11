import { createToolGateway, type GatewayEvent, type ToolHandlers } from "../agents/gateway";
import type { ExecutionLimits } from "../agents/limits";
import { ROLE_BY_ID, instructionsFor } from "../agents/registry";
import { loadRoleSettings } from "../agents/settings";
import { ModelRunError, runStructured } from "../ai/run";
import { searchApproved, type AtlasHit, type AtlasSearchResult } from "../atlas/service";
import { audit } from "../audit";
import { keyFrom } from "../hash";
import { previewText } from "../redact";
import { getCase, type CaseRecord } from "../support/cases";
import { checkDraftBody } from "../support/draft-checks";
import { getDraftByTask, insertDraft, type SourceStatus } from "../support/drafts";
import {
	RELAY_PROMPT_VERSION,
	buildRelayPrompt,
	holdingReply,
	relayDraftSchema,
	type RelayDraftOutput,
} from "../support/prompts";
import { InvalidTransitionError, isActive, isFinished } from "../tasks/state-machine";
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
import { opsDayKey } from "../time";
import type { Actor, OperatorActor, SourceRef } from "../types";
import { recordUsage } from "../usage";
import { WorkflowError, type RunOutcome, type WorkflowDeps } from "./types";

/**
 * Relay's support-draft workflow: pick a case, retrieve approved policy through Atlas, draft a sourced reply, hand it to a
 * person. Retrieval, permission checks, the figure/link/promise checks and every write are application code; the model only
 * writes the wording, from the sources it is given. If no approved source matches, the reply is a holding message written by
 * code (the model isn't asked to improvise policy). If anything fails, the task fails and no draft is saved.
 *
 * The task ends this half in `needs_review`. It is only completed after a person saves the draft to the case and the
 * application has re-read it and confirmed it (see relay-review.ts).
 */

export const RELAY_KIND = "relay.support_draft" as const;
export const CASE_ID_FIELD = "caseId";
const relayActor: Actor = { kind: "agent", roleId: "relay" };

export type RequestOutcome =
	| { kind: "created"; task: TaskRecord }
	| {
			kind: "existing";
			task: TaskRecord;
			reason: "already_active" | "already_completed" | "duplicate_request";
	  };

/**
 * Asks Relay for a draft. The same request again does not make a second task: while one is queued, running or waiting for
 * review, or already completed, that task is returned. A new attempt is made only after a failed, cancelled or unknown
 * outcome, or when a person asks to regenerate a completed one.
 */
export async function requestRelayDraft(
	deps: WorkflowDeps,
	operator: OperatorActor,
	caseId: string,
	options: { regenerate?: boolean } = {},
): Promise<RequestOutcome> {
	const settings = await loadRoleSettings(deps.sql, "relay");
	if (!settings.enabled)
		throw new WorkflowError(
			"disabled",
			"Relay is switched off. The owner can switch it on from the Team page.",
		);
	const supportCase = await getCase(deps.sql, caseId);
	if (!supportCase) throw new WorkflowError("not_found", "That case doesn't exist.");
	if (supportCase.status === "closed") throw new WorkflowError("conflict", "That case is closed.");

	const latest = await findLatestTask(deps.sql, RELAY_KIND, CASE_ID_FIELD, caseId);
	if (latest && isActive(latest.state)) return { kind: "existing", task: latest, reason: "already_active" };
	if (latest && latest.state === "completed" && !options.regenerate)
		return { kind: "existing", task: latest, reason: "already_completed" };

	const attempt = latest ? Number(latest.input.attempt ?? 1) + 1 : 1;
	const retrievedAt = deps.now().toISOString();
	const { task, created } = await createTask(deps.sql, {
		kind: RELAY_KIND,
		title: `Draft a reply: ${previewText(supportCase.subject, 80)}`,
		expectedResult:
			"A reply draft that cites approved sources (or says none matched) is reviewed by a person and saved to this case, and the application confirms the draft and its references were stored against the right case.",
		idempotencyKey: keyFrom(RELAY_KIND, caseId, supportCase.messageSha256, attempt),
		actor: operator,
		input: { [CASE_ID_FIELD]: caseId, attempt, messageSha256: supportCase.messageSha256 },
		sourceRefs: [
			{
				system: "case",
				id: caseId,
				retrievedAt,
				sha256: supportCase.messageSha256,
				label: supportCase.subject,
			},
		],
	});
	await audit(deps.sql, {
		actor: operator,
		action: "relay.draft_requested",
		subject: caseId,
		outcome: "allowed",
		detail: { taskId: task.id, attempt, created },
	});
	return created ? { kind: "created", task } : { kind: "existing", task, reason: "duplicate_request" };
}

const sourceRefFor = (hit: AtlasHit, retrievedAt: string): SourceRef => ({
	system: "atlas",
	id: hit.documentId,
	version: hit.version,
	retrievedAt,
	sha256: hit.contentSha256,
	label: hit.title,
});

/** Runs a queued Relay task. Safe to call again for a task already running or finished: it picks up or does nothing. */
export async function runRelayDraft(
	deps: WorkflowDeps,
	taskId: string,
	/** `resume`: the job runner is retrying a run that died part-way, so a task already "running" is ours to carry on. */
	run: { externalRunId?: string; resume?: boolean } = {},
): Promise<RunOutcome> {
	const task = await getTask(deps.sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	if (task.kind !== RELAY_KIND)
		throw new WorkflowError("invalid", `Task ${taskId} isn't a Relay draft task.`);
	if (isFinished(task.state) || task.state === "needs_review")
		return { status: "skipped", task, reason: `The task is already ${task.state}.` };
	// Someone else is already working on it: don't start a second model call for the same task.
	if (task.state === "running" && !run.resume)
		return { status: "skipped", task, reason: "The task is already running." };

	const settings = await loadRoleSettings(deps.sql, "relay");
	let current = task;
	if (task.state === "queued") {
		if (!settings.enabled) {
			const failed = await transitionTask(deps.sql, task.id, "failed", relayActor, {
				error: "Relay is switched off.",
				onlyFrom: ["queued"],
			});
			return { status: "failed", task: failed, error: "Relay is switched off." };
		}
		const claim = await claimTask(deps.sql, task.id, relayActor, {
			maxConcurrent: settings.limits.maxConcurrentTasks,
		});
		if (!claim.claimed)
			return claim.reason === "busy"
				? { status: "deferred", task, reason: "Relay is at its limit of tasks running at once." }
				: {
						status: "skipped",
						task: (await getTask(deps.sql, task.id)) ?? task,
						reason: "Another run already took this task.",
					};
		current = claim.task;
	}
	if (run.externalRunId) await setExternalRunId(deps.sql, current.id, run.externalRunId);

	let draftSaved = false;
	try {
		return await draftReply(deps, current, settings.limits, () => {
			draftSaved = true;
		});
	} catch (error) {
		return failOrReconcile(deps, current, error, draftSaved);
	}
}

async function failOrReconcile(
	deps: WorkflowDeps,
	task: TaskRecord,
	error: unknown,
	draftMaybeSaved: boolean,
): Promise<RunOutcome> {
	// If the draft was written before something went wrong, the work is done: move on rather than lose it.
	const existing = await getDraftByTask(deps.sql, task.id).catch(() => null);
	if (existing && (draftMaybeSaved || existing.state === "pending_review")) {
		try {
			const moved = await transitionTask(deps.sql, task.id, "needs_review", relayActor, {
				result: { draftId: existing.id, sourceStatus: existing.sourceStatus, recovered: true },
				note: "The draft was saved; the task was moved to review after an error.",
				onlyFrom: ["running"],
			});
			return { status: "needs_review", task: moved, draftId: existing.id };
		} catch {
			// fall through to failing the task
		}
	}
	const message =
		error instanceof ModelRunError || error instanceof WorkflowError
			? error.message
			: "Something went wrong while preparing the draft. Nothing was saved.";
	console.error(
		"[worldwide-ai] relay task failed:",
		task.id,
		error instanceof Error ? `${error.name}: ${error.message}` : error,
	);
	try {
		const failed = await transitionTask(deps.sql, task.id, "failed", relayActor, {
			error: message,
			onlyFrom: ["queued", "running"],
		});
		return { status: "failed", task: failed, error: message };
	} catch (transitionError) {
		// The task changed under us (cancelled, say). Report what is true now.
		if (transitionError instanceof InvalidTransitionError) {
			const now = await getTask(deps.sql, task.id);
			return {
				status: "skipped",
				task: now ?? task,
				reason: `The task was ${now?.state ?? "changed"} while it ran.`,
			};
		}
		throw transitionError;
	}
}

type DraftSaveInput = { caseId: string; taskId: string; subject?: string; body: string; citations: string[] };

/** The model-and-tools part of the workflow, run under the role's limits with every tool call going through the gateway. */
async function draftReply(
	deps: WorkflowDeps,
	task: TaskRecord,
	limits: ExecutionLimits,
	onSaved: () => void,
): Promise<RunOutcome> {
	const { sql } = deps;
	const caseId = String(task.input[CASE_ID_FIELD] ?? "");

	// A retried run finds the draft the first attempt saved and carries on from there instead of writing another.
	const already = await getDraftByTask(sql, task.id);
	if (already) {
		onSaved();
		const moved = await transitionTask(sql, task.id, "needs_review", relayActor, {
			result: { draftId: already.id, sourceStatus: already.sourceStatus, resumed: true },
			onlyFrom: ["running"],
		});
		return { status: "needs_review", task: moved, draftId: already.id };
	}

	let retrieved: AtlasHit[] = [];
	let retrievedAt = deps.now().toISOString();
	let model: string | null = null;
	let sourceStatus: SourceStatus = "missing";
	let warnings: string[] = [];
	let savedDraftId: string | null = null;

	const record = async (event: GatewayEvent) => {
		await addTaskEvent(sql, task.id, {
			kind: event.kind,
			actor: relayActor,
			roleId: "relay",
			tool: event.tool,
			detail: {
				input: event.inputPreview,
				ms: event.ms,
				...(event.code ? { code: event.code, message: event.message } : {}),
			},
		});
		await recordUsage(sql, {
			taskId: task.id,
			roleId: "relay",
			kind: "tool",
			tool: event.tool,
			latencyMs: event.ms,
			status: event.kind === "tool_call" ? "ok" : event.kind === "tool_denied" ? "denied" : "error",
		});
	};

	const handlers: ToolHandlers = {
		"case.get": async (input: { caseId: string }) => {
			const found = await getCase(sql, input.caseId);
			if (!found) throw new Error("That case doesn't exist.");
			return found;
		},
		"atlas.search": async (input: { query: string; collection?: string; limit?: number }, context) =>
			searchApproved(sql, {
				query: input.query,
				// What Relay may read comes from its registry entry, not from anything the model or the customer said.
				allowedCollections: ROLE_BY_ID[context.roleId].knowledge,
				collection: input.collection,
				limit: input.limit,
				now: deps.now(),
				staleAfterDays: deps.config.staleAfterDays,
			}),
		"draft.save": async (input: DraftSaveInput) => {
			if (input.taskId !== task.id) throw new Error("A draft can only be saved for the task it belongs to.");
			if (input.caseId !== caseId)
				throw new Error("That draft belongs to a different case than the one this task was created for.");
			const cited = new Set(input.citations);
			const { draft } = await insertDraft(sql, {
				taskId: task.id,
				caseId,
				subject: input.subject ?? null,
				body: input.body,
				sourceStatus,
				warnings,
				model,
				promptVersion: RELAY_PROMPT_VERSION,
				createdByRole: "relay",
				sources: retrieved.map((hit) => ({
					documentId: hit.documentId,
					version: hit.version,
					title: hit.title,
					contentSha256: hit.contentSha256,
					retrievedAt,
					freshness: hit.freshness.state === "stale" ? "stale" : "current",
					cited: cited.has(hit.documentId),
					excerpt: hit.excerpt,
				})),
			});
			onSaved();
			savedDraftId = draft.id;
			return { draftId: draft.id };
		},
	};

	const gateway = createToolGateway({
		roleId: "relay",
		taskId: task.id,
		actor: relayActor,
		limits,
		handlers,
		record,
		recordRaw: deps.config.recordRaw,
	});
	const must = async <T>(tool: string, input: unknown): Promise<T> => {
		const result = await gateway.call(tool, input);
		if (result.ok) return result.value as T;
		throw new WorkflowError(
			"conflict",
			result.error.code === "failed" ? `A step (${tool}) couldn't be completed.` : result.error.message,
		);
	};

	// 1. The case, read through the gateway so Relay's permission to read it is checked like any other.
	const supportCase = await must<CaseRecord>("case.get", { caseId });
	if (supportCase.id !== caseId)
		throw new WorkflowError("conflict", "The case returned wasn't the one this task is for.");

	// 2. Approved sources from Atlas, limited to the collections Relay may read.
	const search = await must<AtlasSearchResult>("atlas.search", {
		query: `${supportCase.subject}\n${supportCase.message}`,
		limit: 3,
	});
	retrieved = search.hits;
	retrievedAt = search.retrievedAt;
	const keyed = search.hits.map((hit, index) => ({ key: `S${index + 1}`, hit }));
	sourceStatus =
		keyed.length === 0
			? "missing"
			: keyed.some(({ hit }) => hit.freshness.state === "stale")
				? "stale"
				: "ok";
	await addTaskEvent(sql, task.id, {
		kind: "sources_retrieved",
		actor: relayActor,
		roleId: "relay",
		detail: {
			found: keyed.map(({ key, hit }) => ({
				key,
				title: hit.title,
				version: hit.version,
				freshness: hit.freshness.state,
			})),
			skipped: search.skipped,
			status: sourceStatus,
		},
	});

	// 3. The wording: from the model when there are sources to write from, from code when there are none.
	let output: RelayDraftOutput;
	if (keyed.length === 0) {
		output = {
			body: holdingReply(supportCase.customerName),
			citations: [],
			needsFollowUp: true,
			uncertainties: ["No approved document matched this case."],
			instructionsInData: false,
		};
	} else {
		if (!deps.model)
			throw new WorkflowError(
				"not_configured",
				"No model provider is configured (ANTHROPIC_API_KEY), so no draft was written.",
			);
		const started = Date.now();
		try {
			const run = await runStructured({
				handle: deps.model,
				roleId: "relay",
				taskId: task.id,
				instructions: instructionsFor("relay"),
				prompt: buildRelayPrompt({
					subject: supportCase.subject,
					message: supportCase.message,
					customerName: supportCase.customerName,
					orderNumber: supportCase.orderNumber,
					today: opsDayKey(deps.now()),
					sources: keyed.map(({ key, hit }) => ({
						key,
						title: hit.title,
						collection: hit.collection,
						version: hit.version,
						freshness: hit.freshness.state === "stale" ? "stale" : "current",
						content: hit.content,
					})),
				}),
				schema: relayDraftSchema,
				limits,
				functionId: `worldwide-ai.${RELAY_KIND}`,
				promptVersion: RELAY_PROMPT_VERSION,
				recordRaw: deps.config.recordRaw,
			});
			output = run.output;
			model = run.modelId;
			await recordUsage(sql, {
				taskId: task.id,
				roleId: "relay",
				kind: "model",
				model: run.modelId,
				inputTokens: run.usage.inputTokens,
				outputTokens: run.usage.outputTokens,
				latencyMs: run.latencyMs,
			});
			await addTaskEvent(sql, task.id, {
				kind: "model_call",
				actor: relayActor,
				roleId: "relay",
				detail: {
					model: run.modelId,
					promptVersion: RELAY_PROMPT_VERSION,
					inputTokens: run.usage.inputTokens,
					outputTokens: run.usage.outputTokens,
					latencyMs: run.latencyMs,
					finishReason: run.finishReason,
					...(deps.config.recordRaw ? { output: previewText(run.output.body, 400) } : {}),
				},
			});
		} catch (error) {
			await recordUsage(sql, {
				taskId: task.id,
				roleId: "relay",
				kind: "model",
				model: deps.model.modelId,
				latencyMs: Date.now() - started,
				status: "error",
			});
			throw error;
		}
	}

	// 4. Checks the application does itself, so a reviewer sees what the draft got wrong before they trust it.
	warnings = [];
	const keys = new Map(keyed.map(({ key, hit }) => [key, hit]));
	const citedHits: AtlasHit[] = [];
	for (const key of output.citations) {
		const hit = keys.get(key);
		if (hit) {
			if (!citedHits.includes(hit)) citedHits.push(hit);
		} else
			warnings.push(`The model cited a source ("${key}") that wasn't provided. That citation was dropped.`);
	}
	if (keyed.length === 0)
		warnings.push(
			"No approved source matched this case. This is a holding reply written by the system, not by the model.",
		);
	else if (citedHits.length === 0)
		warnings.push("The draft cites no approved source. Check every statement in it.");
	for (const { hit } of keyed)
		if (hit.freshness.state === "stale")
			warnings.push(`Source "${hit.title}" is out of date: ${hit.freshness.reasons.join(" ")}`);
	for (const skipped of search.skipped)
		warnings.push(
			`A matching document was left out because it has expired: "${skipped.title}". ${skipped.reason}`,
		);
	if (output.needsFollowUp && keyed.length > 0)
		warnings.push(
			`The draft says a team member needs to follow up${output.uncertainties.length ? `: ${output.uncertainties.join("; ")}` : "."}`,
		);
	if (output.instructionsInData)
		warnings.push(
			"Text in the customer's message or a document tried to give the assistant instructions. It was not followed; read the message before replying.",
		);
	if (keyed.length > 0)
		warnings.push(
			...checkDraftBody({
				body: output.body,
				sourceTexts: keyed.map(({ hit }) => `${hit.title}\n${hit.content}`),
				caseText: `${supportCase.subject}\n${supportCase.message}`,
			}),
		);

	// 5. Save the draft against this case, through the gateway (which checks the case and task match).
	const body = output.body.trim();
	await must("draft.save", {
		caseId,
		taskId: task.id,
		subject: `Re: ${supportCase.subject}`.slice(0, 300),
		body,
		citations: citedHits.map((hit) => hit.documentId),
	});
	if (!savedDraftId) throw new WorkflowError("conflict", "The draft wasn't saved.");
	const draftId: string = savedDraftId;
	await addTaskEvent(sql, task.id, {
		kind: "draft_created",
		actor: relayActor,
		roleId: "relay",
		detail: {
			draftId,
			sourceStatus,
			retrieved: retrieved.length,
			cited: citedHits.length,
			warnings: warnings.length,
		},
	});

	// 6. Hand it to a person.
	try {
		const reviewed = await transitionTask(sql, task.id, "needs_review", relayActor, {
			result: {
				draftId,
				caseId,
				sourceStatus,
				retrievedCount: retrieved.length,
				citedCount: citedHits.length,
				warningCount: warnings.length,
			},
			sourceRefs: [
				{
					system: "case",
					id: caseId,
					retrievedAt,
					sha256: supportCase.messageSha256,
					label: supportCase.subject,
				},
				...retrieved.map((hit) => sourceRefFor(hit, retrievedAt)),
			],
			onlyFrom: ["running"],
		});
		return { status: "needs_review", task: reviewed, draftId };
	} catch (error) {
		if (error instanceof InvalidTransitionError) {
			const now = await getTask(sql, task.id);
			// Another run of the same task got there first: the draft is the one that task already has.
			if (now?.state === "needs_review") return { status: "needs_review", task: now, draftId };
			// The task was cancelled (or otherwise ended) while the draft was being written. The draft is not offered for review.
			await sql.query(
				`update wai_drafts set state = 'superseded', updated_at = now() where id = $1 and state = 'pending_review'`,
				[draftId],
			);
			return {
				status: "skipped",
				task: now ?? task,
				reason: `The task was ${now?.state ?? "changed"} while the draft was being written, so the draft was not offered for review.`,
			};
		}
		throw error;
	}
}
