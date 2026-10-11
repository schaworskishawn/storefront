import type { z } from "zod";
import type { ExecutionLimits } from "../agents/limits";
import type { IntegrationId } from "../integrations/catalog";
import type { TaskRecord } from "../tasks/repo";
import type { RoleId, SourceRef, TaskKind } from "../types";
import type { WorkflowDeps } from "../workflows/types";
import { tryDec } from "../decimal";
import { isIsoDay, parseList, parseTable, type Row, type TableColumn } from "./table";

/**
 * The contract every agent function is registered under. A function is not a persona: it declares what it needs (fields a
 * person fills in, with their types and limits), has a real handler in application code, returns a typed record, and says
 * what "done" means. The shared pipeline (pipeline.ts) does the rest the same way for all of them: authorize, validate,
 * create or find the task, run the handler, validate and store the result, read it back, and only then record the outcome.
 */

type FieldBase = { key: string; label: string; required?: boolean; help?: string };

export type FieldSpec =
	| (FieldBase & { kind: "text" | "textarea"; max?: number; placeholder?: string })
	| (FieldBase & { kind: "date" | "decimal" | "integer" })
	| (FieldBase & { kind: "select"; options: ReadonlyArray<{ value: string; label: string }> })
	| (FieldBase & { kind: "list"; maxItems?: number; placeholder?: string })
	| (FieldBase & { kind: "table"; columns: readonly TableColumn[]; maxRows?: number; minRows?: number })
	| (FieldBase & { kind: "images"; maxFiles?: number });

/** A file a person attached to a task (a screenshot to review), stored privately and referred to by checksum. */
export type Upload = {
	field: string;
	path: string;
	name: string;
	mime: string;
	bytes: number;
	sha256: string;
};

/** A function's input after validation: text and numbers as strings, lists as string arrays, tables as rows. */
export type FunctionInput = Record<string, string | string[] | Row[] | undefined>;

export type DraftArgs<S extends z.ZodType> = {
	schema: S;
	/** The task for the model, with everything a person supplied fenced as data. */
	prompt: string;
	promptVersion: string;
	images?: ReadonlyArray<{ bytes: Uint8Array; mime: string }>;
};

export type FunctionContext = {
	task: TaskRecord;
	input: FunctionInput;
	uploads: readonly Upload[];
	now: Date;
	/** Today on the Winnipeg calendar (YYYY-MM-DD): the day every due-date comparison is made against. */
	today: string;
	deps: WorkflowDeps;
	limits: ExecutionLimits;
	/** One schema-checked call to the model under the role's instructions and limits, with usage recorded. */
	draft: <S extends z.ZodType>(args: DraftArgs<S>) => Promise<z.infer<S>>;
	readUpload: (upload: Upload) => Promise<Uint8Array>;
	text: (key: string) => string;
	list: (key: string) => string[];
	rows: (key: string) => Row[];
	/** Looks up another registered function (Verify re-checks other agents' results with their own rules). */
	definitionOf: (id: string) => FunctionDefinition | undefined;
};

/** Thrown by a handler when what was supplied can't support the result (a rule is missing, the records don't relate). */
export class FunctionBlocked extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FunctionBlocked";
	}
}

export type FunctionResult<O> = {
	output: O;
	/** One line for lists and notifications: what was produced, with its key number. */
	summary: string;
	/** What couldn't be determined because something wasn't supplied. Never filled in with a guess. */
	missing?: string[];
	assumptions?: string[];
	/** How much of the input the result covers ("rows checked": 42). */
	coverage?: Record<string, string | number>;
	/** Things a reviewer should look at before relying on the result. */
	warnings?: string[];
	sourceRefs?: SourceRef[];
};

export type FunctionDefinition<O = unknown> = {
	id: TaskKind;
	version: number;
	agent: RoleId;
	/** The button label: "Reconcile settlements". */
	action: string;
	/** The typed record it produces: "SettlementReconciliation". */
	outputType: string;
	/** What it actually does, in a sentence or two. */
	purpose: string;
	/** What will exist when the task is done. Recorded on the task before it runs. */
	expectedResult: string;
	/** What this function does not do, so a narrower result is never mistaken for a wider one. */
	notThis: string;
	fields: readonly FieldSpec[];
	output: z.ZodType<O>;
	/** "code": calculated entirely by application code. "model": the wording comes from the model, the checks from code. */
	uses: "code" | "model";
	/** Integrations it needs beyond the database. */
	requires: readonly IntegrationId[];
	/** Whether a person must accept the result before the task can be completed. */
	review: "required" | "none";
	/** Personal functions keep the task and its result visible to the person who asked, and nobody else. */
	scope?: "personal";
	promptVersion?: string;
	handler: (ctx: FunctionContext) => Promise<FunctionResult<O>>;
	/** Checks of the produced record against what was supplied. Any problem fails the task and nothing is stored. */
	verify?: (output: O, input: FunctionInput) => string[];
	/** Fictional input for a labelled demonstration run, or null when a run only makes sense against a real record. */
	sample: (() => Record<string, unknown>) | null;
	/**
	 * Set for a function that already has its own workflow and store (Relay's support draft). The registry lists it, but the
	 * shared pipeline doesn't run it.
	 */
	external?: { runner: string; store: string; start: string };
};

export const defineFunction = <O>(definition: FunctionDefinition<O>): FunctionDefinition<O> => definition;

/** The default and the most rows any table field may carry. */
export const DEFAULT_MAX_ROWS = 500;
export const MAX_TEXT = 20_000;

export type ParsedInput =
	| { ok: true; input: FunctionInput; rowsRead: number }
	| { ok: false; problems: string[] };

/**
 * Validates what was supplied against a function's fields. Every problem is specific ("Bank lines, row 3: amount isn't a
 * number"), unknown fields are dropped, and nothing is defaulted: a required value that is missing is a blocker.
 */
export function parseInput(
	definition: Pick<FunctionDefinition, "fields">,
	raw: Record<string, unknown>,
): ParsedInput {
	const problems: string[] = [];
	const input: FunctionInput = {};
	let rowsRead = 0;
	for (const field of definition.fields) {
		const value = raw[field.key];
		const blank = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
		switch (field.kind) {
			case "table": {
				const parsed = parseTable(value, field.columns, {
					label: field.label,
					maxRows: field.maxRows ?? DEFAULT_MAX_ROWS,
					minRows: field.required ? Math.max(field.minRows ?? 1, 1) : field.minRows,
				});
				problems.push(...parsed.problems);
				input[field.key] = parsed.rows;
				rowsRead += parsed.rows.length;
				break;
			}
			case "list": {
				const items = parseList(value, field.maxItems ?? 50);
				if (field.required && items.length === 0)
					problems.push(`${field.label} is required (one item per line).`);
				input[field.key] = items;
				break;
			}
			case "images":
				// Files travel beside the form values; the pipeline checks them.
				break;
			default: {
				if (blank) {
					if (field.required) problems.push(`${field.label} is required.`);
					break;
				}
				const text = String(value).replace(/\r\n?/g, "\n").trim();
				if (field.kind === "date" && !isIsoDay(text))
					problems.push(`${field.label} must be a date like 2026-10-31.`);
				else if (field.kind === "decimal" && !tryDec(text)) problems.push(`${field.label} must be a number.`);
				else if (field.kind === "integer" && !/^\d+$/.test(text))
					problems.push(`${field.label} must be a whole number.`);
				else if (field.kind === "select" && !field.options.some((o) => o.value === text))
					problems.push(`${field.label} must be one of: ${field.options.map((o) => o.value).join(", ")}.`);
				else if (
					text.length >
					((field.kind === "text" || field.kind === "textarea" ? field.max : undefined) ?? MAX_TEXT)
				)
					problems.push(`${field.label} is too long.`);
				else input[field.key] = text;
			}
		}
	}
	return problems.length ? { ok: false, problems } : { ok: true, input, rowsRead };
}

/** A short, safe label for a task title, taken from the first text field that has one. */
export function inputLabel(definition: Pick<FunctionDefinition, "fields">, input: FunctionInput): string {
	for (const field of definition.fields) {
		const value = input[field.key];
		if ((field.kind === "text" || field.kind === "date") && typeof value === "string" && value)
			return value.slice(0, 70);
	}
	return "";
}
