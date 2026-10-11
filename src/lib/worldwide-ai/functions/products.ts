import { iso, json, type Row, type Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import { personalScopeOf } from "../tasks/repo";
import type { RoleId, SourceRef, TaskKind } from "../types";

/**
 * What a function produced: one typed, reviewable record per task. The record carries its own evidence envelope (what was
 * missing, what was assumed, how much of the input it covers, where the facts came from) and two checksums: one of the
 * result itself and one of exactly what was supplied, so a stored result can always be tied back to its input and re-checked.
 */

export type ReviewState = "pending" | "accepted" | "rejected" | "not_required";

export type WorkProduct = {
	id: string;
	taskId: string;
	functionId: TaskKind;
	functionVersion: number;
	agentId: RoleId;
	outputType: string;
	scope: string;
	demo: boolean;
	summary: string;
	payload: unknown;
	payloadSha256: string;
	inputSha256: string;
	missing: string[];
	assumptions: string[];
	coverage: Record<string, string | number>;
	warnings: string[];
	sourceRefs: SourceRef[];
	model: string | null;
	promptVersion: string | null;
	reviewRequired: boolean;
	reviewState: ReviewState;
	reviewedBy: string | null;
	reviewedAt: string | null;
	reviewNote: string | null;
	createdAt: string;
	updatedAt: string;
};

/** JSON with every object's keys in order, so the same record always hashes the same, whatever order it was built in. */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export const hashOf = (value: unknown): string => sha256Hex(canonicalJson(value));

const COLUMNS = `id, task_id, function_id, function_version, agent_id, output_type, scope, demo, summary, payload, payload_sha256,
	input_sha256, missing, assumptions, coverage, warnings, source_refs, model, prompt_version, review_required, review_state,
	reviewed_by, reviewed_at, review_note, created_at, updated_at`;

function mapProduct(r: Row): WorkProduct {
	return {
		id: r.id as string,
		taskId: r.task_id as string,
		functionId: r.function_id as TaskKind,
		functionVersion: Number(r.function_version),
		agentId: r.agent_id as RoleId,
		outputType: r.output_type as string,
		scope: r.scope as string,
		demo: Boolean(r.demo),
		summary: r.summary as string,
		payload: r.payload,
		payloadSha256: r.payload_sha256 as string,
		inputSha256: r.input_sha256 as string,
		missing: (r.missing as string[]) ?? [],
		assumptions: (r.assumptions as string[]) ?? [],
		coverage: (r.coverage as Record<string, string | number>) ?? {},
		warnings: (r.warnings as string[]) ?? [],
		sourceRefs: (r.source_refs as SourceRef[]) ?? [],
		model: (r.model as string | null) ?? null,
		promptVersion: (r.prompt_version as string | null) ?? null,
		reviewRequired: Boolean(r.review_required),
		reviewState: r.review_state as ReviewState,
		reviewedBy: (r.reviewed_by as string | null) ?? null,
		reviewedAt: iso(r.reviewed_at),
		reviewNote: (r.review_note as string | null) ?? null,
		createdAt: iso(r.created_at) as string,
		updatedAt: iso(r.updated_at) as string,
	};
}

export type NewProduct = Pick<
	WorkProduct,
	| "taskId"
	| "functionId"
	| "functionVersion"
	| "agentId"
	| "outputType"
	| "scope"
	| "demo"
	| "summary"
	| "payload"
	| "inputSha256"
	| "missing"
	| "assumptions"
	| "coverage"
	| "warnings"
	| "sourceRefs"
	| "model"
	| "promptVersion"
	| "reviewRequired"
>;

/** Stores a task's result. A task gets one however often it is retried: a second attempt finds the first and returns it. */
export async function insertProduct(
	sql: Sql,
	input: NewProduct,
): Promise<{ product: WorkProduct; created: boolean }> {
	const { rows } = await sql.query(
		`insert into wai_work_products (task_id, function_id, function_version, agent_id, output_type, scope, demo, summary, payload,
			payload_sha256, input_sha256, missing, assumptions, coverage, warnings, source_refs, model, prompt_version, review_required, review_state)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::json,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19,$20)
		 on conflict (task_id) do nothing returning ${COLUMNS}`,
		[
			input.taskId,
			input.functionId,
			input.functionVersion,
			input.agentId,
			input.outputType,
			input.scope,
			input.demo,
			input.summary.slice(0, 400),
			json(input.payload),
			hashOf(input.payload),
			input.inputSha256,
			json(input.missing),
			json(input.assumptions),
			json(input.coverage),
			json(input.warnings),
			json(input.sourceRefs),
			input.model,
			input.promptVersion,
			input.reviewRequired,
			input.reviewRequired ? "pending" : "not_required",
		],
	);
	if (rows[0]) return { product: mapProduct(rows[0]), created: true };
	const existing = await getProductByTask(sql, input.taskId);
	if (!existing) throw new Error("The result couldn't be stored.");
	return { product: existing, created: false };
}

export async function getProduct(sql: Sql, id: string): Promise<WorkProduct | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const { rows } = await sql.query(`select ${COLUMNS} from wai_work_products where id = $1`, [id]);
	return rows[0] ? mapProduct(rows[0]) : null;
}

export async function getProductByTask(sql: Sql, taskId: string): Promise<WorkProduct | null> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_work_products where task_id = $1`, [taskId]);
	return rows[0] ? mapProduct(rows[0]) : null;
}

export type ProductFilter = {
	agentId?: RoleId;
	functionId?: TaskKind;
	reviewState?: ReviewState;
	/** An operator's key: business results plus that person's own. Left out, business results only. */
	viewer?: string;
	demo?: "include" | "only";
	limit?: number;
};

export async function listProducts(sql: Sql, filter: ProductFilter = {}): Promise<WorkProduct[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	const push = (clause: string, value: unknown) => {
		params.push(value);
		where.push(clause.replace("?", `$${params.length}`));
	};
	if (filter.agentId) push("agent_id = ?", filter.agentId);
	if (filter.functionId) push("function_id = ?", filter.functionId);
	if (filter.reviewState) push("review_state = ?", filter.reviewState);
	if (filter.viewer) push("(scope = 'business' or scope = ?)", personalScopeOf(filter.viewer));
	else where.push(`scope = 'business'`);
	if (filter.demo === "only") where.push("demo");
	else if (filter.demo !== "include") where.push("not demo");
	params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200));
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_work_products where ${where.join(" and ")} order by created_at desc, id limit $${params.length}`,
		params,
	);
	return rows.map(mapProduct);
}

/** How many business results are waiting for a person (never counting personal or demonstration ones). */
export async function countPendingProducts(sql: Sql): Promise<number> {
	const { rows } = await sql.query<{ n: number }>(
		`select count(*)::int as n from wai_work_products where review_state = 'pending' and scope = 'business' and not demo`,
	);
	return Number(rows[0].n);
}
