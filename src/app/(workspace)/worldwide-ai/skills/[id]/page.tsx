import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { TOOLS } from "@/lib/worldwide-ai/agents/tools";
import { collectionLabel } from "@/lib/worldwide-ai/atlas/collections";
import { FUNCTIONS } from "@/lib/worldwide-ai/functions/registry";
import { SKILL_BY_ID } from "@/lib/worldwide-ai/skills/catalog";
import { MAX_FOUNDATIONS_PER_STEP } from "@/lib/worldwide-ai/skills/resolver";
import type { EvaluationCase } from "@/lib/worldwide-ai/skills/store";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { skillAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { STANDING_LABELS, loadSkillDetail } from "@/lib/worldwide-ai/web/skills";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Bullets,
	Card,
	DataTable,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	When,
	agentHref,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: SKILL_BY_ID.get(id)?.title ?? "Skill" };
}

const OUTCOME_TONE: Record<EvaluationCase["outcome"], Tone> = {
	passed: "good",
	failed: "bad",
	not_run: "plain",
};
const OUTCOME_LABEL: Record<EvaluationCase["outcome"], string> = {
	passed: "Passed",
	failed: "Failed",
	not_run: "Not run",
};

const person = (key: string | null) => (key ? key.replace(/^operator:.*/, "a person") : "nobody");

/** One skill: the procedure as written, what it is bound to, what its evaluation found, and its release history. */
export default async function SkillPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const detail = await loadSkillDetail(workspace.runtime.sql, id);
	if (!detail) notFound();
	const now = workspace.runtime.now();
	const { skill, active, evaluation } = detail;
	const isPack = skill.kind === "role-pack";

	return (
		<>
			<PageHeader
				title={skill.title}
				crumbs={[
					{ label: "Improvement", href: `${WORKSPACE_PATH}/improvement` },
					{ label: "Skills", href: `${WORKSPACE_PATH}/skills` },
					{ label: skill.title },
				]}
				lead={skill.description}
				actions={
					<Pill tone={active ? "good" : detail.standing === "evaluated" ? "pink" : "plain"}>
						{STANDING_LABELS[detail.standing]}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{!active && (
						<Notice tone="info" title="This skill is not guiding any work.">
							{isPack
								? "Its agent's function runs on the registry instructions until the owner approves a version."
								: "It is loaded only alongside an approved role pack, once it has an approved version of its own."}
						</Notice>
					)}
					{active && !detail.intact && (
						<Notice
							tone="bad"
							title="The stored package no longer matches the checksum it was approved under."
						>
							It is being refused for every task. Revoke it, then evaluate and approve the current version.
						</Notice>
					)}
					{active && active.contentSha256 !== detail.sha256 && (
						<Notice
							tone="warn"
							title={`Version ${active.version} is in use. Version ${skill.version} is not.`}
						>
							The procedure below is the version in the repository. It guides nothing until it has been
							evaluated and approved; until then work follows version {active.version} exactly as it was
							approved.
						</Notice>
					)}

					<Card title={`The procedure, version ${skill.version}`} accent>
						<h3 className="wai-h3">Use this when</h3>
						<Bullets items={skill.useWhen} />
						<h3 className="wai-h3">Do not use this when</h3>
						<Bullets items={skill.notWhen} />
						<h3 className="wai-h3">What it needs</h3>
						<Bullets items={skill.inputs} />
						<h3 className="wai-h3">Steps</h3>
						<ol className="wai-bullets">
							{skill.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
						<h3 className="wai-h3">What it produces</h3>
						<Bullets items={skill.outputs} />
						<h3 className="wai-h3">Checks before it is finished</h3>
						<Bullets items={skill.checks} />
						<h3 className="wai-h3">When something goes wrong</h3>
						<Bullets items={skill.failure} />
						<h3 className="wai-h3">Example</h3>
						<p style={{ margin: "0 0 6px" }}>
							<strong>Request:</strong> {skill.example.request}
						</p>
						<p style={{ margin: 0 }}>
							<strong>Result:</strong> {skill.example.result}
						</p>
						<h3 className="wai-h3">Limits</h3>
						<Bullets items={skill.limitations} />
					</Card>

					<Card
						title="Last evaluation of this version"
						aside={
							evaluation ? (
								<Pill tone={evaluation.passed ? "good" : "bad"}>
									{evaluation.passed ? "Passed" : "Did not pass"}
								</Pill>
							) : undefined
						}
					>
						{evaluation ? (
							<>
								<p className="wai-help" style={{ marginTop: 0 }}>
									Run <When at={evaluation.ranAt} now={now} /> in an isolated database, by{" "}
									{person(evaluation.ranBy)}. {evaluation.totals.passed} of {evaluation.totals.total} cases
									passed, {evaluation.totals.failed} failed, {evaluation.totals.notRun} could not be run here.
									A case that was not run is not a pass.
								</p>
								<DataTable
									caption="A critical case that fails blocks approval outright."
									columns={["Case", "Outcome", "What was found"]}
									rows={evaluation.cases.map((c) => [
										<span key="t">
											{c.title}
											{c.critical && (
												<>
													{" "}
													<Pill>Critical</Pill>
												</>
											)}
										</span>,
										<Pill key="o" tone={OUTCOME_TONE[c.outcome]}>
											{OUTCOME_LABEL[c.outcome]}
										</Pill>,
										c.detail,
									])}
								/>
							</>
						) : (
							<Empty>
								This exact version has not been evaluated under the current set of checks. It can’t be
								approved until it has.
							</Empty>
						)}
						<div style={{ marginTop: 12 }}>
							<ButtonForm
								action={skillAction}
								hidden={{ intent: "evaluate", skillId: skill.id }}
								label={evaluation ? "Evaluate again" : "Evaluate this version"}
								idPrefix="evaluate"
							/>
						</div>
					</Card>

					<Card title="Improvement proposals">
						<p className="wai-help" style={{ marginTop: 0 }}>
							If a result showed this procedure could be better, write down what should change. A proposal
							changes nothing by itself. The procedure is changed in the repository, becomes a new version,
							and guides work only after that version is evaluated and approved here.
						</p>
						{detail.proposals.length > 0 && (
							<ul className="wai-list">
								{detail.proposals.map((proposal) => (
									<li key={proposal.id}>
										<div>
											<strong>{proposal.summary}</strong>{" "}
											<Pill
												tone={
													proposal.state === "open"
														? "pink"
														: proposal.state === "accepted"
															? "good"
															: "plain"
												}
											>
												{proposal.state === "open"
													? "Waiting for the owner"
													: proposal.state === "accepted"
														? "Wanted"
														: "Declined"}
											</Pill>
											<p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{proposal.proposedChange}</p>
											<p className="wai-muted wai-small" style={{ margin: 0 }}>
												Against version {proposal.baseVersion}, <When at={proposal.createdAt} now={now} />
												{proposal.sourceId ? `, from task ${proposal.sourceId}` : ""}
												{proposal.decisionNote ? `. Owner's note: ${proposal.decisionNote}` : ""}
											</p>
											{proposal.state === "open" && workspace.isOwner && (
												<div className="wai-row" style={{ gap: 12, marginTop: 8, alignItems: "flex-start" }}>
													<ButtonForm
														action={skillAction}
														hidden={{ intent: "decide", proposalId: proposal.id, decision: "accepted" }}
														label="This change is wanted"
														small
														idPrefix={`accept-${proposal.id}`}
													/>
													<ButtonForm
														action={skillAction}
														hidden={{ intent: "decide", proposalId: proposal.id, decision: "declined" }}
														label="Decline"
														tone="quiet"
														small
														idPrefix={`decline-${proposal.id}`}
													/>
												</div>
											)}
										</div>
									</li>
								))}
							</ul>
						)}
						<FieldsForm
							action={skillAction}
							hidden={{ intent: "propose", skillId: skill.id }}
							idPrefix="propose"
							submit="Record the proposal"
							fields={[
								{
									name: "summary",
									label: "What should improve",
									kind: "text",
									required: true,
									maxLength: 200,
									placeholder: "Drafts say 'about a month' where the policy says 30 days",
								},
								{
									name: "proposedChange",
									label: "The change to the procedure",
									kind: "textarea",
									required: true,
									rows: 4,
									help: "A step to add, reword or remove, or a check to add. Don't paste customer details.",
								},
								{
									name: "sourceId",
									label: "Task it came from (optional)",
									kind: "text",
									maxLength: 80,
									help: "The id of the task whose result prompted this.",
								},
							]}
						/>
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Standing">
						<KeyValues
							items={[
								["Kind", isPack ? "Role pack" : "Shared foundation"],
								["Version in the repository", skill.version],
								["Version in use", active ? active.version : "None"],
								[
									"Approved",
									active ? (
										<span key="a">
											<When at={active.approvedAt} now={now} /> by {person(active.approvedBy)}
										</span>
									) : (
										"Not approved"
									),
								],
								[
									"Checksum",
									<span key="c" className="wai-mono">
										{detail.sha256.slice(0, 16)}…
									</span>,
								],
								[
									"Followed by tasks",
									`${detail.usage.completed} completed of ${detail.usage.selected} selected`,
								],
							]}
						/>
						{workspace.isOwner ? (
							<div className="wai-stack" style={{ marginTop: 12, gap: 12 }}>
								{detail.approvable && (
									<ButtonForm
										action={skillAction}
										hidden={{ intent: "approve", skillId: skill.id }}
										label={`Approve version ${skill.version} and put it in use`}
										tone="primary"
										idPrefix="approve"
									/>
								)}
								{detail.rollbackTarget && (
									<ButtonForm
										action={skillAction}
										hidden={{ intent: "rollback", skillId: skill.id }}
										label={`Return to version ${detail.rollbackTarget.version}`}
										idPrefix="rollback"
									/>
								)}
								{active && (
									<ButtonForm
										action={skillAction}
										hidden={{ intent: "revoke", releaseId: active.id }}
										label={`Revoke version ${active.version}`}
										tone="danger"
										note={{ label: "Why it is being revoked", required: true }}
										idPrefix="revoke"
									/>
								)}
							</div>
						) : (
							<p className="wai-muted wai-small" style={{ marginBottom: 0 }}>
								Only the owner can approve, revoke or roll back a skill.
							</p>
						)}
					</Card>

					<Card title="What it is bound to">
						<h3 className="wai-h3" style={{ marginTop: 0 }}>
							{isPack ? "Agent" : `Agents that may follow it (${skill.agents.length})`}
						</h3>
						<p style={{ margin: 0 }}>
							{skill.agents.map((agent, index) => (
								<span key={agent}>
									{index > 0 && ", "}
									<Link href={agentHref(agent)}>{ROLE_BY_ID[agent].name}</Link>
								</span>
							))}
						</p>
						{isPack && (
							<>
								<h3 className="wai-h3">Functions it guides</h3>
								<Bullets items={skill.functions.map((kind) => FUNCTIONS.get(kind)?.action ?? kind)} />
								<h3 className="wai-h3">Supporting foundations</h3>
								<p className="wai-help" style={{ marginTop: 0 }}>
									In this order. Only the first {MAX_FOUNDATIONS_PER_STEP} with an approved version are loaded
									for a step.
								</p>
								<ol className="wai-bullets">
									{skill.foundations.map((foundation) => (
										<li key={foundation}>
											<Link href={`${WORKSPACE_PATH}/skills/${foundation}`}>
												{SKILL_BY_ID.get(foundation)?.title ?? foundation}
											</Link>
										</li>
									))}
								</ol>
								<h3 className="wai-h3">Tools it refers to</h3>
								<Bullets items={skill.tools.map((tool) => `${tool}: ${TOOLS[tool]?.summary ?? ""}`)} />
								<h3 className="wai-h3">Knowledge it refers to</h3>
								<Bullets
									items={skill.knowledge.map((collection) => collectionLabel(collection))}
									empty="None."
								/>
							</>
						)}
						<p className="wai-help" style={{ marginBottom: 0 }}>
							A skill never adds a tool or a permission. What an agent can use is its own registry list; a
							stored package that asks for more is refused.
						</p>
					</Card>

					<Card title="Release history">
						{detail.releases.length === 0 ? (
							<Empty>No version of this skill has been approved.</Empty>
						) : (
							<ul className="wai-list">
								{detail.releases.map((release) => (
									<li key={release.id}>
										<div>
											<strong>Version {release.version}</strong>{" "}
											<Pill tone={release.state === "revoked" ? "warn" : release.active ? "good" : "plain"}>
												{release.state === "revoked"
													? "Revoked"
													: release.active
														? "In use"
														: "Approved, not in use"}
											</Pill>
											<p className="wai-muted wai-small" style={{ margin: "4px 0 0" }}>
												Approved <When at={release.approvedAt} now={now} /> by {person(release.approvedBy)}.
												{release.revokedAt && (
													<>
														{" "}
														Revoked <When at={release.revokedAt} now={now} />: {release.revokeReason}
													</>
												)}
											</p>
										</div>
									</li>
								))}
							</ul>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
