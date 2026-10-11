import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	BACKENDS,
	CHECK_RUNNERS,
	JOB_TYPES,
	checkStanding,
	getCodingJob,
} from "@/lib/worldwide-ai/engineering/coding";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { codingAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	When,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Coding job" };

type Props = { params: Promise<{ id: string }> };

const ENGINEERING = `${WORKSPACE_PATH}/engineering`;
const IN_HAND = ["awaiting_backend", "queued", "running"];
const DIFF_SHOWN = 60_000;
const CHANGE_LABEL = { added: "Added", modified: "Changed", deleted: "Deleted", renamed: "Moved" } as const;

/** One coding job: what the worker is given, the change that came back, Verify's results on it, and the owner's decision. */
export default async function CodingJobPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const now = workspace.runtime.now();
	const found = await getCodingJob(workspace.runtime.sql, id);
	if (!found) notFound();
	const { job, packages, verifications } = found;
	const { envelope } = job;
	const current = packages.find((pkg) => pkg.status === "frozen") ?? null;
	const earlier = packages.filter((pkg) => pkg.status !== "frozen");
	const standing = current ? checkStanding(job, current, verifications) : [];
	const allPassed = standing.length > 0 && standing.every((check) => check.state === "passed");

	return (
		<>
			<PageHeader
				title={`Coding job on ${job.repositoryId}`}
				crumbs={[
					{ label: "Engineering", href: ENGINEERING },
					{ label: "Coding work", href: `${ENGINEERING}/coding` },
					{ label: job.repositoryId },
				]}
				lead={envelope.goal}
				actions={<Pill>{JOB_TYPES[job.jobType]}</Pill>}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{job.status === "awaiting_backend" && (
						<Notice tone="warn" title="Nothing has run.">
							{job.statusDetail} This job is recorded and waiting. No patch and no check result exists for it.
						</Notice>
					)}
					{job.status === "rejected" && (
						<Notice tone="bad" title="The returned package was refused and not kept.">
							{job.statusDetail}
						</Notice>
					)}
					{job.status === "cancelled" && <Notice tone="info">{job.statusDetail}</Notice>}

					{current ? (
						<>
							<Card
								title="The change that came back"
								aside={
									<Pill tone={current.decision === "approved" ? "good" : current.decision ? "warn" : "pink"}>
										{current.decision === "approved"
											? "Approved"
											: current.decision === "rejected"
												? "Rejected"
												: "Awaiting a decision"}
									</Pill>
								}
								accent={!current.decision}
							>
								<p style={{ marginTop: 0 }}>{current.summary}</p>
								<KeyValues
									items={[
										[
											"Candidate",
											<span key="c" className="wai-mono wai-small">
												{current.candidateSha256}
											</span>,
										],
										[
											"Starts from",
											<span key="b" className="wai-mono wai-small">
												{current.baseCommit}
											</span>,
										],
										["Frozen", <When key="f" at={current.frozenAt} now={now} />],
									]}
								/>
								<DataTable
									caption="Every file the diff touches. A package whose list and diff disagree is refused."
									columns={["File", "What"]}
									rows={current.files.map((file) => [
										<span key="p" className="wai-mono wai-small">
											{file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
										</span>,
										CHANGE_LABEL[file.change],
									])}
								/>
							</Card>

							<Card
								title="Verify’s checks on this exact candidate"
								aside={
									<Pill tone={allPassed ? "good" : "warn"}>
										{allPassed ? "All passed" : "Not all passed"}
									</Pill>
								}
							>
								<DataTable
									caption="Verify's newest result for each check the job asked for. A result for any other candidate doesn't count here."
									columns={["Check", "Verify", "Exit status", "Where it ran", "When"]}
									rows={standing.map((check) => [
										CHECK_RUNNERS[check.runnerId],
										<Pill
											key="s"
											tone={check.state === "passed" ? "good" : check.state === "failed" ? "bad" : "plain"}
										>
											{check.state === "passed" ? "Passed" : check.state === "failed" ? "Failed" : "Not run"}
										</Pill>,
										check.latest ? String(check.latest.exitStatus) : "—",
										check.latest?.environment ?? "—",
										check.latest ? <When key="w" at={check.latest.recordedAt} now={now} /> : "—",
									])}
								/>
								{current.buildChecks.length > 0 && (
									<p className="wai-help">
										The backend’s own checks, for information only:{" "}
										{current.buildChecks
											.map(
												(check) =>
													`${CHECK_RUNNERS[check.runnerId as keyof typeof CHECK_RUNNERS] ?? check.runnerId} exited ${check.exitStatus}`,
											)
											.join(", ")}
										. They don’t stand in for Verify’s.
									</p>
								)}
							</Card>

							<Card title="The diff">
								<pre className="wai-pre" tabIndex={0} aria-label="The change, as a unified diff">
									{current.diff.slice(0, DIFF_SHOWN)}
								</pre>
								{current.diff.length > DIFF_SHOWN && (
									<p className="wai-help">
										The first {DIFF_SHOWN.toLocaleString("en-CA")} of{" "}
										{current.diff.length.toLocaleString("en-CA")} characters are shown. The whole diff is
										stored and is what the candidate’s checksum covers.
									</p>
								)}
							</Card>

							<Card title="Decision">
								{current.decision ? (
									<Notice
										tone={current.decision === "approved" ? "good" : "warn"}
										title={
											current.decision === "approved" ? "Approved by the owner." : "Rejected by the owner."
										}
									>
										{current.decisionNote} <When at={current.decidedAt} now={now} />
										{current.decision === "approved" &&
											" Approval is a recorded decision on this candidate. Nothing was merged, pushed or deployed."}
									</Notice>
								) : workspace.isOwner ? (
									<>
										<p className="wai-help" style={{ marginTop: 0 }}>
											Your decision is for this exact candidate. If the change comes back different, it is a
											new candidate and this decision does not apply to it. Approving merges, pushes and
											deploys nothing.
										</p>
										{allPassed ? (
											<ButtonForm
												action={codingAction}
												hidden={{
													intent: "package.review",
													packageId: current.id,
													candidateSha256: current.candidateSha256,
													decision: "approved",
												}}
												label="Approve this candidate"
												tone="primary"
												note={{ label: "On what basis", required: true }}
												idPrefix="approve"
											/>
										) : (
											<p className="wai-muted wai-small">
												It can’t be approved until Verify has passed every check above on this candidate.
											</p>
										)}
										<div style={{ marginTop: 8 }}>
											<ButtonForm
												action={codingAction}
												hidden={{
													intent: "package.review",
													packageId: current.id,
													candidateSha256: current.candidateSha256,
													decision: "rejected",
												}}
												label="Reject this candidate"
												tone="danger"
												note={{ label: "Why", required: true }}
												idPrefix="reject"
											/>
										</div>
									</>
								) : (
									<p className="wai-muted wai-small" style={{ margin: 0 }}>
										Only the owner can approve or reject a change.
									</p>
								)}
							</Card>
						</>
					) : (
						job.status !== "rejected" &&
						job.status !== "cancelled" && (
							<Card title="The change that came back">
								<Empty>Nothing has come back. No change exists for this job.</Empty>
							</Card>
						)
					)}

					{earlier.length > 0 && (
						<Card title="Earlier candidates" aside={<Pill>{earlier.length}</Pill>}>
							<DataTable
								caption="Replaced by a newer candidate. Kept as they were; their results and decisions do not carry over."
								columns={["Candidate", "Summary", "Decision", "Frozen"]}
								rows={earlier.map((pkg) => [
									<span key="c" className="wai-mono wai-small">
										{pkg.candidateSha256.slice(0, 16)}…
									</span>,
									pkg.summary,
									pkg.decision ?? "None",
									<When key="w" at={pkg.frozenAt} now={now} />,
								])}
							/>
						</Card>
					)}
				</div>

				<div className="wai-stack">
					<Card title="What the worker is given">
						<p className="wai-help" style={{ marginTop: 0 }}>
							Built by the server from the registered repository and the fixed list of checks. A returned
							package has to quote this envelope’s checksum to be accepted.
						</p>
						<KeyValues
							items={[
								["Backend", BACKENDS[job.backend].label],
								["Repository", envelope.repositoryId],
								[
									"Starts from",
									<span key="b" className="wai-mono wai-small">
										{envelope.baseCommit}
									</span>,
								],
								["Finished when", envelope.expectedResult],
								["May touch", envelope.changeScope.join(", ") || "Nothing: this job changes no files"],
								[
									"Checks",
									envelope.checkRunners.map((runnerId) => CHECK_RUNNERS[runnerId]).join(", ") || "None",
								],
								["Limits", `${envelope.limits.maxTurns} turns, ${envelope.limits.maxMinutes} minutes`],
								["Asked for", <When key="w" at={job.createdAt} now={now} />],
								[
									"Envelope",
									<span key="e" className="wai-mono wai-small">
										{job.envelopeSha256.slice(0, 16)}…
									</span>,
								],
							]}
						/>
					</Card>
					{IN_HAND.includes(job.status) && (
						<Card title="Cancel">
							<p className="wai-help" style={{ marginTop: 0 }}>
								Cancelling frees the repository for another job. A cancelled job takes nothing back from a
								worker.
							</p>
							<ButtonForm
								action={codingAction}
								hidden={{ intent: "job.cancel", jobId: job.id }}
								label="Cancel this job"
								tone="danger"
								note={{ label: "Why", required: true }}
								idPrefix="cancel"
							/>
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
