import { loadRoleSettings } from "../agents/settings";
import { daysUntil, evaluateFreshness } from "../atlas/freshness";
import { listDocuments } from "../atlas/service";
import { recordFinding } from "../findings";
import { keyFrom } from "../hash";
import { checkIntegrations, latestHealth, recordHealth, type HealthResult } from "../integrations/health";
import { InvalidTransitionError, isFinished } from "../tasks/state-machine";
import {
	TaskNotFoundError,
	claimTask,
	createTask,
	getTask,
	setExternalRunId,
	transitionTask,
	type TaskRecord,
} from "../tasks/repo";
import { daysBetween, opsDayKey } from "../time";
import type { Actor, RoleId, TaskKind } from "../types";
import { WorkflowError, type RunOutcome, type WorkflowDeps } from "./types";

/**
 * The two jobs that run on a schedule (Trigger.dev owns the schedules): Watch checking every integration, and Review scanning
 * the document library for reviews that are due and documents that are expiring. Both are plain application code with no model
 * involved, and each ends by reading back what it wrote before the task is called completed.
 */

const SOON_DAYS = 14;
const UNAPPROVED_DAYS = 7;

const watchActor: Actor = { kind: "agent", roleId: "watch" };
const reviewActor: Actor = { kind: "agent", roleId: "review" };

/** Creates the task for one slot of a schedule (for example one five-minute window). The same slot never makes two tasks. */
export async function requestScheduledTask(
	deps: WorkflowDeps,
	kind: "watch.health_check" | "review.document_scan",
	slot: string,
	actor: Actor = { kind: "system", label: "schedule" },
): Promise<{ task: TaskRecord; created: boolean }> {
	return createTask(deps.sql, {
		kind,
		title:
			kind === "watch.health_check"
				? `Check integration health (${slot})`
				: `Scan documents for reviews and expiry (${slot})`,
		expectedResult:
			kind === "watch.health_check"
				? "Every integration was checked or reported as not configured, the results were saved, and a finding exists for anything unhealthy."
				: "Every non-retired document was checked for overdue reviews, expiry and missing approval, and a finding exists for each problem found.",
		idempotencyKey: keyFrom(kind, slot),
		actor,
		input: { slot },
	});
}

async function begin(
	deps: WorkflowDeps,
	taskId: string,
	kind: TaskKind,
	role: RoleId,
	actor: Actor,
	run: { externalRunId?: string; resume?: boolean },
): Promise<TaskRecord | RunOutcome> {
	const task = await getTask(deps.sql, taskId);
	if (!task) throw new TaskNotFoundError(taskId);
	if (task.kind !== kind) throw new WorkflowError("invalid", `Task ${taskId} isn't a ${kind} task.`);
	if (isFinished(task.state))
		return { status: "skipped", task, reason: `The task is already ${task.state}.` };
	if (task.state === "running" && !run.resume)
		return { status: "skipped", task, reason: "The task is already running." };
	let current = task;
	if (task.state === "queued") {
		const settings = await loadRoleSettings(deps.sql, role);
		if (!settings.enabled) {
			const failed = await transitionTask(deps.sql, task.id, "failed", actor, {
				error: `${role} is switched off.`,
				onlyFrom: ["queued"],
			});
			return { status: "failed", task: failed, error: `${role} is switched off.` };
		}
		const claim = await claimTask(deps.sql, task.id, actor, {
			maxConcurrent: settings.limits.maxConcurrentTasks,
		});
		if (!claim.claimed)
			return claim.reason === "busy"
				? { status: "deferred", task, reason: "At the limit of tasks running at once." }
				: {
						status: "skipped",
						task: (await getTask(deps.sql, task.id)) ?? task,
						reason: "Another run already took this task.",
					};
		current = claim.task;
	}
	if (run.externalRunId) await setExternalRunId(deps.sql, current.id, run.externalRunId);
	return current;
}

const isOutcome = (value: TaskRecord | RunOutcome): value is RunOutcome =>
	"status" in value && !("kind" in value);

async function finishFailed(
	deps: WorkflowDeps,
	task: TaskRecord,
	actor: Actor,
	error: unknown,
): Promise<RunOutcome> {
	const message =
		error instanceof WorkflowError ? error.message : "Something went wrong. Nothing was recorded as done.";
	console.error(
		"[worldwide-ai] scheduled task failed:",
		task.id,
		error instanceof Error ? `${error.name}: ${error.message}` : error,
	);
	try {
		return {
			status: "failed",
			task: await transitionTask(deps.sql, task.id, "failed", actor, {
				error: message,
				onlyFrom: ["queued", "running"],
			}),
			error: message,
		};
	} catch (transitionError) {
		if (transitionError instanceof InvalidTransitionError)
			return {
				status: "skipped",
				task: (await getTask(deps.sql, task.id)) ?? task,
				reason: "The task changed while it ran.",
			};
		throw transitionError;
	}
}

// ---- Watch: integration health ------------------------------------------------------------------

const SEVERITY: Record<string, "medium" | "high"> = { degraded: "medium", unhealthy: "high" };

export async function runHealthCheck(
	deps: WorkflowDeps,
	taskId: string,
	run: { externalRunId?: string; resume?: boolean } = {},
): Promise<RunOutcome> {
	const started = await begin(deps, taskId, "watch.health_check", "watch", watchActor, run);
	if (isOutcome(started)) return started;
	const task = started;
	try {
		const results = await checkIntegrations(deps);
		await recordHealth(deps.sql, results);

		// A finding for each integration that is down, once per day it stays down; and settle the ones that have recovered.
		const day = opsDayKey(deps.now());
		let raised = 0;
		for (const r of results) {
			if (r.status === "degraded" || r.status === "unhealthy") {
				const { created } = await recordFinding(deps.sql, {
					roleId: "watch",
					taskId: task.id,
					severity: SEVERITY[r.status],
					category: "integration-health",
					title: `${r.integration} is ${r.status}`,
					detail: r.detail,
					evidence: { integration: r.integration, status: r.status, latencyMs: r.latencyMs },
					sourceRefs: [
						{
							system: "health-check",
							id: r.integration,
							retrievedAt: deps.now().toISOString(),
							label: r.detail.slice(0, 80),
						},
					],
					dedupeKey: `health:${r.integration}:${day}`,
				});
				if (created) raised += 1;
			} else if (r.status === "healthy") {
				await deps.sql.query(
					`update wai_findings set status = 'resolved', updated_at = now() where category = 'integration-health' and status = 'open' and evidence ->> 'integration' = $1`,
					[r.integration],
				);
			}
		}

		// Read back what was saved before saying it was.
		const saved = await latestHealth(deps.sql);
		const savedIds = new Set(saved.map((s) => s.integration));
		const missing = results.filter((r) => !savedIds.has(r.integration)).map((r) => r.integration);
		if (missing.length)
			throw new WorkflowError("conflict", `These results weren't saved: ${missing.join(", ")}.`);

		const summary = summarizeHealth(results);
		const finished = await transitionTask(deps.sql, task.id, "completed", watchActor, {
			result: { ...summary, findingsRaised: raised },
			completionEvidence: {
				...summary,
				findingsRaised: raised,
				checkedAt: deps.now().toISOString(),
				savedResults: saved.length,
				verified: "every result was read back from the database",
			},
			onlyFrom: ["running"],
		});
		return { status: "completed", task: finished };
	} catch (error) {
		return finishFailed(deps, task, watchActor, error);
	}
}

export function summarizeHealth(results: readonly HealthResult[]) {
	const count = (status: HealthResult["status"]) => results.filter((r) => r.status === status).length;
	return {
		checked: results.length,
		healthy: count("healthy"),
		degraded: count("degraded"),
		unhealthy: count("unhealthy"),
		unknown: count("unknown"),
		notConfigured: count("not_configured"),
	};
}

// ---- Review: documents -------------------------------------------------------------------------------

export type DocumentIssue = {
	documentId: string;
	title: string;
	kind: "expired" | "review_overdue" | "expiring_soon" | "review_soon" | "unapproved";
	date: string | null;
	detail: string;
};

/** Which documents need attention today. Dates are compared on the Winnipeg calendar. */
export async function findDocumentIssues(
	deps: Pick<WorkflowDeps, "sql" | "config" | "now">,
): Promise<{ scanned: number; issues: DocumentIssue[] }> {
	const now = deps.now();
	const docs = await listDocuments(deps.sql, {}, { now, staleAfterDays: deps.config.staleAfterDays });
	const issues: DocumentIssue[] = [];
	for (const doc of docs) {
		if (doc.status === "retired") continue;
		if (doc.status === "approved" && doc.approvedAt) {
			const freshness = evaluateFreshness({
				approvedAt: doc.approvedAt,
				reviewDue: doc.reviewDue,
				expiresAt: doc.expiresAt,
				now,
				staleAfterDays: deps.config.staleAfterDays,
			});
			if (freshness.state === "expired")
				issues.push({
					documentId: doc.id,
					title: doc.title,
					kind: "expired",
					date: doc.expiresAt,
					detail: freshness.reasons.join(" "),
				});
			else if (freshness.state === "stale")
				issues.push({
					documentId: doc.id,
					title: doc.title,
					kind: "review_overdue",
					date: doc.reviewDue ?? doc.approvedAt.slice(0, 10),
					detail: freshness.reasons.join(" "),
				});
			else {
				if (doc.expiresAt && daysUntil(doc.expiresAt, now) <= SOON_DAYS)
					issues.push({
						documentId: doc.id,
						title: doc.title,
						kind: "expiring_soon",
						date: doc.expiresAt,
						detail: `Expires in ${daysUntil(doc.expiresAt, now)} day(s), on ${doc.expiresAt}.`,
					});
				if (doc.reviewDue && daysUntil(doc.reviewDue, now) <= SOON_DAYS)
					issues.push({
						documentId: doc.id,
						title: doc.title,
						kind: "review_soon",
						date: doc.reviewDue,
						detail: `A review is due in ${daysUntil(doc.reviewDue, now)} day(s), on ${doc.reviewDue}.`,
					});
			}
		} else if (doc.status === "draft") {
			const age = daysBetween(opsDayKey(doc.createdAt), opsDayKey(now));
			if (age >= UNAPPROVED_DAYS)
				issues.push({
					documentId: doc.id,
					title: doc.title,
					kind: "unapproved",
					date: opsDayKey(doc.createdAt),
					detail: `Submitted ${age} days ago and still waiting for the owner's approval.`,
				});
		}
	}
	return { scanned: docs.filter((d) => d.status !== "retired").length, issues };
}

const ISSUE_SEVERITY: Record<DocumentIssue["kind"], "low" | "medium"> = {
	expired: "medium",
	review_overdue: "medium",
	expiring_soon: "low",
	review_soon: "low",
	unapproved: "low",
};
const ISSUE_TITLE: Record<DocumentIssue["kind"], string> = {
	expired: "has expired",
	review_overdue: "is past its review date",
	expiring_soon: "expires soon",
	review_soon: "is due for review soon",
	unapproved: "is waiting for approval",
};

export async function runDocumentScan(
	deps: WorkflowDeps,
	taskId: string,
	run: { externalRunId?: string; resume?: boolean } = {},
): Promise<RunOutcome> {
	const started = await begin(deps, taskId, "review.document_scan", "review", reviewActor, run);
	if (isOutcome(started)) return started;
	const task = started;
	try {
		const { scanned, issues } = await findDocumentIssues(deps);
		let raised = 0;
		for (const issue of issues) {
			const { created } = await recordFinding(deps.sql, {
				roleId: "review",
				taskId: task.id,
				severity: ISSUE_SEVERITY[issue.kind],
				category: "document-review",
				title: `"${issue.title}" ${ISSUE_TITLE[issue.kind]}`,
				detail: issue.detail,
				evidence: { documentId: issue.documentId, kind: issue.kind, date: issue.date },
				sourceRefs: [
					{
						system: "atlas",
						id: issue.documentId,
						retrievedAt: deps.now().toISOString(),
						label: issue.title,
					},
				],
				dedupeKey: `review:${issue.documentId}:${issue.kind}:${issue.date ?? "none"}`,
			});
			if (created) raised += 1;
		}
		// Every issue found must have a finding, new or already there.
		const keys = issues.map((i) => `review:${i.documentId}:${i.kind}:${i.date ?? "none"}`);
		const { rows } = keys.length
			? await deps.sql.query(
					`select count(*)::int as n from wai_findings where dedupe_key = any($1::text[])`,
					[keys],
				)
			: { rows: [{ n: 0 }] };
		if (Number(rows[0].n) !== keys.length)
			throw new WorkflowError("conflict", "Some findings weren't saved.");

		const summary = {
			scanned,
			issues: issues.length,
			findingsRaised: raised,
			alreadyKnown: issues.length - raised,
		};
		const finished = await transitionTask(deps.sql, task.id, "completed", reviewActor, {
			result: summary,
			completionEvidence: {
				...summary,
				scannedAt: deps.now().toISOString(),
				verified: "every issue has a saved finding",
			},
			onlyFrom: ["running"],
		});
		return { status: "completed", task: finished };
	} catch (error) {
		return finishFailed(deps, task, reviewActor, error);
	}
}
