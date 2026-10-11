import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { skillAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import {
	STANDING_LABELS,
	countStandings,
	loadSkillRows,
	type SkillRow,
	type SkillStanding,
} from "@/lib/worldwide-ai/web/skills";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Notice,
	PageHeader,
	Pill,
	Stat,
	When,
	agentHref,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Skills" };

const STANDING_TONE: Record<SkillStanding, Tone> = {
	in_use: "good",
	newer_waiting: "info",
	evaluated: "pink",
	failed: "bad",
	revoked: "warn",
	not_evaluated: "plain",
};

const skillHref = (id: string) => `${WORKSPACE_PATH}/skills/${id}`;

function Standing({ row }: { row: SkillRow }) {
	return (
		<span className="wai-row" style={{ gap: 6 }}>
			<Pill tone={STANDING_TONE[row.standing]}>{STANDING_LABELS[row.standing]}</Pill>
			{row.active && !row.intact && <Pill tone="bad">Stored package altered</Pill>}
		</span>
	);
}

const version = (row: SkillRow) =>
	row.active && row.active.version !== row.skill.version
		? `${row.active.version} in use, ${row.skill.version} waiting`
		: String(row.skill.version);

function evaluationCell(row: SkillRow, now: Date) {
	if (!row.evaluation) return <span className="wai-muted">Never</span>;
	const { totals } = row.evaluation;
	return (
		<span>
			{totals.passed} of {totals.total} passed
			{totals.notRun > 0 && <span className="wai-muted">, {totals.notRun} not run</span>}
			<br />
			<span className="wai-small">
				<When at={row.evaluation.ranAt} now={now} />
			</span>
		</span>
	);
}

/** Skills: every written procedure, whether a person has approved it, and whether it is guiding work. */
export default async function SkillsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const rows = await loadSkillRows(sql);
	const counts = countStandings(rows);
	const packs = rows.filter((row) => row.skill.kind === "role-pack");
	const foundations = rows.filter((row) => row.skill.kind === "foundation");

	return (
		<>
			<PageHeader
				title="Skills"
				crumbs={[{ label: "Improvement", href: `${WORKSPACE_PATH}/improvement` }, { label: "Skills" }]}
				lead="A skill is a written, tested procedure an agent follows for one of its functions. There are twelve shared foundations and one role pack for each of the 49 agents. A skill guides work only after its exact version has been evaluated and the owner has approved it."
			/>
			<div className="wai-stack">
				<div className="wai-grid wai-grid--4">
					<Stat value={`${counts.inUse} of ${counts.total}`} label="Approved and in use" />
					<Stat value={counts.approvable} label="Passed, waiting for the owner" />
					<Stat value={counts.notEvaluated} label="Not evaluated" />
					<Stat value={counts.failed} label="Failed evaluation" />
				</div>

				{counts.inUse === 0 && (
					<Notice tone="info" title="No skill is in use yet.">
						Every function runs on its agent’s registry instructions, exactly as before. To put the skills in
						use: evaluate them, look at what the evaluation found, then approve the ones you are satisfied
						with.
					</Notice>
				)}

				<Card title="Evaluate and approve">
					<p className="wai-help" style={{ marginTop: 0 }}>
						An evaluation runs each skill’s cases in a scratch database that shares nothing with live records.
						It checks that the package is a real procedure, that it asks for nothing its agents don’t have,
						and that the function behind it works: produces a verified result from its sample, refuses
						incomplete input, never does the same request twice, and stops when its agent is switched off. It
						does not judge how well a model writes; those cases are listed as not run.
					</p>
					<div className="wai-row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
						<ButtonForm
							action={skillAction}
							hidden={{ intent: "evaluate_all" }}
							label="Evaluate every skill"
							idPrefix="evaluate-all"
						/>
						{workspace.isOwner && counts.approvable > 0 ? (
							<ButtonForm
								action={skillAction}
								hidden={{ intent: "approve_passed" }}
								label={`Approve the ${counts.approvable} that passed`}
								tone="primary"
								idPrefix="approve-passed"
							/>
						) : workspace.isOwner ? (
							<p className="wai-muted wai-small" style={{ margin: 0 }}>
								Nothing is waiting for your approval.
							</p>
						) : (
							<p className="wai-muted wai-small" style={{ margin: 0 }}>
								Only the owner can approve, revoke or roll back a skill.
							</p>
						)}
					</div>
				</Card>

				<Card title="Role packs" aside={<Pill>{packs.length} agents</Pill>}>
					<DataTable
						caption="One role pack per agent, bound to that agent's own functions."
						columns={["#", "Agent", "Role pack", "Version", "Standing", "Last evaluation", "Followed"]}
						numeric={[0, 6]}
						rows={packs.map((row) => {
							const role = ROLE_BY_ID[row.skill.agents[0]];
							return [
								role.number,
								<Link key="a" href={agentHref(role.id)}>
									{role.name}
								</Link>,
								<Link key="s" href={skillHref(row.skill.id)}>
									{row.skill.title}
								</Link>,
								version(row),
								<Standing key="st" row={row} />,
								evaluationCell(row, now),
								row.usage.completed,
							];
						})}
					/>
				</Card>

				<Card title="Shared foundations" aside={<Pill>{foundations.length}</Pill>}>
					<DataTable
						caption="A foundation is followed only by the agents whose own role pack names it. At most two are loaded for one step."
						columns={["Foundation", "Used by", "Version", "Standing", "Last evaluation", "Followed"]}
						numeric={[5]}
						rows={foundations.map((row) => [
							<Link key="s" href={skillHref(row.skill.id)}>
								{row.skill.title}
							</Link>,
							`${row.skill.agents.length} agent${row.skill.agents.length === 1 ? "" : "s"}`,
							version(row),
							<Standing key="st" row={row} />,
							evaluationCell(row, now),
							row.usage.completed,
						])}
					/>
				</Card>
			</div>
		</>
	);
}
