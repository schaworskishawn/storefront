import type { ToolId } from "../agents/tools";
import { sha256Hex } from "../hash";
import type { RoleId, TaskKind } from "../types";

/**
 * A skill is a written, tested procedure for one kind of work: when to use it, when not to, what it needs, the steps, what it
 * produces, and the checks before it is finished. It is not an agent, a model, a connector, or a grant of authority. The
 * registered handler does the work and stores the result; the skill says how the work is meant to be done, and is put in
 * front of the model when a function's wording comes from one.
 *
 * Two kinds exist. A foundation is shared by many agents (retrieving approved sources, exact calculation). A role pack belongs
 * to one agent and is bound to that agent's functions. There are twelve foundations and one role pack per agent.
 */

export type SkillKind = "foundation" | "role-pack";

export type SkillDefinition = {
	/** Lower-case letters, digits and single hyphens. Also the package's folder name. */
	id: string;
	kind: SkillKind;
	title: string;
	/** What it does and when to use it, in a sentence or two. This is all a model sees until the skill is selected. */
	description: string;
	/** Bumped whenever anything below changes. An approval is of one version's exact content. */
	version: number;
	useWhen: readonly string[];
	notWhen: readonly string[];
	inputs: readonly string[];
	steps: readonly string[];
	outputs: readonly string[];
	checks: readonly string[];
	failure: readonly string[];
	example: { request: string; result: string };
	limitations: readonly string[];

	// ---- How the application binds it. None of this can widen what an agent is allowed to do. ----
	/** The agents that may follow it. A role pack has exactly one. */
	agents: readonly RoleId[];
	/** The functions it guides. Empty for a foundation, which supports whichever function its role pack is guiding. */
	functions: readonly TaskKind[];
	/** For a role pack: its supporting foundations, most important first. Only the first few are loaded for a step. */
	foundations: readonly string[];
	/** Tools the procedure refers to. The agent gets a tool only if its own registry entry also lists it. */
	tools: readonly ToolId[];
	/** Approved-knowledge collections the procedure refers to. Same rule: the agent's own list is the limit. */
	knowledge: readonly string[];
};

/** The structured half of a package: everything the application binds on, with no prose. */
export type SkillManifest = {
	id: string;
	kind: SkillKind;
	title: string;
	version: number;
	agents: readonly RoleId[];
	functions: readonly TaskKind[];
	foundations: readonly string[];
	tools: readonly ToolId[];
	knowledge: readonly string[];
	suiteVersion: number;
};

/** A package exactly as it is evaluated, approved, stored and exported: the portable SKILL.md text plus the manifest. */
export type SkillPackage = {
	manifest: SkillManifest;
	markdown: string;
	/** The compact form put in front of a model: the steps, the checks and what to do when something goes wrong. */
	procedure: string;
};

/** Bumped when the evaluation cases change, so an old evaluation can't stand in for a new suite. */
export const SUITE_VERSION = 1;

export const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const bullets = (items: readonly string[]) => items.map((item) => `- ${item}`).join("\n");
const numbered = (items: readonly string[]) => items.map((item, index) => `${index + 1}. ${item}`).join("\n");

/** YAML needs a description with a colon or a quote in it to be quoted; quoting always is simplest and always valid. */
const yamlString = (text: string) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The portable file, in the Agent Skills format: `name` and `description` in the frontmatter, the procedure in the body. */
export function renderSkillMarkdown(skill: SkillDefinition): string {
	return [
		"---",
		`name: ${skill.id}`,
		`description: ${yamlString(skill.description)}`,
		"---",
		"",
		`# ${skill.title}`,
		"",
		"## Use this when",
		"",
		bullets(skill.useWhen),
		"",
		"## Do not use this when",
		"",
		bullets(skill.notWhen),
		"",
		"## What you need",
		"",
		bullets(skill.inputs),
		"",
		"## Procedure",
		"",
		numbered(skill.steps),
		"",
		"## What you produce",
		"",
		bullets(skill.outputs),
		"",
		"## Checks before you finish",
		"",
		bullets(skill.checks),
		"",
		"## When something goes wrong",
		"",
		bullets(skill.failure),
		"",
		"## Example",
		"",
		`**Request:** ${skill.example.request}`,
		"",
		`**Result:** ${skill.example.result}`,
		"",
		"## Limits",
		"",
		bullets(skill.limitations),
		"",
	].join("\n");
}

/** What a model is given once a skill has been selected. Short on purpose: the steps, the checks, the failure handling. */
export function renderProcedure(skill: SkillDefinition): string {
	return [
		`Procedure "${skill.title}" (${skill.id}, version ${skill.version}):`,
		numbered(skill.steps),
		"Before you finish, check:",
		bullets(skill.checks),
		"If something goes wrong:",
		bullets(skill.failure),
	].join("\n");
}

export const manifestOf = (skill: SkillDefinition): SkillManifest => ({
	id: skill.id,
	kind: skill.kind,
	title: skill.title,
	version: skill.version,
	agents: skill.agents,
	functions: skill.functions,
	foundations: skill.foundations,
	tools: skill.tools,
	knowledge: skill.knowledge,
	suiteVersion: SUITE_VERSION,
});

export const packageOf = (skill: SkillDefinition): SkillPackage => ({
	manifest: manifestOf(skill),
	markdown: renderSkillMarkdown(skill),
	procedure: renderProcedure(skill),
});

/**
 * The checksum of a package: of its exact text, in a fixed order. It is what an evaluation is of, what an approval is of, and
 * what is compared again every time a stored package is about to guide work.
 */
export const hashOfPackage = (pack: SkillPackage): string =>
	sha256Hex(
		JSON.stringify([
			pack.manifest.id,
			pack.manifest.kind,
			pack.manifest.title,
			pack.manifest.version,
			pack.manifest.agents,
			pack.manifest.functions,
			pack.manifest.foundations,
			pack.manifest.tools,
			pack.manifest.knowledge,
			pack.manifest.suiteVersion,
			pack.markdown,
			pack.procedure,
		]),
	);

export const hashOfSkill = (skill: SkillDefinition): string => hashOfPackage(packageOf(skill));
