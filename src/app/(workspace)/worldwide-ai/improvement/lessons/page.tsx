import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { SKILL_BY_ID } from "@/lib/worldwide-ai/skills/catalog";
import {
	LESSON_POLICY,
	correctionsWithoutProcedure,
	evidenceFor,
	scorecards,
	type EvidenceReview,
	type LearningOutcome,
} from "@/lib/worldwide-ai/skills/learning";
import { listProposals } from "@/lib/worldwide-ai/skills/store";
import { WORKSPACE_PATH, type RoleId } from "@/lib/worldwide-ai/types";
import { skillAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Empty,
	Notice,
	PageHeader,
	Pill,
	When,
	resultHref,
	taskHref,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Lessons from reviews" };

const IMPROVEMENT = `${WORKSPACE_PATH}/improvement`;
const OUTCOME: Record<LearningOutcome, { label: string; tone: Tone }> = {
	accepted: { label: "Accepted as it was", tone: "good" },
	corrected: { label: "Corrected by a person", tone: "warn" },
	rejected: { label: "Rejected", tone: "bad" },
};
const agentName = (id: string) => (id in ROLE_BY_ID ? ROLE_BY_ID[id as RoleId].name : id);

/** What review decisions add up to: how each agent's reviewed work went, and the proposals the workspace raised from them. */
export default async function LessonsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [cards, proposals, unattributed] = await Promise.all([
		scorecards(sql),
		listProposals(sql),
		correctionsWithoutProcedure(sql),
	]);
	const fromReviews = proposals.filter((proposal) => proposal.origin === "reviews");
	const open = fromReviews.filter((proposal) => proposal.state === "open");
	const decided = fromReviews.filter((proposal) => proposal.state !== "open");
	const evidence = new Map<string, EvidenceReview[]>(
		await Promise.all(
			open.map(async (proposal) => [proposal.id, await evidenceFor(sql, proposal.evidence)] as const),
		),
	);

	return (
		<>
			<PageHeader
				title="Lessons from reviews"
				crumbs={[{ label: "Improvement", href: IMPROVEMENT }, { label: "Lessons from reviews" }]}
				lead={`Every time a person accepts, corrects or rejects an agent's work, that decision is counted here. When reviewers have corrected or rejected at least ${LESSON_POLICY.minimumCorrections} results that followed the same version of a procedure, the workspace raises one proposal against it, with those reviews as evidence. It writes no new wording and changes nothing: a procedure in use stays as approved until a person writes a new version and it is evaluated and approved.`}
				actions={
					<Link href={`${WORKSPACE_PATH}/skills`} className="wai-btn">
						Skills
					</Link>
				}
			/>
			{unattributed > 0 && (
				<Notice tone="info" title="Some corrections can’t lead to a proposal.">
					{unattributed} corrected or rejected review{unattributed === 1 ? " was" : "s were"} of work that
					followed no approved procedure, so there is no procedure for a proposal to be against. They are
					still counted below. Approve the agent’s skill and later reviews of its work can add up to one.
				</Notice>
			)}
			<div className="wai-stack" style={{ marginTop: unattributed > 0 ? 16 : 0 }}>
				<Card
					title="Raised from reviews, waiting for you"
					aside={<Pill tone={open.length ? "pink" : "plain"}>{open.length}</Pill>}
					accent={open.length > 0}
				>
					{open.length === 0 ? (
						<Empty>
							Nothing is waiting. A proposal is raised only when several reviews say the same procedure fell
							short; one review is never enough.
						</Empty>
					) : (
						<ul className="wai-list">
							{open.map((proposal) => (
								<li key={proposal.id} style={{ display: "block" }}>
									<div className="wai-row" style={{ gap: 8, flexWrap: "wrap" }}>
										<strong>
											<Link href={`${WORKSPACE_PATH}/skills/${proposal.skillId}`}>
												{SKILL_BY_ID.get(proposal.skillId)?.title ?? proposal.skillId}
											</Link>
										</strong>
										<Pill>Version {proposal.baseVersion}</Pill>
									</div>
									<p style={{ margin: "4px 0" }}>{proposal.summary}</p>
									<DataTable
										caption="The reviews it rests on, newest first, with what each reviewer wrote."
										columns={["How it went", "What the reviewer wrote", "The work", "When"]}
										rows={(evidence.get(proposal.id) ?? []).map((review) => [
											<Pill key="o" tone={OUTCOME[review.outcome].tone}>
												{OUTCOME[review.outcome].label}
											</Pill>,
											review.note ?? "No note. The reviewer changed the text before saving it.",
											<Link
												key="t"
												href={
													review.subjectType === "work_product"
														? resultHref(review.subjectId)
														: taskHref(review.taskId)
												}
											>
												{review.subjectType === "work_product" ? "The result" : "The task"}
											</Link>,
											<When key="w" at={review.reviewedAt} now={now} />,
										])}
									/>
									<p className="wai-help">{proposal.proposedChange}</p>
									{workspace.isOwner ? (
										<div className="wai-row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
											<ButtonForm
												action={skillAction}
												hidden={{ intent: "decide", proposalId: proposal.id, decision: "accepted" }}
												label="The procedure should change"
												tone="primary"
												small
												note={{ label: "What should change", placeholder: "Optional" }}
												idPrefix={`want-${proposal.id}`}
											/>
											<ButtonForm
												action={skillAction}
												hidden={{ intent: "decide", proposalId: proposal.id, decision: "declined" }}
												label="Decline"
												small
												note={{ label: "Why not", placeholder: "Optional" }}
												idPrefix={`decline-${proposal.id}`}
											/>
										</div>
									) : (
										<p className="wai-muted wai-small">Only the owner decides a proposal.</p>
									)}
								</li>
							))}
						</ul>
					)}
				</Card>

				<Card title="How reviewed work went, by agent" aside={<Pill>{cards.length}</Pill>}>
					{cards.length === 0 ? (
						<Empty>No agent’s work has been reviewed yet, so there is nothing to count.</Empty>
					) : (
						<DataTable
							caption="Counted from review decisions on the business's own work. Work nobody reviewed isn't in these numbers, and an agent with none reviewed isn't listed rather than shown as zero."
							columns={[
								"Agent",
								"Reviewed",
								"Accepted as it was",
								"Corrected",
								"Rejected",
								"Accepted as it was, share",
								"Reviews from",
							]}
							numeric={[1, 2, 3, 4, 5]}
							rows={cards.map((card) => [
								<Link key="a" href={`${WORKSPACE_PATH}/team/${card.agent}`}>
									{agentName(card.agent)}
								</Link>,
								String(card.reviewed),
								String(card.accepted),
								String(card.corrected),
								String(card.rejected),
								card.acceptedPercent === null ? "—" : `${card.acceptedPercent}% of ${card.reviewed}`,
								<span key="p">
									<When at={card.firstReview} now={now} /> to <When at={card.lastReview} now={now} />
								</span>,
							])}
						/>
					)}
					<p className="wai-help">
						A share over a handful of reviews moves a lot with each one, and reviewers pick what to review.
						This is a count of what happened, not a measure of how good an agent is, and a better number gives
						an agent no more permission to do anything.
					</p>
				</Card>

				{decided.length > 0 && (
					<Card title="Already decided" aside={<Pill>{decided.length}</Pill>}>
						<DataTable
							caption="Newest first. The reviews a decided proposal rested on are not raised again."
							columns={["Procedure", "What was raised", "Decision", "Note", "Decided"]}
							rows={decided.map((proposal) => [
								<Link key="s" href={`${WORKSPACE_PATH}/skills/${proposal.skillId}`}>
									{SKILL_BY_ID.get(proposal.skillId)?.title ?? proposal.skillId}
								</Link>,
								proposal.summary,
								proposal.state === "accepted" ? "The procedure should change" : "Declined",
								proposal.decisionNote ?? "—",
								<When key="w" at={proposal.decidedAt} now={now} />,
							])}
						/>
					</Card>
				)}
			</div>
		</>
	);
}
