/**
 * Shared vocabulary for Worldwide AI, the private operations dashboard. Nothing here touches I/O, and nothing here is
 * `server-only`: the Next.js app, the background jobs (Trigger.dev) and the tests all import it.
 */

export const ROLE_IDS = [
	"nexus",
	"patch",
	"relay",
	"ledger",
	"atlas",
	"check",
	"watch",
	"review",
	"route",
	"trace",
	"tally",
	"vault",
	"guard",
	"verify",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export const isRoleId = (value: unknown): value is RoleId =>
	typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);

/** The states a task can be in. `outcome_unknown` means we could not confirm what happened, never "it probably worked". */
export const TASK_STATES = [
	"queued",
	"running",
	"needs_review",
	"completed",
	"failed",
	"cancelled",
	"outcome_unknown",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TASK_STATE_LABELS: Record<TaskState, string> = {
	queued: "Queued",
	running: "Running",
	needs_review: "Needs review",
	completed: "Completed",
	failed: "Failed",
	cancelled: "Cancelled",
	outcome_unknown: "Outcome unknown",
};

/** What kinds of work the task system knows how to run. Each has an owning role and a workflow in `workflows/`. */
export const TASK_KINDS = [
	"relay.support_draft",
	"patch.site_inspection",
	"review.document_scan",
	"watch.health_check",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const isTaskKind = (value: unknown): value is TaskKind =>
	typeof value === "string" && (TASK_KINDS as readonly string[]).includes(value);

export type OperatorRole = "owner" | "staff";

/**
 * Who is doing something. Approvals and permission changes accept only an `operator`: an agent persona, or the system, can
 * never approve its own work or grant itself anything.
 */
export type Actor =
	| { kind: "operator"; id: string; label: string; role: OperatorRole }
	| { kind: "agent"; roleId: RoleId }
	| { kind: "system"; label: string };

export type OperatorActor = Extract<Actor, { kind: "operator" }>;

export const isOperator = (actor: Actor): actor is OperatorActor => actor.kind === "operator";

/** The string stored in `requested_by`, `reviewer` and the audit log: a prefix says what kind of actor it was. */
export function actorKey(actor: Actor): string {
	switch (actor.kind) {
		case "operator":
			return `operator:${actor.id}`;
		case "agent":
			return `agent:${actor.roleId}`;
		case "system":
			return `system:${actor.label}`;
	}
}

export function actorLabel(actor: Actor): string {
	switch (actor.kind) {
		case "operator":
			return actor.label;
		case "agent":
			return actor.roleId;
		case "system":
			return actor.label;
	}
}

/** A pointer back to the system a fact came from, kept beside whatever an agent concluded from it. */
export type SourceRef = {
	/** The system of record: "atlas", "case", "openclaw", "saleor"… */
	system: string;
	/** That system's own identifier. */
	id: string;
	/** Version or revision, where the system has one. */
	version?: string | number;
	/** When we read it (ISO 8601, UTC). */
	retrievedAt: string;
	/** A hash of what was read, so a later check can tell if it changed. */
	sha256?: string;
	/** Human-readable name for the dashboard. */
	label?: string;
};

export type Severity = "info" | "low" | "medium" | "high" | "critical";
