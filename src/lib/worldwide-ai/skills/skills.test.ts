import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLES } from "../agents/registry";
import { approveVersion, createDocument } from "../atlas/service";
import { listAudit } from "../audit";
import { runBackup, runRestoreDrill } from "../backup/drill";
import type { SqlClient } from "../db/sql";
import { requestFunction, runFunction } from "../functions/pipeline";
import { getProductByTask } from "../functions/products";
import { FUNCTIONS, lookupFunction } from "../functions/registry";
import { createFolderStorage } from "../storage/files";
import { createCase } from "../support/cases";
import { countTasksByState, getTaskEvents } from "../tasks/repo";
import { fixedNow, freshDb, mockModel, owner, staff, system, workflowDeps } from "../testing.test-util";
import { requestRelayDraft, runRelayDraft } from "../workflows/relay";
import {
	FOUNDATIONS,
	ROLE_PACKS,
	SKILLS,
	SKILL_BY_ID,
	catalogProblems,
	definitionProblems,
	packOf,
	skillsOf,
} from "./catalog";
import { evaluateSkills } from "./evaluate";
import { NO_SKILLS, resolveSkills } from "./resolver";
import {
	activeReleases,
	approveRelease,
	createProposal,
	decideProposal,
	listInvocations,
	listProposals,
	listReleases,
	revokeRelease,
	rollbackSkill,
	usageBySkill,
	type SkillEvaluation,
} from "./store";
import { hashOfPackage, hashOfSkill, packageOf, renderSkillMarkdown, type SkillDefinition } from "./types";

let sql: SqlClient;
/** One evaluation of every catalog skill, run once and reused. */
let evaluations: Map<string, SkillEvaluation>;

const env = { POSTGRES_URL: "postgres://test", ANTHROPIC_API_KEY: "sk-ant-test" };
const skill = (id: string) => SKILL_BY_ID.get(id) as SkillDefinition;
const approve = (id: string) =>
	approveRelease(sql, owner, { skill: skill(id), evaluationId: (evaluations.get(id) as SkillEvaluation).id });

beforeAll(async () => {
	sql = await freshDb();
	evaluations = new Map(
		(await evaluateSkills(sql, SKILLS, { ranBy: "operator:owner-1" })).map((e) => [e.skillId, e]),
	);
}, 240_000);
afterAll(async () => {
	await sql.close();
});

describe("the skill catalog", () => {
	it("is twelve foundations and one role pack per agent, each a real procedure", () => {
		expect(catalogProblems()).toEqual([]);
		expect(FOUNDATIONS).toHaveLength(12);
		expect(ROLE_PACKS).toHaveLength(49);
		expect(SKILLS).toHaveLength(61);
		expect(new Set(SKILLS.map((s) => s.id)).size).toBe(61);
		expect(FOUNDATIONS.map((s) => s.id)).toEqual([
			"goal-intake",
			"approved-source-retrieval",
			"claim-and-conflict-check",
			"structured-extraction",
			"deterministic-calculation-check",
			"tool-contract-use",
			"context-and-memory-hygiene",
			"exception-and-retry-recovery",
			"review-package-preparation",
			"clear-business-writing",
			"document-and-table-production",
			"outcome-and-performance-check",
		]);
	});

	it("binds every pack to its own agent's functions and to nothing that agent doesn't already have", () => {
		for (const role of ROLES) {
			const pack = packOf(role.id) as SkillDefinition;
			expect(pack.agents, role.id).toEqual([role.id]);
			expect(pack.functions, role.id).toEqual(role.workflows);
			expect(pack.functions).toContain(role.primary);
			expect(pack.tools.every((tool) => role.tools.includes(tool))).toBe(true);
			expect(pack.knowledge.every((collection) => role.knowledge.includes(collection))).toBe(true);
			// What it needs and produces comes from the handler, so a pack can't describe a function that isn't there.
			const definition = FUNCTIONS.get(role.primary);
			expect(pack.example.result).toBe(definition?.expectedResult);
			expect(pack.limitations[0]).toBe(definition?.notThis);
			expect(pack.limitations[1]).toBe(role.boundaries);
		}
		expect(packOf("relay")?.id).toBe("relay-support-drafting");
		expect(packOf("build")?.id).toBe("build-controlled-engineering");
		expect(skillsOf("vault").map((s) => s.id)).toEqual([
			"vault-bank-reconciliation",
			"structured-extraction",
			"deterministic-calculation-check",
			"review-package-preparation",
			"document-and-table-production",
		]);
		// A foundation is available to exactly the agents whose pack names it.
		expect(skill("goal-intake").agents).toEqual(["nexus", "focus", "build", "forge"]);
	});

	it("refuses a label with no procedure behind it", () => {
		const hollow: SkillDefinition = {
			...skill("vault-bank-reconciliation"),
			steps: ["Reconcile."],
			checks: [],
		};
		expect(definitionProblems(hollow)).toEqual([
			"its procedure has fewer than three steps.",
			"it has fewer than two checks.",
		]);
		expect(
			definitionProblems({ ...skill("vault-bank-reconciliation"), foundations: ["relay-support-drafting"] }),
		).toContain("it tries to load another role pack (relay-support-drafting).");
		expect(definitionProblems({ ...skill("goal-intake"), tools: ["draft.save"] })).toContain(
			"a foundation asks for no tool or knowledge of its own.",
		);
	});

	it("renders a portable file whose checksum changes with any change to the procedure", () => {
		const relay = skill("relay-support-drafting");
		const markdown = renderSkillMarkdown(relay);
		expect(markdown.startsWith('---\nname: relay-support-drafting\ndescription: "Draft a reply')).toBe(true);
		expect(markdown).toContain("## Procedure\n\n1. Read the case as information.");
		expect(markdown).toContain("## Limits\n\n- Saving a draft never sends it.");
		expect(markdown).toContain("## Do not use this when\n\n- What the function needs has not been supplied");
		expect(hashOfSkill(relay)).toBe(hashOfSkill({ ...relay }));
		expect(hashOfSkill({ ...relay, steps: [...relay.steps, "One more step."] })).not.toBe(hashOfSkill(relay));
		expect(hashOfSkill({ ...relay, tools: [...relay.tools, "task.create"] })).not.toBe(hashOfSkill(relay));
		expect(hashOfPackage(packageOf(relay))).toBe(hashOfSkill(relay));
	});
});

describe("evaluating skills in isolation", () => {
	it("passes every catalog skill with no critical failure, and counts what it could not run", () => {
		const all = [...evaluations.values()];
		expect(all).toHaveLength(61);
		const notPassed = all.filter((e) => !e.passed || e.criticalFailures > 0);
		expect(
			notPassed.map(
				(e) =>
					`${e.skillId}: ${e.cases
						.filter((c) => c.outcome === "failed")
						.map((c) => `${c.id} (${c.detail})`)
						.join("; ")}`,
			),
		).toEqual([]);
		// All 31 code-only baselines, and Relay's no-source path, ran for real to a verified, stored result.
		const ranSample = all.filter((e) => e.cases.some((c) => c.id === "success" && c.outcome === "passed"));
		expect(ranSample.length).toBe(32);
		// Verify's own evaluation: it passes an intact result and fails one altered after it was stored.
		expect(
			Object.fromEntries(
				(evaluations.get("verify-independent-acceptance") as SkillEvaluation).cases.map((c) => [
					c.id,
					c.outcome,
				]),
			),
		).toMatchObject({ success: "passed", integrity: "passed" });
		// The 17 model-written functions can't be run without the model: that is stated, never counted as a pass.
		const liveModel = all.filter((e) => e.cases.some((c) => c.id === "live-model"));
		expect(liveModel).toHaveLength(18);
		expect(liveModel.every((e) => e.cases.find((c) => c.id === "live-model")?.outcome === "not_run")).toBe(
			true,
		);
		expect(
			all.every((e) => e.environment === "isolated" && e.contentSha256 === hashOfSkill(skill(e.skillId))),
		).toBe(true);
	});

	it("leaves no trace in the live database beyond the evaluation records", async () => {
		expect(Object.values(await countTasksByState(sql)).reduce((a, b) => a + b, 0)).toBe(0);
		for (const table of ["wai_tasks", "wai_work_products", "wai_cases", "wai_drafts", "wai_skill_releases"])
			expect((await sql.query(`select count(*)::int as n from ${table}`)).rows[0].n, table).toBe(0);
		expect((await sql.query("select count(*)::int as n from wai_skill_evaluations")).rows[0].n).toBe(61);
	});

	it("shows exactly which cases ran for a code-only pack, a model-written pack and a foundation", () => {
		const outcomes = (id: string) =>
			Object.fromEntries((evaluations.get(id) as SkillEvaluation).cases.map((c) => [c.id, c.outcome]));
		expect(outcomes("vault-bank-reconciliation")).toEqual({
			format: "passed",
			substance: "passed",
			permission: "passed",
			binding: "passed",
			success: "passed",
			duplicate: "passed",
			"missing-data": "passed",
			authorization: "passed",
		});
		expect(outcomes("script-brand-copy")).toEqual({
			format: "passed",
			substance: "passed",
			permission: "passed",
			binding: "passed",
			success: "not_run",
			"missing-data": "not_run",
			authorization: "passed",
			"live-model": "not_run",
		});
		expect(outcomes("relay-support-drafting")).toEqual({
			format: "passed",
			substance: "passed",
			permission: "passed",
			binding: "passed",
			success: "passed",
			duplicate: "passed",
			"live-model": "not_run",
		});
		expect(outcomes("deterministic-calculation-check")).toMatchObject({ calculation: "passed" });
		expect(outcomes("context-and-memory-hygiene")).toMatchObject({ fencing: "passed" });
		expect(outcomes("outcome-and-performance-check")).toMatchObject({ integrity: "passed" });
		expect(outcomes("review-package-preparation")).toMatchObject({ reviewer: "passed" });
		expect(outcomes("exception-and-retry-recovery")).toMatchObject({ retry: "passed" });
	});

	it("fails a pack that asks for a tool its agent doesn't have, critically", async () => {
		const greedy: SkillDefinition = {
			...skill("script-brand-copy"),
			version: 9,
			tools: [...skill("script-brand-copy").tools, "draft.save"],
		};
		const [evaluation] = await evaluateSkills(sql, [greedy], { ranBy: "operator:owner-1" });
		expect(evaluation.passed).toBe(false);
		expect(evaluation.criticalFailures).toBe(1);
		expect(evaluation.cases.find((c) => c.id === "permission")).toMatchObject({
			outcome: "failed",
			detail: "It asks for a tool Script doesn't have: draft.save.",
		});
		await expect(approveRelease(sql, owner, { skill: greedy, evaluationId: evaluation.id })).rejects.toThrow(
			"The evaluation has 1 critical failure, so this version can't be approved.",
		);
	});
});

describe("approving a skill", () => {
	it("is the owner's alone, and a refused attempt is logged", async () => {
		const id = "check-data-quality";
		await expect(
			approveRelease(sql, staff, {
				skill: skill(id),
				evaluationId: (evaluations.get(id) as SkillEvaluation).id,
			}),
		).rejects.toThrow("Only the owner can approve, revoke or roll back a skill.");
		expect((await listAudit(sql, 5))[0]).toMatchObject({
			actor: "operator:staff-1",
			action: "skill.approve",
			subject: id,
			outcome: "denied",
		});
		expect(await activeReleases(sql)).toEqual(new Map());
	});

	it("is only ever of the exact content that was evaluated", async () => {
		const check = skill("check-data-quality");
		const changed: SkillDefinition = {
			...check,
			version: 2,
			steps: [...check.steps, "Report the time the check ran."],
		};
		await expect(
			approveRelease(sql, owner, {
				skill: changed,
				evaluationId: (evaluations.get(check.id) as SkillEvaluation).id,
			}),
		).rejects.toThrow("The skill has changed since that evaluation. Evaluate the current version first.");
		await expect(
			approveRelease(sql, owner, {
				skill: check,
				evaluationId: (evaluations.get("vault-bank-reconciliation") as SkillEvaluation).id,
			}),
		).rejects.toThrow("That evaluation isn't of this skill. Evaluate it first.");
	});

	it("puts the approved version in use, with the package kept exactly as approved", async () => {
		const release = await approve("check-data-quality");
		expect(release).toMatchObject({
			skillId: "check-data-quality",
			kind: "role-pack",
			version: 1,
			state: "approved",
			active: true,
			approvedBy: "operator:owner-1",
			previousReleaseId: null,
			contentSha256: hashOfSkill(skill("check-data-quality")),
		});
		expect(release.package).toEqual(packageOf(skill("check-data-quality")));
		// Approving the same version again changes nothing.
		expect((await approve("check-data-quality")).id).toBe(release.id);
		expect(await listReleases(sql, "check-data-quality")).toHaveLength(1);
	});
});

describe("choosing the procedures for a task", () => {
	it("loads nothing while a role pack is unapproved, and says so", async () => {
		expect(await resolveSkills(sql, { agent: "vault", functionId: "vault.settlement-match" })).toEqual(
			NO_SKILLS,
		);
	});

	it("loads the role pack and at most two supporting foundations, recording what it turned away", async () => {
		// Check's pack is approved (above) but its foundations are not yet.
		const before = await resolveSkills(sql, { agent: "check", functionId: "check.record-validation" });
		expect(before.selected.map((s) => s.skillId)).toEqual(["check-data-quality"]);
		expect(before.rejected).toEqual(
			skill("check-data-quality").foundations.map((id) => ({
				skillId: id,
				reason: "It has no approved version in use.",
			})),
		);
		for (const id of skill("check-data-quality").foundations) await approve(id);
		const after = await resolveSkills(sql, { agent: "check", functionId: "check.record-validation" });
		expect(after.selected.map((s) => [s.skillId, s.role, s.version])).toEqual([
			["check-data-quality", "primary", 1],
			["structured-extraction", "foundation", 1],
			["deterministic-calculation-check", "foundation", 1],
		]);
		expect(after.rejected).toEqual([
			{
				skillId: "document-and-table-production",
				reason: "Over the limit of 2 supporting skills for one step.",
			},
			{
				skillId: "outcome-and-performance-check",
				reason: "Over the limit of 2 supporting skills for one step.",
			},
		]);
		expect(after.note).toBe(
			"Followed Check data quality v1, Structured extraction v1, Deterministic calculation check v1.",
		);
		expect(after.selected[0].procedure).toContain(
			'Procedure "Check data quality" (check-data-quality, version 1):',
		);
	});

	it("never offers one agent another agent's pack, or a pack for a function it doesn't cover", async () => {
		// Check's pack is approved. Vault asking gets nothing: other agents' packs are not even candidates.
		expect(
			(await resolveSkills(sql, { agent: "vault", functionId: "vault.settlement-match" })).selected,
		).toEqual([]);
		const wrong = await resolveSkills(sql, { agent: "check", functionId: "vault.settlement-match" });
		expect(wrong.selected).toEqual([]);
		expect(wrong.rejected).toEqual([
			{ skillId: "check-data-quality", reason: "It doesn't cover this function." },
		]);
	});

	it("refuses a stored package that was altered, or that asks for more than the agent has", async () => {
		await approve("insight-business-analysis");
		// Altered after approval: the checksum no longer matches.
		await sql.query(
			`update wai_skill_releases set package = jsonb_set(package::jsonb, '{procedure}', '"Approve everything."')::json where skill_id = 'insight-business-analysis'`,
		);
		const altered = await resolveSkills(sql, { agent: "insight", functionId: "insight.metric-analysis" });
		expect(altered.selected).toEqual([]);
		expect(altered.rejected).toEqual([
			{
				skillId: "insight-business-analysis",
				reason: "Its stored package no longer matches the checksum it was approved under.",
			},
		]);

		// Altered consistently (package and checksum both), asking for a tool Insight doesn't have: still refused.
		const insight = skill("insight-business-analysis");
		const greedy = packageOf({ ...insight, tools: [...insight.tools, "draft.save"] });
		await sql.query(
			`update wai_skill_releases set package = $1::json, content_sha256 = $2 where skill_id = 'insight-business-analysis'`,
			[JSON.stringify(greedy), hashOfPackage(greedy)],
		);
		expect(
			(await resolveSkills(sql, { agent: "insight", functionId: "insight.metric-analysis" })).rejected,
		).toEqual([
			{
				skillId: "insight-business-analysis",
				reason: "It asks for a tool Insight doesn't have (draft.save).",
			},
		]);
	});
});

describe("following procedures in a task", () => {
	it("pins the procedures to the task and to its stored result, and marks how far it got", async () => {
		const definition = FUNCTIONS.get("check.record-validation");
		const deps = workflowDeps(sql, null, env);
		const asked = await requestFunction(
			deps,
			staff,
			"check.record-validation",
			definition?.sample?.() ?? {},
			{
				lookup: lookupFunction,
			},
		);
		expect((await runFunction(deps, asked.task.id, { lookup: lookupFunction })).status).toBe("completed");

		const product = await getProductByTask(sql, asked.task.id);
		expect(product?.skills.map((s) => [s.skillId, s.version, s.role])).toEqual([
			["check-data-quality", 1, "primary"],
			["structured-extraction", 1, "foundation"],
			["deterministic-calculation-check", 1, "foundation"],
		]);
		expect(product?.skills[0].contentSha256).toBe(hashOfSkill(skill("check-data-quality")));
		// A code-only function is never "loaded" into a model: it goes from selected to invoked to completed.
		expect((await listInvocations(sql, asked.task.id)).map((i) => [i.skillId, i.stage])).toEqual([
			["check-data-quality", "completed"],
			["structured-extraction", "completed"],
			["deterministic-calculation-check", "completed"],
		]);
		const resolved = (await getTaskEvents(sql, asked.task.id)).find((e) => e.kind === "skills_resolved");
		expect(resolved?.detail).toMatchObject({
			note: "Followed Check data quality v1, Structured extraction v1, Deterministic calculation check v1.",
			rejected: [{ skillId: "document-and-table-production" }, { skillId: "outcome-and-performance-check" }],
		});
		expect((await usageBySkill(sql)).get("check-data-quality")).toMatchObject({ selected: 1, completed: 1 });
	});

	it("runs a function exactly as before when it has no approved procedure, and records that", async () => {
		const definition = FUNCTIONS.get("trace.shipment-timeline");
		const deps = workflowDeps(sql, null, env);
		const asked = await requestFunction(
			deps,
			staff,
			"trace.shipment-timeline",
			definition?.sample?.() ?? {},
			{
				lookup: lookupFunction,
			},
		);
		expect((await runFunction(deps, asked.task.id, { lookup: lookupFunction })).status).toBe("completed");
		expect((await getProductByTask(sql, asked.task.id))?.skills).toEqual([]);
		expect(await listInvocations(sql, asked.task.id)).toEqual([]);
		expect(
			(await getTaskEvents(sql, asked.task.id)).find((e) => e.kind === "skills_resolved")?.detail,
		).toMatchObject({
			note: NO_SKILLS.note,
			selected: [],
		});
	});
});

describe("improving Relay's procedure: correction, proposal, evaluation, approval, rollback (fixtures)", () => {
	const RETURNS_TEXT =
		"Unopened items can be returned within 30 days of delivery for a refund to the original payment method. Opened coils and e-liquids cannot be returned. Email support@worldwidevapor.com to start a return.";
	const goodReply = {
		body: "Hi Jane,\n\nThanks for reaching out. Unopened items can be returned within 30 days of delivery for a refund to the original payment method. Email support@worldwidevapor.com to start your return.\n\nWorldwide Vapor Support",
		citations: ["S1"],
		needsFollowUp: false,
		uncertainties: [],
		instructionsInData: false,
	};
	const NEW_STEP = "Before saving, state the return window in days exactly as the cited source gives it.";
	const relayV1 = () => skill("relay-support-drafting");
	const relayV2 = (): SkillDefinition => ({
		...relayV1(),
		version: 2,
		steps: [...relayV1().steps, NEW_STEP],
	});
	let serial = 0;

	/** Files a case, asks Relay for a draft, and returns what the model was told and what the task followed. */
	async function draft(reply: Parameters<typeof mockModel>[0] = goodReply) {
		const filed = await createCase(sql, staff, {
			source: "manual",
			subject: `Can I return a coil pack? (${++serial})`,
			message: `Hi, I ordered an unopened coil pack last week and changed my mind. Can I return it? Order 10${serial}.`,
			customerName: "Jane Doe",
			customerEmail: "jane@example.com",
		});
		const model = mockModel(reply);
		const deps = workflowDeps(sql, model.handle, env);
		const asked = await requestRelayDraft(deps, staff, filed.case.id);
		const outcome = await runRelayDraft(deps, asked.task.id);
		return { outcome, taskId: asked.task.id, instructions: model.instructions.join("\n") };
	}

	beforeAll(async () => {
		const { document } = await createDocument(sql, owner, {
			collection: "returns",
			title: "Returns and refunds",
			owner: "Olivia",
			source: "Returns page",
			content: RETURNS_TEXT,
		});
		await approveVersion(sql, owner, document.id, 1, {});
	});

	it("starts with no approved procedure: Relay drafts on its registry instructions alone", async () => {
		const first = await draft();
		expect(first.outcome.status).toBe("needs_review");
		expect(first.instructions).not.toContain("Approved procedures for this task.");
		expect(await listInvocations(sql, first.taskId)).toEqual([]);
	});

	it("follows version 1 once the owner approves it and its foundations", async () => {
		await approve("relay-support-drafting");
		for (const id of relayV1().foundations) if (!(await activeReleases(sql)).has(id)) await approve(id);
		const second = await draft();
		expect(second.outcome.status).toBe("needs_review");
		expect(second.instructions).toContain("Approved procedures for this task.");
		expect(second.instructions).toContain(
			'Procedure "Relay support drafting" (relay-support-drafting, version 1):',
		);
		expect(second.instructions).toContain(
			'Procedure "Approved source retrieval" (approved-source-retrieval, version 1):',
		);
		expect(second.instructions).toContain(
			'Procedure "Context and memory hygiene" (context-and-memory-hygiene, version 1):',
		);
		// Only two foundations are loaded, and no other agent's procedure is ever in the prompt.
		expect(second.instructions).not.toContain("clear-business-writing");
		expect(second.instructions).not.toContain("vault-bank-reconciliation");
		expect(second.instructions).not.toContain(NEW_STEP);
		expect((await listInvocations(sql, second.taskId)).map((i) => [i.skillId, i.version, i.stage])).toEqual([
			["relay-support-drafting", 1, "completed"],
			["approved-source-retrieval", 1, "completed"],
			["context-and-memory-hygiene", 1, "completed"],
		]);
	});

	it("records a reviewer's correction as a proposal, which changes nothing by itself", async () => {
		const proposal = await createProposal(sql, staff, {
			skill: relayV1(),
			summary: "Drafts sometimes say 'about a month' instead of the 30 days in the policy.",
			proposedChange: NEW_STEP,
			sourceType: "task",
			sourceId: "reviewed-draft",
		});
		expect(proposal).toMatchObject({ state: "open", baseVersion: 1, createdBy: "operator:staff-1" });
		await expect(
			decideProposal(sql, staff, { proposalId: proposal.id, decision: "accepted" }),
		).rejects.toThrow("Only the owner can approve, revoke or roll back a skill.");
		const decided = await decideProposal(sql, owner, { proposalId: proposal.id, decision: "accepted" });
		expect(decided).toMatchObject({ state: "accepted", decidedBy: "operator:owner-1" });
		expect(await listProposals(sql, { skillId: "relay-support-drafting", state: "open" })).toEqual([]);
		// Accepting the proposal did not touch the procedure in use.
		expect((await activeReleases(sql)).get("relay-support-drafting")?.version).toBe(1);
		expect((await draft()).instructions).not.toContain(NEW_STEP);
	});

	it("evaluates the changed procedure against the same cases, and only then lets the owner put it in use", async () => {
		const [candidate] = await evaluateSkills(sql, [relayV2()], { ranBy: "operator:owner-1" });
		const current = evaluations.get("relay-support-drafting") as SkillEvaluation;
		// The same cases, on the same isolated environment, with the same outcomes: no regression.
		expect(candidate.cases.map((c) => [c.id, c.outcome])).toEqual(
			current.cases.map((c) => [c.id, c.outcome]),
		);
		expect(candidate).toMatchObject({ passed: true, criticalFailures: 0, version: 2 });
		expect(candidate.contentSha256).not.toBe(current.contentSha256);

		// Until it is approved, version 2 guides nothing.
		expect((await draft()).instructions).not.toContain(NEW_STEP);
		await expect(
			approveRelease(sql, staff, { skill: relayV2(), evaluationId: candidate.id }),
		).rejects.toThrow("Only the owner");
		const v1 = (await activeReleases(sql)).get("relay-support-drafting");
		const release = await approveRelease(sql, owner, { skill: relayV2(), evaluationId: candidate.id });
		expect(release).toMatchObject({ version: 2, active: true, previousReleaseId: v1?.id });

		const after = await draft();
		expect(after.outcome.status).toBe("needs_review");
		expect(after.instructions).toContain(`6. ${NEW_STEP}`);
		expect((await listInvocations(sql, after.taskId))[0]).toMatchObject({
			skillId: "relay-support-drafting",
			version: 2,
			releaseId: release.id,
			stage: "completed",
		});
	});

	it("rolls back to version 1 on the owner's word, keeping the history", async () => {
		await expect(rollbackSkill(sql, staff, { skillId: "relay-support-drafting" })).rejects.toThrow(
			"Only the owner",
		);
		const back = await rollbackSkill(sql, owner, { skillId: "relay-support-drafting" });
		expect(back).toMatchObject({ version: 1, active: true, state: "approved" });
		expect((await draft()).instructions).not.toContain(NEW_STEP);
		expect(
			(await listReleases(sql, "relay-support-drafting")).map((r) => [r.version, r.state, r.active]),
		).toEqual([
			[2, "approved", false],
			[1, "approved", true],
		]);
		await expect(rollbackSkill(sql, owner, { skillId: "relay-support-drafting" })).rejects.toThrow(
			"There is no earlier approved version of this skill to return to.",
		);
	});

	it("stores nothing when the procedure is revoked while a draft is being written", async () => {
		const v1 = (await activeReleases(sql)).get("relay-support-drafting");
		const interrupted = await draft(async () => {
			await revokeRelease(sql, owner, {
				releaseId: v1?.id ?? "",
				reason: "Found to misstate the return window.",
			});
			return goodReply;
		});
		expect(interrupted.outcome.status).toBe("failed");
		expect(interrupted.outcome.status === "failed" && interrupted.outcome.error).toMatch(
			/^A procedure this task was following changed while it ran, so nothing was stored: relay-support-drafting \(It was revoked or taken out of use while the task ran\.\)/,
		);
		expect(
			(await sql.query("select count(*)::int as n from wai_drafts where task_id = $1", [interrupted.taskId]))
				.rows[0].n,
		).toBe(0);
		expect((await listInvocations(sql, interrupted.taskId)).every((i) => i.stage !== "completed")).toBe(true);
	});

	it("never falls back silently after a revocation: no version guides Relay until the owner chooses one", async () => {
		expect((await activeReleases(sql)).has("relay-support-drafting")).toBe(false);
		const after = await draft();
		expect(after.outcome.status).toBe("needs_review");
		expect(after.instructions).not.toContain("Approved procedures for this task.");
		expect(await listInvocations(sql, after.taskId)).toEqual([]);
		// A revoked version can't be approved again as it stands.
		await expect(approve("relay-support-drafting")).rejects.toThrow(
			"This exact version was revoked. Change the procedure and evaluate the new version.",
		);
		// The owner can still choose the other approved version.
		const forward = await rollbackSkill(sql, owner, { skillId: "relay-support-drafting" });
		expect(forward).toMatchObject({ version: 2, active: true });
		expect(
			(await listAudit(sql, 200)).filter((a) => a.action.startsWith("skill.")).map((a) => a.action),
		).toEqual(
			expect.arrayContaining([
				"skill.approve",
				"skill.revoke",
				"skill.rollback",
				"skill.propose",
				"skill.proposal.decide",
			]),
		);
	});
});

describe("recovering skills from a backup", () => {
	it("restores releases, evaluations, what tasks followed and proposals intact, in an isolated database", async () => {
		const dir = await mkdtemp(join(tmpdir(), "wai-skills-backup-"));
		try {
			const storage = createFolderStorage(dir);
			const { manifest } = await runBackup({ sql, storage, actor: system, now: fixedNow });
			for (const table of [
				"wai_skill_evaluations",
				"wai_skill_releases",
				"wai_skill_invocations",
				"wai_skill_proposals",
			] as const)
				expect(manifest.tables[table].rows, table).toBeGreaterThan(0);
			const result = await runRestoreDrill({ backup: storage, sql, actor: system, now: fixedNow });
			expect(result.checks.filter((check) => !check.ok)).toEqual([]);
			expect(result.ok).toBe(true);
			// One check per table and more besides: the four skills tables are among them.
			expect(result.checks.length).toBeGreaterThanOrEqual(21);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
