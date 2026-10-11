"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { rateLimited } from "@/lib/rate-limit";
import { parseLimitOverrides } from "../agents/limits";
import { updateRoleSettings } from "../agents/settings";
import { addVersion, approveVersion, createDocument, rejectVersion, retireDocument } from "../atlas/service";
import { audit } from "../audit";
import { listBackups } from "../backup/backup";
import { runBackup, runRestoreDrill } from "../backup/drill";
import { decideFinding } from "../findings";
import { requestFunction, reviewProduct, type IncomingFile } from "../functions/pipeline";
import { getProductByTask } from "../functions/products";
import { lookupFunction } from "../functions/registry";
import { dispatchTask } from "../jobs/dispatch";
import { MOVEMENT_LABELS, createIngredient, createLot, postMovement } from "../lab/inventory";
import { generateDailyReport } from "../reports/daily";
import { SKILLS, SKILL_BY_ID } from "../skills/catalog";
import { evaluateSkills } from "../skills/evaluate";
import {
	approveRelease,
	createProposal,
	decideProposal,
	listEvaluations,
	revokeRelease,
	rollbackSkill,
} from "../skills/store";
import { createCase, setCaseStatus, type CaseStatus } from "../support/cases";
import { cancelTask, retryTask, settleUnknownTask } from "../tasks/actions";
import { getTask, scopeVisibleTo, type TaskRecord } from "../tasks/repo";
import { opsDayKey } from "../time";
import { WORKSPACE_PATH } from "../types";
import { runTask } from "../workflows";
import { requestSiteInspection } from "../workflows/inspection";
import { requestRelayDraft } from "../workflows/relay";
import { reviewDraft } from "../workflows/relay-review";
import { requestScheduledTask } from "../workflows/scheduled";
import { WorkflowError } from "../workflows/types";
import type { ActionState } from "./action-state";
import { describeFailure } from "./failures";
import { getWorkspace, type Workspace } from "./session";
import { loadSkillRows } from "./skills";

/**
 * Every change a person makes in the workspace goes through one of these server actions. Each one checks who is asking
 * first (the same check the pages use), does the work through the library, and either moves on to the result or returns a
 * specific reason it couldn't. Nothing here sends a message, moves money, files anything or changes production.
 */

const text = (form: FormData, key: string): string => {
	const value = form.get(key);
	return typeof value === "string" ? value : "";
};
const path = (suffix: string) => `${WORKSPACE_PATH}${suffix}`;
const refresh = () => revalidatePath(WORKSPACE_PATH, "layout");

/** Each person may start a generous but finite number of things an hour, so a stuck key or a script can't run up a bill. */
function throttle(workspace: Workspace): void {
	if (rateLimited(`worldwide-ai:${workspace.viewer}`, 400))
		throw new WorkflowError("conflict", "That is a lot of requests in an hour. Wait a little and try again.");
}

/**
 * Hands a queued task to whatever runs background work. Trigger.dev when it is configured. Otherwise the work runs here:
 * quick, code-only work straight away, so the result is ready when the page loads, and anything that waits on a model or
 * the OpenClaw worker after the response has been sent.
 */
async function start(workspace: Workspace, task: TaskRecord, immediate: boolean): Promise<void> {
	if (task.state !== "queued") return;
	const { runtime } = workspace;
	const background = (taskId: string) =>
		after(async () => {
			try {
				await runTask(runtime, taskId, { waitMs: 45_000 });
			} catch (error) {
				console.error(
					"[worldwide-ai] background run failed:",
					taskId,
					error instanceof Error ? error.message : error,
				);
			}
		});
	if (workspace.config.trigger.secretSet || !immediate) {
		await dispatchTask(runtime, task, { inline: background });
		return;
	}
	await dispatchTask(runtime, task, { inline: () => undefined });
	await runTask(runtime, task.id);
}

/** Where to send someone after a task was started: its result if it has one already, otherwise the task itself. */
async function landing(workspace: Workspace, taskId: string): Promise<string> {
	const product = await getProductByTask(workspace.runtime.sql, taskId);
	return product ? path(`/results/${product.id}`) : path(`/tasks/${taskId}`);
}

// ---- Agent functions --------------------------------------------------------------------------------

export async function runFunctionAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const functionId = text(form, "functionId");
	const definition = lookupFunction(functionId);
	const values: Record<string, string> = {};
	let destination: string;
	try {
		throttle(workspace);
		if (!definition) throw new WorkflowError("not_found", "That function doesn't exist.");
		const demo = text(form, "demo") === "1";
		const raw: Record<string, unknown> = demo && definition.sample ? definition.sample() : {};
		const files: IncomingFile[] = [];
		if (!demo)
			for (const field of definition.fields) {
				if (field.kind === "images") {
					for (const entry of form.getAll(field.key))
						if (entry instanceof File && entry.size > 0)
							files.push({
								field: field.key,
								name: entry.name,
								mime: entry.type,
								bytes: new Uint8Array(await entry.arrayBuffer()),
							});
					continue;
				}
				raw[field.key] = text(form, field.key);
				values[field.key] = text(form, field.key);
			}
		const asked = await requestFunction(workspace.runtime, workspace.actor, functionId, raw, {
			lookup: lookupFunction,
			demo,
			again: text(form, "again") === "1",
			parentTaskId: text(form, "plan") || undefined,
			files,
		});
		await start(workspace, asked.task, definition.uses === "code");
		destination = await landing(workspace, asked.task.id);
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	redirect(destination);
}

export async function reviewResultAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const productId = text(form, "productId");
	try {
		const intent = text(form, "intent");
		if (intent !== "accept" && intent !== "reject")
			throw new WorkflowError("invalid", "Choose accept or reject.");
		const reviewed = await reviewProduct(workspace.runtime, workspace.actor, productId, {
			action: intent,
			note: text(form, "note"),
		});
		refresh();
		return {
			ok: reviewed.task.state !== "outcome_unknown",
			message:
				reviewed.task.state === "completed"
					? "Accepted. The stored result was read back and every check passed, so the task is completed."
					: reviewed.task.state === "cancelled"
						? "Rejected. The task was cancelled and the reason is on record."
						: "The decision was recorded, but the result could not be confirmed afterwards. The task is marked outcome unknown.",
		};
	} catch (error) {
		return describeFailure(error);
	}
}

// ---- Tasks ------------------------------------------------------------------------------------------

export async function taskAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const taskId = text(form, "taskId");
	const intent = text(form, "intent");
	try {
		const { sql } = workspace.runtime;
		const task = await getTask(sql, taskId);
		// Someone else's personal task doesn't exist as far as this person is concerned.
		if (!task || !scopeVisibleTo(task.scope, workspace.viewer))
			throw new WorkflowError("not_found", "That task doesn't exist.");
		if (intent === "cancel") {
			await cancelTask(sql, workspace.actor, taskId, text(form, "note"));
			refresh();
			return { ok: true, message: "Cancelled." };
		}
		if (intent === "retry" || intent === "start") {
			throttle(workspace);
			const queued = intent === "retry" ? await retryTask(sql, workspace.actor, taskId) : task;
			await start(
				workspace,
				queued,
				lookupFunction(queued.kind)?.uses === "code" && !lookupFunction(queued.kind)?.external,
			);
			refresh();
			return { ok: true, message: intent === "retry" ? "Queued again, on the same task." : "Started." };
		}
		if (intent === "settle") {
			const resolution = text(form, "resolution");
			if (resolution !== "completed" && resolution !== "failed")
				throw new WorkflowError("invalid", "Choose completed or failed.");
			await settleUnknownTask(sql, workspace.actor, taskId, { resolution, note: text(form, "note") });
			refresh();
			return { ok: true, message: `Settled as ${resolution}, attributed to you.` };
		}
		throw new WorkflowError("invalid", "That isn't something a task can do.");
	} catch (error) {
		return describeFailure(error);
	}
}

// ---- Support ----------------------------------------------------------------------------------------

export async function createCaseAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const values = Object.fromEntries(
		["subject", "message", "customerName", "customerEmail", "orderNumber"].map((key) => [
			key,
			text(form, key),
		]),
	);
	let destination: string;
	try {
		const created = await createCase(workspace.runtime.sql, workspace.actor, {
			source: "manual",
			...values,
		} as Parameters<typeof createCase>[2]);
		destination = path(`/support/cases/${created.case.id}`);
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	redirect(destination);
}

export async function requestDraftAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	let destination: string;
	try {
		throttle(workspace);
		const asked = await requestRelayDraft(workspace.runtime, workspace.actor, text(form, "caseId"), {
			regenerate: text(form, "regenerate") === "1",
		});
		await start(workspace, asked.task, false);
		destination = path(`/tasks/${asked.task.id}`);
	} catch (error) {
		return describeFailure(error);
	}
	refresh();
	redirect(destination);
}

export async function reviewDraftAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const draftId = text(form, "draftId");
	const intent = text(form, "intent");
	const body = text(form, "body");
	try {
		const result =
			intent === "save"
				? await reviewDraft(workspace.runtime, workspace.actor, draftId, {
						action: "save",
						body,
						note: text(form, "note") || undefined,
						acknowledgeSources: text(form, "acknowledge") === "1",
					})
				: intent === "edit"
					? await reviewDraft(workspace.runtime, workspace.actor, draftId, { action: "edit", body })
					: intent === "reject"
						? await reviewDraft(workspace.runtime, workspace.actor, draftId, {
								action: "reject",
								note: text(form, "note") || undefined,
							})
						: null;
		if (!result) throw new WorkflowError("invalid", "Choose save, edit or reject.");
		refresh();
		if (intent === "edit")
			return { ok: true, message: "Your edit is saved. The draft is still waiting for a decision." };
		if (intent === "reject") return { ok: true, message: "Rejected. The task was cancelled." };
		return result.verification?.ok
			? {
					ok: true,
					message:
						"Saved to the case. The draft and its sources were read back and every check passed. Nothing was sent to the customer.",
				}
			: {
					ok: false,
					message: "The draft was saved but could not be confirmed, so the task is marked outcome unknown.",
					problems: result.verification?.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`),
				};
	} catch (error) {
		return describeFailure(error, { body });
	}
}

export async function caseStatusAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	try {
		const status = text(form, "status");
		if (!["open", "draft_ready", "resolved", "closed"].some((allowed) => allowed === status))
			throw new WorkflowError("invalid", "That isn't a case status.");
		await setCaseStatus(workspace.runtime.sql, workspace.actor, text(form, "caseId"), status as CaseStatus);
		refresh();
		return { ok: true, message: `Case marked ${status.replace("_", " ")}.` };
	} catch (error) {
		return describeFailure(error);
	}
}

// ---- Knowledge --------------------------------------------------------------------------------------

export async function createDocumentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const values = Object.fromEntries(
		["collection", "title", "owner", "source", "content", "reviewDue", "expiresAt"].map((key) => [
			key,
			text(form, key),
		]),
	);
	let destination: string;
	try {
		const created = await createDocument(workspace.runtime.sql, workspace.actor, {
			collection: values.collection,
			title: values.title,
			owner: values.owner,
			source: values.source,
			content: values.content,
			reviewDue: values.reviewDue || null,
			expiresAt: values.expiresAt || null,
		});
		destination = path(`/knowledge/${created.document.id}`);
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	redirect(destination);
}

export async function documentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const documentId = text(form, "documentId");
	const intent = text(form, "intent");
	const version = Number(text(form, "version"));
	const note = text(form, "note") || undefined;
	try {
		if (intent === "add_version") {
			const added = await addVersion(sql, workspace.actor, documentId, {
				content: text(form, "content"),
				title: text(form, "title") || undefined,
			});
			refresh();
			return {
				ok: true,
				message: `Version ${added.version} was added as a draft. Only the owner can approve it.`,
			};
		}
		if (intent === "approve") {
			await approveVersion(sql, workspace.actor, documentId, version, {
				note,
				...(text(form, "reviewDue") ? { reviewDue: text(form, "reviewDue") } : {}),
			});
			refresh();
			return { ok: true, message: `Version ${version} is approved and is now the one used as a source.` };
		}
		if (intent === "reject") {
			await rejectVersion(sql, workspace.actor, documentId, version, note);
			refresh();
			return { ok: true, message: `Version ${version} was rejected.` };
		}
		if (intent === "retire") {
			await retireDocument(sql, workspace.actor, documentId, note);
			refresh();
			return { ok: true, message: "The document is retired and no longer used as a source." };
		}
		throw new WorkflowError("invalid", "That isn't something a document can do.");
	} catch (error) {
		return describeFailure(error, { content: text(form, "content") });
	}
}

// ---- Findings, health, inspections ------------------------------------------------------------------

export async function findingAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	try {
		const decision = text(form, "decision");
		if (decision !== "acknowledged" && decision !== "dismissed" && decision !== "resolved")
			throw new WorkflowError("invalid", "Choose acknowledge, dismiss or resolve.");
		const updated = await decideFinding(
			workspace.runtime.sql,
			workspace.actor,
			text(form, "findingId"),
			decision,
			text(form, "note") || undefined,
		);
		if (!updated) throw new WorkflowError("conflict", "That finding was already dealt with.");
		refresh();
		return { ok: true, message: `Finding ${decision}.` };
	} catch (error) {
		return describeFailure(error);
	}
}

export async function scheduledNowAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	try {
		throttle(workspace);
		const kind = text(form, "kind");
		if (kind !== "watch.health_check" && kind !== "review.document_scan")
			throw new WorkflowError("invalid", "That isn't something that can be run now.");
		// One per minute at most: pressing the button twice in the same minute finds the same task.
		const slot = `manual-${workspace.runtime.now().toISOString().slice(0, 16)}`;
		const { task } = await requestScheduledTask(workspace.runtime, kind, slot, workspace.actor);
		await start(workspace, task, true);
		const finished = await getTask(workspace.runtime.sql, task.id);
		refresh();
		return {
			ok: finished?.state === "completed",
			message:
				finished?.state === "completed"
					? kind === "watch.health_check"
						? "Every integration was checked just now."
						: "The document library was scanned just now."
					: finished?.state === "failed"
						? (finished.error ?? "It failed.")
						: "It has been queued.",
		};
	} catch (error) {
		return describeFailure(error);
	}
}

export async function inspectionAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const urls = text(form, "urls");
	let destination: string;
	try {
		throttle(workspace);
		const asked = await requestSiteInspection(workspace.runtime, workspace.actor, {
			urls: urls.split(/\s+/).filter(Boolean),
		});
		await start(workspace, asked.task, false);
		destination = path(`/tasks/${asked.task.id}`);
	} catch (error) {
		return describeFailure(error, { urls });
	}
	refresh();
	redirect(destination);
}

// ---- Owner only -------------------------------------------------------------------------------------

export async function roleSettingsAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	try {
		const limits: Record<string, number> = {};
		for (const [key, value] of form.entries())
			if (key.startsWith("limit.") && typeof value === "string" && value.trim() !== "")
				limits[key.slice(6)] = Number(value);
		const parsed = Object.keys(limits).length ? parseLimitOverrides(limits) : null;
		if (parsed && !parsed.ok) throw new WorkflowError("invalid", parsed.message);
		// The owner check is inside updateRoleSettings, which also logs a refused attempt.
		const saved = await updateRoleSettings(workspace.runtime.sql, workspace.actor, text(form, "roleId"), {
			...(form.has("enabled") ? { enabled: text(form, "enabled") === "1" } : {}),
			...(parsed?.ok ? { limits: parsed.value } : {}),
		});
		refresh();
		return {
			ok: true,
			message: saved.enabled
				? "Saved. The agent is switched on."
				: "Saved. The agent is switched off: nothing new will start for it.",
		};
	} catch (error) {
		return describeFailure(error);
	}
}

export async function backupAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const intent = text(form, "intent");
	try {
		const { sql, storage } = workspace.runtime;
		if (!workspace.isOwner) {
			await audit(sql, {
				actor: workspace.actor,
				action: `backup.${intent}`,
				outcome: "denied",
				detail: { reason: "owner only" },
			});
			throw new WorkflowError("forbidden", "Only the owner can take a backup or run the restore check.");
		}
		if (!storage)
			throw new WorkflowError(
				"not_configured",
				"File storage isn't configured, so there is nowhere to keep a backup.",
			);
		if (intent === "backup") {
			const { manifest } = await runBackup({
				sql,
				storage,
				actor: workspace.actor,
				now: workspace.runtime.now(),
			});
			refresh();
			return {
				ok: true,
				message: `Backup ${manifest.id} taken: ${manifest.totals.rows} records and ${manifest.totals.files} files.`,
			};
		}
		if (intent === "restore_check") {
			if ((await listBackups(storage)).length === 0)
				throw new WorkflowError("conflict", "There is no backup to check yet. Take one first.");
			const result = await runRestoreDrill({
				backup: storage,
				sql,
				actor: workspace.actor,
				now: workspace.runtime.now(),
			});
			refresh();
			const failed = result.checks.filter((c) => !c.ok);
			return result.ok
				? {
						ok: true,
						message: `Backup ${result.backupId} was restored into an isolated database and every one of ${result.checks.length} checks passed. Nothing live was touched.`,
					}
				: {
						ok: false,
						message: `Backup ${result.backupId} did not restore correctly.`,
						problems: failed.map((c) => `${c.name}: ${c.detail}`),
					};
		}
		throw new WorkflowError("invalid", "Choose backup or restore check.");
	} catch (error) {
		return describeFailure(error);
	}
}

// ---- Skills ---------------------------------------------------------------------------------------------

/**
 * Everything a person does to a skill. Anyone in the workspace can run an evaluation or write an improvement proposal;
 * approving, revoking, rolling back and deciding a proposal are the owner's, checked in the library and logged either way.
 * An evaluation runs in a scratch database and touches no live record.
 */
export async function skillAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	try {
		throttle(workspace);
		const skill = SKILL_BY_ID.get(text(form, "skillId"));
		const needSkill = () => {
			if (!skill) throw new WorkflowError("not_found", "That skill doesn't exist.");
			return skill;
		};
		const ownerOnly = async (action: string) => {
			if (workspace.isOwner) return;
			await audit(sql, {
				actor: workspace.actor,
				action,
				outcome: "denied",
				detail: { reason: "owner only" },
			});
			throw new WorkflowError("forbidden", "Only the owner can approve, revoke or roll back a skill.");
		};
		switch (intent) {
			case "evaluate_all": {
				const results = await evaluateSkills(sql, SKILLS, { ranBy: workspace.viewer });
				const passed = results.filter((result) => result.passed).length;
				await audit(sql, {
					actor: workspace.actor,
					action: "skill.evaluate",
					subject: "all",
					outcome: "allowed",
					detail: { evaluated: results.length, passed },
				});
				refresh();
				return {
					ok: passed === results.length,
					message: `Evaluated ${results.length} skills in an isolated database: ${passed} passed${
						passed === results.length ? "" : `, ${results.length - passed} did not`
					}. Nothing is in use until the owner approves it.`,
				};
			}
			case "evaluate": {
				const [result] = await evaluateSkills(sql, [needSkill()], { ranBy: workspace.viewer });
				await audit(sql, {
					actor: workspace.actor,
					action: "skill.evaluate",
					subject: result.skillId,
					outcome: "allowed",
					detail: { version: result.version, ok: result.passed, ...result.totals },
				});
				refresh();
				return {
					ok: result.passed,
					message: `${result.totals.passed} of ${result.totals.total} cases passed, ${result.totals.failed} failed and ${result.totals.notRun} could not be run here. ${
						result.passed
							? "This version can be approved by the owner."
							: "This version can't be approved until every case that ran passes."
					}`,
				};
			}
			case "approve": {
				const candidate = needSkill();
				const [latest] = await listEvaluations(sql, candidate.id, 1);
				if (!latest) throw new WorkflowError("conflict", "Evaluate this version before approving it.");
				const release = await approveRelease(sql, workspace.actor, {
					skill: candidate,
					evaluationId: latest.id,
				});
				refresh();
				return { ok: true, message: `Version ${release.version} is approved and in use from now on.` };
			}
			case "approve_passed": {
				await ownerOnly("skill.approve");
				const rows = (await loadSkillRows(sql)).filter((row) => row.approvable && row.evaluation);
				for (const row of rows)
					await approveRelease(sql, workspace.actor, {
						skill: row.skill,
						evaluationId: (row.evaluation as { id: string }).id,
					});
				refresh();
				return {
					ok: true,
					message: rows.length
						? `Approved ${rows.length} skill${rows.length === 1 ? "" : "s"} that passed evaluation. They are in use from now on.`
						: "There is nothing waiting for approval. Evaluate the skills first.",
				};
			}
			case "revoke": {
				const release = await revokeRelease(sql, workspace.actor, {
					releaseId: text(form, "releaseId"),
					reason: text(form, "note"),
				});
				refresh();
				return {
					ok: true,
					message: `Version ${release.version} is revoked. No version of this skill guides work until you roll back or approve another.`,
				};
			}
			case "rollback": {
				const release = await rollbackSkill(sql, workspace.actor, { skillId: needSkill().id });
				refresh();
				return { ok: true, message: `Version ${release.version} is back in use.` };
			}
			case "propose": {
				const sourceId = text(form, "sourceId").trim();
				await createProposal(sql, workspace.actor, {
					skill: needSkill(),
					summary: text(form, "summary"),
					proposedChange: text(form, "proposedChange"),
					sourceType: sourceId ? "task" : "none",
					sourceId: sourceId || null,
				});
				refresh();
				return {
					ok: true,
					message: "Proposal recorded. It changes nothing by itself: the procedure in use stays as approved.",
				};
			}
			case "decide": {
				const decision = text(form, "decision") === "accepted" ? "accepted" : "declined";
				await decideProposal(sql, workspace.actor, {
					proposalId: text(form, "proposalId"),
					decision,
					note: text(form, "note"),
				});
				refresh();
				return {
					ok: true,
					message:
						decision === "accepted"
							? "Marked as wanted. The procedure still has to be changed in the repository, evaluated and approved."
							: "Declined.",
				};
			}
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done to a skill.");
		}
	} catch (error) {
		return describeFailure(error);
	}
}

// ---- Daily reports ---------------------------------------------------------------------------------------

/**
 * "Generate report now". Anyone in the workspace may: a report reads only shared business records, saves a further attempt
 * for today, and sends nothing anywhere. A run already in progress for today is left to finish.
 */
export async function reportAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	try {
		throttle(workspace);
		const kind = text(form, "kind") === "evening" ? "evening" : "morning";
		const outcome = await generateDailyReport(workspace.runtime, {
			kind,
			actor: workspace.actor,
			again: true,
		});
		refresh();
		if (outcome.status === "failed")
			return {
				ok: false,
				message: `The report couldn't be generated: ${outcome.error} The attempt is kept in the list below.`,
			};
		if (outcome.status === "skipped") return { ok: false, message: outcome.reason };
		const actions = outcome.report.report?.actions.length ?? 0;
		return {
			ok: true,
			message: `${kind === "morning" ? "Morning report" : "Evening recap"} saved and read back. ${
				actions === 0
					? "Nothing needs anyone to act."
					: `${actions} item${actions === 1 ? " needs" : "s need"} someone to act.`
			}`,
		};
	} catch (error) {
		return describeFailure(error);
	}
}

// ---- E-Liquid Lab inventory ------------------------------------------------------------------------------

/**
 * Everything a person does to the ingredient inventory: record an ingredient, record a lot, post a movement to the ledger.
 * Every rule (who may, how much, what is usable) is checked in the library inside one transaction. A form that is sent twice
 * moves stock once, because each form carries its own key.
 */
export async function inventoryAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	// Where to go once the work is done. A redirect is raised outside the try block, as in the other actions here.
	let destination: string | null = null;
	try {
		throttle(workspace);
		if (intent === "ingredient") {
			const made = await createIngredient(sql, workspace.actor, {
				name: text(form, "name"),
				category: text(form, "category"),
				supplier: text(form, "supplier"),
				sku: text(form, "sku"),
				nicotineMgPerMl: text(form, "nicotineMgPerMl"),
				nicotineType: text(form, "nicotineType"),
				pgPercent: text(form, "pgPercent"),
				vgPercent: text(form, "vgPercent"),
				carrierSource: text(form, "carrierSource"),
				minStock: text(form, "minStock"),
				minStockUnit: text(form, "minStockUnit"),
				notes: text(form, "notes"),
			});
			destination = path(`/lab/ingredients/${made.id}`);
		} else if (intent === "lot") {
			const lot = await createLot(sql, workspace.actor, {
				ingredientId: text(form, "ingredientId"),
				lotCode: text(form, "lotCode"),
				unit: text(form, "unit"),
				receivedOn: text(form, "receivedOn"),
				expiresOn: text(form, "expiresOn"),
				reviewOn: text(form, "reviewOn"),
				location: text(form, "location"),
				densityGPerMl: text(form, "densityGPerMl"),
				densityTempC: text(form, "densityTempC"),
				densitySource: text(form, "densitySource"),
				costPerUnit: text(form, "costPerUnit"),
				currency: text(form, "currency"),
			});
			refresh();
			return {
				ok: true,
				message: `Lot ${lot.lotCode} recorded with nothing in it yet. Record a receipt to put stock in it.`,
			};
		} else if (intent === "move") {
			const outcome = await postMovement(
				sql,
				workspace.actor,
				{
					lotId: text(form, "lotId"),
					kind: text(form, "kind"),
					quantity: text(form, "quantity"),
					reason: text(form, "reason"),
					reference: text(form, "reference"),
					toLocation: text(form, "toLocation"),
					basis: text(form, "basis"),
					otherQuantity: text(form, "otherQuantity"),
					idempotencyKey: text(form, "idempotencyKey"),
				},
				opsDayKey(workspace.runtime.now()),
			);
			refresh();
			const { lot, movement } = outcome;
			return {
				ok: true,
				message: `${outcome.duplicate ? "Already recorded" : MOVEMENT_LABELS[movement.kind]}${
					movement.quantity === "0" ? "" : `: ${movement.quantity} ${movement.unit}`
				}. Lot ${lot.lotCode} now has ${lot.onHand} ${lot.unit} on hand, ${lot.reserved} reserved.`,
			};
		} else throw new WorkflowError("invalid", "That isn't something that can be done to the inventory.");
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	redirect(destination);
}
