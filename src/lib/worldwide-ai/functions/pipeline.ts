import { ROLE_BY_ID, instructionsFor, requireTool } from "../agents/registry";
import { loadRoleSettings } from "../agents/settings";
import { ModelRunError, runStructured } from "../ai/run";
import { audit } from "../audit";
import { iso } from "../db/sql";
import { keyFrom, sha256Hex } from "../hash";
import { configStatus } from "../integrations/catalog";
import { previewText } from "../redact";
import { InvalidTransitionError, isActive, isFinished } from "../tasks/state-machine";
import {
	TaskNotFoundError,
	addTaskEvent,
	claimTask,
	createTask,
	findLatestTask,
	getTask,
	getTaskEvents,
	personalScopeOf,
	scopeVisibleTo,
	setExternalRunId,
	transitionTask,
	type TaskEvent,
	type TaskRecord,
} from "../tasks/repo";
import { opsDayKey } from "../time";
import { actorKey, actorLabel, type Actor, type OperatorActor, type TaskKind } from "../types";
import { recordUsage } from "../usage";
import type { RequestOutcome } from "../workflows/relay";
import { WorkflowError, type WorkflowDeps } from "../workflows/types";
import { getProduct, getProductByTask, hashOf, insertProduct, type WorkProduct } from "./products";
import { functionReadiness } from "./readiness";
import type { Row } from "./table";
import {
	FunctionBlocked,
	inputLabel,
	parseInput,
	type DraftArgs,
	type FunctionContext,
	type FunctionDefinition,
	type FunctionInput,
	type Upload,
} from "./types";

/**
 * The one path every agent function runs through, whoever asked for it (an agent's own button, or Nexus):
 *
 *   authorize and validate → create the task, or find the one the same request already made → run the registered handler
 *   → validate what it returned → store it privately → read it back and check it → record the outcome.
 *
 * A result that needs a person stays in `needs_review` until one accepts it; a result that could not be confirmed after it
 * was stored is `outcome_unknown`, never completed. A model's reply, however well-formed, never completes a task by itself.
 */

export type Lookup = (id: string) => FunctionDefinition | undefined;

export class FunctionInputError extends WorkflowError {
	constructor(readonly problems: string[]) {
		super("invalid", problems.join(" "));
		this.name = "FunctionInputError";
	}
}

export type FunctionOutcome =
	| { status: "needs_review"; task: TaskRecord; productId: string }
	| { status: "completed"; task: TaskRecord; productId: string }
	| { status: "failed"; task: TaskRecord; error: string }
	| { status: "skipped"; task: TaskRecord; reason: string }
	| { status: "deferred"; task: TaskRecord; reason: string };

export type IncomingFile = { field: string; name: string; mime: string; bytes: Uint8Array };

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_SIGNATURES: Array<{ mime: string; ext: string; test: (b: Uint8Array) => boolean }> = [
	{
		mime: "image/png",
		ext: "png",
		test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
	},
	{ mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
	{
		mime: "image/webp",
		ext: "webp",
		test: (b) =>
			b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
	},
];

const agentActor = (definition: FunctionDefinition): Actor => ({ kind: "agent", roleId: definition.agent });

/** What a file really is, from its first bytes (the name and the declared type are not trusted). */
const sniffImage = (bytes: Uint8Array) => IMAGE_SIGNATURES.find((signature) => signature.test(bytes)) ?? null;

async function storeUploads(
	deps: WorkflowDeps,
	definition: FunctionDefinition,
	files: readonly IncomingFile[],
): Promise<Upload[]> {
	const problems: string[] = [];
	const uploads: Upload[] = [];
	const imageFields = definition.fields.filter((f) => f.kind === "images");
	for (const field of imageFields) {
		const mine = files.filter((f) => f.field === field.key && f.bytes.byteLength > 0);
		const most = field.kind === "images" ? (field.maxFiles ?? 4) : 0;
		if (field.required && mine.length === 0) problems.push(`${field.label}: attach at least one image.`);
		if (mine.length > most) problems.push(`${field.label}: at most ${most} images.`);
		for (const file of mine.slice(0, most)) {
			const kind = sniffImage(file.bytes);
			if (!kind)
				problems.push(`${field.label}: "${file.name.slice(0, 60)}" isn't a PNG, JPEG or WebP image.`);
			else if (file.bytes.byteLength > MAX_UPLOAD_BYTES)
				problems.push(`${field.label}: "${file.name.slice(0, 60)}" is larger than 2 MB.`);
			else {
				const sha256 = sha256Hex(file.bytes);
				uploads.push({
					field: field.key,
					path: `uploads/${sha256}.${kind.ext}`,
					name: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || `image.${kind.ext}`,
					mime: kind.mime,
					bytes: file.bytes.byteLength,
					sha256,
				});
			}
		}
	}
	if (problems.length) throw new FunctionInputError(problems);
	if (uploads.length === 0) return [];
	if (!deps.storage)
		throw new WorkflowError(
			"not_configured",
			"File storage isn't configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY), so the images can't be kept.",
		);
	for (const upload of uploads) {
		const existing = await deps.storage.get(upload.path);
		if (existing && sha256Hex(existing) === upload.sha256) continue;
		const bytes = files.find((f) => sha256Hex(f.bytes) === upload.sha256)?.bytes;
		if (!bytes) throw new WorkflowError("conflict", "An attached image couldn't be read.");
		const stored = await deps.storage.put(upload.path, bytes, upload.mime);
		if (stored.sha256 !== upload.sha256)
			throw new WorkflowError("conflict", "An attached image changed while it was stored.");
	}
	return uploads;
}

/** Why a function can't be started now, or null when it can. */
export async function preflight(deps: WorkflowDeps, definition: FunctionDefinition): Promise<string | null> {
	const settings = await loadRoleSettings(deps.sql, definition.agent);
	const readiness = functionReadiness(definition, {
		statuses: configStatus(deps.config),
		enabled: settings.enabled,
	});
	if (readiness.status === "disabled")
		return `${ROLE_BY_ID[definition.agent].name} is switched off. The owner can switch it on from the Team page.`;
	if (readiness.status === "awaiting_configuration")
		return `${definition.action} can't run yet: ${readiness.reasons.join(" ")} Missing: ${readiness.missing.join(", ")}.`;
	return null;
}

/**
 * Asks for a function to be run. The same request again does not make a second task: while one is queued, running or
 * waiting for review, or already completed, that task is returned (pass `again` to deliberately run a completed one anew).
 */
export async function requestFunction(
	deps: WorkflowDeps,
	operator: OperatorActor,
	functionId: string,
	raw: Record<string, unknown>,
	options: {
		lookup: Lookup;
		demo?: boolean;
		again?: boolean;
		parentTaskId?: string;
		files?: readonly IncomingFile[];
	},
): Promise<RequestOutcome> {
	const definition = options.lookup(functionId);
	if (!definition)
		throw new WorkflowError("not_found", `There is no function called "${functionId.slice(0, 80)}".`);
	if (definition.external)
		throw new WorkflowError(
			"invalid",
			`${definition.action} has its own screen: ${definition.external.start}.`,
		);
	const blocker = await preflight(deps, definition);
	if (blocker)
		throw new WorkflowError(blocker.includes("switched off") ? "disabled" : "not_configured", blocker);

	const parsed = parseInput(definition, raw);
	if (!parsed.ok) throw new FunctionInputError(parsed.problems);
	const uploads = await storeUploads(deps, definition, options.files ?? []);

	const scope = definition.scope === "personal" ? personalScopeOf(actorKey(operator)) : "business";
	const demo = options.demo === true;
	const inputSha256 = hashOf({ input: parsed.input, uploads: uploads.map((u) => u.sha256), scope, demo });

	// Work is only ever delegated through a Nexus plan that names this function: nothing else can be a parent.
	if (options.parentTaskId) {
		const parent = await getTask(deps.sql, options.parentTaskId);
		const steps = parent
			? (
					(await getProductByTask(deps.sql, parent.id))?.payload as
						| { steps?: Array<{ functionId: string }> }
						| undefined
				)?.steps
			: undefined;
		if (
			!parent ||
			parent.kind !== "nexus.goal-plan" ||
			parent.scope !== "business" ||
			parent.demo !== demo ||
			scope !== "business"
		)
			throw new WorkflowError("forbidden", "A task can only be started under one of Nexus's plans.");
		if (!steps?.some((step) => step.functionId === definition.id))
			throw new WorkflowError("forbidden", `That plan doesn't include ${definition.action}.`);
	}

	const latest = await findLatestTask(deps.sql, definition.id, "inputSha256", inputSha256);
	if (latest && isActive(latest.state)) return { kind: "existing", task: latest, reason: "already_active" };
	if (latest && latest.state === "completed" && !options.again)
		return { kind: "existing", task: latest, reason: "already_completed" };

	const attempt = latest ? Number(latest.input.attempt ?? 1) + 1 : 1;
	const label = inputLabel(definition, parsed.input);
	const { task, created } = await createTask(deps.sql, {
		kind: definition.id,
		title: `${demo ? "[DEMO] " : ""}${definition.action}${label ? `: ${previewText(label, 70)}` : ""}`,
		expectedResult: definition.expectedResult,
		idempotencyKey: keyFrom(definition.id, definition.version, inputSha256, attempt),
		actor: operator,
		input: { ...parsed.input, inputSha256, attempt, functionVersion: definition.version, uploads },
		parentTaskId: options.parentTaskId ?? null,
		scope,
		demo,
	});
	if (created)
		for (const upload of uploads)
			await deps.sql.query(
				`insert into wai_files (bucket, path, sha256, bytes, mime, kind, task_id) values ($1,$2,$3,$4,$5,'task_upload',$6)
				 on conflict (path) do nothing`,
				[deps.config.storage.bucket, upload.path, upload.sha256, upload.bytes, upload.mime, task.id],
			);
	await audit(deps.sql, {
		actor: operator,
		action: "function.requested",
		subject: task.id,
		outcome: "allowed",
		detail: {
			function: definition.id,
			version: definition.version,
			attempt,
			created,
			demo,
			rows: parsed.rowsRead,
		},
	});
	return created ? { kind: "created", task } : { kind: "existing", task, reason: "duplicate_request" };
}

type Check = { name: string; ok: boolean; detail: string };

/** Reads a stored result back and checks it is the one this task produced, unaltered, in the right place. */
async function verifyStored(
	deps: WorkflowDeps,
	task: TaskRecord,
	definition: FunctionDefinition,
	expected: { payloadSha256: string; inputSha256: string },
): Promise<{ ok: boolean; checks: Check[]; product: WorkProduct | null }> {
	const checks: Check[] = [];
	const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
	let product: WorkProduct | null = null;
	try {
		product = await getProductByTask(deps.sql, task.id);
		check(
			"The result is stored",
			product !== null,
			product ? `Found result ${product.id}.` : "No result was found for this task.",
		);
		check(
			"It belongs to this task, function and agent",
			product?.taskId === task.id &&
				product.functionId === definition.id &&
				product.agentId === definition.agent,
			product ? `Stored under ${product.functionId} for ${product.agentId}.` : "No result.",
		);
		const stored = product ? hashOf(product.payload) : "";
		check(
			"The stored record is exactly what was produced",
			!!product && stored === product.payloadSha256 && stored === expected.payloadSha256,
			product
				? `Stored ${stored.slice(0, 12)}…, produced ${expected.payloadSha256.slice(0, 12)}….`
				: "No result.",
		);
		check(
			"It is tied to the input that was supplied",
			product?.inputSha256 === expected.inputSha256,
			product ? `Input ${product.inputSha256.slice(0, 12)}….` : "No result.",
		);
		check(
			"It is visible only to who it should be",
			product?.scope === task.scope && product.demo === task.demo,
			product
				? `Scope ${product.scope === "business" ? "business" : "personal"}${product.demo ? ", demonstration" : ""}.`
				: "No result.",
		);
		check(
			"Its review requirement is the function's",
			product?.reviewRequired === (definition.review === "required"),
			product
				? product.reviewRequired
					? "A person must accept it."
					: "No review is required."
				: "No result.",
		);
	} catch (error) {
		check(
			"The check could be completed",
			false,
			error instanceof Error ? error.message.slice(0, 160) : "A database error stopped the check.",
		);
	}
	return { ok: checks.every((c) => c.ok), checks, product };
}

const withTimeout = async <T>(work: Promise<T>, seconds: number): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new ModelRunError("timeout", `The function didn't finish within ${seconds} seconds.`)),
					seconds * 1000,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
};

/** Runs a queued function task. Safe to call again for one already running or finished: it picks up or does nothing. */
export async function runFunction(
	deps: WorkflowDeps,
	taskId: string,
	run: { externalRunId?: string; resume?: boolean; lookup: Lookup },
): Promise<FunctionOutcome> {
	const { sql } = deps;
	const task = await getTask(sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	const definition = run.lookup(task.kind);
	if (!definition || definition.external)
		throw new WorkflowError("invalid", `There is no handler for "${task.kind}".`);
	if (isFinished(task.state) || task.state === "needs_review")
		return { status: "skipped", task, reason: `The task is already ${task.state}.` };
	if (task.state === "running" && !run.resume)
		return { status: "skipped", task, reason: "The task is already running." };

	const actor = agentActor(definition);
	const role = ROLE_BY_ID[definition.agent];
	const settings = await loadRoleSettings(sql, definition.agent);
	let current = task;
	if (task.state === "queued") {
		if (!settings.enabled) {
			const failed = await transitionTask(sql, task.id, "failed", actor, {
				error: `${role.name} is switched off.`,
				onlyFrom: ["queued"],
			});
			return { status: "failed", task: failed, error: `${role.name} is switched off.` };
		}
		const claim = await claimTask(sql, task.id, actor, { maxConcurrent: settings.limits.maxConcurrentTasks });
		if (!claim.claimed)
			return claim.reason === "busy"
				? { status: "deferred", task, reason: `${role.name} is at its limit of tasks running at once.` }
				: {
						status: "skipped",
						task: (await getTask(sql, task.id)) ?? task,
						reason: "Another run already took this task.",
					};
		current = claim.task;
	}
	if (run.externalRunId) await setExternalRunId(sql, current.id, run.externalRunId);

	const fail = async (message: string): Promise<FunctionOutcome> => {
		try {
			const failed = await transitionTask(sql, current.id, "failed", actor, {
				error: message,
				onlyFrom: ["queued", "running"],
			});
			return { status: "failed", task: failed, error: message };
		} catch (error) {
			if (!(error instanceof InvalidTransitionError)) throw error;
			const now = await getTask(sql, current.id);
			return {
				status: "skipped",
				task: now ?? current,
				reason: `The task was ${now?.state ?? "changed"} while it ran.`,
			};
		}
	};

	const settle = async (
		product: WorkProduct,
		verified: { ok: boolean; checks: Check[] },
		extra: Record<string, unknown> = {},
	): Promise<FunctionOutcome> => {
		try {
			if (!verified.ok) {
				const unknown = await transitionTask(sql, current.id, "outcome_unknown", actor, {
					error: `A result was stored but could not be confirmed: ${verified.checks
						.filter((c) => !c.ok)
						.map((c) => c.name)
						.join("; ")}. Check it before relying on it.`,
					detail: { checks: verified.checks },
					onlyFrom: ["running"],
				});
				return {
					status: "failed",
					task: unknown,
					error: unknown.error ?? "The result could not be confirmed.",
				};
			}
			const result = {
				productId: product.id,
				outputType: product.outputType,
				payloadSha256: product.payloadSha256,
				...extra,
			};
			if (definition.review === "required") {
				const moved = await transitionTask(sql, current.id, "needs_review", actor, {
					result,
					sourceRefs: product.sourceRefs,
					note: "The result was stored and read back. It is waiting for a person to accept it.",
					onlyFrom: ["running"],
				});
				return { status: "needs_review", task: moved, productId: product.id };
			}
			const done = await transitionTask(sql, current.id, "completed", actor, {
				result,
				sourceRefs: product.sourceRefs,
				completionEvidence: {
					productId: product.id,
					outputType: product.outputType,
					payloadSha256: product.payloadSha256,
					inputSha256: product.inputSha256,
					verifiedAt: deps.now().toISOString(),
					checks: verified.checks.map(({ name, ok }) => ({ name, ok })),
				},
				note: "The stored result was read back and every check passed.",
				onlyFrom: ["running"],
			});
			return { status: "completed", task: done, productId: product.id };
		} catch (error) {
			if (!(error instanceof InvalidTransitionError)) throw error;
			const now = await getTask(sql, current.id);
			if (now?.state === "needs_review") return { status: "needs_review", task: now, productId: product.id };
			if (now?.state === "completed") return { status: "completed", task: now, productId: product.id };
			return {
				status: "skipped",
				task: now ?? current,
				reason: `The task was ${now?.state ?? "changed"} while it ran.`,
			};
		}
	};

	try {
		const inputSha256 = String(current.input.inputSha256 ?? "");
		// A retried run finds the result the first attempt stored and carries on from there instead of producing another.
		const already = await getProductByTask(sql, current.id);
		if (already) {
			const verified = await verifyStored(deps, current, definition, {
				payloadSha256: already.payloadSha256,
				inputSha256,
			});
			return await settle(already, verified, { resumed: true });
		}

		// What was supplied is validated again here: the task may have waited in a queue, and nothing is trusted on the way out.
		const parsed = parseInput(definition, current.input);
		if (!parsed.ok) return await fail(`The supplied input is no longer valid: ${parsed.problems.join(" ")}`);
		const uploads = (Array.isArray(current.input.uploads) ? current.input.uploads : []) as Upload[];
		if (definition.uses === "model" && !deps.model)
			return await fail("No model provider is configured (ANTHROPIC_API_KEY), so nothing was written.");
		requireTool(definition.agent, "source.read_supplied");

		let modelId: string | null = null;
		let modelCalls = 0;
		const draft = async <S extends import("zod").z.ZodType>(args: DraftArgs<S>) => {
			if (!deps.model)
				throw new WorkflowError("not_configured", "No model provider is configured (ANTHROPIC_API_KEY).");
			if (modelCalls >= settings.limits.maxModelCalls)
				throw new ModelRunError(
					"limit",
					`${role.name} reached its limit of ${settings.limits.maxModelCalls} model calls for one task.`,
				);
			modelCalls += 1;
			const started = Date.now();
			try {
				const result = await runStructured({
					handle: deps.model,
					roleId: definition.agent,
					taskId: current.id,
					instructions: instructionsFor(definition.agent),
					prompt: args.prompt,
					schema: args.schema,
					limits: settings.limits,
					functionId: `worldwide-ai.${definition.id}`,
					promptVersion: args.promptVersion,
					recordRaw: deps.config.recordRaw,
					images: args.images,
				});
				modelId = result.modelId;
				await recordUsage(sql, {
					taskId: current.id,
					roleId: definition.agent,
					kind: "model",
					model: result.modelId,
					inputTokens: result.usage.inputTokens,
					outputTokens: result.usage.outputTokens,
					latencyMs: result.latencyMs,
				});
				await addTaskEvent(sql, current.id, {
					kind: "model_call",
					actor,
					detail: {
						model: result.modelId,
						promptVersion: args.promptVersion,
						instructionsVersion: role.instructionsVersion,
						inputTokens: result.usage.inputTokens,
						outputTokens: result.usage.outputTokens,
						latencyMs: result.latencyMs,
						finishReason: result.finishReason,
						images: args.images?.length ?? 0,
					},
				});
				return result.output;
			} catch (error) {
				await recordUsage(sql, {
					taskId: current.id,
					roleId: definition.agent,
					kind: "model",
					model: deps.model.modelId,
					latencyMs: Date.now() - started,
					status: "error",
				});
				throw error;
			}
		};

		const input = parsed.input;
		const context: FunctionContext = {
			task: current,
			input,
			uploads,
			now: deps.now(),
			today: opsDayKey(deps.now()),
			deps,
			limits: settings.limits,
			draft,
			readUpload: async (upload) => {
				const bytes = await deps.storage?.get(upload.path);
				if (!bytes || sha256Hex(bytes) !== upload.sha256)
					throw new WorkflowError(
						"conflict",
						`The attached image "${upload.name}" is missing or has changed since it was attached.`,
					);
				return bytes;
			},
			text: (key) => (typeof input[key] === "string" ? (input[key] as string) : ""),
			list: (key) =>
				Array.isArray(input[key]) && typeof input[key]?.[0] !== "object" ? (input[key] as string[]) : [],
			rows: (key) =>
				Array.isArray(input[key]) && typeof input[key]?.[0] === "object" ? (input[key] as Row[]) : [],
			definitionOf: run.lookup,
		};

		const started = Date.now();
		const result = await withTimeout(definition.handler(context), settings.limits.maxTaskSeconds);
		const shaped = definition.output.safeParse(result.output);
		if (!shaped.success)
			return await fail("The function's result wasn't in its declared format, so nothing was stored.");
		const problems = definition.verify?.(shaped.data, input) ?? [];
		if (problems.length)
			return await fail(
				`The result didn't pass its own checks, so nothing was stored: ${problems.slice(0, 5).join(" ")}`,
			);
		await recordUsage(sql, {
			taskId: current.id,
			roleId: definition.agent,
			kind: "tool",
			tool: "source.read_supplied",
			latencyMs: Date.now() - started,
		});

		requireTool(definition.agent, "product.store");
		const { product } = await insertProduct(sql, {
			taskId: current.id,
			functionId: definition.id,
			functionVersion: definition.version,
			agentId: definition.agent,
			outputType: definition.outputType,
			scope: current.scope,
			demo: current.demo,
			summary: result.summary,
			payload: shaped.data,
			inputSha256,
			missing: result.missing ?? [],
			assumptions: result.assumptions ?? [],
			coverage: { ...(result.coverage ?? {}), "Rows read": parsed.rowsRead },
			warnings: result.warnings ?? [],
			sourceRefs: [
				{
					system: "supplied-input",
					id: current.id,
					retrievedAt: current.createdAt,
					sha256: inputSha256,
					label: "What was supplied for this task",
				},
				...(result.sourceRefs ?? []),
			],
			model: modelId,
			promptVersion: modelId ? (definition.promptVersion ?? null) : null,
			reviewRequired: definition.review === "required",
		});
		await recordUsage(sql, {
			taskId: current.id,
			roleId: definition.agent,
			kind: "tool",
			tool: "product.store",
		});
		await addTaskEvent(sql, current.id, {
			kind: "result_stored",
			actor,
			tool: "product.store",
			detail: {
				productId: product.id,
				outputType: definition.outputType,
				function: definition.id,
				functionVersion: definition.version,
				missing: product.missing.length,
				warnings: product.warnings.length,
			},
		});
		const verified = await verifyStored(deps, current, definition, {
			payloadSha256: hashOf(shaped.data),
			inputSha256,
		});
		return await settle(product, verified);
	} catch (error) {
		// If the result was stored before something went wrong, the work exists: reconcile rather than lose or repeat it.
		const existing = await getProductByTask(sql, current.id).catch(() => null);
		if (existing) {
			const verified = await verifyStored(deps, current, definition, {
				payloadSha256: existing.payloadSha256,
				inputSha256: String(current.input.inputSha256 ?? ""),
			});
			return settle(existing, verified, { recovered: true });
		}
		const known =
			error instanceof ModelRunError || error instanceof WorkflowError || error instanceof FunctionBlocked;
		if (!known)
			console.error(
				"[worldwide-ai] function failed:",
				current.kind,
				current.id,
				error instanceof Error ? `${error.name}: ${error.message}` : error,
			);
		return fail(
			known ? (error as Error).message : "Something went wrong while this ran. Nothing was stored.",
		);
	}
}

export type ProductReview = { product: WorkProduct; task: TaskRecord; checks: Check[] };

/**
 * A person accepting or rejecting a stored result. Only an operator can; an agent is never one. Accepting completes the task
 * only after the decision has been read back from the database with the record unchanged.
 */
export async function reviewProduct(
	deps: WorkflowDeps,
	operator: OperatorActor,
	productId: string,
	input: { action: "accept" | "reject"; note?: string },
): Promise<ProductReview> {
	const { sql } = deps;
	const product = await getProduct(sql, productId);
	// A result in someone else's personal scope doesn't exist as far as this person is concerned.
	if (!product || !scopeVisibleTo(product.scope, actorKey(operator)))
		throw new WorkflowError("not_found", "That result doesn't exist.");
	const task = await getTask(sql, product.taskId);
	if (!task) throw new WorkflowError("not_found", "The task for that result doesn't exist.");
	if (product.reviewState !== "pending")
		throw new WorkflowError("conflict", `This result is already ${product.reviewState.replace("_", " ")}.`);
	if (task.state !== "needs_review")
		throw new WorkflowError(
			"conflict",
			`The task is ${task.state.replace("_", " ")}, not waiting for review.`,
		);
	if (input.action !== "accept" && input.action !== "reject")
		throw new WorkflowError("invalid", "Choose accept or reject.");
	const note = input.note?.trim().slice(0, 1000) || null;
	if (input.action === "reject" && !note)
		throw new WorkflowError("invalid", "Say why you are rejecting it, so the reason is on record.");
	const decision = input.action === "accept" ? "accepted" : "rejected";

	await sql.transaction(async (tx) => {
		const moved = await tx.query(
			`update wai_work_products set review_state = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now()
			 where id = $1 and review_state = 'pending'`,
			[productId, decision, actorKey(operator), note],
		);
		if (!moved.rowCount) throw new WorkflowError("conflict", "This result was already reviewed.");
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note, before_sha256, after_sha256)
			 values ('work_product', $1, $2, $3, $4, $5, $6, $6)`,
			[
				productId,
				input.action === "accept" ? "approved" : "rejected",
				actorKey(operator),
				actorLabel(operator),
				note,
				product.payloadSha256,
			],
		);
	});
	await audit(sql, {
		actor: operator,
		action: `function.result_${decision}`,
		subject: productId,
		outcome: "allowed",
		detail: { function: product.functionId, taskId: task.id },
	});

	const checks: Check[] = [];
	const saved = await getProduct(sql, productId);
	if (input.action === "reject") {
		const cancelled = await transitionTask(sql, task.id, "cancelled", operator, {
			note: `Result rejected: ${previewText(note ?? "", 200)}`,
			onlyFrom: ["needs_review"],
		});
		return { product: saved ?? product, task: cancelled, checks };
	}

	const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
	check(
		"The decision is stored",
		saved?.reviewState === "accepted",
		`Review state is ${saved?.reviewState ?? "missing"}.`,
	);
	check(
		"It is recorded against the person who made it",
		saved?.reviewedBy === actorKey(operator),
		saved?.reviewedBy ? "Reviewer recorded." : "No reviewer recorded.",
	);
	const stored = saved ? hashOf(saved.payload) : "";
	check(
		"The accepted record is unchanged",
		!!saved && stored === product.payloadSha256 && stored === saved.payloadSha256,
		`Stored ${stored.slice(0, 12)}….`,
	);
	const logged = await sql.query(
		`select 1 from wai_reviews where subject_type = 'work_product' and subject_id = $1 and decision = 'approved' and reviewer = $2`,
		[productId, actorKey(operator)],
	);
	check(
		"The approval is in the review history",
		logged.rows.length >= 1,
		logged.rows.length ? "Approval found." : "No approval record found.",
	);

	const ok = checks.every((c) => c.ok);
	try {
		const finished = ok
			? await transitionTask(sql, task.id, "completed", operator, {
					completionEvidence: {
						productId,
						outputType: product.outputType,
						payloadSha256: product.payloadSha256,
						inputSha256: product.inputSha256,
						reviewer: actorKey(operator),
						verifiedAt: deps.now().toISOString(),
						checks: checks.map(({ name, ok: passed }) => ({ name, ok: passed })),
					},
					note: "The accepted result was read back and every check passed.",
					onlyFrom: ["needs_review"],
				})
			: await transitionTask(sql, task.id, "outcome_unknown", operator, {
					error: `The result was accepted but could not be confirmed: ${checks
						.filter((c) => !c.ok)
						.map((c) => c.name)
						.join("; ")}.`,
					detail: { checks },
					onlyFrom: ["needs_review"],
				});
		return { product: saved ?? product, task: finished, checks };
	} catch (error) {
		if (error instanceof InvalidTransitionError)
			throw new WorkflowError("conflict", "The task changed while the result was being accepted.");
		throw error;
	}
}

export type ProductView = {
	product: WorkProduct;
	task: TaskRecord;
	events: TaskEvent[];
	decisions: Array<{ decision: string; reviewerLabel: string | null; note: string | null; at: string }>;
};

/** Everything the result screen shows, or null when it doesn't exist for this viewer. */
export async function loadProductView(
	deps: Pick<WorkflowDeps, "sql">,
	productId: string,
	viewerKey: string,
): Promise<ProductView | null> {
	const product = await getProduct(deps.sql, productId);
	if (!product || !scopeVisibleTo(product.scope, viewerKey)) return null;
	const task = await getTask(deps.sql, product.taskId);
	if (!task) return null;
	const [events, decisions] = await Promise.all([
		getTaskEvents(deps.sql, task.id),
		deps.sql.query(
			`select decision, reviewer_label, note, at from wai_reviews where subject_type = 'work_product' and subject_id = $1 order by at, id`,
			[productId],
		),
	]);
	return {
		product,
		task,
		events,
		decisions: decisions.rows.map((r) => ({
			decision: r.decision as string,
			reviewerLabel: (r.reviewer_label as string | null) ?? null,
			note: (r.note as string | null) ?? null,
			at: iso(r.at) as string,
		})),
	};
}

export type { FunctionInput, TaskKind };
