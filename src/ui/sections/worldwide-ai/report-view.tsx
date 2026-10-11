import Link from "next/link";
import type { DailyReport, Priority, TaskLine } from "@/lib/worldwide-ai/reports/daily";
import { formatDay, formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { TASK_STATE_LABELS } from "@/lib/worldwide-ai/types";
import { Bullets, Card, DataTable, Empty, Pill, Stat, taskHref, type Tone } from "./ui";

/** A saved daily report, laid out for reading. Everything shown is in the stored record; nothing is worked out here. */

const PRIORITY_TONE: Record<Priority, Tone> = { urgent: "bad", high: "warn", normal: "plain" };
const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", normal: "Normal" };

function TaskTable({ caption, lines, when }: { caption: string; lines: readonly TaskLine[]; when: string }) {
	return (
		<DataTable
			caption={caption}
			columns={["Task", "Agent", "State", when]}
			rows={lines.map((line) => [
				<Link key="t" href={taskHref(line.taskId)}>
					{line.title}
				</Link>,
				line.agent,
				TASK_STATE_LABELS[line.state],
				formatOpsDateTime(line.at),
			])}
		/>
	);
}

export function ReportView({ report }: { report: DailyReport }) {
	return (
		<div className="wai-stack">
			<Card title={report.kind === "morning" ? "Summary" : "Evening recap"} accent>
				<p className="wai-help" style={{ marginTop: 0 }}>
					Covers {formatOpsDateTime(report.period.start)} to {formatOpsDateTime(report.period.end)}.{" "}
					{report.period.basis}
				</p>
				<Bullets items={report.summary} />
				{report.tomorrow && report.tomorrow.length > 0 && (
					<>
						<h3 className="wai-h3">Proposed to pick up first tomorrow</h3>
						<ol className="wai-bullets">
							{report.tomorrow.map((title) => (
								<li key={title}>{title}</li>
							))}
						</ol>
					</>
				)}
			</Card>

			<div className="wai-grid wai-grid--4">
				<Stat value={report.counts.completed} label="Completed and verified" />
				<Stat value={report.counts.waitingReview} label="Waiting for review" />
				<Stat value={report.counts.failed} label="Failed" />
				<Stat value={report.counts.unknown} label="Outcome unknown" />
			</div>

			<Card
				title="What needs someone to act"
				aside={<Pill tone={report.actions.length ? "pink" : "good"}>{report.actions.length}</Pill>}
			>
				{report.actions.length === 0 ? (
					<Empty>Nothing. No record in the workspace is waiting on a person.</Empty>
				) : (
					<ol className="wai-list" style={{ listStyle: "none", padding: 0 }}>
						{report.actions.map((action, index) => (
							<li key={`${index}-${action.title}`} style={{ display: "block" }}>
								<div className="wai-row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
									<Pill tone={PRIORITY_TONE[action.priority]}>{PRIORITY_LABEL[action.priority]}</Pill>
									<strong>{action.title}</strong>
								</div>
								<p style={{ margin: "6px 0" }}>{action.reason}</p>
								<dl className="wai-kv">
									<dt>Who</dt>
									<dd>{action.responsible}</dd>
									<dt>Due</dt>
									<dd>
										{action.due
											? `${formatDay(action.due.date)} (${action.due.confirmed ? "confirmed: a recorded date" : "suggested: a review date"})`
											: "No date is recorded"}
									</dd>
									<dt>Done when</dt>
									<dd>{action.expectedResult}</dd>
									{action.dependsOn.length > 0 && (
										<>
											<dt>Depends on</dt>
											<dd>{action.dependsOn.join("; ")}</dd>
										</>
									)}
								</dl>
								<ol className="wai-bullets">
									{action.nextSteps.map((step) => (
										<li key={step}>{step}</li>
									))}
								</ol>
								<p className="wai-small" style={{ margin: "6px 0 0" }}>
									{action.links.map((link, at) => (
										<span key={link.href}>
											{at > 0 && " · "}
											<Link href={link.href}>{link.label}</Link>
										</span>
									))}
									<span className="wai-muted">
										{" "}
										· From:{" "}
										{action.sources
											.map((source) => `${source.label}, read ${formatOpsDateTime(source.retrievedAt)}`)
											.join("; ")}
									</span>
								</p>
							</li>
						))}
					</ol>
				)}
			</Card>

			<div className="wai-grid wai-grid--2">
				<Card title="Completed and verified">
					{report.completed.length === 0 ? (
						<Empty>No task was completed in this period.</Empty>
					) : (
						<TaskTable
							caption="A task is listed only after its stored result was read back and checked."
							lines={report.completed}
							when="Finished"
						/>
					)}
				</Card>
				<Card title="Carried over">
					{report.carryover.length === 0 ? (
						<Empty>Nothing was still open from before this period.</Empty>
					) : (
						<TaskTable
							caption="Still open from before this period, by their existing task ids."
							lines={report.carryover}
							when="Created"
						/>
					)}
				</Card>
			</div>

			<div className="wai-grid wai-grid--2">
				<Card title="By agent">
					{report.agents.length === 0 ? (
						<Empty>
							No agent had business work in this period. That is not the same as every agent having run.
						</Empty>
					) : (
						<DataTable
							caption="Only agents with work in this period are listed."
							columns={["Agent", "Completed", "Failed or unknown", "Waiting for review"]}
							numeric={[1, 2, 3]}
							rows={report.agents.map((row) => [row.agent, row.completed, row.failed, row.waiting])}
						/>
					)}
				</Card>
				<Card title="Knowledge and skills">
					<dl className="wai-kv">
						<dt>Document versions approved</dt>
						<dd className="wai-num">{report.knowledge.approved.length}</dd>
						<dt>Waiting for approval</dt>
						<dd className="wai-num">{report.knowledge.waitingApproval}</dd>
						<dt>Documents expired</dt>
						<dd className="wai-num">{report.knowledge.expired}</dd>
						<dt>Documents past review</dt>
						<dd className="wai-num">{report.knowledge.reviewOverdue}</dd>
						<dt>Skills in use</dt>
						<dd className="wai-num">
							{report.skills.inUse} of {report.skills.total}
						</dd>
						<dt>Skills waiting for approval</dt>
						<dd className="wai-num">{report.skills.waitingApproval}</dd>
						<dt>Skills that failed evaluation</dt>
						<dd className="wai-num">{report.skills.failedEvaluation}</dd>
						<dt>Improvement proposals open</dt>
						<dd className="wai-num">{report.skills.openProposals}</dd>
					</dl>
					{(report.knowledge.approved.length > 0 ||
						report.skills.approved.length > 0 ||
						report.skills.revoked.length > 0) && (
						<Bullets
							items={[
								...report.knowledge.approved.map(
									(doc) =>
										`Approved: ${doc.title}, version ${doc.version}, ${formatOpsDateTime(doc.approvedAt)}.`,
								),
								...report.skills.approved.map(
									(skill) =>
										`Skill approved: ${skill.skill}, version ${skill.version}, ${formatOpsDateTime(skill.at)}.`,
								),
								...report.skills.revoked.map(
									(skill) =>
										`Skill revoked: ${skill.skill}, version ${skill.version}, ${formatOpsDateTime(skill.at)}. ${skill.reason}`,
								),
							]}
						/>
					)}
				</Card>
			</div>

			<div className="wai-grid wai-grid--2">
				<Card title="Services">
					<DataTable
						caption="A service that isn't configured or was never checked is shown as that, never as healthy."
						columns={["Service", "Status", "Detail", "Checked"]}
						rows={report.integrations.map((item) => [
							item.name,
							item.status,
							item.detail,
							item.checkedAt ? formatOpsDateTime(item.checkedAt) : "Never",
						])}
					/>
				</Card>
				<Card title="Unavailable">
					<p className="wai-help" style={{ marginTop: 0 }}>
						The workspace has no records for these, so the report says nothing about them. That is not a
						report of zero.
					</p>
					<ul className="wai-bullets">
						{report.unavailable.map((item) => (
							<li key={item.area}>
								<strong>{item.area}.</strong> {item.reason}
							</li>
						))}
					</ul>
				</Card>
			</div>

			<Card title="What this report read">
				<DataTable
					caption={`Model use in the period: ${report.usage.modelCalls} calls, ${report.usage.inputTokens.toLocaleString("en-CA")} tokens in, ${report.usage.outputTokens.toLocaleString("en-CA")} out. No model wrote any part of this report.`}
					columns={["Source", "Records read", "As of"]}
					numeric={[1]}
					rows={report.coverage.map((row) => [row.source, row.records, formatOpsDateTime(row.asOf)])}
				/>
			</Card>
		</div>
	);
}
