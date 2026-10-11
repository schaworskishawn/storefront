import { listPendingVersions } from "./atlas/service";
import type { WorldwideAiConfig } from "./config";
import type { Sql } from "./db/sql";
import { countOpenFindings } from "./findings";
import { latestHealth } from "./integrations/health";
import { countTasksByState } from "./tasks/repo";
import { findDocumentIssues } from "./workflows/scheduled";
import { WORKSPACE_PATH, type Severity, type TaskState } from "./types";

/**
 * Nexus's briefing: what needs a person, what failed, and what is overdue, assembled by application code from the records
 * (so every number is a count, not a guess) and ordered with the things waiting on a person first.
 */

export type BriefingItem = { level: "action" | "attention" | "info"; text: string; href: string };

export type Briefing = {
	generatedAt: string;
	tasks: Record<TaskState, number>;
	findings: Record<Severity, number>;
	pendingDrafts: number;
	pendingDocuments: number;
	documentIssues: { expired: number; overdue: number };
	integrations: { unhealthy: string[]; degraded: string[] };
	items: BriefingItem[];
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function buildBriefing(
	sql: Sql,
	config: Pick<WorldwideAiConfig, "staleAfterDays">,
	now: Date,
): Promise<Briefing> {
	const [tasks, findings, drafts, pending, issues, health] = await Promise.all([
		countTasksByState(sql),
		countOpenFindings(sql),
		sql.query<{ n: number }>(`select count(*)::int as n from wai_drafts where state = 'pending_review'`),
		listPendingVersions(sql),
		findDocumentIssues({ sql, config: config as WorldwideAiConfig, now: () => now }),
		latestHealth(sql),
	]);
	const pendingDrafts = Number(drafts.rows[0].n);
	const unhealthy = health.filter((h) => h.status === "unhealthy").map((h) => h.integration);
	const degraded = health.filter((h) => h.status === "degraded").map((h) => h.integration);
	const expired = issues.issues.filter((i) => i.kind === "expired").length;
	const overdue = issues.issues.filter((i) => i.kind === "review_overdue").length;

	const items: BriefingItem[] = [];
	if (pendingDrafts)
		items.push({
			level: "action",
			text: `${plural(pendingDrafts, "support draft")} waiting for your review.`,
			href: `${WORKSPACE_PATH}/review`,
		});
	if (pending.length)
		items.push({
			level: "action",
			text: `${plural(pending.length, "document version")} waiting for the owner's approval.`,
			href: `${WORKSPACE_PATH}/review`,
		});
	if (tasks.outcome_unknown)
		items.push({
			level: "action",
			text: `${plural(tasks.outcome_unknown, "task")} with an unknown outcome. Check what actually happened before retrying.`,
			href: `${WORKSPACE_PATH}/tasks?state=outcome_unknown`,
		});
	if (tasks.failed)
		items.push({
			level: "attention",
			text: `${plural(tasks.failed, "task")} failed.`,
			href: `${WORKSPACE_PATH}/tasks?state=failed`,
		});
	const serious = findings.critical + findings.high;
	if (serious)
		items.push({
			level: "attention",
			text: `${plural(serious, "serious finding")} open.`,
			href: `${WORKSPACE_PATH}/review`,
		});
	if (unhealthy.length)
		items.push({
			level: "attention",
			text: `${unhealthy.join(", ")} ${unhealthy.length === 1 ? "isn't" : "aren't"} answering.`,
			href: `${WORKSPACE_PATH}/integrations`,
		});
	if (degraded.length)
		items.push({
			level: "attention",
			text: `${degraded.join(", ")} ${degraded.length === 1 ? "is" : "are"} degraded.`,
			href: `${WORKSPACE_PATH}/integrations`,
		});
	if (expired)
		items.push({
			level: "attention",
			text: `${plural(expired, "document")} expired and no longer used as sources.`,
			href: `${WORKSPACE_PATH}/knowledge`,
		});
	if (overdue)
		items.push({
			level: "attention",
			text: `${plural(overdue, "document")} past their review date.`,
			href: `${WORKSPACE_PATH}/knowledge`,
		});
	if (tasks.queued)
		items.push({
			level: "info",
			text: `${plural(tasks.queued, "task")} queued.`,
			href: `${WORKSPACE_PATH}/tasks?state=queued`,
		});
	if (tasks.running)
		items.push({
			level: "info",
			text: `${plural(tasks.running, "task")} running.`,
			href: `${WORKSPACE_PATH}/tasks?state=running`,
		});
	if (!items.length)
		items.push({ level: "info", text: "Nothing is waiting on you.", href: `${WORKSPACE_PATH}/tasks` });

	return {
		generatedAt: now.toISOString(),
		tasks,
		findings,
		pendingDrafts,
		pendingDocuments: pending.length,
		documentIssues: { expired, overdue },
		integrations: { unhealthy, degraded },
		items,
	};
}
