import { MockLanguageModelV4 } from "ai/test";
import type { ModelHandle } from "./ai/model";
import { readConfig } from "./config";
import { createMigratedPglite } from "./db/pglite";
import type { SqlClient } from "./db/sql";
import type { Actor, OperatorActor } from "./types";
import type { WorkflowDeps } from "./workflows/types";

/** Fixtures shared by the Worldwide AI tests (only imported by tests). */

export const freshDb = (): Promise<SqlClient> => createMigratedPglite();

export const owner: OperatorActor = { kind: "operator", id: "owner-1", label: "Olivia Owner", role: "owner" };
export const staff: OperatorActor = { kind: "operator", id: "staff-1", label: "Sam Staff", role: "staff" };
export const relayAgent: Actor = { kind: "agent", roleId: "relay" };
export const nexusAgent: Actor = { kind: "agent", roleId: "nexus" };
export const system: Actor = { kind: "system", label: "test" };

export const fixedNow = new Date("2026-10-07T15:00:00Z");

let counter = 0;
export const uniqueKey = (prefix = "key") => `${prefix}-${++counter}-${Math.random().toString(36).slice(2)}`;

const usage = (input: number, output: number) => ({
	inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: output, text: output, reasoning: undefined },
});

export type MockReply = unknown | Error;

/**
 * A model that answers with whatever the test says (an object is sent back as JSON; an Error is thrown), and records every
 * prompt it was sent so a test can check what the model was and wasn't shown.
 */
export function mockModel(
	reply: MockReply | ((prompt: string, call: number) => MockReply | Promise<MockReply>),
) {
	const prompts: string[] = [];
	const instructions: string[] = [];
	const model = new MockLanguageModelV4({
		doGenerate: async (options) => {
			const messages = options.prompt as Array<{ role: string; content: unknown }>;
			const text = (m: { content: unknown }) =>
				typeof m.content === "string"
					? m.content
					: (m.content as Array<{ type: string; text?: string }>)
							.map((part) => (part.type === "text" ? (part.text ?? "") : ""))
							.join("");
			prompts.push(
				messages
					.filter((m) => m.role === "user")
					.map(text)
					.join("\n"),
			);
			instructions.push(
				messages
					.filter((m) => m.role === "system")
					.map(text)
					.join("\n"),
			);
			const result =
				typeof reply === "function"
					? await (reply as (p: string, c: number) => MockReply | Promise<MockReply>)(
							prompts.at(-1) ?? "",
							prompts.length,
						)
					: reply;
			if (result instanceof Error) throw result;
			return {
				content: [
					{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result) },
				],
				finishReason: { unified: "stop" as const, raw: undefined },
				usage: usage(120, 80),
				warnings: [],
			};
		},
	});
	const handle: ModelHandle = { model, modelId: "mock-model-1", provider: "mock" };
	return { handle, prompts, instructions, calls: () => prompts.length };
}

export const workflowDeps = (
	sql: SqlClient,
	model: ModelHandle | null,
	env: Record<string, string | undefined> = {},
): WorkflowDeps => ({
	sql,
	config: readConfig(env),
	now: () => fixedNow,
	model,
});
