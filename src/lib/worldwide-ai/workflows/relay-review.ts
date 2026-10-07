import { audit } from "../audit";
import { versionStillMatches } from "../atlas/service";
import { iso, type Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import { previewText } from "../redact";
import { getCase, type CaseRecord } from "../support/cases";
import { getDraft, getDraftSources, type DraftRecord, type DraftSourceRecord } from "../support/drafts";
import { InvalidTransitionError } from "../tasks/state-machine";
import {
	addTaskEvent,
	getTask,
	getTaskEvents,
	transitionTask,
	type TaskEvent,
	type TaskRecord,
} from "../tasks/repo";
import { actorKey, actorLabel, type OperatorActor } from "../types";
import { WorkflowError, type WorkflowDeps } from "./types";

/**
 * A person reviewing Relay's draft: edit it, reject it, or save it to the case. Saving is not the end. The task is only
 * marked completed after the application has read the draft back and confirmed it is in the database, belongs to the right
 * case, has the exact text that was approved, has all its source references (still matching the documents), and has the
 * approval recorded. If any check fails the task is marked "outcome unknown" instead, with the failed checks listed.
 */

export const MAX_DRAFT_CHARS = 4000;

export type ReviewAction =
	| { action: "edit"; body: string }
	| { action: "reject"; note?: string }
	| { action: "save"; body?: string; note?: string; acknowledgeSources?: boolean };

export type VerificationCheck = { name: string; ok: boolean; detail: string };
export type Verification = { ok: boolean; checks: VerificationCheck[]; verifiedAt: string };

export type ReviewResult = {
	draft: DraftRecord;
	task: TaskRecord;
	verification: Verification | null;
};

function cleanBody(value: unknown): string {
	const body = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
	if (!body) throw new WorkflowError("invalid", "The reply can't be empty.");
	if (body.length > MAX_DRAFT_CHARS)
		throw new WorkflowError(
			"invalid",
			`The reply is too long (at most ${MAX_DRAFT_CHARS.toLocaleString()} characters).`,
		);
	return body;
}

/** Everything the review screen shows for one draft. */
export type DraftReview = {
	draft: DraftRecord;
	sources: DraftSourceRecord[];
	supportCase: CaseRecord;
	task: TaskRecord;
	events: TaskEvent[];
	decisions: Array<{
		decision: string;
		reviewer: string;
		reviewerLabel: string | null;
		note: string | null;
		at: string;
	}>;
};

export async function loadDraftReview(sql: Sql, draftId: string): Promise<DraftReview | null> {
	const draft = await getDraft(sql, draftId);
	if (!draft) return null;
	const [sources, supportCase, task, events, decisions] = await Promise.all([
		getDraftSources(sql, draftId),
		getCase(sql, draft.caseId),
		getTask(sql, draft.taskId),
		getTaskEvents(sql, draft.taskId),
		sql.query(
			`select decision, reviewer, reviewer_label, note, at from wai_reviews where subject_type = 'draft' and subject_id = $1 order by at, id`,
			[draftId],
		),
	]);
	if (!supportCase || !task) return null;
	return {
		draft,
		sources,
		supportCase,
		task,
		events,
		decisions: decisions.rows.map((r) => ({
			decision: r.decision as string,
			reviewer: r.reviewer as string,
			reviewerLabel: (r.reviewer_label as string | null) ?? null,
			note: (r.note as string | null) ?? null,
			at: iso(r.at) as string,
		})),
	};
}

export async function reviewDraft(
	deps: WorkflowDeps,
	operator: OperatorActor,
	draftId: string,
	input: ReviewAction,
): Promise<ReviewResult> {
	const { sql } = deps;
	const draft = await getDraft(sql, draftId);
	if (!draft) throw new WorkflowError("not_found", "That draft doesn't exist.");
	const task = await getTask(sql, draft.taskId);
	if (!task) throw new WorkflowError("not_found", "The task for that draft doesn't exist.");
	if (draft.state !== "pending_review")
		throw new WorkflowError("conflict", `This draft is already ${draft.state.replace("_", " ")}.`);
	if (task.state !== "needs_review")
		throw new WorkflowError(
			"conflict",
			`The task is ${task.state.replace("_", " ")}, not waiting for review.`,
		);

	if (input.action === "edit") {
		const body = cleanBody(input.body);
		await applyEdit(sql, operator, draft, body);
		await audit(sql, { actor: operator, action: "relay.draft_edited", subject: draftId, outcome: "allowed" });
		return { draft: (await getDraft(sql, draftId)) as DraftRecord, task, verification: null };
	}

	if (input.action === "reject") {
		await sql.transaction(async (tx) => {
			const moved = await tx.query(
				`update wai_drafts set state = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3, updated_at = now() where id = $1 and state = 'pending_review'`,
				[draftId, actorKey(operator), input.note?.slice(0, 1000) ?? null],
			);
			if (!moved.rowCount) throw new WorkflowError("conflict", "This draft was already reviewed.");
			await tx.query(
				`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note, before_sha256) values ('draft', $1, 'rejected', $2, $3, $4, $5)`,
				[
					draftId,
					actorKey(operator),
					actorLabel(operator),
					input.note?.slice(0, 1000) ?? null,
					draft.bodySha256,
				],
			);
		});
		const cancelled = await transitionTask(sql, task.id, "cancelled", operator, {
			note: `Draft rejected${input.note ? `: ${previewText(input.note, 200)}` : "."}`,
			onlyFrom: ["needs_review"],
		});
		await audit(sql, {
			actor: operator,
			action: "relay.draft_rejected",
			subject: draftId,
			outcome: "allowed",
		});
		return { draft: (await getDraft(sql, draftId)) as DraftRecord, task: cancelled, verification: null };
	}

	// Save to the case.
	if (draft.sourceStatus !== "ok" && !input.acknowledgeSources)
		throw new WorkflowError(
			"conflict",
			draft.sourceStatus === "missing"
				? "No approved source matched this case. Confirm you have checked it yourself before saving."
				: "A source is out of date. Confirm you have checked it before saving.",
		);
	let working = draft;
	if (input.body !== undefined) {
		const body = cleanBody(input.body);
		if (body !== draft.body) working = await applyEdit(sql, operator, draft, body);
	}

	const sourceCountBefore = (await getDraftSources(sql, draftId)).length;
	await sql.transaction(async (tx) => {
		const locked = await tx.query(`select state from wai_drafts where id = $1 for update`, [draftId]);
		if (locked.rows[0]?.state !== "pending_review")
			throw new WorkflowError("conflict", "This draft was already reviewed.");
		await tx.query(
			`update wai_drafts set state = 'saved', reviewed_by = $2, reviewed_at = now(), saved_at = now(), review_note = $3, updated_at = now() where id = $1`,
			[draftId, actorKey(operator), input.note?.slice(0, 1000) ?? null],
		);
		// If this replaces an earlier saved draft for the same case, that one is superseded.
		await tx.query(
			`update wai_drafts set state = 'superseded', updated_at = now() where case_id = $1 and id <> $2 and state = 'saved'`,
			[working.caseId, draftId],
		);
		await tx.query(
			`update wai_cases set status = 'draft_ready', updated_at = now() where id = $1 and status in ('open','draft_ready')`,
			[working.caseId],
		);
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, note, before_sha256, after_sha256) values ('draft', $1, 'approved', $2, $3, $4, $5, $6)`,
			[
				draftId,
				actorKey(operator),
				actorLabel(operator),
				input.note?.slice(0, 1000) ?? null,
				draft.bodySha256,
				sha256Hex(working.body),
			],
		);
	});
	await addTaskEvent(sql, task.id, {
		kind: "draft_saved",
		actor: operator,
		detail: { draftId, caseId: working.caseId, sources: sourceCountBefore },
	});
	await audit(sql, {
		actor: operator,
		action: "relay.draft_saved",
		subject: draftId,
		outcome: "allowed",
		detail: { caseId: working.caseId },
	});

	const expectedSources =
		typeof task.result?.retrievedCount === "number"
			? (task.result.retrievedCount as number)
			: sourceCountBefore;
	const verification = await verifyDraftSaved(sql, {
		draftId,
		expectedCaseId: String(task.input.caseId ?? ""),
		expectedBodySha256: sha256Hex(working.body),
		expectedSourceCount: expectedSources,
		expectedReviewer: actorKey(operator),
	});

	let finished: TaskRecord;
	try {
		finished = verification.ok
			? await transitionTask(sql, task.id, "completed", operator, {
					completionEvidence: {
						draftId,
						caseId: working.caseId,
						bodySha256: sha256Hex(working.body),
						sourceCount: expectedSources,
						citedCount: (await getDraftSources(sql, draftId)).filter((s) => s.cited).length,
						sourceStatus: draft.sourceStatus,
						reviewer: actorKey(operator),
						verifiedAt: verification.verifiedAt,
						checks: verification.checks.map(({ name, ok }) => ({ name, ok })),
					},
					note: "The saved draft was read back and every check passed.",
					onlyFrom: ["needs_review"],
				})
			: await transitionTask(sql, task.id, "outcome_unknown", operator, {
					error: `The draft was saved but could not be confirmed: ${verification.checks
						.filter((c) => !c.ok)
						.map((c) => c.name)
						.join("; ")}. Check the case before relying on it.`,
					detail: { checks: verification.checks },
					onlyFrom: ["needs_review"],
				});
	} catch (error) {
		if (error instanceof InvalidTransitionError)
			throw new WorkflowError("conflict", "The task changed while the draft was being saved.");
		throw error;
	}
	return { draft: (await getDraft(sql, draftId)) as DraftRecord, task: finished, verification };
}

async function applyEdit(
	sql: Sql,
	operator: OperatorActor,
	draft: DraftRecord,
	body: string,
): Promise<DraftRecord> {
	if (body === draft.body) return draft;
	await sql.transaction(async (tx) => {
		const updated = await tx.query(
			`update wai_drafts set body = $2, body_sha256 = $3, edited_by = $4, updated_at = now() where id = $1 and state = 'pending_review'`,
			[draft.id, body, sha256Hex(body), actorKey(operator)],
		);
		if (!updated.rowCount) throw new WorkflowError("conflict", "This draft was already reviewed.");
		await tx.query(
			`insert into wai_reviews (subject_type, subject_id, decision, reviewer, reviewer_label, before_sha256, after_sha256) values ('draft', $1, 'edited', $2, $3, $4, $5)`,
			[draft.id, actorKey(operator), actorLabel(operator), draft.bodySha256, sha256Hex(body)],
		);
	});
	await addTaskEvent(sql, draft.taskId, {
		kind: "draft_edited",
		actor: operator,
		detail: { draftId: draft.id, from: draft.bodySha256.slice(0, 12), to: sha256Hex(body).slice(0, 12) },
	});
	return (await getDraft(sql, draft.id)) as DraftRecord;
}

export type VerifyInput = {
	draftId: string;
	expectedCaseId: string;
	expectedBodySha256: string;
	expectedSourceCount: number;
	expectedReviewer: string;
};

/**
 * Reads a saved draft back from the database and checks it. Each check is separate so a failure says exactly what is wrong.
 * A database error while checking counts as a failed check: an unverified result is never reported as a good one.
 */
export async function verifyDraftSaved(
	sql: Sql,
	input: VerifyInput,
	now: () => Date = () => new Date(),
): Promise<Verification> {
	const checks: VerificationCheck[] = [];
	const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
	try {
		const draft = await getDraft(sql, input.draftId);
		check(
			"The draft is stored",
			draft !== null,
			draft ? `Found draft ${draft.id}.` : "No draft with that id was found.",
		);
		check("The draft is saved", draft?.state === "saved", `State is ${draft?.state ?? "missing"}.`);
		check(
			"The draft belongs to the case the task was created for",
			draft?.caseId === input.expectedCaseId && input.expectedCaseId !== "",
			draft
				? `Draft is on case ${draft.caseId}; the task is for ${input.expectedCaseId || "no case"}.`
				: "No draft.",
		);
		const supportCase = draft ? await getCase(sql, draft.caseId) : null;
		check(
			"That case exists and shows a draft is ready",
			supportCase?.status === "draft_ready",
			`Case status is ${supportCase?.status ?? "missing"}.`,
		);
		const storedHash = draft ? sha256Hex(draft.body) : "";
		check(
			"The stored text is exactly what was approved",
			!!draft && storedHash === draft.bodySha256 && storedHash === input.expectedBodySha256,
			draft
				? `Stored ${storedHash.slice(0, 12)}…, approved ${input.expectedBodySha256.slice(0, 12)}….`
				: "No draft.",
		);
		const sources = draft ? await getDraftSources(sql, draft.id) : [];
		check(
			"All source references were saved",
			sources.length === input.expectedSourceCount,
			`${sources.length} stored, ${input.expectedSourceCount} retrieved.`,
		);
		let matching = 0;
		for (const source of sources)
			if (await versionStillMatches(sql, source.documentId, source.version, source.contentSha256))
				matching += 1;
		check(
			"Each reference still points at the version that was read",
			matching === sources.length,
			`${matching} of ${sources.length} match.`,
		);
		const review = draft
			? await sql.query(
					`select 1 from wai_reviews where subject_type = 'draft' and subject_id = $1 and decision = 'approved' and reviewer = $2`,
					[draft.id, input.expectedReviewer],
				)
			: { rows: [] };
		check(
			"The approval is recorded",
			review.rows.length >= 1 && draft?.reviewedBy === input.expectedReviewer,
			review.rows.length ? "Approval found." : "No approval record found.",
		);
	} catch (error) {
		check(
			"The check could be completed",
			false,
			error instanceof Error ? error.message.slice(0, 160) : "A database error stopped the check.",
		);
	}
	return { ok: checks.every((c) => c.ok), checks, verifiedAt: now().toISOString() };
}
