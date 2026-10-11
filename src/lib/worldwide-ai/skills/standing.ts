import type { Sql } from "../db/sql";
import { SKILLS, SKILL_BY_ID } from "./catalog";
import {
	EVALUATION_POLICY,
	activeReleases,
	latestEvaluations,
	listEvaluations,
	listProposals,
	listReleases,
	releaseIsIntact,
	usageBySkill,
	type SkillEvaluation,
	type SkillProposal,
	type SkillRelease,
} from "./store";
import { SUITE_VERSION, hashOfSkill, type SkillDefinition } from "./types";

/**
 * What the Skills pages show. A skill's standing is worked out from records, never assumed: which version a person approved
 * and is in use, whether the version in the repository is that one, and what its last evaluation actually found.
 */

export type SkillStanding =
	/** The repository's version is approved and in use. */
	| "in_use"
	/** An earlier approved version is in use; the repository's version has not been approved. */
	| "newer_waiting"
	/** The repository's version passed its evaluation and is waiting for the owner. Nothing is in use. */
	| "evaluated"
	/** The repository's version failed its evaluation. Nothing is in use. */
	| "failed"
	/** The repository's version was revoked and nothing else is in use. */
	| "revoked"
	/** Never evaluated. Nothing is in use. */
	| "not_evaluated";

export const STANDING_LABELS: Record<SkillStanding, string> = {
	in_use: "Approved, in use",
	newer_waiting: "Earlier version in use",
	evaluated: "Passed, waiting for approval",
	failed: "Evaluation failed",
	revoked: "Revoked",
	not_evaluated: "Not evaluated",
};

export type SkillRow = {
	skill: SkillDefinition;
	sha256: string;
	standing: SkillStanding;
	/** The release guiding work right now, if any. */
	active: SkillRelease | null;
	/** Whether the stored package of the active release still matches its approved checksum. */
	intact: boolean;
	/** The newest evaluation of the repository's exact version under the current checks, if there is one. */
	evaluation: SkillEvaluation | null;
	/** Whether the owner could approve the repository's version right now. */
	approvable: boolean;
	usage: { selected: number; completed: number; lastAt: string | null };
};

const currentEvaluation = (skill: SkillDefinition, sha256: string, latest: SkillEvaluation | undefined) =>
	latest &&
	latest.contentSha256 === sha256 &&
	latest.version === skill.version &&
	latest.suiteVersion === SUITE_VERSION &&
	latest.policyVersion === EVALUATION_POLICY.version
		? latest
		: null;

function standingOf(
	sha256: string,
	active: SkillRelease | null,
	evaluation: SkillEvaluation | null,
	revoked: boolean,
): SkillStanding {
	if (active) return active.contentSha256 === sha256 ? "in_use" : "newer_waiting";
	if (revoked) return "revoked";
	if (!evaluation) return "not_evaluated";
	return evaluation.passed ? "evaluated" : "failed";
}

export async function loadSkillRows(sql: Sql): Promise<SkillRow[]> {
	const [active, latest, usage, releases] = await Promise.all([
		activeReleases(sql),
		latestEvaluations(sql),
		usageBySkill(sql),
		listReleases(sql),
	]);
	return SKILLS.map((skill) => {
		const sha256 = hashOfSkill(skill);
		const inUse = active.get(skill.id) ?? null;
		const evaluation = currentEvaluation(skill, sha256, latest.get(skill.id));
		const revoked = releases.some(
			(release) =>
				release.skillId === skill.id && release.contentSha256 === sha256 && release.state === "revoked",
		);
		const standing = standingOf(sha256, inUse, evaluation, revoked);
		return {
			skill,
			sha256,
			standing,
			active: inUse,
			intact: inUse ? releaseIsIntact(inUse) : true,
			evaluation,
			approvable: !revoked && standing !== "in_use" && evaluation?.passed === true,
			usage: usage.get(skill.id) ?? { selected: 0, completed: 0, lastAt: null },
		};
	});
}

export type SkillDetail = SkillRow & {
	releases: SkillRelease[];
	evaluations: SkillEvaluation[];
	proposals: SkillProposal[];
	/** An earlier approved version the owner could return to. */
	rollbackTarget: SkillRelease | null;
};

export async function loadSkillDetail(sql: Sql, id: string): Promise<SkillDetail | null> {
	if (!SKILL_BY_ID.has(id)) return null;
	const [rows, releases, evaluations, proposals] = await Promise.all([
		loadSkillRows(sql),
		listReleases(sql, id),
		listEvaluations(sql, id, 6),
		listProposals(sql, { skillId: id }),
	]);
	const row = rows.find((candidate) => candidate.skill.id === id);
	if (!row) return null;
	const current = releases.find((release) => release.active);
	return {
		...row,
		releases,
		evaluations,
		proposals,
		rollbackTarget:
			releases.find(
				(release) =>
					release.state === "approved" &&
					!release.active &&
					(!current || release.approvedAt <= current.approvedAt),
			) ?? null,
	};
}

export const countStandings = (rows: readonly SkillRow[]) => ({
	total: rows.length,
	inUse: rows.filter((row) => row.active !== null).length,
	approvable: rows.filter((row) => row.approvable).length,
	notEvaluated: rows.filter((row) => row.standing === "not_evaluated").length,
	failed: rows.filter((row) => row.standing === "failed").length,
});
