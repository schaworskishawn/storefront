import { ROLES, ROLE_BY_ID } from "../agents/registry";
import { readConfig } from "../config";
import { INTEGRATIONS, configStatus } from "../integrations/catalog";
import { ROLE_COUNT, ownerOfKind } from "../types";
import { functionReadiness, READINESS_LABELS, requiredIntegrations } from "./readiness";
import { ALL_FUNCTIONS, FUNCTIONS, capabilityMatrix } from "./registry";
import type { FunctionDefinition } from "./types";

/**
 * The capability matrix as a document: one entry per agent's baseline function, written out from the registry so it can't
 * claim anything the code doesn't do. `docs/worldwide-ai/capability-matrix.md` is this text; a test fails when the two differ.
 *
 * It reports what is true of the code, not of any one installation: readiness is shown for an installation with nothing
 * configured, which is the same as listing what each function needs. Live readiness is on the Team page.
 */

/** The test file that exercises a function. Checked by the matrix test: the file must exist and name the function's agent. */
export function evidenceFor(definition: FunctionDefinition): string {
	if (definition.external) {
		const byRunner: Record<string, string> = {
			"workflows/relay.ts": "workflows/relay.test.ts",
			"workflows/inspection.ts": "workflows/inspection.test.ts",
			"workflows/scheduled.ts": "workflows/scheduled.test.ts",
		};
		return `src/lib/worldwide-ai/${byRunner[definition.external.runner] ?? ""}`;
	}
	return definition.uses === "model"
		? "src/lib/worldwide-ai/functions/drafting.test.ts"
		: "src/lib/worldwide-ai/functions/functions.test.ts";
}

/** What has and hasn't been proven about a function. Nothing here has been run against live services. */
export function statusOf(definition: FunctionDefinition): string {
	if (definition.external)
		return definition.uses === "model"
			? "Implemented. Tested with a stand-in model and an in-memory database; not yet run against the live model or database."
			: "Implemented. Tested against an in-memory database and a stand-in worker; not yet run against the live services.";
	return definition.uses === "model"
		? "Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven."
		: "Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.";
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

const names = (ids: readonly string[]) =>
	ids.map((id) => INTEGRATIONS[id as keyof typeof INTEGRATIONS]?.name ?? id).join(", ");

export function renderCapabilityMatrix(): string {
	const rows = capabilityMatrix();
	const bare = configStatus(readConfig({}), {});
	const out: string[] = [];
	const line = (text = "") => out.push(text);

	const model = rows.filter((row) => FUNCTIONS.get(row.functionId)?.uses === "model").length;
	const reviewed = rows.filter((row) => FUNCTIONS.get(row.functionId)?.review === "required").length;
	const planned = ROLES.reduce((n, role) => n + role.planned.length, 0);

	line("# Worldwide AI: capability matrix");
	line();
	line(
		"<!-- Generated from the registry by `pnpm worldwide-ai:matrix`. Do not edit by hand: a test fails when this file and the registry differ. -->",
	);
	line();
	line(
		`One entry for each of the ${ROLE_COUNT} agents, describing the one baseline function each agent can actually run. It is written out from \`src/lib/worldwide-ai/agents/registry.ts\` and \`src/lib/worldwide-ai/functions/registry.ts\`, so it says what the code does and nothing more.`,
	);
	line();
	line("How to read it:");
	line();
	line(
		`- **${rows.length} baseline functions**, one per agent: ${rows.length - model} are calculated by code alone, and ${model} are written by the model and then checked by code. ${ALL_FUNCTIONS.length} functions exist in all (some agents own more than one).`,
	);
	line(
		`- **Review**: ${reviewed} baselines produce a draft that a person must accept or reject; the other ${rows.length - reviewed} save a result that code has verified and that changes nothing outside the workspace.`,
	);
	line(
		"- **Needs** lists the services a function can't run without. **With nothing configured** is its readiness on an installation with no settings at all, with the names of the missing settings (never their values). Live readiness for your installation is on the Team page.",
	);
	line(
		"- **Status** separates implemented from proven. Every function here is tested; none has been run against the live database, the live model or real business records.",
	);
	line(
		`- **Role pack**: the skills system (role packs and foundation skills) is not built, so no agent has one yet. Each agent runs on the instructions and tool list in the registry.`,
	);
	line(
		`- **Planned, not built** lists ${planned} later capabilities that have no working code. They are shown so that nobody mistakes an agent's name for something it can't do yet.`,
	);
	line();
	line("## Summary");
	line();
	line("| # | Agent | Baseline function | Written by | Review | Needs |");
	line("| --- | --- | --- | --- | --- | --- |");
	for (const row of rows) {
		const definition = FUNCTIONS.get(row.functionId) as FunctionDefinition;
		line(
			`| ${row.number} | ${cell(row.agent)} (\`${row.agentId}\`) | \`${row.functionId}\`: ${cell(row.action)} | ${
				definition.uses === "model" ? "model, checked by code" : "code"
			} | ${definition.review === "required" ? "a person" : "none"} | ${cell(names(requiredIntegrations(definition)))} |`,
		);
	}
	line();
	line("## Each agent");
	for (const row of rows) {
		const definition = FUNCTIONS.get(row.functionId) as FunctionDefinition;
		const role = ROLE_BY_ID[row.agentId];
		const readiness = functionReadiness(definition, { statuses: bare, enabled: true });
		const others = role.workflows.filter((kind) => kind !== role.primary);
		line();
		line(`### ${row.number}. ${row.agent}: ${row.title} (\`${row.agentId}\`)`);
		line();
		line(`- **Function:** \`${definition.id}\` version ${definition.version}: ${definition.action}`);
		line(`- **What it produces:** ${definition.expectedResult}`);
		line(`- **Handler:** \`${row.handler}\``);
		line(`- **Inputs** (\\* required): ${row.inputs}`);
		line(
			`- **Output:** \`${row.outputType}\`, checked against its declared format before it is stored in \`${row.store}\``,
		);
		line(`- **Written by:** ${row.uses}`);
		line(`- **Review:** ${row.review}`);
		line(`- **Needs:** ${names(requiredIntegrations(definition))}`);
		line(
			`- **With nothing configured:** ${READINESS_LABELS[readiness.status]}${
				readiness.missing.length ? ` (missing: ${readiness.missing.join(", ")})` : ""
			}`,
		);
		line(`- **Role pack:** not built`);
		line(`- **Status:** ${statusOf(definition)}`);
		line(`- **Evidence:** \`${evidenceFor(definition)}\``);
		line(`- **It does not:** ${definition.notThis}`);
		if (others.length)
			line(
				`- **Also owns:** ${others
					.map((kind) => {
						const other = FUNCTIONS.get(kind) as FunctionDefinition;
						return `\`${kind}\` (${other.action}; evidence \`${evidenceFor(other)}\`)`;
					})
					.join("; ")}`,
			);
		for (const capability of role.planned)
			line(
				`- **Planned, not built:** \`${capability.id}\` (${capability.label}). Needs ${names(capability.needs)}. ${capability.note}`,
			);
	}
	line();
	return out.join("\n");
}

/** Every function's owner, for the test that checks the matrix covers the roster exactly once. */
export const matrixOwners = () => capabilityMatrix().map((row) => ownerOfKind(row.functionId));
