import { generateText, isStepCount, Output } from "ai";
import type { z } from "zod";
import type { ExecutionLimits } from "../agents/limits";
import type { RoleId } from "../types";
import type { ModelHandle } from "./model";

/**
 * One call to the model for one role, with the role's limits applied: retries, output size, steps and a time limit, and
 * with usage reported back for recording. The model's reply must match a schema; anything else is an error here, so a
 * malformed reply never becomes a draft.
 */

export type ModelRunErrorKind = "timeout" | "provider" | "invalid_output" | "limit";

export class ModelRunError extends Error {
	constructor(
		readonly kind: ModelRunErrorKind,
		message: string,
	) {
		super(message);
		this.name = "ModelRunError";
	}
}

export type ModelUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

export type ModelRun<T> = {
	output: T;
	usage: ModelUsage;
	modelId: string;
	latencyMs: number;
	finishReason: string;
};

export type RunStructuredArgs<S extends z.ZodType> = {
	handle: ModelHandle;
	roleId: RoleId;
	taskId: string | null;
	/** What the role is: its instructions plus the shared rules. Never contains retrieved data. */
	instructions: string;
	/** The task, with all outside text clearly fenced as data. */
	prompt: string;
	schema: S;
	limits: Pick<ExecutionLimits, "maxModelCalls" | "maxRetries" | "maxOutputTokens" | "maxTaskSeconds">;
	/** Name for the trace, like "relay.support_draft". */
	functionId: string;
	promptVersion: string;
	/** Whether the (redacted) prompt and output may be recorded in traces. */
	recordRaw: boolean;
	abortSignal?: AbortSignal;
	/** Images for the model to look at beside the prompt (a screenshot under review). */
	images?: ReadonlyArray<{ bytes: Uint8Array; mime: string }>;
};

function classify(error: unknown): ModelRunError {
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : String(error);
	if (name === "TimeoutError" || name === "AbortError" || /timed? ?out|aborted/i.test(message))
		return new ModelRunError("timeout", "The model didn't answer in time.");
	if (
		/NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse|InvalidResponse|schema/i.test(
			name + message,
		)
	)
		return new ModelRunError(
			"invalid_output",
			"The model's reply wasn't in the expected format, so nothing was saved.",
		);
	// Don't pass a provider's raw message on: it can include request details.
	const status = (error as { statusCode?: number } | null)?.statusCode;
	return new ModelRunError(
		"provider",
		status ? `The model provider returned an error (${status}).` : "The model provider couldn't be reached.",
	);
}

export async function runStructured<S extends z.ZodType>(
	args: RunStructuredArgs<S>,
): Promise<ModelRun<z.infer<S>>> {
	const started = Date.now();
	try {
		const result = await generateText({
			model: args.handle.model,
			instructions: args.instructions,
			...(args.images?.length
				? {
						messages: [
							{
								role: "user" as const,
								content: [
									{ type: "text" as const, text: args.prompt },
									...args.images.map((image) => ({
										type: "image" as const,
										image: image.bytes,
										mediaType: image.mime,
									})),
								],
							},
						],
					}
				: { prompt: args.prompt }),
			output: Output.object({ schema: args.schema }),
			temperature: 0.2,
			maxRetries: args.limits.maxRetries,
			maxOutputTokens: args.limits.maxOutputTokens,
			// One structured reply is a single step; the cap stays in force if tools are added.
			stopWhen: isStepCount(args.limits.maxModelCalls),
			timeout: { totalMs: Math.max(5, args.limits.maxTaskSeconds - 10) * 1000 },
			abortSignal: args.abortSignal,
			runtimeContext: { taskId: args.taskId, roleId: args.roleId, promptVersion: args.promptVersion },
			telemetry: {
				functionId: args.functionId,
				recordInputs: args.recordRaw,
				recordOutputs: args.recordRaw,
				// Ids only: nothing the customer wrote is ever in the runtime context.
				includeRuntimeContext: { taskId: true, roleId: true, promptVersion: true },
			},
		});
		const output = result.output as z.infer<S> | undefined;
		if (output === undefined || output === null)
			throw new ModelRunError("invalid_output", "The model returned no result, so nothing was saved.");
		return {
			output,
			usage: {
				inputTokens: result.usage?.inputTokens ?? 0,
				outputTokens: result.usage?.outputTokens ?? 0,
				totalTokens:
					result.usage?.totalTokens ?? (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
			},
			modelId: result.response?.modelId ?? args.handle.modelId,
			latencyMs: Date.now() - started,
			finishReason: String(result.finishReason),
		};
	} catch (error) {
		if (error instanceof ModelRunError) throw error;
		throw classify(error);
	}
}
