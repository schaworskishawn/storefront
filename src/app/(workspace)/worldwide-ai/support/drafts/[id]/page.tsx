import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { MAX_DRAFT_CHARS, loadDraftReview } from "@/lib/worldwide-ai/workflows/relay-review";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { DraftReviewForm } from "@/ui/sections/worldwide-ai/draft-review-form";
import {
	Card,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	TaskStatePill,
	When,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Review a reply draft" };

type Props = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Review of one reply draft. What the reviewer must see before deciding comes first: the warnings, then the reply, then the
 * exact sources it was written from. The task is completed only after the saved draft has been read back and checked.
 */
export default async function DraftPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const review = await loadDraftReview(workspace.runtime.sql, id);
	if (!review) notFound();
	const { draft, sources, supportCase, task, decisions } = review;
	const now = workspace.runtime.now();
	const evidence = task.completionEvidence as {
		checks?: Array<{ name: string; ok: boolean }>;
		verifiedAt?: string;
	} | null;

	return (
		<>
			<PageHeader
				title={draft.subject ?? "Reply draft"}
				crumbs={[
					{ label: "Support Drafts", href: `${WORKSPACE_PATH}/support` },
					{ label: supportCase.subject, href: `${WORKSPACE_PATH}/support/cases/${supportCase.id}` },
					{ label: "Draft" },
				]}
				actions={
					<>
						<Pill
							tone={draft.state === "pending_review" ? "pink" : draft.state === "saved" ? "good" : "plain"}
						>
							{draft.state === "pending_review" ? "Awaiting review" : draft.state}
						</Pill>
						<Pill tone={draft.sourceStatus === "ok" ? "good" : "warn"}>
							Sources:{" "}
							{draft.sourceStatus === "ok"
								? "current"
								: draft.sourceStatus === "stale"
									? "out of date"
									: "none matched"}
						</Pill>
					</>
				}
			/>

			<div className="wai-split">
				<div className="wai-stack">
					{draft.state === "pending_review" ? (
						<Card title="Decide" accent>
							<DraftReviewForm
								draftId={draft.id}
								body={draft.body}
								warnings={draft.warnings}
								sourceStatus={draft.sourceStatus}
								maxLength={MAX_DRAFT_CHARS}
							/>
						</Card>
					) : (
						<Card title="The reply">
							<pre className="wai-pre">{draft.body}</pre>
							{draft.warnings.length > 0 && (
								<div style={{ marginTop: 12 }}>
									<Notice tone="warn" title="Warnings shown to the reviewer:">
										<ul>
											{draft.warnings.map((warning) => (
												<li key={warning}>{warning}</li>
											))}
										</ul>
									</Notice>
								</div>
							)}
						</Card>
					)}

					{draft.state === "saved" && (
						<Card title="Saved, and checked">
							{task.state === "completed" && evidence?.checks ? (
								<>
									<p style={{ marginTop: 0 }}>
										After saving, the application read the draft back and ran these checks. The task was
										completed only because every one passed. Nothing was sent to the customer.
									</p>
									<ul className="wai-list">
										{evidence.checks.map((check) => (
											<li key={check.name}>
												<span>{check.name}</span>
												<Pill tone={check.ok ? "good" : "bad"}>{check.ok ? "Passed" : "Failed"}</Pill>
											</li>
										))}
									</ul>
								</>
							) : (
								<Notice tone="warn" title="The save could not be confirmed.">
									{task.error ?? "The task is not completed."}{" "}
									<Link href={taskHref(task.id)}>Open the task</Link>
								</Notice>
							)}
						</Card>
					)}

					<Card title="The customer's message">
						<pre className="wai-pre">{supportCase.message}</pre>
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Sources this was written from">
						{sources.length === 0 ? (
							<Empty>
								No approved document matched this case, so this is a holding reply written by the system, not
								by the model.
							</Empty>
						) : (
							<ul className="wai-list">
								{sources.map((source) => (
									<li key={source.id}>
										<span>
											<Link href={`${WORKSPACE_PATH}/knowledge/${source.documentId}`}>{source.title}</Link>
											<br />
											<span className="wai-muted wai-small">
												Version {source.version} · read {formatOpsDateTime(source.retrievedAt)} ·{" "}
												<span className="wai-mono">{source.contentSha256.slice(0, 12)}…</span>
											</span>
											{source.excerpt && (
												<>
													<br />
													<span className="wai-small">“{source.excerpt}”</span>
												</>
											)}
										</span>
										<span className="wai-row">
											<Pill tone={source.cited ? "info" : "plain"}>
												{source.cited ? "Cited" : "Retrieved, not cited"}
											</Pill>
											<Pill tone={source.freshness === "current" ? "good" : "warn"}>
												{source.freshness === "current" ? "Current" : "Out of date"}
											</Pill>
										</span>
									</li>
								))}
							</ul>
						)}
					</Card>

					<Card title="About this draft">
						<KeyValues
							items={[
								[
									"Case",
									<Link key="c" href={`${WORKSPACE_PATH}/support/cases/${supportCase.id}`}>
										{supportCase.subject}
									</Link>,
								],
								[
									"Task",
									<span key="t">
										<Link href={taskHref(task.id)}>{task.id.slice(0, 8)}</Link>{" "}
										<TaskStatePill state={task.state} />
									</span>,
								],
								[
									"Written by",
									draft.model
										? `${draft.model} (prompt ${draft.promptVersion ?? "unversioned"})`
										: "The system (holding reply)",
								],
								["Created", <When key="w" at={draft.createdAt} now={now} />],
								["Edited by a person", draft.editedBy ? "Yes" : "No"],
								[
									"Text checksum",
									<span key="h" className="wai-mono">
										{draft.bodySha256.slice(0, 16)}…
									</span>,
								],
							]}
						/>
					</Card>

					<Card title="Decisions">
						{decisions.length === 0 ? (
							<Empty>No decision yet.</Empty>
						) : (
							<ul className="wai-list">
								{decisions.map((decision) => (
									<li key={`${decision.at}-${decision.decision}`}>
										<span>
											{decision.decision} by {decision.reviewerLabel ?? "a person"}
											{decision.note ? `: ${decision.note}` : ""}
										</span>
										<span className="wai-muted wai-small">{formatOpsDateTime(decision.at)}</span>
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
