import { iso, type Sql } from "./db/sql";
import type { RoleId } from "./types";

/** What the roles have used: model calls with their token counts and time, and tool calls. Kept per task and per role. */

export type UsageInput = {
	taskId: string | null;
	roleId: RoleId;
	kind: "model" | "tool";
	model?: string | null;
	tool?: string | null;
	inputTokens?: number | null;
	outputTokens?: number | null;
	latencyMs?: number | null;
	status?: "ok" | "error" | "denied";
};

const whole = (n: number | null | undefined): number | null =>
	typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;

export async function recordUsage(sql: Sql, usage: UsageInput): Promise<void> {
	const input = whole(usage.inputTokens);
	const output = whole(usage.outputTokens);
	await sql.query(
		`insert into wai_usage (task_id, role_id, kind, model, tool, input_tokens, output_tokens, total_tokens, latency_ms, status)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		[
			usage.taskId,
			usage.roleId,
			usage.kind,
			usage.model ?? null,
			usage.tool ?? null,
			input,
			output,
			input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null,
			whole(usage.latencyMs),
			usage.status ?? "ok",
		],
	);
}

export type UsageSummary = {
	roleId: RoleId;
	modelCalls: number;
	toolCalls: number;
	deniedCalls: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
};

/** Usage per role since a moment, for the dashboard. */
export async function summarizeUsage(sql: Sql, since: Date): Promise<UsageSummary[]> {
	const { rows } = await sql.query(
		`select role_id,
			count(*) filter (where kind = 'model')::int as model_calls,
			count(*) filter (where kind = 'tool' and status = 'ok')::int as tool_calls,
			count(*) filter (where status = 'denied')::int as denied_calls,
			coalesce(sum(input_tokens), 0)::int as input_tokens,
			coalesce(sum(output_tokens), 0)::int as output_tokens,
			coalesce(sum(total_tokens), 0)::int as total_tokens
		 from wai_usage where at >= $1 group by role_id order by total_tokens desc, role_id`,
		[since.toISOString()],
	);
	return rows.map((r) => ({
		roleId: r.role_id as RoleId,
		modelCalls: Number(r.model_calls),
		toolCalls: Number(r.tool_calls),
		deniedCalls: Number(r.denied_calls),
		inputTokens: Number(r.input_tokens),
		outputTokens: Number(r.output_tokens),
		totalTokens: Number(r.total_tokens),
	}));
}

export type TaskUsage = {
	at: string;
	kind: "model" | "tool";
	model: string | null;
	tool: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	latencyMs: number | null;
	status: string;
};

export async function usageForTask(sql: Sql, taskId: string): Promise<TaskUsage[]> {
	const { rows } = await sql.query(
		`select at, kind, model, tool, input_tokens, output_tokens, latency_ms, status from wai_usage where task_id = $1 order by id`,
		[taskId],
	);
	return rows.map((r) => ({
		at: iso(r.at) as string,
		kind: r.kind as "model" | "tool",
		model: (r.model as string | null) ?? null,
		tool: (r.tool as string | null) ?? null,
		inputTokens: r.input_tokens === null ? null : Number(r.input_tokens),
		outputTokens: r.output_tokens === null ? null : Number(r.output_tokens),
		latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
		status: r.status as string,
	}));
}
