import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import type { Actor } from "../types";
import { SKILLS } from "./catalog";
import { hashOfSkill, type SkillDefinition } from "./types";

/**
 * Lessons from review decisions.
 *
 * A learning event is made from each saved review of an agent's work: which task, which agent, which version of which
 * procedure the work followed, and whether a person accepted it as it was, corrected it, or rejected it. Events are derived
 * from the review rows themselves, one per review, so a saved review can't lose its event and reading the reviews twice
 * adds nothing.
 *
 * When reviewers have corrected or rejected enough results that followed the same version of a procedure, one proposal is
 * raised against it with those reviews as evidence. The workspace writes no new wording and changes nothing: the proposal
 * waits for a person, and the procedure in use stays exactly as approved until a new version is written, evaluated and
 * approved by the owner. One review is never enough, and what was already decided is not raised again.
 *
 * This is counting, done by code. Nothing here is an agent judging its own work, and a rate is a rate over the reviews that
 * happened: it says nothing about work nobody reviewed.
 */

export const LESSON_POLICY = {
	/** How many corrected or rejected reviews of one version of a procedure it takes to raise a proposal. */
	minimumCorrections: 2,
} as const;

/** Who raises a proposal from reviews. It is the application, and it is recorded as such. */
export const LEARNING_ACTOR: Actor = { kind: "system", label: "learning" };

export type LearningOutcome = "accepted" | "corrected" | "rejected";

export type LearningEvent = {
	id: string;
	reviewId: string;
	subjectType: "work_product" | "draft";
	subjectId: string;
	taskId: string;
	agent: string;
	skillId: string | null;
	skillVersion: number | null;
	outcome: LearningOutcome;
	reviewer: string;
	reviewedAt: string;
};

const EVENT_COLUMNS = `id, review_id, subject_type, subject_id, task_id, agent, skill_id, skill_version, outcome, reviewer, reviewed_at`;

const toEvent = (r: Row): LearningEvent => ({
	id: r.id as string,
	reviewId: r.review_id as string,
	subjectType: r.subject_type as LearningEvent["subjectType"],
	subjectId: r.subject_id as string,
	taskId: r.task_id as string,
	agent: r.agent as string,
	skillId: (r.skill_id as string | null) ?? null,
	skillVersion: r.skill_version === null || r.skill_version === undefined ? null : Number(r.skill_version),
	outcome: r.outcome as LearningOutcome,
	reviewer: r.reviewer as string,
	reviewedAt: iso(r.reviewed_at) as string,
});

/**
 * Makes a learning event for every final review of an agent's work that doesn't have one yet, and returns how many it made.
 * Safe to run at any time and any number of times.
 *
 * - A result that was accepted or rejected is one event.
 * - A draft that was saved is "accepted" when it was saved as written and "corrected" when a person changed it first. An
 *   edit on the way is not an event of its own: it is why the save counts as corrected.
 * - Demonstration runs and one person's own work are left out: neither is evidence about the business's work.
 */
export async function ingestLearningEvents(sql: Sql): Promise<number> {
	const products = await sql.query(
		`insert into wai_learning_events (review_id, subject_type, subject_id, task_id, agent, skill_id, skill_version, skill_sha256,
			outcome, reviewer, reviewed_at)
		 select r.id, 'work_product', r.subject_id, t.id, t.owner_role, i.skill_id, i.version, i.content_sha256,
			case when r.decision = 'approved' then 'accepted' else 'rejected' end, r.reviewer, r.at
		 from wai_reviews r
		 join wai_work_products p on p.id::text = r.subject_id
		 join wai_tasks t on t.id = p.task_id
		 left join wai_skill_invocations i on i.task_id = t.id and i.role = 'primary'
		 where r.subject_type = 'work_product' and r.decision in ('approved', 'rejected')
			and p.demo = false and t.demo = false and t.scope = 'business'
		 on conflict (review_id) do nothing`,
	);
	const drafts = await sql.query(
		`insert into wai_learning_events (review_id, subject_type, subject_id, task_id, agent, skill_id, skill_version, skill_sha256,
			outcome, reviewer, reviewed_at)
		 select r.id, 'draft', r.subject_id, t.id, t.owner_role, i.skill_id, i.version, i.content_sha256,
			case
				when r.decision = 'rejected' then 'rejected'
				when r.before_sha256 is distinct from r.after_sha256 then 'corrected'
				when exists (select 1 from wai_reviews e where e.subject_type = 'draft' and e.subject_id = r.subject_id
					and e.decision = 'edited') then 'corrected'
				else 'accepted'
			end, r.reviewer, r.at
		 from wai_reviews r
		 join wai_drafts d on d.id::text = r.subject_id
		 join wai_tasks t on t.id = d.task_id
		 left join wai_skill_invocations i on i.task_id = t.id and i.role = 'primary'
		 where r.subject_type = 'draft' and r.decision in ('approved', 'rejected')
			and t.demo = false and t.scope = 'business'
		 on conflict (review_id) do nothing`,
	);
	return (products.rowCount ?? 0) + (drafts.rowCount ?? 0);
}

export async function listLearningEvents(
	sql: Sql,
	filter: { skillId?: string; agent?: string; limit?: number } = {},
): Promise<LearningEvent[]> {
	const where: string[] = [];
	const values: unknown[] = [];
	if (filter.skillId) where.push(`skill_id = $${values.push(filter.skillId)}`);
	if (filter.agent) where.push(`agent = $${values.push(filter.agent)}`);
	const { rows } = await sql.query(
		`select ${EVENT_COLUMNS} from wai_learning_events ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by reviewed_at desc, id limit $${values.push(Math.min(filter.limit ?? 200, 500))}`,
		values,
	);
	return rows.map(toEvent);
}

export type Scorecard = {
	agent: string;
	reviewed: number;
	accepted: number;
	corrected: number;
	rejected: number;
	/** Accepted as it was, as a share of what was reviewed, to one decimal place. Null when nothing was reviewed. */
	acceptedPercent: string | null;
	firstReview: string | null;
	lastReview: string | null;
};

const percent = (part: number, whole: number): string | null =>
	whole === 0 ? null : (Math.round((part * 1000) / whole) / 10).toFixed(1);

/**
 * How each agent's reviewed work went, counted from the learning events. The denominator is the reviews that happened:
 * work nobody reviewed isn't in it, and an agent with no reviewed work has no rate at all rather than a zero.
 */
export async function scorecards(sql: Sql): Promise<Scorecard[]> {
	const { rows } = await sql.query(
		`select agent, count(*)::int as reviewed,
			count(*) filter (where outcome = 'accepted')::int as accepted,
			count(*) filter (where outcome = 'corrected')::int as corrected,
			count(*) filter (where outcome = 'rejected')::int as rejected,
			min(reviewed_at) as first_review, max(reviewed_at) as last_review
		 from wai_learning_events group by agent order by agent`,
	);
	return rows.map((r) => ({
		agent: r.agent as string,
		reviewed: Number(r.reviewed),
		accepted: Number(r.accepted),
		corrected: Number(r.corrected),
		rejected: Number(r.rejected),
		acceptedPercent: percent(Number(r.accepted), Number(r.reviewed)),
		firstReview: iso(r.first_review),
		lastReview: iso(r.last_review),
	}));
}

const PROPOSED_CHANGE =
	"Raised by the workspace from review decisions, not written by a person. It proposes no wording. Read the reviews listed as evidence, with the reviewers' own notes, and decide what the procedure should say instead. Until a new version is written, evaluated and approved by the owner, the procedure in use stays exactly as it is.";

/** `fresh` is how many of the corrections were not part of a proposal already decided, or null when none was. */
const summaryFor = (skill: SkillDefinition, bad: number, reviewed: number, fresh: number | null): string =>
	`Reviewers corrected or rejected ${bad} of ${reviewed} reviewed result${reviewed === 1 ? "" : "s"} that followed version ${skill.version} of this procedure.${
		fresh === null ? "" : ` ${fresh} of those have not been put to you before.`
	}`;

/**
 * Raises, or adds to, one proposal per procedure from the corrected and rejected reviews of work that followed its current
 * version. It takes at least LESSON_POLICY.minimumCorrections of them that haven't already been put to the owner: reviews
 * a decided proposal rested on are not raised a second time. Work that followed an older version is evidence about a
 * procedure that has since changed, and is left out.
 */
export async function proposeLessons(
	sql: Sql,
	catalog: readonly SkillDefinition[] = SKILLS,
): Promise<{ raised: string[]; added: string[] }> {
	const raised: string[] = [];
	const added: string[] = [];
	const { rows } = await sql.query<{ skill_id: string; skill_version: number }>(
		`select distinct skill_id, skill_version from wai_learning_events where skill_id is not null`,
	);
	for (const skill of catalog) {
		if (!rows.some((r) => r.skill_id === skill.id && Number(r.skill_version) === skill.version)) continue;
		const sha = hashOfSkill(skill);
		const outcome = await sql.transaction(async (tx) => {
			const events = await tx.query<{ review_id: string; outcome: string }>(
				`select review_id, outcome from wai_learning_events
				 where skill_id = $1 and skill_version = $2 and skill_sha256 = $3 order by reviewed_at, id`,
				[skill.id, skill.version, sha],
			);
			const bad = events.rows.filter((e) => e.outcome !== "accepted").map((e) => e.review_id);
			const decided = await tx.query<{ evidence: unknown }>(
				`select evidence from wai_skill_proposals where skill_id = $1 and origin = 'reviews' and state <> 'open'`,
				[skill.id],
			);
			const settled = new Set(
				decided.rows.flatMap(
					(r) => (typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence) as string[],
				),
			);
			const fresh = bad.filter((id) => !settled.has(id));
			if (fresh.length < LESSON_POLICY.minimumCorrections) return null;
			const summary = summaryFor(
				skill,
				bad.length,
				events.rows.length,
				fresh.length === bad.length ? null : fresh.length,
			);
			const open = await tx.query<{ id: string; evidence: unknown }>(
				`select id, evidence from wai_skill_proposals where skill_id = $1 and origin = 'reviews' and state = 'open' for update`,
				[skill.id],
			);
			if (open.rows[0]) {
				const before = (
					typeof open.rows[0].evidence === "string"
						? JSON.parse(open.rows[0].evidence)
						: open.rows[0].evidence
				) as string[];
				if (fresh.every((id) => before.includes(id))) return null;
				await tx.query(
					`update wai_skill_proposals set evidence = $2::jsonb, evidence_updated_at = now(), summary = $3 where id = $1`,
					[open.rows[0].id, json(fresh), summary],
				);
				return { kind: "added" as const, id: open.rows[0].id, evidence: fresh.length };
			}
			const inserted = await tx.query<{ id: string }>(
				`insert into wai_skill_proposals (skill_id, base_version, base_sha256, summary, proposed_change, source_type, origin,
					evidence, evidence_updated_at, created_by)
				 values ($1,$2,$3,$4,$5,'none','reviews',$6::jsonb, now(), 'system:learning') returning id`,
				[skill.id, skill.version, sha, summary, PROPOSED_CHANGE, json(fresh)],
			);
			return { kind: "raised" as const, id: inserted.rows[0].id, evidence: fresh.length };
		});
		if (!outcome) continue;
		(outcome.kind === "raised" ? raised : added).push(skill.id);
		await audit(sql, {
			actor: LEARNING_ACTOR,
			action: outcome.kind === "raised" ? "skill.lesson.raise" : "skill.lesson.add_evidence",
			subject: skill.id,
			outcome: "allowed",
			detail: { proposal: outcome.id, version: skill.version, reviews: outcome.evidence },
		});
	}
	return { raised, added };
}

/** Reads the reviews, then raises what they add up to. Idempotent: running it again with nothing new does nothing. */
export async function learnFromReviews(
	sql: Sql,
	catalog: readonly SkillDefinition[] = SKILLS,
): Promise<{ events: number; raised: string[]; added: string[] }> {
	const events = await ingestLearningEvents(sql);
	return { events, ...(await proposeLessons(sql, catalog)) };
}

export type EvidenceReview = {
	reviewId: string;
	subjectType: "work_product" | "draft";
	subjectId: string;
	taskId: string;
	outcome: LearningOutcome;
	/** What the reviewer wrote. Shown from where it is kept, to people who can already read reviews. */
	note: string | null;
	reviewedAt: string;
};

/** The reviews a proposal rests on, with each reviewer's note, newest first. */
export async function evidenceFor(sql: Sql, reviewIds: readonly string[]): Promise<EvidenceReview[]> {
	if (reviewIds.length === 0) return [];
	const { rows } = await sql.query(
		`select e.review_id, e.subject_type, e.subject_id, e.task_id, e.outcome, r.note, e.reviewed_at
		 from wai_learning_events e join wai_reviews r on r.id = e.review_id
		 where e.review_id = any($1::uuid[]) order by e.reviewed_at desc`,
		[reviewIds],
	);
	return rows.map((r) => ({
		reviewId: r.review_id as string,
		subjectType: r.subject_type as EvidenceReview["subjectType"],
		subjectId: r.subject_id as string,
		taskId: r.task_id as string,
		outcome: r.outcome as LearningOutcome,
		note: (r.note as string | null) ?? null,
		reviewedAt: iso(r.reviewed_at) as string,
	}));
}

/**
 * How many corrected or rejected reviews were of work that followed no approved procedure. Nothing can be raised from
 * those, because there is no procedure for a proposal to be against, and the screen says so rather than staying silent.
 */
export async function correctionsWithoutProcedure(sql: Sql): Promise<number> {
	const { rows } = await sql.query<{ n: number }>(
		`select count(*)::int as n from wai_learning_events where skill_id is null and outcome <> 'accepted'`,
	);
	return Number(rows[0]?.n ?? 0);
}
