import { tool, type ToolSet } from "ai";
import { previewText, redactDeep } from "../redact";
import type { Actor, RoleId } from "../types";
import type { ExecutionLimits } from "./limits";
import { ROLE_BY_ID } from "./registry";
import { TOOLS, isToolId, type ToolId } from "./tools";

/**
 * The one door tools are called through. Permissions are checked here, in application code, on every call, whatever the
 * model asked for: a role can only call the tools in its registry entry, the input must match the tool's schema, the
 * task's tool-call budget must not be spent, and a tool with nothing behind it says "not configured" instead of returning
 * something plausible. Every call, allowed or refused, is recorded.
 */

export type ToolErrorCode =
	| "forbidden"
	| "unknown_tool"
	| "invalid_input"
	| "unavailable"
	| "limit_exceeded"
	| "failed";
export type ToolError = { code: ToolErrorCode; message: string };
export type ToolResult = { ok: true; value: unknown } | { ok: false; error: ToolError };

export type ToolCallContext = { roleId: RoleId; taskId: string | null };
/** What the application does for a tool. Handlers get validated input and may throw; the gateway turns that into an error result. */
export type ToolHandler = (input: never, context: ToolCallContext) => Promise<unknown>;
export type ToolHandlers = Partial<Record<ToolId, ToolHandler>>;

export type GatewayEvent = {
	kind: "tool_call" | "tool_denied" | "tool_error";
	roleId: RoleId;
	taskId: string | null;
	tool: string;
	/** A redacted, shortened view of the input; the full input is not kept. */
	inputPreview: string;
	code?: ToolErrorCode;
	message?: string;
	ms: number;
};

export type GatewayDeps = {
	roleId: RoleId;
	taskId: string | null;
	actor?: Actor;
	limits: Pick<ExecutionLimits, "maxToolCalls">;
	handlers: ToolHandlers;
	record: (event: GatewayEvent) => Promise<void> | void;
	clock?: () => number;
	/** Keep (redacted) long text in what is recorded. Off by default: only short fields and lengths are kept. */
	recordRaw?: boolean;
};

export type ToolGateway = {
	call: (toolId: string, input: unknown) => Promise<ToolResult>;
	/** Calls made so far and how many of them were refused. */
	stats: () => { calls: number; denied: number };
	/** The tools this role may use and that have something behind them, as AI SDK tools (named with underscores) that route back through `call`. */
	aiTools: () => ToolSet;
};

const LONG_TEXT = 80;

/** Long strings (a customer's message, a draft) are recorded as their length unless raw recording is on. */
function shorten(value: unknown, recordRaw: boolean): unknown {
	if (typeof value === "string")
		return !recordRaw && value.length > LONG_TEXT ? `[${value.length} chars]` : value;
	if (Array.isArray(value)) return value.map((item) => shorten(item, recordRaw));
	if (value && typeof value === "object")
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v, recordRaw)]));
	return value;
}

const summarize = (input: unknown, recordRaw: boolean): string => {
	try {
		return previewText(JSON.stringify(shorten(redactDeep(input), recordRaw)) ?? "", 200);
	} catch {
		return "[unserializable]";
	}
};

export function createToolGateway(deps: GatewayDeps): ToolGateway {
	const role = ROLE_BY_ID[deps.roleId];
	const clock = deps.clock ?? Date.now;
	let calls = 0;
	let denied = 0;

	async function note(event: Omit<GatewayEvent, "roleId" | "taskId">) {
		try {
			await deps.record({ ...event, roleId: deps.roleId, taskId: deps.taskId });
		} catch (error) {
			// Recording must never turn a refused call into an allowed one, or hide a result.
			console.error(
				"[worldwide-ai] couldn't record a tool event",
				error instanceof Error ? error.message : error,
			);
		}
	}

	const refuse = async (
		kind: GatewayEvent["kind"],
		tool: string,
		input: unknown,
		error: ToolError,
		started: number,
	): Promise<ToolResult> => {
		if (kind === "tool_denied") denied += 1;
		await note({
			kind,
			tool,
			inputPreview: summarize(input, deps.recordRaw ?? false),
			code: error.code,
			message: error.message,
			ms: clock() - started,
		});
		return { ok: false, error };
	};

	async function call(toolId: string, input: unknown): Promise<ToolResult> {
		const started = clock();
		if (!isToolId(toolId))
			return refuse(
				"tool_denied",
				toolId,
				input,
				{ code: "unknown_tool", message: `There is no tool called "${toolId}".` },
				started,
			);
		if (!role.tools.includes(toolId))
			return refuse(
				"tool_denied",
				toolId,
				input,
				{ code: "forbidden", message: `${role.name} is not permitted to use ${toolId}.` },
				started,
			);
		if (calls >= deps.limits.maxToolCalls)
			return refuse(
				"tool_denied",
				toolId,
				input,
				{ code: "limit_exceeded", message: `This task has used its ${deps.limits.maxToolCalls} tool calls.` },
				started,
			);

		const definition = TOOLS[toolId];
		const parsed = definition.inputSchema.safeParse(input);
		if (!parsed.success)
			return refuse(
				"tool_error",
				toolId,
				input,
				{
					code: "invalid_input",
					message: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
				},
				started,
			);

		const handler = deps.handlers[toolId];
		if (!handler)
			return refuse(
				"tool_error",
				toolId,
				input,
				{
					code: "unavailable",
					message: `${toolId} is not available yet (${definition.integration === "internal" ? "no handler" : `${definition.integration} isn't configured`}). No result was produced.`,
				},
				started,
			);

		calls += 1;
		try {
			const value = await handler(parsed.data as never, { roleId: deps.roleId, taskId: deps.taskId });
			await note({
				kind: "tool_call",
				tool: toolId,
				inputPreview: summarize(input, deps.recordRaw ?? false),
				ms: clock() - started,
			});
			return { ok: true, value };
		} catch (error) {
			return refuse(
				"tool_error",
				toolId,
				input,
				{ code: "failed", message: error instanceof Error ? error.message : "The tool failed." },
				started,
			);
		}
	}

	return {
		call,
		stats: () => ({ calls, denied }),
		aiTools: () => {
			const set: ToolSet = {};
			for (const id of role.tools) {
				if (!deps.handlers[id]) continue;
				const definition = TOOLS[id];
				// Model providers don't accept dots in tool names, so "atlas.search" is offered as "atlas_search".
				set[id.replace(/\./g, "_")] = tool({
					description: definition.summary,
					inputSchema: definition.inputSchema,
					execute: async (input: unknown) => {
						const result = await call(id, input);
						return result.ok ? result.value : { error: result.error };
					},
				});
			}
			return set;
		},
	};
}
