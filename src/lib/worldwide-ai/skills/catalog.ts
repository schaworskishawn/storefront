import { ROLES, ROLE_BY_ID } from "../agents/registry";
import { FUNCTIONS } from "../functions/registry";
import type { FunctionDefinition } from "../functions/types";
import { ROLE_COUNT, type RoleId } from "../types";
import { FOUNDATION_AUTHORING } from "./foundations";
import { PACK_AUTHORING, type PackAuthoring } from "./role-packs";
import { SKILL_ID, type SkillDefinition } from "./types";

/**
 * The skill catalog: twelve shared foundations and one role pack per agent, 61 in all. This is the one canonical source.
 * The files under skills/worldwide-ai/ are an export of it (a test fails when they differ), and what guides work at run time
 * is never this file directly but the release a person approved, kept in the database exactly as it was approved.
 *
 * What a role pack needs, produces, must not be used for, and which tools it refers to all come from the agent's registry
 * entry and its function definition, so a pack cannot describe a handler that doesn't exist.
 */

export const FOUNDATION_COUNT = 12;

const fieldLine = (field: FunctionDefinition["fields"][number]) =>
	`${field.label}${field.required ? " (required)" : ""}`;

function rolePack(authoring: PackAuthoring): SkillDefinition {
	const role = ROLE_BY_ID[authoring.agent];
	const definition = FUNCTIONS.get(role.primary) as FunctionDefinition;
	const writtenByModel = definition.uses === "model";
	return {
		id: authoring.id,
		kind: "role-pack",
		title: authoring.title,
		description: authoring.description,
		version: authoring.version,
		useWhen: authoring.useWhen,
		// Situations, true of every role pack. What the function itself does not and must not do is under Limits.
		notWhen: [
			"What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.",
			"The request belongs to another agent's function: it goes through Nexus, not through this procedure.",
			"The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.",
		],
		inputs: definition.fields.length
			? definition.fields.map(fieldLine)
			: ["Nothing has to be supplied: it reads what the workspace has recorded."],
		steps: authoring.steps,
		outputs: [
			`A stored ${definition.outputType} record, checked against its declared format before it is kept.`,
			definition.review === "required"
				? "It waits for a person to accept or reject it."
				: "It is saved once code has verified it, and changes nothing outside the workspace.",
			"Its sources, anything missing, assumptions and warnings are listed with it.",
		],
		checks: authoring.checks,
		failure: authoring.failure,
		example: {
			request: `"${role.name}: ${definition.action.charAt(0).toLowerCase()}${definition.action.slice(1)}."`,
			result: definition.expectedResult,
		},
		limitations: [
			definition.notThis,
			role.boundaries,
			...(authoring.limitations ?? []),
			writtenByModel
				? "The wording comes from a model and is checked by code. A person reviews every draft before it is used."
				: "The figures and findings are calculated by code from what is supplied. No model writes them.",
		],
		agents: [authoring.agent],
		functions: role.workflows,
		foundations: authoring.foundations,
		tools: role.tools,
		knowledge: role.knowledge,
	};
}

export const ROLE_PACKS: readonly SkillDefinition[] = PACK_AUTHORING.map(rolePack);

export const FOUNDATIONS: readonly SkillDefinition[] = FOUNDATION_AUTHORING.map((authoring) => ({
	...authoring,
	kind: "foundation" as const,
	// A foundation may be followed by exactly the agents whose own role pack names it.
	agents: ROLES.filter((role) =>
		PACK_AUTHORING.some((pack) => pack.agent === role.id && pack.foundations.includes(authoring.id)),
	).map((role) => role.id),
	functions: [],
	foundations: [],
	tools: [],
	knowledge: [],
}));

export const SKILLS: readonly SkillDefinition[] = [...FOUNDATIONS, ...ROLE_PACKS];
export const SKILL_BY_ID: ReadonlyMap<string, SkillDefinition> = new Map(
	SKILLS.map((skill) => [skill.id, skill]),
);

/** The one role pack an agent follows. */
export const packOf = (agent: RoleId): SkillDefinition | undefined =>
	ROLE_PACKS.find((skill) => skill.agents[0] === agent);

/** An agent's role pack followed by that pack's foundations, in the pack's order. */
export function skillsOf(agent: RoleId): SkillDefinition[] {
	const pack = packOf(agent);
	if (!pack) return [];
	return [
		pack,
		...pack.foundations.flatMap((id) => {
			const foundation = SKILL_BY_ID.get(id);
			return foundation ? [foundation] : [];
		}),
	];
}

/**
 * Everything that must be true of the catalog, checked by a test and by every evaluation. Empty when it is sound. A pack with
 * a title and no procedure is exactly what this exists to refuse.
 */
export function catalogProblems(): string[] {
	const problems: string[] = [];
	if (FOUNDATIONS.length !== FOUNDATION_COUNT)
		problems.push(`There are ${FOUNDATIONS.length} foundations, not ${FOUNDATION_COUNT}.`);
	if (ROLE_PACKS.length !== ROLE_COUNT)
		problems.push(`There are ${ROLE_PACKS.length} role packs, not ${ROLE_COUNT}.`);
	const seen = new Set<string>();
	for (const skill of SKILLS) {
		if (seen.has(skill.id)) problems.push(`${skill.id} is defined twice.`);
		seen.add(skill.id);
		problems.push(...definitionProblems(skill).map((problem) => `${skill.id}: ${problem}`));
	}
	for (const role of ROLES) {
		const packs = ROLE_PACKS.filter((skill) => skill.agents.some((agent) => agent === role.id));
		if (packs.length !== 1) problems.push(`${role.name} has ${packs.length} role packs, not one.`);
		else if (!packs[0].functions.some((kind) => kind === role.primary))
			problems.push(`${packs[0].id} doesn't cover ${role.name}'s baseline function.`);
	}
	for (const foundation of FOUNDATIONS)
		if (foundation.agents.length === 0) problems.push(`${foundation.id} is used by no role pack.`);
	return problems;
}

/** What makes one definition a real procedure rather than a label. Used on the catalog and on stored packages alike. */
export function definitionProblems(skill: SkillDefinition): string[] {
	const problems: string[] = [];
	if (!SKILL_ID.test(skill.id) || skill.id.length > 64)
		problems.push("its id must be lower-case letters, digits and single hyphens, at most 64 characters.");
	if (skill.description.length < 40 || skill.description.length > 1024)
		problems.push("its description must say what it does and when to use it, in 40 to 1024 characters.");
	if (!Number.isInteger(skill.version) || skill.version < 1)
		problems.push("its version must be a whole number from 1.");
	if (skill.useWhen.length < 1) problems.push("it doesn't say when to use it.");
	if (skill.notWhen.length < 1) problems.push("it doesn't say when not to use it.");
	if (skill.inputs.length < 1) problems.push("it doesn't say what it needs.");
	if (skill.steps.length < 3) problems.push("its procedure has fewer than three steps.");
	if (skill.outputs.length < 1) problems.push("it doesn't say what it produces.");
	if (skill.checks.length < 2) problems.push("it has fewer than two checks.");
	if (skill.failure.length < 1) problems.push("it doesn't say what to do when something goes wrong.");
	if (!skill.example.request.trim() || !skill.example.result.trim()) problems.push("it has no example.");
	if (skill.limitations.length < 1) problems.push("it states no limits.");
	const lines = [
		...skill.useWhen,
		...skill.notWhen,
		...skill.inputs,
		...skill.steps,
		...skill.outputs,
		...skill.checks,
		...skill.failure,
		...skill.limitations,
	];
	if (lines.some((line) => !line.trim() || /[\r\n]/.test(line)))
		problems.push("a line is empty or runs over more than one line.");
	if (skill.kind === "role-pack") {
		if (skill.agents.length !== 1) problems.push("a role pack belongs to exactly one agent.");
		if (skill.functions.length < 1) problems.push("it is bound to no function.");
		if (skill.foundations.length < 2) problems.push("it names fewer than two foundations.");
		for (const id of skill.foundations) {
			const foundation = SKILL_BY_ID.get(id);
			if (!foundation) problems.push(`it names a foundation that doesn't exist (${id}).`);
			else if (foundation.kind !== "foundation") problems.push(`it tries to load another role pack (${id}).`);
		}
		if (new Set(skill.foundations).size !== skill.foundations.length)
			problems.push("it names a foundation twice.");
	} else {
		if (skill.foundations.length) problems.push("a foundation can't load other skills.");
		if (skill.tools.length || skill.knowledge.length)
			problems.push("a foundation asks for no tool or knowledge of its own.");
	}
	return problems;
}
