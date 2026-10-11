import { z } from "zod";
import { HARD_CAPS } from "../agents/limits";
import { ROLE_BY_ID, requireTool } from "../agents/registry";
import { loadSettings } from "../agents/settings";
import { listAudit } from "../audit";
import { BACKUP_TABLES, listBackups, readManifest } from "../backup/backup";
import { listFindings } from "../findings";
import { sha256Hex } from "../hash";
import { INTEGRATIONS, configStatus } from "../integrations/catalog";
import { latestHealth } from "../integrations/health";
import { getDraftByTask, getDraftSources } from "../support/drafts";
import { getTask, listTasks } from "../tasks/repo";
import { isFinished } from "../tasks/state-machine";
import { TASK_STATE_LABELS, ownerOfKind } from "../types";
import { verifyDraftSaved } from "../workflows/relay-review";
import { block, count, fieldInt, lower, nullableText, plural, text, texts } from "./helpers";
import { getProductByTask, hashOf } from "./products";
import { functionReadiness } from "./readiness";
import { groupBy, type Row } from "./table";
import { defineFunction, parseInput } from "./types";

/** Nexus, Patch, Watch, Verify, Guard and Restore: the functions that look at the workspace's own records. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const taskIdFrom = (value: string): string => {
	const id = value.trim().split("/").pop() ?? "";
	if (!UUID.test(id)) block(`"${value.slice(0, 60)}" isn't a task id. Copy it from the task's page.`);
	return id.toLowerCase();
};

// ---- Nexus ------------------------------------------------------------------------------------------

const planStep = z.object({
	step: count,
	functionId: text,
	agent: text,
	action: text,
	dependsOn: z.array(count),
	order: count,
	readiness: text,
	blocker: text,
	needs: texts,
	note: text,
});
const childOutcome = z.object({
	taskId: text,
	functionId: text,
	agent: text,
	title: text,
	state: text,
	summary: text,
	verified: z.boolean(),
});

export const MAX_PLAN_STEPS = 12;

export const nexusGoalPlan = defineFunction({
	id: "nexus.goal-plan",
	version: 1,
	agent: "nexus",
	action: "Plan and coordinate goal",
	outputType: "CoordinationBrief",
	purpose:
		"Turns a goal into a bounded plan of specialist functions with their dependencies and what each needs, or consolidates what the tasks started under a plan actually returned.",
	expectedResult:
		"A coordination brief is stored: for a plan, the ordered steps with one owning agent each, their readiness and blockers; for a consolidation, every child task's actual state and result.",
	notThis:
		"Planning starts no work: each step is started by a person from the plan. Consolidating reports what came back, including failures and unknown outcomes, and never fills in for a step that didn't finish.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "goal", label: "Goal", kind: "textarea", required: true, max: 1500 },
		{ key: "expectedResult", label: "What done looks like", kind: "textarea", required: true, max: 1000 },
		{
			key: "mode",
			label: "What to do",
			kind: "select",
			required: true,
			options: [
				{ value: "plan", label: "Plan the steps (starts nothing)" },
				{ value: "consolidate", label: "Consolidate the results of an earlier plan" },
			],
		},
		{
			key: "steps",
			label: "Steps (for a plan)",
			kind: "table",
			maxRows: MAX_PLAN_STEPS,
			columns: [
				{ key: "function", label: "Function", required: true, aliases: ["function id", "workflow"] },
				{ key: "depends_on", label: "Depends on", aliases: ["after", "dependencies"] },
				{ key: "note", label: "Note" },
			],
		},
		{ key: "planTask", label: "Plan to consolidate (task id)", kind: "text", max: 120 },
	],
	output: z.object({
		goal: text,
		expectedResult: text,
		mode: z.enum(["plan", "consolidate"]),
		scope: text,
		steps: z.array(planStep),
		children: z.array(childOutcome),
		counts: z.object({
			steps: count,
			readyNow: count,
			blocked: count,
			childrenStarted: count,
			childrenCompleted: count,
			childrenUnresolved: count,
		}),
		complete: z.boolean(),
		blockers: texts,
	}),
	sample: () => ({
		goal: "[DEMO] Close out September: reconcile the bank, check the tax workpaper, and confirm backups are restorable.",
		expectedResult:
			"A settlement reconciliation and a tax workpaper are accepted, and recovery coverage has been reviewed.",
		mode: "plan",
		steps:
			"function,depends_on,note\nvault.settlement-match,,Bank and processor exports for September\ntally.tax-workpaper,1,Uses the reconciled period\nrestore.coverage-review,,\nverify.workflow-acceptance,2,Independent check of the workpaper",
	}),
	async handler(ctx) {
		const base = { goal: ctx.text("goal"), expectedResult: ctx.text("expectedResult") };
		if (ctx.text("mode") === "consolidate") {
			const planId = taskIdFrom(
				ctx.text("planTask") || block("Give the task id of the plan to consolidate."),
			);
			const plan = await getTask(ctx.deps.sql, planId);
			if (
				!plan ||
				plan.kind !== "nexus.goal-plan" ||
				plan.scope !== "business" ||
				plan.demo !== ctx.task.demo
			)
				block("That task isn't a coordination plan you can consolidate.");
			requireTool("nexus", "product.read");
			const tasks = await listTasks(ctx.deps.sql, { parentTaskId: planId, limit: 50, demo: "include" });
			const children = [];
			for (const child of tasks) {
				const product = await getProductByTask(ctx.deps.sql, child.id);
				children.push({
					taskId: child.id,
					functionId: child.kind,
					agent: ROLE_BY_ID[child.ownerRole].name,
					title: child.title,
					state: TASK_STATE_LABELS[child.state],
					summary: product?.summary ?? child.error ?? "No result is stored.",
					verified: child.state === "completed" && child.completionEvidence !== null,
				});
			}
			const done = children.filter((c) => c.verified).length;
			const unresolved = children.filter((c) => !c.verified);
			const planned =
				(
					(await getProductByTask(ctx.deps.sql, planId))?.payload as
						| { steps?: Array<{ functionId: string }> }
						| undefined
				)?.steps ?? [];
			const notStarted = planned.filter((s) => !tasks.some((t) => t.kind === s.functionId));
			const blockers = [
				...unresolved.map((c) => `${c.agent}, "${c.title}": ${c.state}. ${c.summary}`),
				...notStarted.map((s) => `${s.functionId} was planned but never started.`),
			];
			return {
				output: {
					...base,
					mode: "consolidate" as const,
					scope: `Consolidation of plan ${planId}: what each started task actually returned.`,
					steps: [],
					children,
					counts: {
						steps: planned.length,
						readyNow: 0,
						blocked: 0,
						childrenStarted: children.length,
						childrenCompleted: done,
						childrenUnresolved: unresolved.length,
					},
					complete: children.length > 0 && unresolved.length === 0 && notStarted.length === 0,
					blockers,
				},
				summary: `${done} of ${plural(children.length, "started task")} completed and verified; ${plural(blockers.length, "item")} unresolved.`,
				missing: notStarted.map((s) => `${s.functionId} has no task under this plan.`),
				coverage: { "Tasks under the plan": children.length, "Steps planned": planned.length } as Record<
					string,
					string | number
				>,
				sourceRefs: children.map((c) => ({
					system: "task",
					id: c.taskId,
					retrievedAt: ctx.now.toISOString(),
					label: c.title,
				})),
			};
		}

		const rows = ctx.rows("steps");
		if (rows.length === 0) block("A plan needs its steps. Add the functions to run, one per row.");
		const settings = await loadSettings(ctx.deps.sql);
		const statuses = configStatus(ctx.deps.config);
		const blockers: string[] = [];
		const steps = rows.map((row, index) => {
			const id = row.function.trim();
			const definition = ctx.definitionOf(id);
			if (!definition) block(`Step ${index + 1}: there is no function called "${id}".`);
			if (definition.id === "nexus.goal-plan") block(`Step ${index + 1}: a plan can't contain another plan.`);
			if (definition.scope === "personal")
				block(`Step ${index + 1}: ${definition.action} is personal and can't be part of a shared plan.`);
			const dependsOn = (row.depends_on ?? "")
				.split(/[,; ]+/)
				.filter(Boolean)
				.map((value) => {
					const n = Number(value);
					if (!Number.isInteger(n) || n < 1 || n > rows.length || n === index + 1)
						block(`Step ${index + 1}: "${value}" isn't another step's number.`);
					return n;
				});
			const readiness = functionReadiness(definition, {
				statuses,
				enabled: settings[definition.agent].enabled,
			});
			const blocker =
				readiness.status === "ready"
					? ""
					: `${readiness.reasons.join(" ")}${readiness.missing.length ? ` Missing: ${readiness.missing.join(", ")}.` : ""}`;
			if (blocker) blockers.push(`Step ${index + 1} (${definition.action}): ${blocker}`);
			return {
				step: index + 1,
				functionId: definition.id,
				agent: ROLE_BY_ID[definition.agent].name,
				action: definition.action,
				dependsOn: [...new Set(dependsOn)],
				order: 0,
				readiness: readiness.status,
				blocker,
				needs: definition.external
					? [`Started from ${definition.external.start}`]
					: definition.fields.filter((f) => f.required).map((f) => f.label),
				note: row.note ?? "",
			};
		});
		// Order the steps so each comes after everything it depends on; a loop has no such order.
		const placed = new Map<number, number>();
		while (placed.size < steps.length) {
			const ready = steps.filter((s) => !placed.has(s.step) && s.dependsOn.every((d) => placed.has(d)));
			if (ready.length === 0)
				block("The steps depend on each other in a loop, so there is no order to run them in.");
			const level = Math.max(0, ...ready.flatMap((s) => s.dependsOn.map((d) => placed.get(d) ?? 0))) + 1;
			for (const s of ready) placed.set(s.step, level);
		}
		for (const s of steps) s.order = placed.get(s.step) ?? 0;
		for (const s of steps) {
			const upstream = s.dependsOn.map((d) => steps[d - 1]).filter((d) => d.blocker);
			if (upstream.length && !s.blocker)
				blockers.push(
					`Step ${s.step} (${s.action}) waits on step ${upstream.map((u) => u.step).join(", ")}, which can't run yet.`,
				);
		}
		const repeated = [...groupBy(steps, (s) => s.functionId)]
			.filter(([, group]) => group.length > 1)
			.map(([id]) => id);
		const readyNow = steps.filter((s) => !s.blocker && s.dependsOn.length === 0).length;
		return {
			output: {
				...base,
				mode: "plan" as const,
				scope:
					"Planning only: no task was started. Start each ready step from this plan so its task is linked to it.",
				steps,
				children: [],
				counts: {
					steps: steps.length,
					readyNow,
					blocked: steps.filter((s) => s.blocker).length,
					childrenStarted: 0,
					childrenCompleted: 0,
					childrenUnresolved: 0,
				},
				complete: false,
				blockers,
			},
			summary: `${plural(steps.length, "step")} planned across ${new Set(steps.map((s) => s.agent)).size} agents: ${readyNow} can start now, ${steps.filter((s) => s.blocker).length} blocked.`,
			assumptions: repeated.length
				? [`${repeated.join(", ")} appears more than once; each run needs its own input.`]
				: [],
			coverage: {
				"Steps planned": steps.length,
				"Most steps a plan may have": Math.min(MAX_PLAN_STEPS, HARD_CAPS.maxToolCalls),
			} as Record<string, string | number>,
		};
	},
	verify: (output) =>
		output.mode === "plan" && output.steps.some((s) => ownerOfKind(s.functionId as never) === "nexus")
			? ["A plan can't assign a step to Nexus itself."]
			: [],
});

// ---- Patch ------------------------------------------------------------------------------------------

const TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;
const SOURCE_PATH = /(?:src|app|pages|lib|components)\/[\w./[\]()-]+\.(?:tsx?|jsx?|mjs)(?::\d+)?/g;

/** A log line with everything that varies from one occurrence to the next removed, so the same error groups together. */
export const errorSignature = (line: string): string =>
	line
		.replace(TIMESTAMP, "")
		.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>")
		.replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
		.replace(/\b\d+(\.\d+)?(ms|s|kb|mb)?\b/gi, "<n>")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 200);

export const patchIssueDiagnosis = defineFunction({
	id: "patch.issue-diagnosis",
	version: 1,
	agent: "patch",
	action: "Diagnose website issue",
	outputType: "DiagnosticReport",
	purpose:
		"Correlates the evidence for a website issue: groups the error lines in the logs you paste, counts them, finds when they started, and names the source files they point at. It can attach a completed site inspection as reproduction evidence.",
	expectedResult:
		"A diagnostic report is stored against the issue with grouped error signatures and their counts and times, the files implicated, the reproduction evidence or an explicit gap, and a proposed repair scope.",
	notThis:
		"It reports what the evidence shows. It states no cause that the logs don't show, and it changes no code: a fix is Build's work, after review.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "issue", label: "Issue", kind: "text", required: true, max: 160 },
		{ key: "route", label: "Affected page or route", kind: "text", max: 200 },
		{ key: "revision", label: "Release or commit", kind: "text", max: 80 },
		{ key: "observed", label: "What was observed", kind: "textarea", required: true, max: 3000 },
		{
			key: "logs",
			label: "Log lines",
			kind: "textarea",
			max: 20000,
			help: "Paste the relevant lines. Secrets and personal details are redacted in the report.",
		},
		{ key: "inspectionTask", label: "Site inspection to attach (task id)", kind: "text", max: 120 },
	],
	output: z.object({
		issue: text,
		route: text,
		revision: text,
		observed: text,
		signatures: z.array(
			z.object({ signature: text, occurrences: count, firstSeen: nullableText, lastSeen: nullableText }),
		),
		statusCodes: z.array(z.object({ code: text, occurrences: count })),
		implicatedFiles: z.array(z.object({ file: text, mentions: count })),
		reproduction: z.object({
			status: z.enum(["evidence_attached", "not_reproduced"]),
			detail: text,
			evidence: texts,
		}),
		proposedRepairScope: texts,
		logLinesRead: count,
	}),
	sample: () => ({
		issue: "[DEMO] Product filters do nothing on phones",
		route: "/shop",
		revision: "demo-build-123",
		observed:
			"On a phone, tapping a filter chip closes the drawer but the product list doesn't change. Desktop works.",
		logs: "2026-10-08T14:02:11Z error TypeError: Cannot read properties of undefined (reading 'value') at applyFilter (src/ui/sections/wv-shop/filters.tsx:88)\n2026-10-08T14:02:11Z GET /shop?brand=demo 200 412ms\n2026-10-08T14:05:40Z error TypeError: Cannot read properties of undefined (reading 'value') at applyFilter (src/ui/sections/wv-shop/filters.tsx:88)\n2026-10-08T14:09:02Z warn hydration mismatch in src/ui/sections/wv-shop/filter-drawer.tsx:41\n2026-10-08T14:11:19Z GET /api/search?q=demo 500 88ms",
	}),
	async handler(ctx) {
		const lines = ctx
			.text("logs")
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		const errors = lines.filter(
			(l) =>
				/\b(error|exception|fatal|failed|unhandled|typeerror|referenceerror|warn(ing)?)\b/i.test(l) ||
				/\s5\d\d\s/.test(l),
		);
		const signatures = [...groupBy(errors, errorSignature)]
			.map(([signature, group]) => {
				const times = group
					.map((l) => TIMESTAMP.exec(l)?.[0])
					.filter((t): t is string => Boolean(t))
					.sort();
				return {
					signature,
					occurrences: group.length,
					firstSeen: times[0] ?? null,
					lastSeen: times[times.length - 1] ?? null,
				};
			})
			.sort((a, b) => b.occurrences - a.occurrences)
			.slice(0, 25);
		const codes = lines.flatMap((l) => /\s([1-5]\d\d)\s/.exec(l)?.[1] ?? []);
		const statusCodes = [...groupBy(codes, (c) => c)]
			.map(([code, group]) => ({ code, occurrences: group.length }))
			.sort((a, b) => a.code.localeCompare(b.code));
		const files = errors.flatMap((l) => l.match(SOURCE_PATH) ?? []).map((f) => f.replace(/:\d+$/, ""));
		const implicatedFiles = [...groupBy(files, (f) => f)]
			.map(([file, group]) => ({ file, mentions: group.length }))
			.sort((a, b) => b.mentions - a.mentions)
			.slice(0, 10);

		let reproduction: { status: "evidence_attached" | "not_reproduced"; detail: string; evidence: string[] } =
			{
				status: "not_reproduced",
				detail:
					"No inspection was attached, so this report rests on the description and the logs only. Run a site inspection of the affected page to collect screenshots and console output.",
				evidence: [],
			};
		const sourceRefs = [];
		if (ctx.text("inspectionTask")) {
			const id = taskIdFrom(ctx.text("inspectionTask"));
			const inspection = await getTask(ctx.deps.sql, id);
			if (!inspection || inspection.kind !== "patch.site_inspection")
				block("That task isn't a site inspection.");
			if (inspection.state !== "completed")
				block(
					`That inspection is ${TASK_STATE_LABELS[inspection.state].toLowerCase()}, so it has no verified evidence to attach.`,
				);
			const findings = await listFindings(ctx.deps.sql, { taskId: id, limit: 50 });
			const shots = (
				(inspection.completionEvidence?.screenshots as
					| Array<{ path: string; viewport: string; url: string }>
					| undefined) ?? []
			).map((s) => `${s.viewport} screenshot of ${s.url} (${s.path})`);
			reproduction = {
				status: "evidence_attached",
				detail: `Inspection ${id} completed with ${plural(shots.length, "verified screenshot")} and ${plural(findings.length, "finding")}. Whether it shows this issue is for the reviewer to judge.`,
				evidence: [...shots, ...findings.map((f) => `${f.severity}: ${f.title}`)],
			};
			sourceRefs.push({ system: "task", id, retrievedAt: ctx.now.toISOString(), label: inspection.title });
		}
		return {
			output: {
				issue: ctx.text("issue"),
				route: ctx.text("route"),
				revision: ctx.text("revision"),
				observed: ctx.text("observed"),
				signatures,
				statusCodes,
				implicatedFiles,
				reproduction,
				proposedRepairScope: implicatedFiles.length
					? [
							`Start with ${implicatedFiles
								.slice(0, 3)
								.map((f) => f.file)
								.join(
									", ",
								)}: ${implicatedFiles.length === 1 ? "it is" : "they are"} named in the error lines.`,
							"Reproduce on the affected viewport before changing anything, and keep the change to those files unless the evidence widens.",
						]
					: [
							"The logs name no source file. Reproduce the issue with an inspection before proposing a change.",
						],
				logLinesRead: lines.length,
			},
			summary: `${ctx.text("issue")}: ${plural(signatures.length, "distinct error")} in ${plural(lines.length, "log line")}; ${reproduction.status === "evidence_attached" ? "inspection evidence attached" : "not reproduced"}.`,
			missing: [
				...(lines.length === 0 ? ["No log lines were supplied."] : []),
				...(!ctx.text("revision")
					? ["The release or commit isn't recorded, so the evidence can't be tied to a build."]
					: []),
				...(reproduction.status === "not_reproduced" ? ["Reproduction evidence."] : []),
			],
			assumptions: [
				"Errors are grouped by their text with numbers, ids and times removed; two different faults with the same message would group together.",
			],
			coverage: { "Log lines read": lines.length, "Error lines": errors.length },
			sourceRefs,
		};
	},
});

// ---- Watch ------------------------------------------------------------------------------------------

export const watchHealthAssessment = defineFunction({
	id: "watch.health-assessment",
	version: 1,
	agent: "watch",
	action: "Assess service health",
	outputType: "HealthAssessment",
	purpose:
		"Assesses service health from timestamped observations: either the integration checks this workspace recorded, or a snapshot you paste in. It flags stale signals and groups failing services into incidents.",
	expectedResult:
		"A health assessment is stored with each service's status, when it was observed and how old that is, the incidents grouped from failing services, and the feeds that are unavailable.",
	notThis:
		"A pasted snapshot is assessed as a snapshot: it is never described as live monitoring. A service nobody checked is 'not observed', never healthy.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{
			key: "source",
			label: "Observations to assess",
			kind: "select",
			required: true,
			options: [
				{ value: "recorded", label: "The integration checks this workspace recorded" },
				{ value: "snapshot", label: "A snapshot I am pasting in" },
			],
		},
		{
			key: "freshHours",
			label: "Hours before an observation counts as stale",
			kind: "integer",
			help: "Default 2.",
		},
		{
			key: "snapshot",
			label: "Snapshot",
			kind: "table",
			maxRows: 200,
			columns: [
				{ key: "service", label: "Service", required: true },
				{ key: "status", label: "Status", required: true },
				{
					key: "checked_at",
					label: "Checked at",
					required: true,
					kind: "datetime",
					aliases: ["observed at", "time"],
				},
				{ key: "detail", label: "Detail" },
			],
		},
	],
	output: z.object({
		source: text,
		assessedAt: text,
		freshHours: count,
		services: z.array(
			z.object({
				service: text,
				status: text,
				observedAt: nullableText,
				ageHours: z.number().nullable(),
				stale: z.boolean(),
				detail: text,
			}),
		),
		incidents: z.array(z.object({ title: text, services: texts, detail: text })),
		notObserved: texts,
		counts: z.object({ healthy: count, failing: count, stale: count, notObserved: count }),
	}),
	sample: () => ({
		source: "snapshot",
		freshHours: "2",
		snapshot:
			"service,status,checked_at,detail\n[DEMO] Storefront,healthy,2026-10-09T14:55:00Z,200 in 310 ms\n[DEMO] Checkout API,unhealthy,2026-10-09T14:55:00Z,503 from payment gateway\n[DEMO] Payment gateway,unhealthy,2026-10-09T14:54:00Z,503 from payment gateway\n[DEMO] Search index,healthy,2026-10-08T03:00:00Z,Last sync ok",
	}),
	async handler(ctx) {
		const freshHours = fieldInt(ctx, "freshHours", 2);
		const recorded = ctx.text("source") === "recorded";
		const failingWords = /unhealthy|down|fail|error|critical|degraded/i;
		let observations: Array<{ service: string; status: string; observedAt: string | null; detail: string }>;
		const notObserved: string[] = [];
		if (recorded) {
			const latest = await latestHealth(ctx.deps.sql);
			const configured = configStatus(ctx.deps.config).filter((c) => c.configured);
			observations = latest
				.filter((h) => h.status !== "not_configured")
				.map((h) => ({
					service: INTEGRATIONS[h.integration]?.name ?? h.integration,
					status: h.status,
					observedAt: h.checkedAt,
					detail: h.detail,
				}));
			for (const c of configured)
				if (!latest.some((h) => h.integration === c.id))
					notObserved.push(`${INTEGRATIONS[c.id].name} is configured but has never been checked.`);
		} else {
			if (ctx.rows("snapshot").length === 0)
				block("Paste the snapshot to assess, or choose the recorded integration checks.");
			observations = ctx
				.rows("snapshot")
				.map((r) => ({
					service: r.service,
					status: lower(r.status),
					observedAt: r.checked_at,
					detail: r.detail ?? "",
				}));
		}
		const services = observations.map((o) => {
			const at = o.observedAt
				? Date.parse(
						o.observedAt.includes("T") || o.observedAt.includes(" ")
							? o.observedAt.replace(" ", "T")
							: `${o.observedAt}T00:00:00Z`,
					)
				: NaN;
			const ageHours = Number.isNaN(at) ? null : Math.round(((ctx.now.getTime() - at) / 3_600_000) * 10) / 10;
			return { ...o, ageHours, stale: ageHours === null || ageHours > freshHours };
		});
		const failing = services.filter((s) => failingWords.test(s.status));
		const incidents = [...groupBy(failing, (s) => lower(s.detail) || lower(s.service))].map(([, group]) => ({
			title:
				group.length > 1
					? `${group.length} services failing with the same symptom`
					: `${group[0].service} is ${group[0].status}`,
			services: group.map((s) => s.service),
			detail: group[0].detail || "No detail was recorded.",
		}));
		const staleCount = services.filter((s) => s.stale).length;
		return {
			output: {
				source: recorded
					? "Integration checks recorded by this workspace"
					: "An imported snapshot (a point in time, not continuous monitoring)",
				assessedAt: ctx.now.toISOString(),
				freshHours,
				services,
				incidents,
				notObserved,
				counts: {
					healthy: services.filter((s) => !failingWords.test(s.status) && !s.stale).length,
					failing: failing.length,
					stale: staleCount,
					notObserved: notObserved.length,
				},
			},
			summary: `${plural(failing.length, "service")} failing in ${plural(incidents.length, "incident")}; ${staleCount} of ${services.length} observations are older than ${freshHours} h.`,
			missing: [...notObserved, ...(services.length === 0 ? ["There are no observations to assess."] : [])],
			assumptions: [
				"Services failing with identical detail are grouped as one incident.",
				"A stale observation says what was true when it was taken, not what is true now.",
			],
			coverage: { "Observations assessed": services.length },
		};
	},
});

// ---- Verify -----------------------------------------------------------------------------------------

const verdict = z.object({ check: text, result: z.enum(["pass", "fail", "not_applicable"]), detail: text });

export const verifyWorkflowAcceptance = defineFunction({
	id: "verify.workflow-acceptance",
	version: 1,
	agent: "verify",
	action: "Verify workflow result",
	outputType: "VerificationReport",
	purpose:
		"Independently re-checks another agent's finished task: reads the stored result again, recomputes its checksums, re-validates it against that function's own rules and its recorded input, and confirms the review and completion records.",
	expectedResult:
		"A verification report is stored naming the exact result and checksum that was checked, each check's real pass or fail, and what could not be tested.",
	notThis:
		"It checks records the application holds. It can't re-run a model's judgement or observe anything physical, it never checks its own reports, and it approves nothing.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "task", label: "Task to verify (task id)", kind: "text", required: true, max: 120 },
		{
			key: "criteria",
			label: "Acceptance criteria to record as not automatically tested",
			kind: "list",
			maxItems: 20,
		},
	],
	output: z.object({
		taskId: text,
		kind: text,
		owner: text,
		state: text,
		expectedResult: text,
		verified: z.object({ record: text, sha256: nullableText }),
		checks: z.array(verdict),
		passed: z.boolean(),
		untested: texts,
	}),
	// There is nothing fictional to verify: it only makes sense pointed at a real finished task.
	sample: null,
	async handler(ctx) {
		const id = taskIdFrom(ctx.text("task"));
		const target = await getTask(ctx.deps.sql, id);
		// Verify works on shared business records only; it never opens someone's personal work.
		if (!target || target.scope !== "business") block("That task doesn't exist.");
		if (target.kind === "verify.workflow-acceptance")
			block("Verify can't check its own reports: that would not be an independent check.");
		if (!isFinished(target.state) && target.state !== "needs_review")
			block(
				`That task is ${TASK_STATE_LABELS[target.state].toLowerCase()}; there is no result to verify yet.`,
			);
		requireTool("verify", "product.read");
		const checks: Array<z.infer<typeof verdict>> = [];
		const check = (name: string, ok: boolean | null, detail: string) =>
			checks.push({ check: name, result: ok === null ? "not_applicable" : ok ? "pass" : "fail", detail });
		const untested = [...ctx.list("criteria").map((c) => `Not automatically tested: ${c}`)];
		let verified: { record: string; sha256: string | null } = { record: "none", sha256: null };

		check(
			"An expected result was recorded before the work ran",
			target.expectedResult.trim().length > 0,
			target.expectedResult.slice(0, 140),
		);
		if (target.state === "completed")
			check(
				"Completion evidence is recorded",
				target.completionEvidence !== null,
				target.completionEvidence ? "Evidence present." : "No evidence.",
			);
		else
			check(
				"Completion evidence is recorded",
				null,
				`The task is ${TASK_STATE_LABELS[target.state].toLowerCase()}, not completed.`,
			);

		const product = await getProductByTask(ctx.deps.sql, id);
		const definition = ctx.definitionOf(target.kind);
		if (product && definition) {
			verified = { record: `Result ${product.id} (${product.outputType})`, sha256: product.payloadSha256 };
			const stored = hashOf(product.payload);
			check(
				"The stored result matches its recorded checksum",
				stored === product.payloadSha256,
				`Recomputed ${stored.slice(0, 12)}…, recorded ${product.payloadSha256.slice(0, 12)}….`,
			);
			check(
				"It is filed under the right task, function and agent",
				product.taskId === id && product.functionId === target.kind && product.agentId === target.ownerRole,
				`${product.functionId} for ${product.agentId}.`,
			);
			const shaped = definition.output.safeParse(product.payload);
			check(
				"It still has the function's declared shape",
				shaped.success,
				shaped.success
					? `Valid ${definition.outputType}.`
					: "The stored record no longer matches the declared format.",
			);
			const parsed = parseInput(definition, target.input);
			check(
				"The recorded input is still valid for the function",
				parsed.ok,
				parsed.ok ? `${parsed.rowsRead} rows.` : parsed.problems.slice(0, 2).join(" "),
			);
			if (parsed.ok) {
				const uploads = (Array.isArray(target.input.uploads) ? target.input.uploads : []) as Array<{
					sha256: string;
				}>;
				const inputSha = hashOf({
					input: parsed.input,
					uploads: uploads.map((u) => u.sha256),
					scope: target.scope,
					demo: target.demo,
				});
				check(
					"The result is tied to exactly that input",
					inputSha === product.inputSha256,
					`Input ${inputSha.slice(0, 12)}…, result records ${product.inputSha256.slice(0, 12)}….`,
				);
				if (shaped.success && definition.verify) {
					const problems = definition.verify(shaped.data, parsed.input);
					check(
						"The function's own consistency rules pass when re-run",
						problems.length === 0,
						problems.length ? problems.slice(0, 3).join(" ") : "Re-run with no problems.",
					);
				} else
					check(
						"The function's own consistency rules pass when re-run",
						null,
						"This function declares no extra consistency rule.",
					);
			}
			if (target.state === "completed")
				check(
					"The task's evidence names this exact result",
					target.completionEvidence?.payloadSha256 === product.payloadSha256,
					"Compared the evidence checksum with the stored result.",
				);
			if (product.reviewRequired) {
				const decided = product.reviewState === "accepted" || product.reviewState === "rejected";
				const reviews = await ctx.deps.sql.query(
					`select reviewer from wai_reviews where subject_type = 'work_product' and subject_id = $1`,
					[product.id],
				);
				check(
					"A person's review decision is recorded",
					!decided ? null : /^operator:/.test(product.reviewedBy ?? "") && reviews.rows.length > 0,
					decided ? `${product.reviewState} by a person.` : "Still waiting for review.",
				);
				if (target.state === "completed")
					check(
						"It was accepted before the task was completed",
						product.reviewState === "accepted",
						`Review state is ${product.reviewState}.`,
					);
			}
			if (product.model)
				untested.push(
					"The wording came from a model. Whether it reads well and is right is for the human reviewer; only its structure and references were checked.",
				);
		} else if (target.kind === "relay.support_draft") {
			const draft = await getDraftByTask(ctx.deps.sql, id);
			check("A draft is stored for the task", draft !== null, draft ? `Draft ${draft.id}.` : "No draft.");
			if (draft) {
				verified = { record: `Draft ${draft.id}`, sha256: draft.bodySha256 };
				check(
					"The draft's text matches its recorded checksum",
					sha256Hex(draft.body) === draft.bodySha256,
					"Recomputed from the stored text.",
				);
				check(
					"The draft is on the case the task was created for",
					draft.caseId === String(target.input.caseId ?? ""),
					`Case ${draft.caseId}.`,
				);
				if (target.state === "completed" && draft.reviewedBy) {
					const again = await verifyDraftSaved(ctx.deps.sql, {
						draftId: draft.id,
						expectedCaseId: String(target.input.caseId ?? ""),
						expectedBodySha256: String(target.completionEvidence?.bodySha256 ?? ""),
						expectedSourceCount: (await getDraftSources(ctx.deps.sql, draft.id)).length,
						expectedReviewer: draft.reviewedBy,
					});
					for (const c of again.checks) check(c.name, c.ok, c.detail);
				}
			}
		} else if (target.kind === "patch.site_inspection") {
			const shots =
				(target.completionEvidence?.screenshots as Array<{ path: string; sha256: string }> | undefined) ?? [];
			check(
				"Evidence screenshots are listed",
				target.state !== "completed" ? null : shots.length > 0,
				`${shots.length} listed.`,
			);
			if (shots.length && ctx.deps.storage) {
				let matching = 0;
				for (const shot of shots) {
					const bytes = await ctx.deps.storage.get(shot.path);
					if (bytes && sha256Hex(bytes) === shot.sha256) matching += 1;
				}
				verified = { record: `${shots.length} evidence files`, sha256: null };
				check(
					"Every evidence file is stored and matches its checksum",
					matching === shots.length,
					`${matching} of ${shots.length} match.`,
				);
			} else if (shots.length)
				untested.push(
					"File storage isn't configured here, so the evidence files themselves weren't re-read.",
				);
		} else {
			check(
				"A stored result exists to re-check",
				null,
				"This kind of task keeps its outcome in its own evidence, which was checked above.",
			);
		}
		const failed = checks.filter((c) => c.result === "fail");
		return {
			output: {
				taskId: id,
				kind: target.kind,
				owner: ROLE_BY_ID[target.ownerRole].name,
				state: TASK_STATE_LABELS[target.state],
				expectedResult: target.expectedResult,
				verified,
				checks,
				passed: failed.length === 0 && checks.some((c) => c.result === "pass"),
				untested,
			},
			summary: failed.length
				? `${ROLE_BY_ID[target.ownerRole].name}'s task failed ${plural(failed.length, "check")}: ${failed.map((c) => c.check).join("; ")}.`
				: `${ROLE_BY_ID[target.ownerRole].name}'s task passed ${checks.filter((c) => c.result === "pass").length} checks; ${untested.length} not tested.`,
			missing: untested,
			coverage: {
				"Checks run": checks.filter((c) => c.result !== "not_applicable").length,
				"Not applicable": checks.filter((c) => c.result === "not_applicable").length,
			},
			sourceRefs: [
				{
					system: "task",
					id,
					retrievedAt: ctx.now.toISOString(),
					sha256: verified.sha256 ?? undefined,
					label: target.title,
				},
			],
			warnings: failed.length
				? ["A check failed. Treat the checked result as unreliable until it is explained."]
				: [],
		};
	},
});

// ---- Guard ------------------------------------------------------------------------------------------

export const guardAccessReview = defineFunction({
	id: "guard.access-review",
	version: 1,
	agent: "guard",
	action: "Review access and security",
	outputType: "SecurityReview",
	purpose:
		"Compares the access grants you supply with your approved role policy, flags excessive, conflicting, self-granted and unattributed access, and reports how this workspace's own access is set up and what was refused recently.",
	expectedResult:
		"A security review is stored with each finding's subject, the rule it breaks and a recommended correction, plus the workspace's own access setup and the denied attempts on record.",
	notThis:
		"It recommends. It cannot grant, revoke or change any permission, here or anywhere else, its own included.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "system", label: "System under review", kind: "text", required: true, max: 120 },
		{
			key: "policy",
			label: "Approved policy (what each role may hold)",
			kind: "table",
			required: true,
			columns: [
				{ key: "role", label: "Role", required: true },
				{ key: "permission", label: "Permission", required: true },
			],
		},
		{
			key: "grants",
			label: "Current grants",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "subject", label: "Subject", required: true, aliases: ["user", "account", "who"] },
				{ key: "role", label: "Role", required: true },
				{ key: "permission", label: "Permission", required: true },
				{ key: "granted_by", label: "Granted by" },
				{ key: "granted_on", label: "Granted on", kind: "date" },
			],
		},
	],
	output: z.object({
		system: text,
		findings: z.array(z.object({ subject: text, issue: text, detail: text, recommendation: text })),
		grantsReviewed: count,
		withinPolicy: count,
		workspace: z.object({ owners: count, staff: count, notes: texts }),
		deniedAttempts: z.array(z.object({ action: text, attempts: count, lastAt: text })),
	}),
	sample: () => ({
		system: "[DEMO] Store admin",
		policy:
			"role,permission\nSupport,View orders\nSupport,Edit customer notes\nFulfilment,View orders\nFulfilment,Mark shipped\nAdmin,Manage staff",
		grants:
			"subject,role,permission,granted_by,granted_on\nsam@demo.test,Support,View orders,owner@demo.test,2026-03-01\nsam@demo.test,Support,Refund orders,sam@demo.test,2026-09-14\njo@demo.test,Fulfilment,Mark shipped,,2026-04-02\njo@demo.test,Admin,Manage staff,owner@demo.test,2026-04-02",
	}),
	async handler(ctx) {
		const allowed = new Set(ctx.rows("policy").map((p) => `${lower(p.role)}|${lower(p.permission)}`));
		const roles = new Set(ctx.rows("policy").map((p) => lower(p.role)));
		const grants = ctx.rows("grants");
		const findings: Array<{ subject: string; issue: string; detail: string; recommendation: string }> = [];
		let withinPolicy = 0;
		for (const g of grants) {
			const ok = allowed.has(`${lower(g.role)}|${lower(g.permission)}`);
			if (ok) withinPolicy += 1;
			else if (!roles.has(lower(g.role)))
				findings.push({
					subject: g.subject,
					issue: "Role not in the policy",
					detail: `Holds role "${g.role}", which the approved policy doesn't define.`,
					recommendation: "Confirm the role is approved, or remove the grant.",
				});
			else
				findings.push({
					subject: g.subject,
					issue: "Excessive permission",
					detail: `"${g.permission}" isn't allowed for role "${g.role}".`,
					recommendation: `Remove "${g.permission}", or have the policy changed by the owner first.`,
				});
			if (g.granted_by && lower(g.granted_by) === lower(g.subject))
				findings.push({
					subject: g.subject,
					issue: "Self-granted",
					detail: `"${g.permission}" was granted by the same account that holds it.`,
					recommendation: "Have someone with authority re-approve or remove it.",
				});
			if (!g.granted_by)
				findings.push({
					subject: g.subject,
					issue: "No record of who granted it",
					detail: `"${g.permission}" has no granting account recorded.`,
					recommendation: "Record who approved it, or remove it.",
				});
		}
		for (const [subject, mine] of groupBy(grants, (g) => lower(g.subject))) {
			const held = [...new Set(mine.map((g) => g.role))];
			if (held.length > 1)
				findings.push({
					subject: mine[0].subject ?? subject,
					issue: "More than one role",
					detail: `Holds ${held.join(" and ")}.`,
					recommendation:
						"Check the combination is intended; combined roles can defeat a separation of duties.",
				});
		}
		const { ownerEmails, staffEmails } = ctx.deps.config;
		const notes = [
			...(ownerEmails.length === 0
				? ["No owner is configured, so nobody can sign in to the workspace."]
				: []),
			...(ownerEmails.length > 2
				? [`${ownerEmails.length} owners are configured. Each can approve documents and change agent limits.`]
				: []),
			...(ownerEmails.some((e) => staffEmails.includes(e))
				? ["An account is on both the owner and the staff list; it is treated as an owner."]
				: []),
			"Access is decided on the server from the store's staff sign-in and these two lists; a customer account can never qualify.",
		];
		const denied = (await listAudit(ctx.deps.sql, 500)).filter((a) => a.outcome === "denied");
		const deniedAttempts = [...groupBy(denied, (a) => a.action)].map(([action, group]) => ({
			action,
			attempts: group.length,
			lastAt: group[0].at,
		}));
		return {
			output: {
				system: ctx.text("system"),
				findings,
				grantsReviewed: grants.length,
				withinPolicy,
				workspace: { owners: ownerEmails.length, staff: staffEmails.length, notes },
				deniedAttempts,
			},
			summary: `${ctx.text("system")}: ${plural(findings.length, "finding")} in ${plural(grants.length, "grant")}; ${withinPolicy} within policy.`,
			assumptions: [
				"Grants and policy are compared by role and permission name, ignoring capitals.",
				"The policy supplied is taken to be the approved one.",
			],
			coverage: {
				"Grants reviewed": grants.length,
				"Policy rules": allowed.size,
				"Audit entries read": Math.min(500, denied.length + withinPolicy),
			},
		};
	},
});

// ---- Restore ----------------------------------------------------------------------------------------

export const restoreCoverageReview = defineFunction({
	id: "restore.coverage-review",
	version: 1,
	agent: "restore",
	action: "Review recovery coverage",
	outputType: "RecoveryCoverageReport",
	purpose:
		"Compares what must be recoverable with what the backups actually hold: the newest backup's age and contents against every table and stored file, the last isolated restore check, and the other assets you list.",
	expectedResult:
		"A recovery coverage report is stored with the newest backup's age and coverage, tables and files it misses, when restoration was last proven, each other asset's coverage, and a restore-test plan.",
	notThis:
		"Reading a manifest shows coverage on paper. Only the separate isolated restore check proves a backup restores, and this report says which of the two it found.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "maxAgeHours", label: "Oldest acceptable backup (hours)", kind: "integer", help: "Default 26." },
		{
			key: "assets",
			label: "Other things that must be recoverable",
			kind: "table",
			columns: [
				{ key: "asset", label: "Asset", required: true },
				{ key: "covered_by", label: "Covered by", aliases: ["backup", "how"] },
				{ key: "last_restore_test", label: "Last restore test", kind: "date", aliases: ["last tested"] },
			],
		},
	],
	output: z.object({
		backups: z.object({
			found: count,
			newest: z
				.object({ id: text, createdAt: text, ageHours: z.number(), rows: count, files: count })
				.nullable(),
			tablesCovered: count,
			tablesExpected: count,
			tablesMissing: texts,
		}),
		files: z.object({ registered: count, inNewestBackup: count }),
		restoreCheck: z.object({
			lastRunAt: nullableText,
			passed: z.boolean().nullable(),
			backupId: nullableText,
		}),
		otherAssets: z.array(
			z.object({
				asset: text,
				coveredBy: text,
				lastRestoreTest: nullableText,
				status: z.enum(["covered_and_tested", "covered_untested", "not_covered"]),
			}),
		),
		gaps: texts,
		restoreTestPlan: texts,
		statement: text,
	}),
	sample: () => ({
		maxAgeHours: "26",
		assets:
			"asset,covered_by,last_restore_test\n[DEMO] Environment configuration,Password manager export,2026-08-01\n[DEMO] OpenClaw host job records,,\n[DEMO] Source repository,GitHub,",
	}),
	async handler(ctx) {
		const maxAge = fieldInt(ctx, "maxAgeHours", 26);
		const gaps: string[] = [];
		const expected = BACKUP_TABLES.map((t) => t.name);
		let found = 0;
		let newest: { id: string; createdAt: string; ageHours: number; rows: number; files: number } | null =
			null;
		let tablesMissing: string[] = [...expected];
		let inNewestBackup = 0;
		if (!ctx.deps.storage)
			gaps.push("File storage isn't configured, so no backup can be taken or listed here.");
		else {
			const ids = await listBackups(ctx.deps.storage);
			found = ids.length;
			if (ids.length === 0) gaps.push("No backup has been taken yet.");
			else {
				const manifest = await readManifest(ctx.deps.storage, ids[0]);
				const ageHours =
					Math.round(((ctx.now.getTime() - Date.parse(manifest.createdAt)) / 3_600_000) * 10) / 10;
				newest = {
					id: manifest.id,
					createdAt: manifest.createdAt,
					ageHours,
					rows: manifest.totals.rows,
					files: manifest.totals.files,
				};
				tablesMissing = expected.filter((name) => !(name in manifest.tables));
				inNewestBackup = manifest.files.length;
				if (ageHours > maxAge)
					gaps.push(`The newest backup is ${ageHours} hours old; the limit you set is ${maxAge}.`);
				for (const table of tablesMissing) gaps.push(`${table} isn't in the newest backup.`);
			}
		}
		const registered = Number(
			(
				await ctx.deps.sql.query<{ n: number }>(
					`select count(*)::int as n from wai_files where kind <> 'backup'`,
				)
			).rows[0].n,
		);
		if (newest && inNewestBackup < registered)
			gaps.push(
				`${registered - inNewestBackup} stored files were added since the newest backup and aren't in it.`,
			);
		const lastCheck = (await listAudit(ctx.deps.sql, 500)).find((a) => a.action === "backup.restore_check");
		const restoreCheck = {
			lastRunAt: lastCheck?.at ?? null,
			passed: lastCheck ? lastCheck.outcome === "allowed" : null,
			backupId: lastCheck?.subject ?? null,
		};
		if (!lastCheck)
			gaps.push("No isolated restore check is on record, so restoration has never been proven here.");
		else if (lastCheck.outcome !== "allowed")
			gaps.push(`The last restore check (${lastCheck.at.slice(0, 10)}) failed.`);
		else if (newest && lastCheck.subject !== newest.id)
			gaps.push("The newest backup hasn't been through a restore check; an older one has.");
		const otherAssets = ctx.rows("assets").map((a: Row) => {
			const status = !a.covered_by
				? ("not_covered" as const)
				: a.last_restore_test
					? ("covered_and_tested" as const)
					: ("covered_untested" as const);
			if (status === "not_covered") gaps.push(`${a.asset} has no backup recorded.`);
			if (status === "covered_untested")
				gaps.push(`${a.asset} is backed up (${a.covered_by}) but a restore has never been tested.`);
			return {
				asset: a.asset,
				coveredBy: a.covered_by || "",
				lastRestoreTest: a.last_restore_test || null,
				status,
			};
		});
		const restoreTestPlan = [
			...(newest && restoreCheck.backupId !== newest.id
				? [`Run the isolated restore check on backup ${newest.id}.`]
				: []),
			...(newest ? [] : ["Take a backup, then run the isolated restore check on it."]),
			...otherAssets
				.filter((a) => a.status !== "covered_and_tested")
				.map((a) =>
					a.status === "not_covered"
						? `Decide how ${a.asset} is backed up.`
						: `Restore ${a.asset} somewhere isolated and record the date.`,
				),
		];
		return {
			output: {
				backups: {
					found,
					newest,
					tablesCovered: expected.length - tablesMissing.length,
					tablesExpected: expected.length,
					tablesMissing,
				},
				files: { registered, inNewestBackup },
				restoreCheck,
				otherAssets,
				gaps,
				restoreTestPlan,
				statement:
					"Coverage comes from reading the backup manifest. Whether a backup restores is shown only by the isolated restore check recorded above.",
			},
			summary: newest
				? `Newest backup is ${newest.ageHours} h old covering ${expected.length - tablesMissing.length} of ${expected.length} tables and ${inNewestBackup} of ${registered} files; ${plural(gaps.length, "gap")}.`
				: `No backup to review; ${plural(gaps.length, "gap")}.`,
			missing: gaps,
			coverage: {
				"Backups found": found,
				"Tables expected": expected.length,
				"Other assets listed": otherAssets.length,
			},
			sourceRefs: newest
				? [
						{
							system: "backup",
							id: newest.id,
							retrievedAt: ctx.now.toISOString(),
							label: `Backup manifest ${newest.id}`,
						},
					]
				: [],
		};
	},
});

export const OPERATIONS_FUNCTIONS = [
	nexusGoalPlan,
	patchIssueDiagnosis,
	watchHealthAssessment,
	verifyWorkflowAcceptance,
	guardAccessReview,
	restoreCoverageReview,
];
