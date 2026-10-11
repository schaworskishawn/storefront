import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { listFindings } from "@/lib/worldwide-ai/findings";
import { getProductByTask } from "@/lib/worldwide-ai/functions/products";
import { lookupFunction } from "@/lib/worldwide-ai/functions/registry";
import { getRunForTask } from "@/lib/worldwide-ai/openclaw/runs";
import { getDraftByTask } from "@/lib/worldwide-ai/support/drafts";
import { getTask, getTaskEvents, listTasks, scopeVisibleTo } from "@/lib/worldwide-ai/tasks/repo";
import { isActive } from "@/lib/worldwide-ai/tasks/state-machine";
import { formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { usageForTask } from "@/lib/worldwide-ai/usage";
import { taskAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { AutoRefresh, ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { ResultView, humanize } from "@/ui/sections/worldwide-ai/result-view";
import {
	Bullets,
	Card,
	DataTable,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	TaskStatePill,
	When,
	agentHref,
	resultHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Task" };

type Props = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One task: who owns it, what done was meant to look like, what actually happened step by step, and the evidence. */
export default async function TaskPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const { sql, now } = workspace.runtime;
	const task = await getTask(sql, id);
	// A task in someone else's personal scope doesn't exist as far as this person is concerned.
	if (!task || !scopeVisibleTo(task.scope, workspace.viewer)) notFound();
	const [events, usage, product, draft, run, findings, children] = await Promise.all([
		getTaskEvents(sql, id),
		usageForTask(sql, id),
		getProductByTask(sql, id),
		task.kind === "relay.support_draft" ? getDraftByTask(sql, id) : null,
		task.kind === "patch.site_inspection" ? getRunForTask(sql, id) : null,
		listFindings(sql, { taskId: id, limit: 50 }),
		task.kind === "nexus.goal-plan" ? listTasks(sql, { parentTaskId: id, limit: 50, demo: "include" }) : [],
	]);
	const role = ROLE_BY_ID[task.ownerRole];
	const definition = lookupFunction(task.kind);
	const planSteps = (
		(
			product?.payload as
				| {
						mode?: string;
						steps?: Array<{
							step: number;
							functionId: string;
							agent: string;
							action: string;
							blocker: string;
						}>;
				  }
				| undefined
		)?.steps ?? []
	).filter(() => (product?.payload as { mode?: string }).mode === "plan");
	const tokens = usage.reduce((sum, u) => sum + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);
	const active = isActive(task.state) && task.state !== "needs_review";

	return (
		<>
			<PageHeader
				title={task.title}
				crumbs={[{ label: "Tasks", href: `${WORKSPACE_PATH}/tasks` }, { label: task.id.slice(0, 8) }]}
				actions={
					<>
						<TaskStatePill state={task.state} />
						{task.demo && <Pill tone="pink">Demonstration</Pill>}
						{task.scope !== "business" && <Pill tone="info">Private to you</Pill>}
					</>
				}
			/>
			<AutoRefresh active={active} />

			<div className="wai-split">
				<div className="wai-stack">
					{task.state === "outcome_unknown" && (
						<Notice tone="warn" title="The outcome of this task could not be confirmed.">
							{task.error} Check what actually happened before trying again; a retry reuses this task.
						</Notice>
					)}
					{task.state === "failed" && (
						<Notice tone="bad" title="This task failed.">
							{task.error} Nothing was stored as its result.
						</Notice>
					)}
					{task.state === "queued" && (
						<Notice tone="info" title="Queued.">
							It will start when the background runner picks it up. If it has been waiting a while, start it
							again below: the same task is used, never a second one.
						</Notice>
					)}

					{product && (
						<Card
							title="Result"
							aside={<Link href={resultHref(product.id)}>Open the full result</Link>}
							accent
						>
							<p style={{ marginTop: 0 }}>{product.summary}</p>
							{product.reviewState === "pending" && (
								<Notice tone="info" title="Waiting for a person to accept it.">
									<Link href={resultHref(product.id)}>Review it</Link>
								</Notice>
							)}
						</Card>
					)}
					{draft && (
						<Card title="Reply draft" accent>
							<p style={{ marginTop: 0 }}>
								A draft is stored for this task ({draft.state.replace("_", " ")}).{" "}
								<Link href={`${WORKSPACE_PATH}/support/drafts/${draft.id}`}>
									Open the draft and its sources
								</Link>
							</p>
						</Card>
					)}

					{planSteps.length > 0 && (
						<Card title="Steps of this plan">
							<p className="wai-help" style={{ marginTop: 0 }}>
								Planning started nothing. Start a step here and its task is linked to this plan.
							</p>
							<ul className="wai-list">
								{planSteps.map((step) => {
									const started = children.filter((child) => child.kind === step.functionId);
									const owner = step.functionId.slice(0, step.functionId.indexOf("."));
									return (
										<li key={step.step}>
											<span>
												{step.step}. <strong>{step.action}</strong>{" "}
												<span className="wai-muted wai-small">· {step.agent}</span>
												{step.blocker && (
													<>
														<br />
														<span className="wai-muted wai-small">{step.blocker}</span>
													</>
												)}
											</span>
											<span className="wai-row">
												{started.map((child) => (
													<Link key={child.id} href={taskHref(child.id)}>
														<TaskStatePill state={child.state} />
													</Link>
												))}
												{!step.blocker &&
													lookupFunction(step.functionId) &&
													!lookupFunction(step.functionId)?.external && (
														<Link
															className="wai-btn wai-btn--small"
															href={`${WORKSPACE_PATH}/team/${owner}?run=${step.functionId}&plan=${task.id}`}
														>
															{started.length ? "Run again" : "Start"}
														</Link>
													)}
											</span>
										</li>
									);
								})}
							</ul>
							<p className="wai-help" style={{ marginBottom: 0 }}>
								When the steps are done, ask Nexus to consolidate:{" "}
								<Link href={`${WORKSPACE_PATH}/nexus?consolidate=${task.id}`}>consolidate this plan</Link>.
							</p>
						</Card>
					)}

					{run && (
						<Card title="OpenClaw run">
							<KeyValues
								items={[
									[
										"Session id (made here)",
										<span key="s" className="wai-mono">
											{run.sessionId}
										</span>,
									],
									[
										"Run id (from the worker)",
										run.runId ? <span className="wai-mono">{run.runId}</span> : "Not received",
									],
									["Run state", run.state.replace("_", " ")],
									["Evidence files", String(run.evidence.length)],
								]}
							/>
							{run.evidence.length > 0 && (
								<div className="wai-grid wai-grid--2" style={{ marginTop: 14 }}>
									{run.evidence.map((file) => (
										<figure key={file.path} style={{ margin: 0 }}>
											{/* A private file served only to signed-in operators, so it can't go through the image optimizer. */}
											{/* eslint-disable-next-line @next/next/no-img-element */}
											<img
												className="wai-shot"
												src={`/api/worldwide-ai/files/${file.path}`}
												alt={`${file.viewport} screenshot of ${file.url}`}
												loading="lazy"
											/>
											<figcaption className="wai-help">
												{file.viewport} · {file.url} ·{" "}
												<span className="wai-mono">{file.sha256.slice(0, 12)}…</span>
											</figcaption>
										</figure>
									))}
								</div>
							)}
						</Card>
					)}

					{findings.length > 0 && (
						<Card title="Findings from this task">
							<ul className="wai-list">
								{findings.map((finding) => (
									<li key={finding.id}>
										<span>
											<strong>{finding.title}</strong>
											{finding.detail && (
												<>
													<br />
													<span className="wai-muted wai-small">{finding.detail}</span>
												</>
											)}
										</span>
										<Pill
											tone={
												finding.severity === "critical" || finding.severity === "high"
													? "bad"
													: finding.severity === "medium"
														? "warn"
														: "plain"
											}
										>
											{finding.severity}
										</Pill>
									</li>
								))}
							</ul>
						</Card>
					)}

					<Card title="What happened, step by step">
						<ol className="wai-timeline">
							{events.map((event) => (
								<li key={event.id}>
									<strong>
										{event.kind === "state_change" && event.toState
											? `${event.fromState ? `${event.fromState.replace("_", " ")} → ` : ""}${event.toState.replace("_", " ")}`
											: humanize(event.kind)}
									</strong>{" "}
									<span className="wai-muted">
										by{" "}
										{event.actor
											.replace(/^operator:.*/, "a person")
											.replace(/^agent:/, "agent ")
											.replace(/^system:/, "system: ")}{" "}
										· {formatOpsDateTime(event.at)}
									</span>
									{Object.keys(event.detail).length > 0 && (
										<div className="wai-muted wai-small" style={{ overflowWrap: "anywhere" }}>
											{Object.entries(event.detail)
												.filter(([, value]) => typeof value !== "object" || value === null)
												.map(([key, value]) => `${humanize(key).toLowerCase()}: ${String(value)}`)
												.join(" · ")}
										</div>
									)}
								</li>
							))}
						</ol>
					</Card>

					{task.completionEvidence && (
						<Card title="Completion evidence">
							<ResultView payload={task.completionEvidence} />
						</Card>
					)}
				</div>

				<div className="wai-stack">
					<Card title="About this task">
						<KeyValues
							items={[
								[
									"Owner",
									<Link key="o" href={agentHref(task.ownerRole)}>{`${role.name}, ${role.title}`}</Link>,
								],
								[
									"Kind",
									<span key="k" className="wai-mono">
										{task.kind}
									</span>,
								],
								["Requested by", task.requestedByLabel ?? task.requestedBy],
								["Created", <When key="c" at={task.createdAt} now={now()} />],
								["Started", <When key="s" at={task.startedAt} now={now()} />],
								["Finished", <When key="f" at={task.finishedAt} now={now()} />],
								["Attempts", String(task.attempts)],
								...(task.parentTaskId
									? ([
											[
												"Part of plan",
												<Link key="p" href={taskHref(task.parentTaskId)}>
													{task.parentTaskId.slice(0, 8)}
												</Link>,
											],
										] as Array<[string, ReactNode]>)
									: []),
								...(task.externalRunId
									? ([
											[
												"Job runner id",
												<span key="r" className="wai-mono">
													{task.externalRunId}
												</span>,
											],
										] as Array<[string, ReactNode]>)
									: []),
							]}
						/>
					</Card>

					<Card title="What done was meant to look like">
						<p style={{ margin: 0 }}>{task.expectedResult}</p>
						{definition && (
							<p className="wai-help" style={{ marginBottom: 0 }}>
								{definition.notThis}
							</p>
						)}
					</Card>

					<Card title="Sources">
						<Bullets
							items={task.sourceRefs.map((ref) => (
								<span key={`${ref.system}-${ref.id}`}>
									{ref.label ?? ref.id}{" "}
									<span className="wai-muted wai-small">
										({ref.system}
										{ref.version !== undefined ? `, version ${ref.version}` : ""}, read{" "}
										{formatOpsDateTime(ref.retrievedAt)})
									</span>
								</span>
							))}
							empty="No source is recorded yet."
						/>
					</Card>

					<Card title="Usage">
						{usage.length === 0 ? (
							<Empty>No model or tool call is recorded for this task.</Empty>
						) : (
							<>
								<DataTable
									caption={`${usage.length} calls${tokens ? `, ${tokens.toLocaleString("en-CA")} tokens in total` : ""}. Cost isn't shown: no price is configured.`}
									columns={["Call", "Status", "Tokens in", "Tokens out", "ms"]}
									numeric={[2, 3, 4]}
									rows={usage.map((u) => [
										u.kind === "model" ? (u.model ?? "model") : (u.tool ?? "tool"),
										u.status,
										u.inputTokens ?? "—",
										u.outputTokens ?? "—",
										u.latencyMs ?? "—",
									])}
								/>
							</>
						)}
					</Card>

					<Card title="Actions">
						<div className="wai-stack" style={{ gap: 14 }}>
							{task.state === "queued" && (
								<ButtonForm
									action={taskAction}
									hidden={{ taskId: task.id, intent: "start" }}
									label="Start it now"
									tone="primary"
									idPrefix="start"
								/>
							)}
							{(task.state === "failed" || task.state === "outcome_unknown") && (
								<ButtonForm
									action={taskAction}
									hidden={{ taskId: task.id, intent: "retry" }}
									label="Try again on this task"
									tone="primary"
									idPrefix="retry"
								/>
							)}
							{(isActive(task.state) || task.state === "outcome_unknown") && (
								<ButtonForm
									action={taskAction}
									hidden={{ taskId: task.id, intent: "cancel" }}
									label="Cancel this task"
									tone="danger"
									note={{ label: "Reason (optional)" }}
									idPrefix="cancel"
								/>
							)}
							{task.state === "outcome_unknown" &&
								(workspace.isOwner ? (
									<details>
										<summary className="wai-small">Settle it after checking what really happened</summary>
										<div style={{ marginTop: 10 }}>
											<FieldsForm
												action={taskAction}
												hidden={{ taskId: task.id, intent: "settle" }}
												submit="Settle"
												idPrefix="settle"
												fields={[
													{
														name: "resolution",
														label: "What you found",
														kind: "select",
														required: true,
														options: [
															{ value: "completed", label: "It did complete" },
															{ value: "failed", label: "It did not complete" },
														],
													},
													{
														name: "note",
														label: "What you checked and what you found",
														kind: "textarea",
														required: true,
														rows: 3,
														help: "This statement becomes the task's evidence, attributed to you.",
													},
												]}
											/>
										</div>
									</details>
								) : (
									<p className="wai-help">Only the owner can settle a task whose outcome is unknown.</p>
								))}
							{!isActive(task.state) && task.state !== "failed" && task.state !== "outcome_unknown" && (
								<Empty>This task is finished. Nothing more can be done to it.</Empty>
							)}
						</div>
					</Card>
				</div>
			</div>
		</>
	);
}
