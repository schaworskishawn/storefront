/**
 * Shared vocabulary for Worldwide AI, the private operations dashboard. Nothing here touches I/O, and nothing here is
 * `server-only`: the Next.js app, the background jobs (Trigger.dev) and the tests all import it.
 */

/**
 * The canonical roster: exactly 49 agents, Nexus first. The order is the roster position from the brief; the ids are the
 * stable identifiers stored with tasks, findings and usage. Nexus is the only coordinator and Build the only coding agent.
 * The first fourteen ids are unchanged from the first build, so records written under them keep their owner.
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
	"pulse",
	"focus",
	"insight",
	"strategy",
	"post",
	"talent",
	"comet",
	"signal",
	"reach",
	"script",
	"assist",
	"care",
	"stock",
	"source",
	"catalog",
	"comply",
	"batch",
	"return",
	"forecast",
	"build",
	"restore",
	"prism",
	"scout",
	"forge",
	"motion",
	"link",
	"tempo",
	"qualify",
	"assay",
	"assure",
	"gauge",
	"clean",
	"coach",
	"duty",
	"safeguard",
] as const;

export const ROLE_COUNT = 49;

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

/**
 * Every kind of work the task system can run. A kind is "<owning agent>.<workflow>", so the owner of a task is never chosen
 * separately: it is the part before the dot. The first four were built first and keep their names (the brief's
 * "relay.case-draft" is `relay.support_draft` here); the rest are the baseline function of each agent.
 */
export const TASK_KINDS = [
	"relay.support_draft",
	"patch.site_inspection",
	"review.document_scan",
	"watch.health_check",
	"nexus.goal-plan",
	"patch.issue-diagnosis",
	"ledger.period-workpaper",
	"atlas.knowledge-review",
	"check.record-validation",
	"watch.health-assessment",
	"review.deadline-register",
	"route.exception-package",
	"trace.shipment-timeline",
	"tally.tax-workpaper",
	"vault.settlement-match",
	"guard.access-review",
	"verify.workflow-acceptance",
	"pulse.content-calendar",
	"focus.personal-plan",
	"insight.metric-analysis",
	"strategy.option-brief",
	"post.email-draft",
	"talent.hiring-packet",
	"comet.store-audit",
	"signal.search-package",
	"reach.wholesale-proposal",
	"script.copy-draft",
	"assist.meeting-pack",
	"care.service-review",
	"stock.replenishment-plan",
	"source.quote-comparison",
	"catalog.content-package",
	"comply.evidence-review",
	"batch.record-reconciliation",
	"return.case-review",
	"forecast.cash-scenario",
	"build.engineering-brief",
	"restore.coverage-review",
	"prism.design-review",
	"scout.research-brief",
	"forge.feature-spec",
	"motion.storyboard",
	"link.scan-reconciliation",
	"tempo.production-plan",
	"qualify.supplier-package",
	"assay.lab-review",
	"assure.release-package",
	"gauge.equipment-review",
	"clean.clearance-review",
	"coach.training-review",
	"duty.excise-workpaper",
	"safeguard.records-review",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const isTaskKind = (value: unknown): value is TaskKind =>
	typeof value === "string" && (TASK_KINDS as readonly string[]).includes(value);

/** The owning agent of a kind of work: the part of its name before the dot. */
export const ownerOfKind = (kind: TaskKind): RoleId => kind.slice(0, kind.indexOf(".")) as RoleId;

/** Where the private workspace lives in the application. */
export const WORKSPACE_PATH = "/worldwide-ai";

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
