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
import {
	CHECK_RUNNERS,
	cancelCodingJob,
	registerRepository,
	requestCodingJob,
	reviewPackage,
} from "../engineering/coding";
import { decideFinding } from "../findings";
import { requestFunction, reviewProduct, type IncomingFile } from "../functions/pipeline";
import { getProductByTask } from "../functions/products";
import { lookupFunction } from "../functions/registry";
import { dispatchTask } from "../jobs/dispatch";
import {
	addRecipeVersion,
	approveRecipeVersion,
	cancelBatch,
	completeBatch,
	createRecipe,
	planBatch,
	reserveBatch,
} from "../lab/batches";
import {
	addEquipment,
	recordCalibration,
	recordCleaning,
	recordEquipmentUse,
	setEquipmentStatus,
	verifyCleaning,
} from "../lab/equipment";
import {
	RELEASE_CONFIRMATIONS,
	decideRelease,
	liftHold,
	placeHold,
	recordBulkMovement,
	recordPackagingRun,
} from "../lab/finished";
import { MOVEMENT_LABELS, createIngredient, createLot, postMovement } from "../lab/inventory";
import {
	addCorrectiveAction,
	addDeviationEntry,
	addSpecification,
	approveSpecification,
	closeDeviation,
	enterResult,
	openDeviation,
	parseCriteria,
	recordSampleEvent,
	ruleOnResult,
	takeSample,
	updateCorrectiveAction,
	verifyResult,
} from "../lab/quality";
import {
	CONTROLLED_STEPS,
	recordTraining,
	removeRequirement,
	setRequirement,
	verifyTraining,
} from "../lab/training";
import { generateDailyReport } from "../reports/daily";
import {
	EXCEPTION_LABELS,
	SUBJECT_KINDS,
	assignTag,
	endAssignment,
	recordScan,
	registerTags,
	resolveException,
	setTagStatus,
	verifyTag,
} from "../rfid/registry";
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
import { addAction, closeAction, snoozeAction, trackReportAction, updateAction } from "../today/checklist";
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

// ---- Recipes and batches ---------------------------------------------------------------------------------

/** How many flavour rows the recipe form offers. A formula with more is written in two versions' worth of work, not one. */
const FLAVOUR_ROWS = 6;

/**
 * Everything a person does to a recipe or a batch. Approving a recipe version is the owner's. Reserving and completing a
 * batch move stock through the ledger, each in one transaction: a shortage reserves nothing, and recording more than was
 * reserved changes nothing.
 */
export async function batchAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const today = opsDayKey(workspace.runtime.now());
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	let destination: string | null = null;
	try {
		throttle(workspace);
		switch (intent) {
			case "recipe": {
				const recipe = await createRecipe(sql, workspace.actor, {
					name: text(form, "name"),
					product: text(form, "product"),
				});
				destination = path(`/lab/recipes/${recipe.id}`);
				break;
			}
			case "version": {
				const flavours = Array.from({ length: FLAVOUR_ROWS }, (_, index) => ({
					ingredientId: text(form, `flavour${index + 1}`),
					percent: text(form, `percent${index + 1}`),
				})).filter((row) => row.ingredientId || row.percent.trim());
				const version = await addRecipeVersion(sql, workspace.actor, {
					recipeId: text(form, "recipeId"),
					batchMl: text(form, "batchMl"),
					targetNicotineMgPerMl: text(form, "targetNicotineMgPerMl"),
					targetPgPercent: text(form, "targetPgPercent"),
					baseIngredientId: text(form, "baseIngredientId") || undefined,
					pgIngredientId: text(form, "pgIngredientId"),
					vgIngredientId: text(form, "vgIngredientId"),
					flavours,
				});
				refresh();
				return {
					ok: true,
					message: `Version ${version.version} written as a draft. It can be made into a batch once the owner approves it.`,
				};
			}
			case "approve": {
				const version = await approveRecipeVersion(sql, workspace.actor, text(form, "versionId"));
				refresh();
				return { ok: true, message: `Version ${version.version} is approved and can be made into a batch.` };
			}
			case "plan": {
				const batch = await planBatch(
					sql,
					workspace.actor,
					{ recipeVersionId: text(form, "recipeVersionId"), batchMl: text(form, "batchMl") },
					today,
				);
				destination = path(`/lab/batches/${batch.id}`);
				break;
			}
			case "reserve": {
				const batch = await reserveBatch(sql, workspace.actor, text(form, "batchId"), today);
				refresh();
				return { ok: true, message: `Everything batch ${batch.code} needs is reserved.` };
			}
			case "complete": {
				const used = Object.fromEntries(
					[...form.entries()].flatMap(([name, value]) =>
						name.startsWith("used.") && typeof value === "string" ? [[name.slice(5), value]] : [],
					),
				);
				const batch = await completeBatch(
					sql,
					workspace.actor,
					text(form, "batchId"),
					{
						actualYieldMl: text(form, "actualYieldMl"),
						wasteMl: text(form, "wasteMl"),
						samplesMl: text(form, "samplesMl"),
						notes: text(form, "notes"),
						used,
					},
					today,
				);
				refresh();
				return {
					ok: true,
					message: `Batch ${batch.code} is recorded as made, with a measured yield of ${batch.actualYieldMl} mL. It is awaiting a quality review; nothing here releases it.`,
				};
			}
			case "cancel": {
				const batch = await cancelBatch(
					sql,
					workspace.actor,
					text(form, "batchId"),
					text(form, "note"),
					today,
				);
				refresh();
				return {
					ok: true,
					message: `Batch ${batch.code} is cancelled. Anything it had reserved is free again.`,
				};
			}
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done to a recipe or a batch.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	redirect(destination);
}

// ---- The Today checklist --------------------------------------------------------------------------------

/**
 * Everything a person does to the checklist. Anyone in the workspace can add, change, put off and close an item. Closing an
 * item closes the item only: it never completes a task or accepts a result.
 */
export async function checklistAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const id = text(form, "id");
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	try {
		throttle(workspace);
		switch (intent) {
			case "add": {
				const item = await addAction(sql, workspace.actor, {
					title: text(form, "title"),
					detail: text(form, "detail"),
					priority: text(form, "priority"),
					dueOn: text(form, "dueOn"),
					assignedTo: text(form, "assignedTo"),
				});
				refresh();
				return { ok: true, message: `Added to the checklist: ${item.title}` };
			}
			case "track": {
				const { created } = await trackReportAction(sql, workspace.actor, {
					reportId: text(form, "reportId"),
					index: Number(text(form, "index")),
				});
				refresh();
				return {
					ok: true,
					message: created ? "On the checklist." : "Already on the checklist. It wasn’t added a second time.",
				};
			}
			case "update": {
				await updateAction(sql, workspace.actor, id, {
					assignedTo: text(form, "assignedTo") || "anyone",
					priority: text(form, "priority") || undefined,
					dueOn: text(form, "dueOn"),
				});
				refresh();
				return { ok: true, message: "Saved." };
			}
			case "snooze": {
				const item = await snoozeAction(
					sql,
					workspace.actor,
					id,
					{ until: text(form, "until"), reason: text(form, "reason") },
					opsDayKey(workspace.runtime.now()),
				);
				refresh();
				return { ok: true, message: `Put off until ${item.snoozedUntil}. It comes back on that day.` };
			}
			case "done":
			case "dismiss": {
				await closeAction(sql, workspace.actor, id, {
					outcome: intent === "done" ? "done" : "dismissed",
					note: text(form, "note"),
				});
				refresh();
				return {
					ok: true,
					message:
						intent === "done"
							? "Closed. This closes the checklist item only; anything it was about is unchanged."
							: "Dismissed.",
				};
			}
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done to the checklist.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
}

// ---- Finished liquid: packaging, holds and release -------------------------------------------------------

/**
 * Packaging runs, samples and waste from a batch's bulk, quality holds, and the release decision. Releasing or rejecting a
 * batch, lifting a hold and correcting the bulk are the owner's, checked in the library and logged either way. A release is
 * rechecked there, at the moment it is made, whatever this form sent.
 */
export async function finishedAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const batchId = text(form, "batchId");
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	try {
		throttle(workspace);
		switch (intent) {
			case "package": {
				const components = [1, 2, 3].map((n) => ({
					lotId: text(form, `componentLot${n}`),
					quantity: text(form, `componentQuantity${n}`),
				}));
				const run = await recordPackagingRun(
					sql,
					workspace.actor,
					{
						batchId,
						sku: text(form, "sku"),
						bottleMl: text(form, "bottleMl"),
						unitsFilled: text(form, "unitsFilled"),
						unitsRejected: text(form, "unitsRejected"),
						bulkUsedMl: text(form, "bulkUsedMl"),
						labelVersion: text(form, "labelVersion"),
						lineClearance: text(form, "lineClearance"),
						components,
						notes: text(form, "notes"),
						idempotencyKey: text(form, "idempotencyKey"),
					},
					opsDayKey(workspace.runtime.now()),
				);
				refresh();
				return {
					ok: true,
					message: `Run ${run.code} recorded: ${run.unitsFilled} units filled from ${run.bulkUsedMl} mL of bulk.`,
				};
			}
			case "bulk": {
				const batch = await recordBulkMovement(sql, workspace.actor, {
					batchId,
					kind: text(form, "kind"),
					quantityMl: text(form, "quantityMl"),
					reason: text(form, "reason"),
					idempotencyKey: text(form, "idempotencyKey"),
				});
				refresh();
				return { ok: true, message: `Recorded. ${batch.bulkRemainingMl} mL is left in bulk.` };
			}
			case "hold": {
				await placeHold(sql, workspace.actor, batchId, text(form, "note"));
				refresh();
				return {
					ok: true,
					message: "The batch is on hold. It can't be packaged or released until the owner lifts it.",
				};
			}
			case "lift": {
				await liftHold(sql, workspace.actor, text(form, "holdId"), text(form, "note"));
				refresh();
				return { ok: true, message: "The hold is lifted." };
			}
			case "decide": {
				const decision = text(form, "decision") === "released" ? "released" : "rejected";
				const batch = await decideRelease(sql, workspace.actor, {
					batchId,
					decision,
					note: text(form, "note"),
					confirmations: RELEASE_CONFIRMATIONS.filter(
						(item) => text(form, `confirm.${item.id}`) === "yes",
					).map((item) => item.id),
				});
				refresh();
				return {
					ok: true,
					message:
						decision === "released"
							? `Batch ${batch.code} is released. Nothing was published and no stock changed in the store.`
							: `Batch ${batch.code} is rejected. It can't be packaged.`,
				};
			}
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done here.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
}

// ---- Quality records: specifications, samples, results and deviations -----------------------------------

/**
 * Specifications, samples and their custody, laboratory results, and deviations with their corrective actions. Approving a
 * specification, verifying or ruling on a result, verifying or cancelling an action and closing a deviation are the
 * owner's, checked in the library and logged either way. Nothing here sends anything to a laboratory or anyone else.
 */
export async function qualityAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const today = opsDayKey(workspace.runtime.now());
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	let destination: string | null = null;
	let message = "Recorded.";
	try {
		throttle(workspace);
		switch (intent) {
			case "spec.add": {
				const specification = await addSpecification(sql, workspace.actor, {
					recipeId: text(form, "recipeId"),
					criteria: parseCriteria(text(form, "criteria")),
					note: text(form, "note"),
				});
				message = `Version ${specification.version} of the specification for ${specification.recipeName} is saved as a draft. It guides nothing until the owner approves it.`;
				break;
			}
			case "spec.approve": {
				const specification = await approveSpecification(sql, workspace.actor, text(form, "specificationId"));
				message = `Version ${specification.version} is now the specification in force for ${specification.recipeName}.`;
				break;
			}
			case "sample.take": {
				const sample = await takeSample(sql, workspace.actor, {
					batchId: text(form, "batchId"),
					purpose: text(form, "purpose"),
					quantityMl: text(form, "quantityMl"),
					testsRequested: text(form, "testsRequested"),
					idempotencyKey: text(form, "idempotencyKey"),
				});
				message = `Sample ${sample.code} recorded, and ${sample.quantityMl} mL taken from the bulk.`;
				break;
			}
			case "sample.event":
				await recordSampleEvent(sql, workspace.actor, {
					sampleId: text(form, "sampleId"),
					event: text(form, "event"),
					detail: text(form, "detail"),
				});
				message = "Added to the sample's custody record.";
				break;
			case "result.enter": {
				const result = await enterResult(
					sql,
					workspace.actor,
					{
						batchId: text(form, "batchId"),
						sampleId: text(form, "sampleId"),
						analyte: text(form, "analyte"),
						method: text(form, "method"),
						reportedAs: text(form, "reportedAs"),
						uncertainty: text(form, "uncertainty"),
						unit: text(form, "unit"),
						lab: text(form, "lab"),
						reportRef: text(form, "reportRef"),
						reportedOn: text(form, "reportedOn"),
						replacesId: text(form, "replacesId"),
						correctionReason: text(form, "correctionReason"),
					},
					today,
				);
				message = `${result.analyte} ${result.reportedAs} ${result.unit} is on file. It counts once the owner has verified it against the report.`;
				break;
			}
			case "result.verify": {
				const done = await verifyResult(sql, workspace.actor, text(form, "resultId"));
				message = done.hold
					? `Verified. It is outside its limit, so batch ${done.result.batchCode} has been put on hold.`
					: done.verdict
						? `Verified. ${done.verdict.detail}`
						: "Verified. No approved specification has a criterion to compare it with.";
				break;
			}
			case "result.rule": {
				const result = await ruleOnResult(sql, workspace.actor, {
					resultId: text(form, "resultId"),
					ruling: text(form, "ruling"),
					reason: text(form, "note"),
				});
				message =
					result.ruling === "accepted"
						? "Accepted, with your reason kept beside it."
						: "Set aside. It stays on file and is no longer compared with the specification.";
				break;
			}
			case "deviation.open": {
				const deviation = await openDeviation(
					sql,
					workspace.actor,
					{
						batchId: text(form, "batchId"),
						title: text(form, "title"),
						description: text(form, "description"),
						severity: text(form, "severity"),
						hold: text(form, "hold") === "yes",
					},
					today,
				);
				destination = path(`/quality/deviations/${deviation.id}`);
				break;
			}
			case "deviation.entry":
				await addDeviationEntry(sql, workspace.actor, {
					deviationId: text(form, "deviationId"),
					kind: text(form, "kind"),
					body: text(form, "body"),
				});
				message = "Added to the investigation.";
				break;
			case "deviation.action.add":
				await addCorrectiveAction(
					sql,
					workspace.actor,
					{
						deviationId: text(form, "deviationId"),
						action: text(form, "action"),
						responsible: text(form, "responsible"),
						dueOn: text(form, "dueOn"),
					},
					today,
				);
				message = "The action is added. It stays open until it is done and the owner has verified it worked.";
				break;
			case "deviation.action.step": {
				const action = await updateCorrectiveAction(sql, workspace.actor, {
					actionId: text(form, "actionId"),
					step: text(form, "step"),
					note: text(form, "note"),
				});
				message =
					action.status === "done"
						? "Marked done. The owner still has to verify that it worked."
						: action.status === "verified"
							? "Verified to have worked."
							: "Cancelled, with the reason kept.";
				break;
			}
			case "deviation.close": {
				const deviation = await closeDeviation(sql, workspace.actor, {
					deviationId: text(form, "deviationId"),
					disposition: text(form, "note"),
				});
				message = `Deviation ${deviation.code} is closed.`;
				break;
			}
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done here.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	if (destination) redirect(destination);
	return { ok: true, message };
}

// ---- Manufacturing records: equipment, calibration, cleaning and training -------------------------------

/**
 * Equipment and its calibrations, which batch it was used on, cleaning and line-clearance records, and training.
 * Returning equipment to service, verifying training and setting what training a step requires are the owner's; a
 * cleaning is verified by someone other than whoever recorded it. Each is checked in the library and logged either way.
 * Nothing here controls a machine or reads an instrument.
 */
export async function manufacturingAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const today = opsDayKey(workspace.runtime.now());
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	let destination: string | null = null;
	let message = "Recorded.";
	try {
		throttle(workspace);
		switch (intent) {
			case "equipment.add": {
				const equipment = await addEquipment(sql, workspace.actor, {
					code: text(form, "code"),
					name: text(form, "name"),
					kind: text(form, "kind"),
					location: text(form, "location"),
					calibrationIntervalDays: text(form, "calibrationIntervalDays"),
				});
				destination = path(`/manufacturing/equipment/${equipment.id}`);
				break;
			}
			case "equipment.status": {
				const equipment = await setEquipmentStatus(sql, workspace.actor, {
					equipmentId: text(form, "equipmentId"),
					status: text(form, "status"),
					reason: text(form, "note"),
				});
				message =
					equipment.status === "in_service"
						? `${equipment.code} is back in service.`
						: `${equipment.code} is out of service. It can't be recorded against a batch until the owner returns it.`;
				break;
			}
			case "equipment.calibrate": {
				const done = await recordCalibration(
					sql,
					workspace.actor,
					{
						equipmentId: text(form, "equipmentId"),
						performedOn: text(form, "performedOn"),
						result: text(form, "result"),
						certificate: text(form, "certificate"),
						performedBy: text(form, "performedBy"),
						dueOn: text(form, "dueOn"),
						notes: text(form, "notes"),
					},
					today,
				);
				message =
					done.calibration.result === "pass"
						? `Recorded.${done.calibration.dueOn ? ` The next calibration is due on ${done.calibration.dueOn}.` : ""}${
								done.equipment.status === "out_of_service"
									? " It is still out of service: returning it is the owner's decision."
									: ""
							}`
						: `Recorded. ${done.equipment.code} is out of service.${
								done.held.length
									? ` Put on hold because they were measured with it: ${done.held.join(", ")}.`
									: " No batch was recorded against it since its last passing calibration."
							}`;
				break;
			}
			case "equipment.use": {
				const use = await recordEquipmentUse(
					sql,
					workspace.actor,
					{
						batchId: text(form, "batchId"),
						equipmentId: text(form, "equipmentId"),
						purpose: text(form, "purpose"),
					},
					today,
				);
				message = `${use.equipmentCode} recorded against batch ${use.batchCode}.`;
				break;
			}
			case "cleaning.record":
				await recordCleaning(sql, workspace.actor, {
					equipmentId: text(form, "equipmentId"),
					area: text(form, "area"),
					kind: text(form, "kind"),
					procedure: text(form, "procedure"),
					detail: text(form, "detail"),
				});
				message = "Recorded. Someone else can verify it.";
				break;
			case "cleaning.verify":
				await verifyCleaning(sql, workspace.actor, text(form, "recordId"));
				message = "Verified.";
				break;
			case "training.record": {
				const record = await recordTraining(
					sql,
					workspace.actor,
					{
						forSelf: text(form, "who") !== "other",
						person: text(form, "person"),
						topic: text(form, "topic"),
						completedOn: text(form, "completedOn"),
						validUntil: text(form, "validUntil"),
						evidence: text(form, "evidence"),
					},
					today,
				);
				message = `Recorded for ${record.person}. It counts once the owner has verified it.`;
				break;
			}
			case "training.verify":
				await verifyTraining(sql, workspace.actor, text(form, "recordId"));
				message = "Verified.";
				break;
			case "training.require": {
				const step = text(form, "step");
				await setRequirement(sql, workspace.actor, { step, topic: text(form, "topic") });
				message = `Required. ${CONTROLLED_STEPS[step as keyof typeof CONTROLLED_STEPS] ?? "That step"} is now refused to anyone without it, you included.`;
				break;
			}
			case "training.unrequire":
				await removeRequirement(sql, workspace.actor, text(form, "requirementId"));
				message = "No longer required.";
				break;
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done here.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	if (destination) redirect(destination);
	return { ok: true, message };
}

// ---- RFID and NFC: the tag registry, scans and exceptions -----------------------------------------------

/**
 * Registering tags, saying what each is attached to, retiring or revoking one, recording a scan, and resolving an
 * exception. Putting a retired or revoked tag back in use is the owner's. A scan recorded here is an observation only: it
 * moves no stock and nothing is sent to a reader or to the store.
 */
export async function rfidAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	let message = "Recorded.";
	try {
		throttle(workspace);
		switch (intent) {
			case "tag.register": {
				const tags = await registerTags(sql, workspace.actor, {
					technology: text(form, "technology"),
					security: text(form, "security"),
					uids: text(form, "uids"),
					sourceRef: text(form, "sourceRef"),
					note: text(form, "note"),
				});
				message = `${tags.length} tag${tags.length === 1 ? "" : "s"} registered. ${tags.length === 1 ? "It is" : "They are"} attached to nothing yet.`;
				break;
			}
			case "tag.verify":
				await verifyTag(sql, workspace.actor, text(form, "tagId"));
				message = "Confirmed: the identifier on record is the one the tag reports.";
				break;
			case "tag.assign": {
				const assignment = await assignTag(sql, workspace.actor, {
					tagId: text(form, "tagId"),
					subjectKind: text(form, "subjectKind"),
					subjectRef: text(form, "subjectRef"),
					sku: text(form, "sku"),
					lot: text(form, "lot"),
					serial: text(form, "serial"),
					parentUid: text(form, "parentUid"),
					equipmentId: text(form, "equipmentId"),
					packagingRunId: text(form, "packagingRunId"),
					unitsDeclared: text(form, "unitsDeclared"),
					unitsSource: text(form, "unitsSource"),
				});
				message = `Attached to ${SUBJECT_KINDS[assignment.subjectKind].toLowerCase()} "${assignment.subjectRef}".`;
				break;
			}
			case "tag.unassign":
				await endAssignment(sql, workspace.actor, { tagId: text(form, "tagId"), reason: text(form, "note") });
				message = "Taken off. What it was attached to is kept in its history.";
				break;
			case "tag.status": {
				const tag = await setTagStatus(sql, workspace.actor, {
					tagId: text(form, "tagId"),
					status: text(form, "status"),
					reason: text(form, "note"),
				});
				message =
					tag.status === "active"
						? "Back in use."
						: `The tag is ${tag.status}. A scan of it from now on raises an exception.`;
				break;
			}
			case "scan.record": {
				const outcome = await recordScan(
					sql,
					workspace.actor,
					{
						eventId: text(form, "eventId"),
						technology: text(form, "technology"),
						uid: text(form, "uid"),
						station: text(form, "station"),
						workflow: text(form, "workflow"),
						source: text(form, "source"),
						evidence: text(form, "evidence"),
					},
					workspace.runtime.now(),
				);
				message = !outcome.recorded
					? "That read was already recorded. Nothing was added."
					: outcome.exception
						? `Recorded as an observation. ${EXCEPTION_LABELS[outcome.exception.kind]}: an exception is open for a person to resolve.`
						: outcome.assignment
							? `Recorded as an observation. The tag is attached to ${SUBJECT_KINDS[outcome.assignment.subjectKind].toLowerCase()} "${outcome.assignment.subjectRef}". No stock was moved.`
							: "Recorded as an observation. The tag is registered and attached to nothing. No stock was moved.";
				break;
			}
			case "exception.resolve":
				await resolveException(sql, workspace.actor, {
					exceptionId: text(form, "exceptionId"),
					resolution: text(form, "note"),
				});
				message = "Resolved, with what it turned out to be kept beside it.";
				break;
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done here.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	return { ok: true, message };
}

// ---- Engineering: coding jobs for Build -----------------------------------------------------------------

/**
 * Registering a repository, asking for coding work, cancelling a job, and the owner's decision on a returned change. No
 * coding backend is connected, so a job asked for here is recorded and waits. Nothing here runs code, and approving a
 * change records a decision: it merges, pushes and deploys nothing.
 */
export async function codingAction(_previous: ActionState, form: FormData): Promise<ActionState> {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const intent = text(form, "intent");
	const values = Object.fromEntries(
		[...form.entries()].flatMap(([name, value]) =>
			typeof value === "string" && name !== "intent" ? [[name, value]] : [],
		),
	);
	let destination: string | null = null;
	let message = "Recorded.";
	try {
		throttle(workspace);
		switch (intent) {
			case "repo.register": {
				const repository = await registerRepository(sql, workspace.actor, {
					id: text(form, "id"),
					label: text(form, "label"),
					defaultBranch: text(form, "defaultBranch"),
					changeScope: text(form, "changeScope"),
					protectedPaths: text(form, "protectedPaths"),
				});
				message = `Registered as ${repository.id}. Coding work can be asked for on it, within the paths you listed.`;
				break;
			}
			case "job.request": {
				const job = await requestCodingJob(
					sql,
					workspace.actor,
					{
						jobType: text(form, "jobType"),
						repositoryId: text(form, "repositoryId"),
						baseCommit: text(form, "baseCommit"),
						goal: text(form, "goal"),
						expectedResult: text(form, "expectedResult"),
						checks: Object.keys(CHECK_RUNNERS).filter((id) => text(form, `check.${id}`) === "yes"),
						idempotencyKey: text(form, "idempotencyKey"),
					},
					workspace.runtime.now(),
				);
				destination = path(`/engineering/coding/${job.id}`);
				break;
			}
			case "job.cancel":
				await cancelCodingJob(sql, workspace.actor, {
					jobId: text(form, "jobId"),
					reason: text(form, "note"),
				});
				message = "Cancelled.";
				break;
			case "package.review": {
				const pkg = await reviewPackage(sql, workspace.actor, {
					packageId: text(form, "packageId"),
					candidateSha256: text(form, "candidateSha256"),
					decision: text(form, "decision"),
					note: text(form, "note"),
				});
				message =
					pkg.decision === "approved"
						? "Approved. That is a recorded decision on this exact candidate: nothing was merged, pushed or deployed."
						: "Rejected.";
				break;
			}
			default:
				throw new WorkflowError("invalid", "That isn't something that can be done here.");
		}
	} catch (error) {
		return describeFailure(error, values);
	}
	refresh();
	if (destination) redirect(destination);
	return { ok: true, message };
}
