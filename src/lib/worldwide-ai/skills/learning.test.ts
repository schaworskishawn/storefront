import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { requestFunction, reviewProduct, runFunction } from "../functions/pipeline";
import { getProductByTask } from "../functions/products";
import { FUNCTIONS, lookupFunction } from "../functions/registry";
import { createCase } from "../support/cases";
import { freshDb, owner, staff, workflowDeps } from "../testing.test-util";
import { SKILL_BY_ID } from "./catalog";
import { evaluateSkills } from "./evaluate";
import {
	LESSON_POLICY,
	correctionsWithoutProcedure,
	evidenceFor,
	ingestLearningEvents,
	learnFromReviews,
	listLearningEvents,
	proposeLessons,
	scorecards,
} from "./learning";
import { approveRelease, decideProposal, listProposals } from "./store";
import type { SkillDefinition } from "./types";

let sql: SqlClient;
const env = { POSTGRES_URL: "postgres://test" };
const SKILL = "vault-bank-reconciliation";
const skill = SKILL_BY_ID.get(SKILL) as SkillDefinition;
let serial = 0;

/**
 * Runs Vault's reconciliation (code only, and its result has to be reviewed) and records a person's decision on it through
 * the real review path. Returns the stored result's id.
 */
async function reviewed(
	action: "accept" | "reject",
	options: { note?: string; demo?: boolean } = {},
): Promise<string> {
	const deps = workflowDeps(sql, null, env);
	const sample = FUNCTIONS.get("vault.settlement-match")?.sample?.() ?? {};
	const asked = await requestFunction(
		deps,
		staff,
		"vault.settlement-match",
		// A different tolerance each time, so each run is a request of its own.
		{ ...sample, toleranceDays: String(++serial) },
		{ lookup: lookupFunction, demo: options.demo },
	);
	await runFunction(deps, asked.task.id, { lookup: lookupFunction });
	const product = await getProductByTask(sql, asked.task.id);
	if (!product) throw new Error("the run stored no result");
	await reviewProduct(deps, owner, product.id, { action, note: options.note });
	return product.id;
}

const fromReviews = async () =>
	(await listProposals(sql, { skillId: SKILL })).filter((p) => p.origin === "reviews");

beforeAll(async () => {
	sql = await freshDb();
	// The procedure has to be approved for a task to follow it, and so for a review to say anything about it.
	const [evaluation] = await evaluateSkills(sql, [skill], { ranBy: "operator:owner-1" });
	await approveRelease(sql, owner, { skill, evaluationId: evaluation.id });
}, 240_000);
afterAll(async () => {
	await sql.close();
});

describe("a learning event", () => {
	it("is made once from each saved review, with the procedure the work followed", async () => {
		const accepted = await reviewed("accept");
		const rejected = await reviewed("reject", { note: "B3 and B4 were matched to the wrong payouts." });
		expect(await ingestLearningEvents(sql)).toBe(2);
		// Reading the reviews again adds nothing.
		expect(await ingestLearningEvents(sql)).toBe(0);
		const events = await listLearningEvents(sql, { agent: "vault" });
		expect(events).toHaveLength(2);
		expect(events.find((e) => e.subjectId === accepted)).toMatchObject({
			subjectType: "work_product",
			agent: "vault",
			skillId: SKILL,
			skillVersion: skill.version,
			outcome: "accepted",
			reviewer: "operator:owner-1",
		});
		expect(events.find((e) => e.subjectId === rejected)?.outcome).toBe("rejected");
	});

	it("leaves out a demonstration run: it is not evidence about the business's work", async () => {
		const before = (await listLearningEvents(sql)).length;
		await reviewed("reject", { note: "Just trying the screen.", demo: true });
		expect(await ingestLearningEvents(sql)).toBe(0);
		expect((await listLearningEvents(sql)).length).toBe(before);
	});

	it("counts a draft saved as written as accepted, and one a person changed first as corrected", async () => {
		const { case: filed } = await createCase(sql, staff, {
			source: "manual",
			subject: "Where is my order?",
			message: "It has been a week.",
		});
		const draft = async (
			reviews: Array<{ decision: string; before: string; after: string | null; note?: string }>,
			options: { scope?: string } = {},
		) => {
			const task = await sql.query<{ id: string }>(
				`insert into wai_tasks (kind, title, owner_role, idempotency_key, requested_by, expected_result, scope)
				 values ('relay.support_draft', 'A reply', 'relay', $1, 'operator:staff-1', 'a draft', $2) returning id`,
				[`learning-draft-${++serial}`, options.scope ?? "business"],
			);
			const made = await sql.query<{ id: string }>(
				`insert into wai_drafts (task_id, case_id, body, body_sha256, source_status, created_by_role)
				 values ($1,$2,'Hello','aaaa','ok','relay') returning id`,
				[task.rows[0].id, filed.id],
			);
			for (const review of reviews)
				await sql.query(
					`insert into wai_reviews (subject_type, subject_id, decision, reviewer, note, before_sha256, after_sha256)
					 values ('draft', $1, $2, 'operator:owner-1', $3, $4, $5)`,
					[made.rows[0].id, review.decision, review.note ?? null, review.before, review.after],
				);
			return made.rows[0].id;
		};
		const asWritten = await draft([{ decision: "approved", before: "aaaa", after: "aaaa" }]);
		const changedOnSave = await draft([{ decision: "approved", before: "aaaa", after: "bbbb" }]);
		// Edited first, then saved unchanged from the edit: still a correction of what the agent wrote.
		const editedThenSaved = await draft([
			{ decision: "edited", before: "aaaa", after: "bbbb" },
			{ decision: "approved", before: "bbbb", after: "bbbb" },
		]);
		const turnedDown = await draft([
			{ decision: "rejected", before: "aaaa", after: null, note: "Wrong policy quoted." },
		]);
		// Still being edited, with no final decision: nothing to learn from yet.
		const unfinished = await draft([{ decision: "edited", before: "aaaa", after: "bbbb" }]);
		// One person's own work is not the business's.
		const personal = await draft([{ decision: "approved", before: "aaaa", after: "aaaa" }], {
			scope: "personal:operator:staff-1",
		});

		// One event per final decision: the edit on the way is not an event of its own.
		expect(await ingestLearningEvents(sql)).toBe(4);
		const outcomes = new Map(
			(await listLearningEvents(sql, { agent: "relay" })).map((e) => [e.subjectId, e.outcome]),
		);
		expect(outcomes.get(asWritten)).toBe("accepted");
		expect(outcomes.get(changedOnSave)).toBe("corrected");
		expect(outcomes.get(editedThenSaved)).toBe("corrected");
		expect(outcomes.get(turnedDown)).toBe("rejected");
		expect(outcomes.has(unfinished)).toBe(false);
		expect(outcomes.has(personal)).toBe(false);
		// No procedure was recorded for these tasks, and none is made up.
		expect((await listLearningEvents(sql, { agent: "relay" })).every((e) => e.skillId === null)).toBe(true);
		// So nothing can be raised from them, and that is counted rather than passed over: two corrected, one rejected.
		expect(await correctionsWithoutProcedure(sql)).toBe(3);
		expect(await proposeLessons(sql)).toEqual({ raised: [], added: [] });
	});
});

describe("an agent's scorecard", () => {
	it("is counted from the reviews that happened, with the denominator shown", async () => {
		const cards = await scorecards(sql);
		expect(cards.find((c) => c.agent === "vault")).toMatchObject({
			reviewed: 2,
			accepted: 1,
			corrected: 0,
			rejected: 1,
			acceptedPercent: "50.0",
		});
		expect(cards.find((c) => c.agent === "relay")).toMatchObject({
			reviewed: 4,
			accepted: 1,
			corrected: 2,
			rejected: 1,
			acceptedPercent: "25.0",
		});
		// An agent whose work nobody reviewed has no card: not a zero.
		expect(cards.map((c) => c.agent)).toEqual(["relay", "vault"]);
	});
});

describe("a lesson from reviews", () => {
	it("is not raised from one review", async () => {
		expect(LESSON_POLICY.minimumCorrections).toBe(2);
		// One rejection of Vault's work is on record from the tests above.
		expect(await proposeLessons(sql)).toEqual({ raised: [], added: [] });
		expect(await fromReviews()).toEqual([]);
	});

	it("is raised once enough reviews say the same procedure fell short, with those reviews as evidence", async () => {
		await reviewed("reject", { note: "A refund reversal was treated as a payout." });
		expect(await learnFromReviews(sql)).toEqual({ events: 1, raised: [SKILL], added: [] });
		const [proposal] = await fromReviews();
		expect(proposal).toMatchObject({
			skillId: SKILL,
			baseVersion: skill.version,
			state: "open",
			origin: "reviews",
			createdBy: "system:learning",
			summary: `Reviewers corrected or rejected 2 of 3 reviewed results that followed version ${skill.version} of this procedure.`,
		});
		expect(proposal.proposedChange).toContain("It proposes no wording.");
		expect(proposal.evidence).toHaveLength(2);
		expect((await listAudit(sql, 1))[0]).toMatchObject({
			action: "skill.lesson.raise",
			actor: "system:learning",
		});
		// The evidence is the reviews themselves, with what each reviewer wrote. The accepted result isn't among them.
		expect((await evidenceFor(sql, proposal.evidence)).map((e) => [e.outcome, e.note]).sort()).toEqual([
			["rejected", "A refund reversal was treated as a payout."],
			["rejected", "B3 and B4 were matched to the wrong payouts."],
		]);

		// Nothing new: nothing raised and nothing added, however often it runs.
		expect(await learnFromReviews(sql)).toEqual({ events: 0, raised: [], added: [] });
		expect(await fromReviews()).toHaveLength(1);
	});

	it("takes more evidence into the proposal that is open instead of raising another", async () => {
		await reviewed("reject", { note: "Fees were not checked." });
		await reviewed("accept");
		expect(await learnFromReviews(sql)).toEqual({ events: 2, raised: [], added: [SKILL] });
		const proposals = await fromReviews();
		expect(proposals).toHaveLength(1);
		expect(proposals[0].evidence).toHaveLength(3);
		expect(proposals[0].summary).toBe(
			`Reviewers corrected or rejected 3 of 5 reviewed results that followed version ${skill.version} of this procedure.`,
		);
	});

	it("changes nothing by being raised or accepted, and isn't raised again for what was already decided", async () => {
		const [open] = await fromReviews();
		await expect(
			decideProposal(sql, staff, { proposalId: open.id, decision: "declined", note: "No" }),
		).rejects.toThrow();
		await decideProposal(sql, owner, {
			proposalId: open.id,
			decision: "declined",
			note: "Those three were bad bank exports, not the procedure.",
		});
		// The same reviews are not put to the owner a second time.
		expect(await learnFromReviews(sql)).toEqual({ events: 0, raised: [], added: [] });
		// One more correction is not enough by itself, whatever went before.
		await reviewed("reject", { note: "Tolerance applied to the wrong date." });
		expect(await learnFromReviews(sql)).toEqual({ events: 1, raised: [], added: [] });
		// A second new one is, and the new proposal rests only on the reviews not already decided on.
		await reviewed("reject", { note: "Ambiguous candidates were matched anyway." });
		expect(await learnFromReviews(sql)).toEqual({ events: 1, raised: [SKILL], added: [] });
		const proposals = await fromReviews();
		expect(proposals.map((p) => p.state).sort()).toEqual(["declined", "open"]);
		const fresh = proposals.find((p) => p.state === "open");
		expect(fresh?.evidence).toHaveLength(2);
		expect(fresh?.summary).toBe(
			`Reviewers corrected or rejected 5 of 7 reviewed results that followed version ${skill.version} of this procedure. 2 of those have not been put to you before.`,
		);
		// The procedure in use is exactly what it was: a proposal is not a new version.
		expect(SKILL_BY_ID.get(SKILL)?.version).toBe(skill.version);
	});

	it("says nothing about a procedure that has since changed", async () => {
		const next = { ...skill, version: skill.version + 1 };
		// Every review on record was of work that followed the earlier version, so there is no evidence about this one.
		const before = await fromReviews();
		expect(await proposeLessons(sql, [next])).toEqual({ raised: [], added: [] });
		expect(await fromReviews()).toHaveLength(before.length);
	});
});
