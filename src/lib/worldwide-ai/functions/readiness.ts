import { ROLES, type PlannedCapability, type RoleDefinition } from "../agents/registry";
import { INTEGRATIONS, type ConfigStatus, type IntegrationId } from "../integrations/catalog";
import type { HealthStatus } from "../integrations/health";
import type { RoleId, TaskKind } from "../types";
import type { FunctionDefinition } from "./types";

/**
 * Whether a function can run right now, worked out from what is actually configured. Four things are kept apart: that an
 * agent exists (the roster), that the owner left it switched on, whether each of its functions is ready, and what state a
 * given task is in. A card on the Team page proves only the first.
 *
 *   ready                   the handler exists and everything it needs is configured
 *   awaiting_configuration  a provider, connector or worker it needs isn't set up (named)
 *   blocked                 a specific run was refused for a missing or invalid input (reported when you try)
 *   disabled                the owner switched the agent off
 *   unhealthy               something it needs is configured but its last check failed
 *   planned                 a later capability with no working code yet
 */

export type ReadinessStatus =
	| "ready"
	| "awaiting_configuration"
	| "blocked"
	| "disabled"
	| "unhealthy"
	| "planned";

export const READINESS_LABELS: Record<ReadinessStatus, string> = {
	ready: "Ready",
	awaiting_configuration: "Awaiting configuration",
	blocked: "Blocked",
	disabled: "Switched off",
	unhealthy: "Unhealthy",
	planned: "Planned",
};

export type FunctionReadiness = {
	id: string;
	status: ReadinessStatus;
	/** Why, in words. Empty when ready. */
	reasons: string[];
	/** The settings or connectors that are missing (names only, never values). */
	missing: string[];
};

export type ReadinessInputs = {
	statuses: readonly ConfigStatus[];
	/** The latest health result for each integration that has one. */
	health?: ReadonlyArray<{ integration: IntegrationId; status: HealthStatus; detail: string }>;
	enabled: boolean;
};

/** The integrations a function can't run without: the database always, the model when the wording comes from it. */
export const requiredIntegrations = (
	definition: Pick<FunctionDefinition, "uses" | "requires">,
): IntegrationId[] => [
	...new Set<IntegrationId>([
		"database",
		...(definition.uses === "model" ? (["model"] as const) : []),
		...definition.requires,
	]),
];

export function functionReadiness(
	definition: Pick<FunctionDefinition, "id" | "uses" | "requires">,
	inputs: ReadinessInputs,
): FunctionReadiness {
	if (!inputs.enabled)
		return {
			id: definition.id,
			status: "disabled",
			reasons: ["The owner has switched this agent off."],
			missing: [],
		};
	const byId = new Map(inputs.statuses.map((s) => [s.id, s]));
	const needed = requiredIntegrations(definition);
	const unconfigured = needed.filter((id) => !byId.get(id)?.configured);
	if (unconfigured.length)
		return {
			id: definition.id,
			status: "awaiting_configuration",
			reasons: unconfigured.map((id) => `${INTEGRATIONS[id].name} isn't configured.`),
			missing: unconfigured.flatMap((id) => {
				const status = byId.get(id);
				return status?.missing.length ? status.missing : [INTEGRATIONS[id].name];
			}),
		};
	const failing = (inputs.health ?? []).filter(
		(h) => needed.includes(h.integration) && h.status === "unhealthy",
	);
	if (failing.length)
		return {
			id: definition.id,
			status: "unhealthy",
			reasons: failing.map((h) => `${INTEGRATIONS[h.integration].name}: ${h.detail}`),
			missing: [],
		};
	return { id: definition.id, status: "ready", reasons: [], missing: [] };
}

export const plannedReadiness = (capability: PlannedCapability): FunctionReadiness => ({
	id: capability.id,
	status: "planned",
	reasons: [capability.note],
	missing: capability.needs.map((id) => INTEGRATIONS[id].name),
});

export type AgentReadiness = {
	role: RoleDefinition;
	enabled: boolean;
	primary: FunctionReadiness;
	/** Every implemented function the agent owns, the primary one included. */
	functions: Array<{ kind: TaskKind; action: string; readiness: FunctionReadiness }>;
	planned: Array<{ capability: PlannedCapability; readiness: FunctionReadiness }>;
};

export type TeamReadiness = {
	agents: AgentReadiness[];
	totals: {
		/** Always 49: the canonical roster. */
		agents: number;
		enabled: number;
		/** Implemented functions that can run now, out of all implemented functions. */
		functionsReady: number;
		functionsRequired: number;
		/** Agents whose baseline function can run now. */
		baselinesReady: number;
		planned: number;
	};
};

export function teamReadiness(
	functions: ReadonlyMap<TaskKind, FunctionDefinition>,
	inputs: Omit<ReadinessInputs, "enabled"> & { enabled: (role: RoleId) => boolean },
): TeamReadiness {
	const agents = ROLES.map((role): AgentReadiness => {
		const enabled = inputs.enabled(role.id);
		const owned = role.workflows.flatMap((kind) => {
			const definition = functions.get(kind);
			return definition
				? [
						{
							kind,
							action: definition.action,
							readiness: functionReadiness(definition, { ...inputs, enabled }),
						},
					]
				: [];
		});
		const primary = owned.find((f) => f.kind === role.primary)?.readiness ?? {
			id: role.primary,
			status: "planned" as const,
			reasons: ["This function has no handler yet."],
			missing: [],
		};
		return {
			role,
			enabled,
			primary,
			functions: owned,
			planned: role.planned.map((capability) => ({ capability, readiness: plannedReadiness(capability) })),
		};
	});
	const all = agents.flatMap((a) => a.functions);
	return {
		agents,
		totals: {
			agents: agents.length,
			enabled: agents.filter((a) => a.enabled).length,
			functionsReady: all.filter((f) => f.readiness.status === "ready").length,
			functionsRequired: all.length,
			baselinesReady: agents.filter((a) => a.primary.status === "ready").length,
			planned: agents.reduce((n, a) => n + a.planned.length, 0),
		},
	};
}
