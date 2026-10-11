import { ROLE_BY_ID } from "../agents/registry";
import { listPendingVersions } from "../atlas/service";
import { audit } from "../audit";
import type { Env, WorldwideAiConfig } from "../config";
import { iso, json, type Row, type Sql } from "../db/sql";
import { listFindings } from "../findings";
import { hashOf } from "../functions/products";
import { INTEGRATIONS, configStatus } from "../integrations/catalog";
import { latestHealth } from "../integrations/health";
import { CALIBRATION_LABELS, listEquipment } from "../lab/equipment";
import { listFinished } from "../lab/finished";
import { inventoryFindings, listInventory } from "../lab/inventory";
import { SEVERITIES, listDeviations, listPendingActions, listUnverifiedResults } from "../lab/quality";
import { listTraining, trainingStanding } from "../lab/training";
import { listProposals, listReleases } from "../skills/store";
import { countStandings, loadSkillRows } from "../skills/standing";
import { formatOpsDate, opsDayKey } from "../time";
import { WORKSPACE_PATH, actorKey, isRoleId, type Actor, type Severity, type TaskState } from "../types";
import { findDocumentIssues } from "../workflows/scheduled";
import { WorkflowError } from "../workflows/types";

/**
 * The daily report: Nexus's account of where things stand, assembled by application code from the workspace's own records
 * and saved. Every figure is a count of records and every action item points at the record it came from. No model writes any
 * of it, nothing is sent anywhere, and one person's own work (Focus) and demonstration runs are never read into it.
 *
 * What the workspace has no source for (shipments, stock, accounting, goals) is listed as unavailable with the reason. It is
 * never shown as zero.
 */

export type ReportKind = "morning" | "evening";
export type ReportStatus = "generating" | "completed" | "failed";
export type Priority = "urgent" | "high" | "normal";

export type ActionItem = {
	title: string;
	/** Who has to act: the owner, a person reviewing, or the agent whose task it is. */
	responsible: string;
	priority: Priority;
	reason: string;
	nextSteps: string[];
	/** A date from a record. `confirmed` is false for a suggested review date, true for an expiry or a recorded deadline. */
	due: { date: string; confirmed: boolean } | null;
	links: Array<{ label: string; href: string }>;
	sources: Array<{ label: string; retrievedAt: string }>;
	expectedResult: string;
	dependsOn: string[];
};

export type TaskLine = {
	taskId: string;
	title: string;
	agent: string;
	state: TaskState;
	at: string;
	error?: string;
};

export type DailyReport = {
	kind: ReportKind;
	day: string;
	period: { start: string; end: string; basis: string };
	summary: string[];
	counts: { completed: number; failed: number; unknown: number; waitingReview: number; inProgress: number };
	actions: ActionItem[];
	completed: TaskLine[];
	unresolved: TaskLine[];
	carryover: TaskLine[];
	agents: Array<{ agent: string; completed: number; failed: number; waiting: number }>;
	knowledge: {
		approved: Array<{ title: string; version: number; approvedAt: string }>;
		waitingApproval: number;
		expired: number;
		reviewOverdue: number;
	};
	skills: {
		inUse: number;
		total: number;
		waitingApproval: number;
		failedEvaluation: number;
		openProposals: number;
		approved: Array<{ skill: string; version: number; at: string }>;
		revoked: Array<{ skill: string; version: number; at: string; reason: string }>;
	};
	integrations: Array<{ name: string; status: string; detail: string; checkedAt: string | null }>;
	unavailable: Array<{ area: string; reason: string }>;
	usage: { modelCalls: number; inputTokens: number; outputTokens: number };
	coverage: Array<{ source: string; records: number; asOf: string }>;
	/** Evening recap only: what to pick up first tomorrow, taken from the action items above. */
	tomorrow?: string[];
};

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const agentName = (id: string) => (isRoleId(id) ? ROLE_BY_ID[id].name : id);
const taskLink = (id: string) => ({ label: `Task ${id.slice(0, 8)}`, href: `${WORKSPACE_PATH}/tasks/${id}` });
const HOURS = 3_600_000;
const LIST_LIMIT = 50;

/** The areas the brief asks a report to cover that this workspace has no records for. Stated, never shown as zero. */
const UNAVAILABLE: ReadonlyArray<{ area: string; reason: string }> = [
	{ area: "Shipments", reason: "No carrier connector exists. Route and Trace work from records you supply." },
	{ area: "Inventory", reason: "No ingredient has been recorded in the Lab yet." },
	{ area: "Purchasing", reason: "No purchasing records are stored. Source works from quotes you supply." },
	{ area: "Accounting and banking", reason: "No accounting or bank connector exists." },
	{
		area: "Equipment and training",
		reason: "No equipment or training has been recorded yet.",
	},
	{
		area: "Business goals",
		reason: "No goals or baselines have been recorded, so progress can't be measured.",
	},
	{
		area: "Engineering changes",
		reason: "The coding worker isn't built, so there are no change packages to report.",
	},
];

const BUSINESS = `t.scope = 'business' and not t.demo`;
const TASK_COLUMNS = `t.id, t.title, t.owner_role, t.state, t.error, t.created_at, t.updated_at, t.finished_at`;

const taskLine = (r: Row, at: unknown): TaskLine => ({
	taskId: r.id as string,
	title: r.title as string,
	agent: agentName(r.owner_role as string),
	state: r.state as TaskState,
	at: iso(at) as string,
	...(r.error ? { error: String(r.error).slice(0, 300) } : {}),
});

export type ReportDeps = { sql: Sql; config: WorldwideAiConfig; env?: Env };

/** Builds a report for a period from the records. Reads only; saves nothing. */
export async function buildDailyReport(
	deps: ReportDeps,
	input: { kind: ReportKind; start: Date; end: Date; basis: string },
): Promise<DailyReport> {
	const { sql, config } = deps;
	const start = input.start.toISOString();
	const end = input.end.toISOString();
	const day = opsDayKey(input.end);

	const [
		completedRows,
		unresolvedRows,
		activeRows,
		pendingProducts,
		pendingDrafts,
		pendingVersions,
		allFindings,
		documents,
		health,
		skillRows,
		releases,
		proposals,
		approvedDocs,
		usage,
		inventory,
		finished,
		unverified,
		deviations,
		pendingActions,
		equipment,
		training,
	] = await Promise.all([
		sql.query(
			`select ${TASK_COLUMNS} from wai_tasks t where ${BUSINESS} and t.state = 'completed'
			 and t.finished_at > $1::timestamptz and t.finished_at <= $2::timestamptz order by t.finished_at desc limit ${LIST_LIMIT}`,
			[start, end],
		),
		sql.query(
			`select ${TASK_COLUMNS} from wai_tasks t where ${BUSINESS} and t.state in ('failed', 'outcome_unknown')
			 and t.updated_at > $1::timestamptz and t.updated_at <= $2::timestamptz order by t.updated_at desc limit ${LIST_LIMIT}`,
			[start, end],
		),
		sql.query(
			`select ${TASK_COLUMNS} from wai_tasks t where ${BUSINESS} and t.state in ('queued', 'running', 'needs_review')
			 and t.created_at <= $1::timestamptz order by t.created_at limit ${LIST_LIMIT}`,
			[end],
		),
		sql.query(
			`select p.id, p.summary, p.agent_id, p.created_at, p.task_id from wai_work_products p
			 where p.scope = 'business' and not p.demo and p.review_state = 'pending' order by p.created_at limit ${LIST_LIMIT}`,
		),
		sql.query(
			`select d.id, d.subject, d.created_at, d.task_id, d.source_status from wai_drafts d
			 join wai_tasks t on t.id = d.task_id where ${BUSINESS} and d.state = 'pending_review' order by d.created_at limit ${LIST_LIMIT}`,
		),
		listPendingVersions(sql),
		listFindings(sql, { status: "open", limit: LIST_LIMIT }),
		findDocumentIssues({ sql, config, now: () => input.end }),
		latestHealth(sql),
		loadSkillRows(sql),
		listReleases(sql),
		listProposals(sql, { state: "open" }),
		sql.query(
			`select v.title, v.version, v.approved_at from wai_document_versions v
			 where v.status = 'approved' and v.approved_at > $1::timestamptz and v.approved_at <= $2::timestamptz
			 order by v.approved_at desc limit ${LIST_LIMIT}`,
			[start, end],
		),
		sql.query<{ calls: number; input: number; output: number }>(
			`select count(*)::int as calls, coalesce(sum(input_tokens), 0)::int as input, coalesce(sum(output_tokens), 0)::int as output
			 from wai_usage u left join wai_tasks t on t.id = u.task_id
			 where u.kind = 'model' and u.at > $1::timestamptz and u.at <= $2::timestamptz
			 and (t.id is null or (${BUSINESS}))`,
			[start, end],
		),
		listInventory(sql, day),
		listFinished(sql),
		listUnverifiedResults(sql),
		listDeviations(sql, { status: "open" }),
		listPendingActions(sql),
		listEquipment(sql, day),
		listTraining(sql),
	]);

	// A finding raised by a demonstration run, or by one person's own task, is not business news.
	const findingTasks = allFindings.flatMap((finding) => (finding.taskId ? [finding.taskId] : []));
	const hidden = findingTasks.length
		? new Set(
				(
					await sql.query<{ id: string }>(
						`select t.id from wai_tasks t where t.id = any($1::uuid[]) and not (${BUSINESS})`,
						[findingTasks],
					)
				).rows.map((r) => r.id),
			)
		: new Set<string>();
	const findings = allFindings.filter((finding) => !finding.taskId || !hidden.has(finding.taskId));

	const completed = completedRows.rows.map((r) => taskLine(r, r.finished_at));
	const unresolved = unresolvedRows.rows.map((r) => taskLine(r, r.updated_at));
	const active = activeRows.rows.map((r) => taskLine(r, r.created_at));
	const carryover = active.filter((line) => line.at <= start);
	const waitingReview = active.filter((line) => line.state === "needs_review").length;
	const actions: ActionItem[] = [];
	const source = (label: string) => ({ label, retrievedAt: end });
	const ageHours = (at: string) => Math.floor((input.end.getTime() - new Date(at).getTime()) / HOURS);

	// ---- What is waiting on a person -------------------------------------------------------------------
	for (const r of pendingProducts.rows) {
		const waited = ageHours(iso(r.created_at) as string);
		actions.push({
			title: `Review: ${r.summary as string}`,
			responsible: "A person in the workspace",
			priority: waited >= 24 ? "high" : "normal",
			reason: `${agentName(r.agent_id as string)} stored this ${waited >= 24 ? `${Math.floor(waited / 24)} day${waited >= 48 ? "s" : ""} ago` : "in the last day"} and it can't be used until a person accepts or rejects it.`,
			nextSteps: [
				"Open the result.",
				"Check its sources, what is missing and any warning.",
				"Accept or reject it.",
			],
			due: null,
			links: [
				{ label: "Result", href: `${WORKSPACE_PATH}/results/${r.id as string}` },
				taskLink(r.task_id as string),
			],
			sources: [source("Stored results waiting for review")],
			expectedResult: "The result is accepted or rejected, with who decided and when recorded.",
			dependsOn: [],
		});
	}
	for (const r of pendingDrafts.rows) {
		const waited = ageHours(iso(r.created_at) as string);
		actions.push({
			title: `Review support draft: ${(r.subject as string | null) ?? "reply"}`,
			responsible: "A person in the workspace",
			priority: waited >= 24 ? "urgent" : "high",
			reason: `A customer is waiting. The draft was prepared ${waited >= 24 ? `${Math.floor(waited / 24)} day${waited >= 48 ? "s" : ""} ago` : "in the last day"}${r.source_status === "ok" ? "" : r.source_status === "stale" ? " from a source that is past its review date" : " with no approved source"}.`,
			nextSteps: [
				"Open the draft.",
				"Check it against its cited sources.",
				"Save it to the case, edit it, or reject it.",
			],
			due: null,
			links: [
				{ label: "Draft", href: `${WORKSPACE_PATH}/support/drafts/${r.id as string}` },
				taskLink(r.task_id as string),
			],
			sources: [source("Support drafts waiting for review")],
			expectedResult: "The draft is saved to its case or rejected. Nothing is sent by the workspace.",
			dependsOn: [],
		});
	}
	for (const version of pendingVersions)
		actions.push({
			title: `Approve or reject: ${version.documentTitle}, version ${version.version}`,
			responsible: "The owner",
			priority: "high",
			reason:
				"Agents use only approved documents as sources. Until this is decided, the earlier version (or nothing) is used.",
			nextSteps: ["Read the version.", "Approve it, or reject it with a note."],
			due: null,
			links: [{ label: "Document", href: `${WORKSPACE_PATH}/knowledge/${version.documentId}` }],
			sources: [source("Document versions waiting for approval")],
			expectedResult: "The version is approved and becomes the source agents retrieve, or is rejected.",
			dependsOn: [],
		});

	// ---- What went wrong ---------------------------------------------------------------------------------
	for (const line of unresolved)
		actions.push({
			title: `${line.state === "failed" ? "Failed" : "Outcome unknown"}: ${line.title}`,
			responsible: line.state === "failed" ? "The person who asked for it" : "A person in the workspace",
			priority: line.state === "failed" ? "high" : "urgent",
			reason:
				line.state === "failed"
					? `${line.agent}'s task failed${line.error ? `: ${line.error}` : "."}`
					: `The application couldn't establish whether ${line.agent}'s task finished${line.error ? `: ${line.error}` : "."}`,
			nextSteps:
				line.state === "failed"
					? ["Open the task and read why it failed.", "Correct the input or the configuration.", "Retry it."]
					: [
							"Open the task.",
							"Check whether a result exists before relying on anything.",
							"Settle it as done or failed.",
						],
			due: null,
			links: [taskLink(line.taskId)],
			sources: [source("Tasks that failed or ended unknown in this period")],
			expectedResult:
				line.state === "failed"
					? "The task is retried to a verified result, or deliberately left failed."
					: "The task has a state its evidence supports.",
			dependsOn: [],
		});

	const severityPriority: Record<Severity, Priority> = {
		critical: "urgent",
		high: "high",
		medium: "normal",
		low: "normal",
		info: "normal",
	};
	for (const finding of findings.filter((f) => f.severity !== "info"))
		actions.push({
			title: `Finding (${finding.severity}): ${finding.title}`,
			responsible: "A person in the workspace",
			priority: severityPriority[finding.severity],
			reason:
				finding.detail.slice(0, 300) ||
				`${agentName(finding.roleId)} recorded this finding and it is still open.`,
			nextSteps: ["Open the finding and its evidence.", "Acknowledge, resolve or dismiss it with a note."],
			due: null,
			links: [
				{ label: "Review queue", href: `${WORKSPACE_PATH}/review` },
				...(finding.taskId ? [taskLink(finding.taskId)] : []),
			],
			sources: [source(`Open findings, recorded by ${agentName(finding.roleId)}`)],
			expectedResult: "The finding is no longer open, with the decision and who made it recorded.",
			dependsOn: [],
		});

	// ---- Documents: a recorded expiry is a confirmed date; a review date is a suggested one ---------------
	for (const issue of documents.issues.filter((i) => i.kind === "expired" || i.kind === "review_overdue"))
		actions.push({
			title: `${issue.kind === "expired" ? "Expired document" : "Document past its review date"}: ${issue.title}`,
			responsible: "The owner",
			priority: issue.kind === "expired" ? "high" : "normal",
			reason: issue.detail,
			nextSteps:
				issue.kind === "expired"
					? ["Add a current version, or retire the document.", "Approve the new version."]
					: ["Read the document.", "Confirm it is still right, or add a corrected version."],
			due: issue.date ? { date: issue.date, confirmed: issue.kind === "expired" } : null,
			links: [{ label: "Document", href: `${WORKSPACE_PATH}/knowledge/${issue.documentId}` }],
			sources: [source("Knowledge library, checked on the Winnipeg calendar")],
			expectedResult:
				issue.kind === "expired"
					? "An approved, current version exists, or the document is retired."
					: "The document has been reviewed and its review date moved, or a new version approved.",
			dependsOn: [],
		});

	// ---- Ingredient stock: one item per ingredient that has something to look at -----------------------------
	const stockFindings = inventoryFindings(inventory);
	for (const item of inventory.filter((entry) => entry.flags.length > 0)) {
		const own = stockFindings.filter((finding) => finding.ingredientId === item.ingredient.id);
		const pressing = own.some((finding) => finding.kind === "expired" || finding.kind === "low");
		const expiring = item.lots
			.filter((lot) => lot.expiresOn !== null && lot.onHand !== "0")
			.map((lot) => lot.expiresOn as string)
			.sort()[0];
		actions.push({
			title: `Stock: ${item.ingredient.name}`,
			responsible: "A person in the Lab",
			priority: pressing ? "high" : "normal",
			reason: own.map((finding) => finding.text).join(" "),
			nextSteps: [
				"Open the ingredient.",
				own.some((finding) => finding.kind === "low")
					? "Reorder, or ask Stock to plan replenishment from the stored stock."
					: "Record what the supplier's documents say, or deal with the lot.",
				"Record any movement in the ledger.",
			],
			// A lot's expiry is a recorded date.
			due: expiring ? { date: expiring, confirmed: true } : null,
			links: [{ label: "Ingredient", href: `${WORKSPACE_PATH}/lab/ingredients/${item.ingredient.id}` }],
			sources: [source("Ingredient inventory and its ledger")],
			expectedResult: "Nothing is flagged on this ingredient.",
			dependsOn: [],
		});
	}

	// ---- Made batches: a decision that is waiting, and holds that are open ---------------------------------
	for (const item of finished) {
		const link = {
			label: `Batch ${item.batch.code}`,
			href: `${WORKSPACE_PATH}/lab/batches/${item.batch.id}`,
		};
		for (const hold of item.holds)
			actions.push({
				title: `On hold: batch ${item.batch.code}`,
				responsible: "The owner",
				priority: "high",
				reason: `${hold.reason} While the hold is open the batch can't be packaged or released.`,
				nextSteps: [
					"Open the batch.",
					"Look into the reason for the hold.",
					"Lift the hold with a reason, or reject the batch.",
				],
				due: null,
				links: [link],
				sources: [source("Quality holds")],
				expectedResult: "The hold is lifted with a reason, or the batch is rejected.",
				dependsOn: [],
			});
		if (item.standing === "awaiting_review")
			actions.push({
				title: `Release decision: batch ${item.batch.code}`,
				responsible: "The owner",
				priority: "normal",
				reason: `${item.batch.recipeName}, made with a measured yield of ${item.batch.actualYieldMl} mL, is waiting for a release decision.`,
				nextSteps: [
					"Open the batch.",
					"Read its record and what the workspace checked.",
					"Release it, or reject it with a reason.",
				],
				due: null,
				links: [link],
				sources: [source("Batches made and not yet decided")],
				expectedResult: "The batch is released or rejected, with who decided and on what basis recorded.",
				dependsOn: [],
			});
	}

	// ---- Quality records: results to verify, deviations that are open, and actions that need someone -------
	const byBatch = new Map<string, typeof unverified>();
	for (const result of unverified)
		byBatch.set(result.batchId, [...(byBatch.get(result.batchId) ?? []), result]);
	for (const [batchId, results] of byBatch) {
		const reports = [...new Set(results.map((result) => result.reportRef))];
		actions.push({
			title: `Verify results: batch ${results[0].batchCode}`,
			responsible: "The owner",
			priority: "normal",
			reason: `${results.length} result${results.length === 1 ? "" : "s"} entered from report${reports.length === 1 ? "" : "s"} ${reports.join(", ")} ${results.length === 1 ? "is" : "are"} waiting to be verified. Until then ${results.length === 1 ? "it doesn't" : "they don't"} count, and the batch can't be released.`,
			nextSteps: [
				"Open the batch's samples and results.",
				"Compare each result with the laboratory's report.",
				"Verify the ones that match; correct the ones that don't.",
			],
			due: null,
			links: [
				{
					label: `Batch ${results[0].batchCode}`,
					href: `${WORKSPACE_PATH}/lab/batches/${batchId}/quality`,
				},
			],
			sources: [source("Results waiting to be verified")],
			expectedResult: "Every result on file for the batch is verified or corrected.",
			dependsOn: [],
		});
	}
	for (const deviation of deviations) {
		const open = deviation.actions.filter((action) => action.status === "open").length;
		const done = deviation.actions.filter((action) => action.status === "done").length;
		actions.push({
			title: `Deviation ${deviation.code}: ${deviation.title}`,
			responsible: "The owner",
			priority:
				deviation.severity === "critical" ? "urgent" : deviation.severity === "major" ? "high" : "normal",
			reason: `${SEVERITIES[deviation.severity]} deviation${deviation.batchCode ? ` against batch ${deviation.batchCode}, which can't be released while it is open` : ""}. ${
				open || done
					? `${open} action${open === 1 ? "" : "s"} open, ${done} done and waiting to be verified.`
					: "No corrective action is recorded yet."
			}`,
			nextSteps: [
				"Open the deviation.",
				"Record what was contained, what is suspected and what was established.",
				"Close it with a disposition once every action is verified or cancelled.",
			],
			due: null,
			links: [
				{
					label: `Deviation ${deviation.code}`,
					href: `${WORKSPACE_PATH}/quality/deviations/${deviation.id}`,
				},
			],
			sources: [source("Open deviations")],
			expectedResult: "The deviation is closed with its disposition, or its next action is recorded.",
			dependsOn: [],
		});
	}
	for (const action of pendingActions.filter((item) => item.status === "open" && item.dueOn))
		actions.push({
			title: `Corrective action for ${action.deviationCode}: ${action.action}`,
			responsible: action.responsible,
			priority: (action.dueOn as string) < day ? "high" : "normal",
			reason:
				(action.dueOn as string) < day
					? `Due on ${action.dueOn} and still open.`
					: `Open, due on ${action.dueOn}.`,
			nextSteps: ["Do it.", "Mark it done on the deviation, saying where the evidence is."],
			due: { date: action.dueOn as string, confirmed: true },
			links: [
				{
					label: `Deviation ${action.deviationCode}`,
					href: `${WORKSPACE_PATH}/quality/deviations/${action.deviationId}`,
				},
			],
			sources: [source("Corrective actions")],
			expectedResult: "The action is marked done with its evidence.",
			dependsOn: [],
		});

	// ---- Equipment that can't be used or is about to lapse, and training to verify or renew -------------------
	for (const row of equipment) {
		if (row.standing.eligible && row.standing.calibration !== "due_soon") continue;
		const { equipment: item, standing } = row;
		actions.push({
			title: `Equipment: ${item.code} ${item.name}`,
			responsible: item.status === "out_of_service" ? "The owner" : "A person in the Lab",
			priority: standing.eligible ? "normal" : "high",
			reason: standing.eligible
				? `Its calibration is due on ${standing.dueOn}.`
				: `It can't be recorded against a batch. ${standing.reasons.join(" ")}`,
			nextSteps: standing.eligible
				? ["Arrange the calibration.", "Record it with its certificate when it is done."]
				: [
						"Open the equipment.",
						"Arrange and record a passing calibration if one is needed.",
						"The owner returns it to service with a reason.",
					],
			due: standing.dueOn ? { date: standing.dueOn, confirmed: true } : null,
			links: [
				{ label: `Equipment ${item.code}`, href: `${WORKSPACE_PATH}/manufacturing/equipment/${item.id}` },
			],
			sources: [source(`Equipment records: ${CALIBRATION_LABELS[standing.calibration].toLowerCase()}`)],
			expectedResult: "The equipment is in calibration and in service, or stays out of use.",
			dependsOn: [],
		});
	}
	const unverifiedTraining = training.filter((record) => record.verifiedAt === null);
	if (unverifiedTraining.length)
		actions.push({
			title: `Verify training: ${unverifiedTraining.length} record${unverifiedTraining.length === 1 ? "" : "s"}`,
			responsible: "The owner",
			priority: "normal",
			reason: `Recorded for ${[...new Set(unverifiedTraining.map((record) => record.person))].join(", ")}. A record counts only once the owner has verified its evidence.`,
			nextSteps: [
				"Open Training.",
				"Check each record against its evidence.",
				"Verify the ones that are in order.",
			],
			due: null,
			links: [{ label: "Training", href: `${WORKSPACE_PATH}/manufacturing/training` }],
			sources: [source("Training records waiting to be verified")],
			expectedResult: "Each record is verified, or left unverified because its evidence isn't in order.",
			dependsOn: [],
		});
	for (const record of training) {
		const standing = trainingStanding(record, day);
		if (standing !== "expiring" && standing !== "expired") continue;
		// A newer record for the same person and topic that is still in date makes this one history.
		const renewed = training.some(
			(other) =>
				other.id !== record.id &&
				other.person === record.person &&
				other.topic.toLowerCase() === record.topic.toLowerCase() &&
				trainingStanding(other, day) === "valid",
		);
		if (renewed) continue;
		actions.push({
			title: `Training: ${record.person}, ${record.topic}`,
			responsible: record.person,
			priority: standing === "expired" ? "high" : "normal",
			reason:
				standing === "expired"
					? `It lapsed on ${record.validUntil}. Any step that requires it is refused until it is renewed and verified.`
					: `It lapses on ${record.validUntil}.`,
			nextSteps: ["Repeat the training.", "Record it with its evidence.", "The owner verifies it."],
			due: { date: record.validUntil as string, confirmed: true },
			links: [{ label: "Training", href: `${WORKSPACE_PATH}/manufacturing/training` }],
			sources: [source("Training records")],
			expectedResult: "A new verified record is on file before the old one lapses.",
			dependsOn: [],
		});
	}

	// ---- Services ----------------------------------------------------------------------------------------
	const statuses = configStatus(config, deps.env ?? process.env);
	const integrations = statuses
		.filter((status) => INTEGRATIONS[status.id].hasConnector)
		.map((status) => {
			const checked = health.find((h) => h.integration === status.id);
			const name = INTEGRATIONS[status.id].name;
			if (!status.configured)
				return {
					name,
					status: "Awaiting configuration",
					detail: status.missing.length ? `Missing: ${status.missing.join(", ")}.` : "",
					checkedAt: null,
				};
			if (!checked)
				return { name, status: "Not checked", detail: "No health check is on record.", checkedAt: null };
			return {
				name,
				status: checked.status.replace(/^./, (c) => c.toUpperCase()).replace("_", " "),
				detail: checked.detail,
				checkedAt: checked.checkedAt,
			};
		});
	for (const h of health.filter((item) => item.status === "unhealthy"))
		actions.push({
			title: `Unhealthy: ${INTEGRATIONS[h.integration].name}`,
			responsible: "The owner",
			priority: "urgent",
			reason: h.detail || "Its last health check failed.",
			nextSteps: [
				"Open Integrations.",
				"Read the check's detail and correct the service or its settings.",
				"Run the health check again.",
			],
			due: null,
			links: [{ label: "Integrations", href: `${WORKSPACE_PATH}/integrations` }],
			sources: [{ label: "Last recorded health check", retrievedAt: h.checkedAt }],
			expectedResult: "The service's next health check reports healthy.",
			dependsOn: [],
		});

	// ---- Skills ------------------------------------------------------------------------------------------
	const standings = countStandings(skillRows);
	if (standings.approvable > 0)
		actions.push({
			title: `${plural(standings.approvable, "skill")} passed evaluation and ${standings.approvable === 1 ? "is" : "are"} waiting for approval`,
			responsible: "The owner",
			priority: "normal",
			reason: "A skill guides work only after the owner approves the exact version that was evaluated.",
			nextSteps: [
				"Open Skills.",
				"Read what each evaluation found.",
				"Approve the ones you are satisfied with.",
			],
			due: null,
			links: [{ label: "Skills", href: `${WORKSPACE_PATH}/skills` }],
			sources: [source("Skill evaluations and releases")],
			expectedResult: "Each skill is approved and in use, or deliberately left unapproved.",
			dependsOn: [],
		});
	if (standings.failed > 0)
		actions.push({
			title: `${plural(standings.failed, "skill")} failed evaluation`,
			responsible: "The owner",
			priority: "high",
			reason: "A version that fails its evaluation can't be approved, so that procedure guides no work.",
			nextSteps: [
				"Open Skills and read the failed cases.",
				"Have the procedure or the function behind it corrected.",
				"Evaluate again.",
			],
			due: null,
			links: [{ label: "Skills", href: `${WORKSPACE_PATH}/skills` }],
			sources: [source("Skill evaluations")],
			expectedResult: "Every case that can be run passes.",
			dependsOn: [],
		});
	if (proposals.length > 0)
		actions.push({
			title: `${plural(proposals.length, "improvement proposal")} waiting for a decision`,
			responsible: "The owner",
			priority: "normal",
			reason: "Someone reviewing a result wrote down how a procedure should change.",
			nextSteps: ["Open the skill each proposal is for.", "Mark it as wanted, or decline it."],
			due: null,
			links: [{ label: "Skills", href: `${WORKSPACE_PATH}/skills` }],
			sources: [source("Skill improvement proposals")],
			expectedResult:
				"Each proposal is decided. A wanted change still needs a new version, evaluated and approved.",
			dependsOn: [],
		});

	actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

	// ---- Per agent ---------------------------------------------------------------------------------------
	const perAgent = new Map<string, { completed: number; failed: number; waiting: number }>();
	const bump = (agent: string, key: "completed" | "failed" | "waiting") => {
		const row = perAgent.get(agent) ?? { completed: 0, failed: 0, waiting: 0 };
		row[key] += 1;
		perAgent.set(agent, row);
	};
	for (const line of completed) bump(line.agent, "completed");
	for (const line of unresolved) bump(line.agent, "failed");
	for (const line of active) if (line.state === "needs_review") bump(line.agent, "waiting");

	const inPeriod = (at: string | null) => at !== null && at > start && at <= end;
	const title = (skillId: string) =>
		skillRows.find((row) => row.skill.id === skillId)?.skill.title ?? skillId;
	const expired = documents.issues.filter((i) => i.kind === "expired").length;
	const reviewOverdue = documents.issues.filter((i) => i.kind === "review_overdue").length;
	const urgent = actions.filter((a) => a.priority === "urgent").length;

	// An area is listed as unavailable only while nothing at all is recorded for it.
	const unavailable = UNAVAILABLE.filter(
		(item) =>
			(item.area !== "Inventory" || inventory.length === 0) &&
			(item.area !== "Equipment and training" || (equipment.length === 0 && training.length === 0)),
	);
	const summary: string[] = [
		`${plural(completed.length, "task")} completed and verified, ${unresolved.filter((l) => l.state === "failed").length} failed, and ${unresolved.filter((l) => l.state === "outcome_unknown").length} ended with an unknown outcome in this period.`,
		actions.length
			? `${plural(actions.length, "item")} need${actions.length === 1 ? "s" : ""} someone to act${urgent ? `, ${urgent} of them urgent` : ""}.`
			: "Nothing is waiting on anyone.",
		`${waitingReview} result${waitingReview === 1 ? " is" : "s are"} waiting for review and ${plural(carryover.length, "task")} carried over from before this period.`,
		standings.inUse === standings.total
			? `All ${standings.total} skills are approved and in use.`
			: `${standings.inUse} of ${standings.total} skills are approved and in use.`,
		`${unavailable.length} areas the workspace has no records for are listed as unavailable, not as zero.`,
	];

	const report: DailyReport = {
		kind: input.kind,
		day,
		period: { start, end, basis: input.basis },
		summary,
		counts: {
			completed: completed.length,
			failed: unresolved.filter((l) => l.state === "failed").length,
			unknown: unresolved.filter((l) => l.state === "outcome_unknown").length,
			waitingReview,
			inProgress: active.filter((l) => l.state !== "needs_review").length,
		},
		actions,
		completed,
		unresolved,
		carryover,
		agents: [...perAgent.entries()]
			.map(([agent, row]) => ({ agent, ...row }))
			.sort((a, b) => a.agent.localeCompare(b.agent)),
		knowledge: {
			approved: approvedDocs.rows.map((r) => ({
				title: r.title as string,
				version: Number(r.version),
				approvedAt: iso(r.approved_at) as string,
			})),
			waitingApproval: pendingVersions.length,
			expired,
			reviewOverdue,
		},
		skills: {
			inUse: standings.inUse,
			total: standings.total,
			waitingApproval: standings.approvable,
			failedEvaluation: standings.failed,
			openProposals: proposals.length,
			approved: releases
				.filter((release) => inPeriod(release.approvedAt))
				.map((release) => ({
					skill: title(release.skillId),
					version: release.version,
					at: release.approvedAt,
				})),
			revoked: releases
				.filter((release) => inPeriod(release.revokedAt))
				.map((release) => ({
					skill: title(release.skillId),
					version: release.version,
					at: release.revokedAt as string,
					reason: release.revokeReason ?? "",
				})),
		},
		integrations,
		// Once the Lab holds stock, inventory is something the report reads, not something it can't see.
		unavailable,
		usage: {
			modelCalls: Number(usage.rows[0]?.calls ?? 0),
			inputTokens: Number(usage.rows[0]?.input ?? 0),
			outputTokens: Number(usage.rows[0]?.output ?? 0),
		},
		coverage: [
			{
				source: "Tasks (business work, demonstration runs left out)",
				records: completed.length + unresolved.length + active.length,
				asOf: end,
			},
			{ source: "Stored results waiting for review", records: pendingProducts.rows.length, asOf: end },
			{ source: "Support drafts waiting for review", records: pendingDrafts.rows.length, asOf: end },
			{ source: "Open findings", records: findings.length, asOf: end },
			{ source: "Knowledge documents checked", records: documents.scanned, asOf: end },
			{ source: "Integrations with a recorded health check", records: health.length, asOf: end },
			{ source: "Skills", records: skillRows.length, asOf: end },
			{
				source: "Ingredient lots",
				records: inventory.reduce((n, item) => n + item.lots.length, 0),
				asOf: end,
			},
			{ source: "Results waiting to be verified", records: unverified.length, asOf: end },
			{ source: "Open deviations", records: deviations.length, asOf: end },
			{ source: "Equipment", records: equipment.length, asOf: end },
			{ source: "Training records", records: training.length, asOf: end },
		],
	};
	if (input.kind === "evening") report.tomorrow = actions.slice(0, 3).map((action) => action.title);
	return report;
}

// ---- Saved reports --------------------------------------------------------------------------------------

export type SavedReport = {
	id: string;
	kind: ReportKind;
	day: string;
	attempt: number;
	periodStart: string;
	periodEnd: string;
	status: ReportStatus;
	report: DailyReport | null;
	payloadSha256: string | null;
	/** Whether the stored report still matches the checksum recorded when it was saved. */
	intact: boolean;
	error: string | null;
	requestedBy: string;
	startedAt: string;
	completedAt: string | null;
};

const COLUMNS = `id, kind, report_day::text as report_day, attempt, period_start, period_end, status, payload, payload_sha256,
	error, requested_by, started_at, completed_at`;

function toSaved(r: Row): SavedReport {
	const report = (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as DailyReport | null;
	const sha = (r.payload_sha256 as string | null) ?? null;
	return {
		id: r.id as string,
		kind: r.kind as ReportKind,
		day: r.report_day as string,
		attempt: Number(r.attempt),
		periodStart: iso(r.period_start) as string,
		periodEnd: iso(r.period_end) as string,
		status: r.status as ReportStatus,
		report,
		payloadSha256: sha,
		intact: report !== null && sha !== null && hashOf(report) === sha,
		error: (r.error as string | null) ?? null,
		requestedBy: r.requested_by as string,
		startedAt: iso(r.started_at) as string,
		completedAt: iso(r.completed_at),
	};
}

export async function getReport(sql: Sql, id: string): Promise<SavedReport | null> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_daily_reports where id = $1`, [id]);
	return rows[0] ? toSaved(rows[0]) : null;
}

export async function listReports(sql: Sql, limit = 30): Promise<SavedReport[]> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_daily_reports order by started_at desc, attempt desc limit $1`,
		[limit],
	);
	return rows.map(toSaved);
}

export async function latestCompletedReport(sql: Sql, kind: ReportKind): Promise<SavedReport | null> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_daily_reports where kind = $1 and status = 'completed' order by period_end desc limit 1`,
		[kind],
	);
	return rows[0] ? toSaved(rows[0]) : null;
}

/** A run left "generating" this long has died. It is marked failed so the day isn't blocked. */
export const STUCK_AFTER_MINUTES = 15;

export type GenerateOutcome =
	| { status: "completed"; report: SavedReport }
	| { status: "skipped"; report: SavedReport; reason: string }
	| { status: "failed"; report: SavedReport; error: string };

/**
 * Generates and saves a report. A scheduled run makes one report a day and does nothing if that day's already exists; a
 * person asking again makes a further attempt and the earlier ones are kept. Two runs for the same day can't overlap: the
 * database allows only one to be generating. The saved report is read back and its checksum compared before it counts as
 * done, and a failure is saved with its reason.
 */
export async function generateDailyReport(
	deps: ReportDeps & { now: () => Date },
	input: { kind: ReportKind; actor: Actor; again?: boolean },
): Promise<GenerateOutcome> {
	const { sql } = deps;
	const now = deps.now();
	const day = opsDayKey(now);
	const requestedBy = actorKey(input.actor);

	await sql.query(
		`update wai_daily_reports set status = 'failed', error = $2, completed_at = $3::timestamptz
		 where status = 'generating' and started_at < $3::timestamptz - make_interval(mins => $1)`,
		[STUCK_AFTER_MINUTES, "The run stopped before it finished.", now.toISOString()],
	);

	const existing = await sql.query(
		`select ${COLUMNS} from wai_daily_reports where kind = $1 and report_day = $2::date order by attempt desc`,
		[input.kind, day],
	);
	const today = existing.rows.map(toSaved);
	const done = today.find((report) => report.status === "completed");
	if (done && !input.again)
		return {
			status: "skipped",
			report: done,
			reason: `The ${input.kind} report for ${formatOpsDate(now)} already exists.`,
		};
	const running = today.find((report) => report.status === "generating");
	if (running)
		return { status: "skipped", report: running, reason: "A report for today is already being generated." };

	const previous = await latestCompletedReport(sql, input.kind);
	const start = previous ? new Date(previous.periodEnd) : new Date(now.getTime() - 24 * HOURS);
	const basis = previous
		? `Since the last ${input.kind} report, generated ${formatOpsDate(previous.periodEnd)}.`
		: "The 24 hours before this report. There is no earlier report to start from.";
	const attempt = (today[0]?.attempt ?? 0) + 1;

	let id: string;
	try {
		const inserted = await sql.query<{ id: string }>(
			`insert into wai_daily_reports (kind, report_day, attempt, period_start, period_end, status, requested_by, started_at)
			 values ($1, $2::date, $3, $4::timestamptz, $5::timestamptz, 'generating', $6, $5::timestamptz) returning id`,
			[input.kind, day, attempt, start.toISOString(), now.toISOString(), requestedBy],
		);
		id = inserted.rows[0].id;
	} catch {
		// Another run took this day at the same moment. It is doing the work; this one does nothing.
		const taken = await sql.query(
			`select ${COLUMNS} from wai_daily_reports where kind = $1 and report_day = $2::date order by attempt desc limit 1`,
			[input.kind, day],
		);
		if (!taken.rows[0]) throw new WorkflowError("conflict", "The report couldn't be started.");
		return {
			status: "skipped",
			report: toSaved(taken.rows[0]),
			reason: "A report for today is already being generated.",
		};
	}

	try {
		const report = await buildDailyReport(deps, { kind: input.kind, start, end: now, basis });
		const sha = hashOf(report);
		await sql.query(
			`update wai_daily_reports set status = 'completed', payload = $2::json, payload_sha256 = $3, completed_at = $4::timestamptz
			 where id = $1 and status = 'generating'`,
			[id, json(report), sha, deps.now().toISOString()],
		);
		const saved = await getReport(sql, id);
		if (!saved || saved.status !== "completed" || !saved.intact || saved.payloadSha256 !== sha)
			throw new Error("The saved report didn't read back as it was written.");
		await audit(sql, {
			actor: input.actor,
			action: "report.generate",
			subject: id,
			outcome: "allowed",
			detail: { kind: input.kind, day, attempt, actions: report.actions.length },
		});
		return { status: "completed", report: saved };
	} catch (error) {
		const message =
			error instanceof Error ? error.message.slice(0, 400) : "The report couldn't be generated.";
		await sql.query(
			`update wai_daily_reports set status = 'failed', error = $2, payload = null, payload_sha256 = null,
				completed_at = $3::timestamptz where id = $1`,
			[id, message, deps.now().toISOString()],
		);
		const saved = (await getReport(sql, id)) as SavedReport;
		return { status: "failed", report: saved, error: message };
	}
}
