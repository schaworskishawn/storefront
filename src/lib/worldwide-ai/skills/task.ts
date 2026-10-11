import type { Sql } from "../db/sql";
import { addTaskEvent } from "../tasks/repo";
import type { Actor, RoleId, TaskKind } from "../types";
import { pinned, procedureInstructions, resolveSkills, stillApproved, type SkillSelection } from "./resolver";
import { advanceInvocations, recordInvocations, type PinnedSkill } from "./store";

/**
 * The few calls a workflow makes to follow approved procedures: resolve them when the task starts running, add them to a
 * model's instructions, re-check them before anything is stored, and mark how far the task got. Kept in one place so the
 * function pipeline and the support-draft workflow do exactly the same thing.
 */

export type TaskSkills = { selection: SkillSelection; followed: PinnedSkill[] };

/** Resolves the procedures for a task, pins them to it, and writes what was chosen and turned away to its history. */
export async function beginSkills(
	sql: Sql,
	task: { id: string },
	actor: Actor,
	request: { agent: RoleId; functionId: TaskKind },
): Promise<TaskSkills> {
	const selection = await resolveSkills(sql, request);
	const followed = pinned(selection);
	// A retried run starts again from what is approved now, so what an interrupted attempt had selected is cleared first.
	await sql.query(`delete from wai_skill_invocations where task_id = $1 and stage <> 'completed'`, [task.id]);
	await recordInvocations(sql, task.id, followed, "selected");
	await addTaskEvent(sql, task.id, {
		kind: "skills_resolved",
		actor,
		roleId: request.agent,
		detail: {
			note: selection.note,
			selected: followed.map((skill) => ({
				skill: skill.skillId,
				version: skill.version,
				role: skill.role,
				checksum: skill.contentSha256.slice(0, 12),
			})),
			rejected: selection.rejected,
		},
	});
	return { selection, followed };
}

/** An agent's own instructions with the selected procedures after them. Unchanged when none was selected. */
export const withProcedures = (instructions: string, skills: TaskSkills): string =>
	[instructions, procedureInstructions(skills.selection)].filter(Boolean).join("\n\n");

export const markSkills = (sql: Sql, taskId: string, stage: "loaded" | "invoked" | "completed") =>
	advanceInvocations(sql, taskId, stage);

/**
 * Before a result is stored: are the procedures this task followed still the approved versions in use? Returns the sentence
 * to fail the task with when they aren't, or null when everything still stands.
 */
export async function lapsedSkills(sql: Sql, skills: TaskSkills): Promise<string | null> {
	const lapsed = await stillApproved(sql, skills.followed);
	if (!lapsed.length) return null;
	return `A procedure this task was following changed while it ran, so nothing was stored: ${lapsed
		.map((item) => `${item.skillId} (${item.reason})`)
		.join("; ")} Run it again to use what is approved now.`;
}
