import { z } from "zod";
import { ROLES, ROLE_BY_ID } from "../agents/registry";
import { TASK_KINDS, WORKSPACE_PATH, ownerOfKind, type RoleId, type TaskKind } from "../types";
import { DATA_FUNCTIONS } from "./data";
import { DRAFTING_FUNCTIONS } from "./drafting";
import { FINANCE_FUNCTIONS } from "./finance";
import { LOGISTICS_FUNCTIONS } from "./logistics";
import { MANUFACTURING_FUNCTIONS } from "./manufacturing";
import { OPERATIONS_FUNCTIONS } from "./operations";
import { requiredIntegrations } from "./readiness";
import { defineFunction, type FunctionDefinition } from "./types";

/**
 * Every function an agent can run, in one place. The Team page, Nexus's routing, the task runner and the capability matrix
 * all read this list, so an agent's button, what Nexus can dispatch, and what is documented can't disagree.
 *
 * Four functions were built before the shared pipeline and keep their own workflow and store; they are listed here too (as
 * `external`) so readiness and the matrix cover them, but the pipeline doesn't run them.
 */

const never = async (): Promise<never> => {
	throw new Error("This function runs through its own workflow.");
};

const EXTERNAL: FunctionDefinition[] = [
	defineFunction({
		id: "relay.support_draft",
		version: 1,
		agent: "relay",
		action: "Prepare support reply",
		outputType: "SupportDraft",
		purpose:
			"Takes a support case, retrieves the approved policy that applies through Atlas, and drafts a reply that cites it. If no approved source matches, it writes a holding reply instead of guessing.",
		expectedResult:
			"A reply draft that cites approved sources (or says none matched) is reviewed by a person and saved to the case, and the application confirms the draft and its references were stored against the right case.",
		notThis:
			"Saving a draft never sends it. The task is completed only after the saved draft has been read back and checked.",
		fields: [{ key: "caseId", label: "Support case", kind: "text", required: true }],
		output: z.unknown(),
		uses: "model",
		requires: [],
		review: "required",
		handler: never,
		sample: null,
		external: {
			runner: "workflows/relay.ts",
			store: "wai_drafts, wai_draft_sources",
			start: `${WORKSPACE_PATH}/support`,
		},
	}),
	defineFunction({
		id: "patch.site_inspection",
		version: 1,
		agent: "patch",
		action: "Inspect website pages",
		outputType: "SiteInspection",
		purpose:
			"Opens chosen pages at desktop and phone widths on the OpenClaw worker, and brings back a screenshot of each and what the browser reported, as checksum-verified evidence.",
		expectedResult:
			"Screenshots of each page at desktop and mobile widths are saved as evidence with their checksums, the findings are recorded, and the OpenClaw run id is kept.",
		notThis:
			"Only pages on the allowed hosts are opened. Without the worker configured nothing runs and no screenshot is produced.",
		fields: [{ key: "urls", label: "Pages to inspect", kind: "list", required: true, maxItems: 5 }],
		output: z.unknown(),
		uses: "code",
		requires: ["openclaw", "storage"],
		review: "none",
		handler: never,
		sample: null,
		external: {
			runner: "workflows/inspection.ts",
			store: "wai_openclaw_runs, wai_files, wai_findings",
			start: `${WORKSPACE_PATH}/engineering`,
		},
	}),
	defineFunction({
		id: "review.document_scan",
		version: 1,
		agent: "review",
		action: "Scan the document library",
		outputType: "DocumentScan",
		purpose:
			"Scans the knowledge library for reviews that are due, documents that are expiring, and versions waiting for approval, and records a finding for each.",
		expectedResult:
			"Every document past review, expiring or awaiting approval has a finding recorded once, and the scan's counts are stored as evidence.",
		notThis: "It runs on a schedule or on demand over the library only. It changes no document.",
		fields: [],
		output: z.unknown(),
		uses: "code",
		requires: [],
		review: "none",
		handler: never,
		sample: null,
		external: {
			runner: "workflows/scheduled.ts",
			store: "wai_findings",
			start: `${WORKSPACE_PATH}/knowledge`,
		},
	}),
	defineFunction({
		id: "watch.health_check",
		version: 1,
		agent: "watch",
		action: "Check every integration",
		outputType: "HealthCheck",
		purpose:
			"Probes each configured integration with a read-only request, records what answered, and raises a finding for anything that is down.",
		expectedResult:
			"A health result is recorded for every integration, and a finding exists for each one that is not answering.",
		notThis:
			"Probes are read-only. The model provider and Trigger.dev are not probed; their status comes from the last real use.",
		fields: [],
		output: z.unknown(),
		uses: "code",
		requires: [],
		review: "none",
		handler: never,
		sample: null,
		external: {
			runner: "workflows/scheduled.ts",
			store: "wai_integration_health, wai_findings",
			start: `${WORKSPACE_PATH}/integrations`,
		},
	}),
];

export const ALL_FUNCTIONS: readonly FunctionDefinition[] = [
	...EXTERNAL,
	...(OPERATIONS_FUNCTIONS as FunctionDefinition[]),
	...(DATA_FUNCTIONS as FunctionDefinition[]),
	...(FINANCE_FUNCTIONS as FunctionDefinition[]),
	...(LOGISTICS_FUNCTIONS as FunctionDefinition[]),
	...(MANUFACTURING_FUNCTIONS as FunctionDefinition[]),
	...DRAFTING_FUNCTIONS,
];

export const FUNCTIONS: ReadonlyMap<TaskKind, FunctionDefinition> = new Map(
	ALL_FUNCTIONS.map((f) => [f.id, f]),
);

/** Looks a function up by id. Anything not registered here simply doesn't exist: there is no fallback handler. */
export const lookupFunction = (id: string): FunctionDefinition | undefined => FUNCTIONS.get(id as TaskKind);

export const functionsOf = (role: RoleId): FunctionDefinition[] =>
	ROLE_BY_ID[role].workflows.flatMap((kind) => FUNCTIONS.get(kind) ?? []);

export const primaryFunctionOf = (role: RoleId): FunctionDefinition | undefined =>
	FUNCTIONS.get(ROLE_BY_ID[role].primary);

/** Problems with the registry itself. Empty means: every kind has a handler, owned by the agent its name says. */
export function registryProblems(): string[] {
	const problems: string[] = [];
	if (ALL_FUNCTIONS.length !== FUNCTIONS.size) problems.push("A function id is registered twice.");
	for (const kind of TASK_KINDS)
		if (!FUNCTIONS.has(kind)) problems.push(`${kind} has no registered function.`);
	for (const definition of ALL_FUNCTIONS) {
		if (!(TASK_KINDS as readonly string[]).includes(definition.id))
			problems.push(`${definition.id} isn't a known kind of task.`);
		if (ownerOfKind(definition.id) !== definition.agent)
			problems.push(`${definition.id} is registered to ${definition.agent}.`);
	}
	for (const role of ROLES)
		if (!FUNCTIONS.has(role.primary)) problems.push(`${role.name} has no handler for its baseline function.`);
	return problems;
}

export type MatrixRow = {
	number: number;
	agentId: RoleId;
	agent: string;
	title: string;
	functionId: TaskKind;
	action: string;
	handler: string;
	inputs: string;
	outputType: string;
	store: string;
	uses: string;
	requires: string;
	review: string;
	notThis: string;
};

const HANDLER_FILE: Array<[readonly FunctionDefinition[], string]> = [
	[OPERATIONS_FUNCTIONS as FunctionDefinition[], "functions/operations.ts"],
	[DATA_FUNCTIONS as FunctionDefinition[], "functions/data.ts"],
	[FINANCE_FUNCTIONS as FunctionDefinition[], "functions/finance.ts"],
	[LOGISTICS_FUNCTIONS as FunctionDefinition[], "functions/logistics.ts"],
	[MANUFACTURING_FUNCTIONS as FunctionDefinition[], "functions/manufacturing.ts"],
	[DRAFTING_FUNCTIONS, "functions/drafting.ts"],
];

/** The capability matrix: one row per agent's baseline function, generated from the registry, never written by hand. */
export function capabilityMatrix(): MatrixRow[] {
	return ROLES.map((role) => {
		const definition = FUNCTIONS.get(role.primary) as FunctionDefinition;
		const file =
			definition.external?.runner ?? HANDLER_FILE.find(([list]) => list.includes(definition))?.[1] ?? "";
		return {
			number: role.number,
			agentId: role.id,
			agent: role.name,
			title: role.title,
			functionId: definition.id,
			action: definition.action,
			handler: `src/lib/worldwide-ai/${file}`,
			inputs:
				definition.fields
					.map(
						(f) =>
							`${f.label}${f.required ? "*" : ""} (${f.kind}${f.kind === "table" ? `, up to ${f.maxRows ?? 500} rows` : ""})`,
					)
					.join("; ") || "none",
			outputType: definition.outputType,
			store: definition.external?.store ?? "wai_work_products",
			uses: definition.uses === "model" ? "model writes, code checks" : "code only",
			requires: requiredIntegrations(definition).join(", "),
			review: definition.review === "required" ? "a person must accept" : "none (verified save)",
			notThis: definition.notThis,
		};
	});
}
