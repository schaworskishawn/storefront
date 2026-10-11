import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { INTEGRATIONS } from "@/lib/worldwide-ai/integrations/catalog";
import { formatOpsDate } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { loadToday } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import {
	Card,
	Empty,
	Notice,
	PageHeader,
	Pill,
	TaskStatePill,
	When,
	agentHref,
	resultHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Today" };

/**
 * Today: what needs attention, what to do next, what needs approval, and what is actually finished. Every line is read from
 * the records at the moment the page loads; nothing here is a sample figure.
 */
export default async function TodayPage() {
	const workspace = await getWorkspace();
	const now = workspace.runtime.now();
	const { briefing, waiting, active, attention, recent, team } = await loadToday(workspace);
	const priorities = briefing.items.filter((item) => item.level !== "info").slice(0, 3);
	const approvals = waiting.drafts.length + waiting.products.length + waiting.versions.length;
	const blocked = team.team.agents.filter((agent) => agent.primary.status === "awaiting_configuration");
	const missing = [...new Set(blocked.flatMap((agent) => agent.primary.missing))];
	const failing = team.health.filter((h) => h.status === "unhealthy" || h.status === "degraded");
	const { totals } = team.team;

	return (
		<>
			<PageHeader
				title={`Today, ${formatOpsDate(now)}`}
				lead={`Signed in as ${workspace.actor.label}. Times are shown in Winnipeg time.`}
				actions={
					<>
						<Link href={`${WORKSPACE_PATH}/nexus`} className="wai-btn wai-btn--primary">
							Give Nexus a goal
						</Link>
						<Link href={`${WORKSPACE_PATH}/team`} className="wai-btn">
							Run an agent
						</Link>
					</>
				}
			/>

			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Top priorities" accent>
						{priorities.length === 0 ? (
							<Empty>
								Nothing is waiting on you.{" "}
								{briefing.items[0]?.level === "info" ? briefing.items.map((item) => item.text).join(" ") : ""}
							</Empty>
						) : (
							<ol className="wai-list">
								{priorities.map((item) => (
									<li key={item.text}>
										<span>
											<Pill tone={item.level === "action" ? "pink" : "warn"}>
												{item.level === "action" ? "Needs you" : "Attention"}
											</Pill>{" "}
											{item.text}
										</span>
										<Link href={item.href} className="wai-btn wai-btn--small">
											Open
										</Link>
									</li>
								))}
							</ol>
						)}
					</Card>

					<Card title="Work in progress" aside={<Link href={`${WORKSPACE_PATH}/tasks`}>All tasks</Link>}>
						{active.length === 0 ? (
							<Empty>No task is queued or running.</Empty>
						) : (
							<ul className="wai-list">
								{active.map((task) => (
									<li key={task.id}>
										<span>
											<Link href={taskHref(task.id)}>{task.title}</Link>
											<span className="wai-muted wai-small"> · {ROLE_BY_ID[task.ownerRole].name}</span>
										</span>
										<TaskStatePill state={task.state} />
									</li>
								))}
							</ul>
						)}
					</Card>

					{attention.length > 0 && (
						<Card title="Failed or unconfirmed">
							<ul className="wai-list">
								{attention.map((task) => (
									<li key={task.id}>
										<span>
											<Link href={taskHref(task.id)}>{task.title}</Link>
											<span className="wai-muted wai-small"> · {task.error ?? "No reason recorded."}</span>
										</span>
										<TaskStatePill state={task.state} />
									</li>
								))}
							</ul>
						</Card>
					)}

					<Card title="Latest results">
						{recent.length === 0 ? (
							<Empty>No agent has produced a result yet. Open the Team page and run one.</Empty>
						) : (
							<ul className="wai-list">
								{recent.map((product) => (
									<li key={product.id}>
										<span>
											<Link href={resultHref(product.id)}>{product.summary}</Link>
											<span className="wai-muted wai-small">
												{" "}
												· {ROLE_BY_ID[product.agentId].name} · <When at={product.createdAt} now={now} />
											</span>
										</span>
										<Pill
											tone={
												product.reviewState === "pending"
													? "pink"
													: product.reviewState === "rejected"
														? "bad"
														: "good"
											}
										>
											{product.reviewState === "pending"
												? "Awaiting review"
												: product.reviewState === "not_required"
													? "Verified"
													: product.reviewState === "accepted"
														? "Accepted"
														: "Rejected"}
										</Pill>
									</li>
								))}
							</ul>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card
						title="Approvals"
						aside={approvals > 0 ? <span className="wai-count">{approvals}</span> : undefined}
					>
						{approvals === 0 ? (
							<Empty>Nothing is waiting for a decision.</Empty>
						) : (
							<ul className="wai-list">
								{waiting.drafts.length > 0 && (
									<li>
										<span>
											{waiting.drafts.length} support {waiting.drafts.length === 1 ? "draft" : "drafts"} to
											review
										</span>
										<Link href={`${WORKSPACE_PATH}/review`}>Review</Link>
									</li>
								)}
								{waiting.products.length > 0 && (
									<li>
										<span>
											{waiting.products.length} agent {waiting.products.length === 1 ? "result" : "results"}{" "}
											to accept or reject
										</span>
										<Link href={`${WORKSPACE_PATH}/review`}>Review</Link>
									</li>
								)}
								{waiting.versions.length > 0 && (
									<li>
										<span>
											{waiting.versions.length} document{" "}
											{waiting.versions.length === 1 ? "version" : "versions"} for the owner to approve
										</span>
										<Link href={`${WORKSPACE_PATH}/review`}>Review</Link>
									</li>
								)}
							</ul>
						)}
					</Card>

					<Card title="Blockers">
						{missing.length === 0 && failing.length === 0 ? (
							<Empty>Nothing configured is failing, and no agent is waiting on configuration.</Empty>
						) : (
							<div className="wai-stack" style={{ gap: 10 }}>
								{failing.map((h) => (
									<Notice
										key={h.integration}
										tone="bad"
										title={`${INTEGRATIONS[h.integration]?.name ?? h.integration} is ${h.status}.`}
									>
										{h.detail}
									</Notice>
								))}
								{missing.length > 0 && (
									<Notice tone="warn" title={`${blocked.length} agents are awaiting configuration.`}>
										Missing: {missing.join(", ")}.{" "}
										<Link href={`${WORKSPACE_PATH}/integrations`}>See Integrations</Link>
									</Notice>
								)}
							</div>
						)}
					</Card>

					<Card title="Team" aside={<Link href={`${WORKSPACE_PATH}/team`}>All 49 agents</Link>}>
						<dl className="wai-kv">
							<dt>Agents</dt>
							<dd className="wai-num">{totals.agents}</dd>
							<dt>Switched on</dt>
							<dd className="wai-num">{totals.enabled}</dd>
							<dt>Functions ready now</dt>
							<dd className="wai-num">
								{totals.functionsReady} of {totals.functionsRequired}
							</dd>
							<dt>Tasks running</dt>
							<dd className="wai-num">{briefing.tasks.running}</dd>
						</dl>
						<p className="wai-help" style={{ marginTop: 10 }}>
							An agent being listed or switched on doesn’t mean it is running. Readiness is per function, from
							what is actually configured.
						</p>
					</Card>

					<Card title="Recently used agents">
						{recent.length === 0 ? (
							<Empty>None yet.</Empty>
						) : (
							<div className="wai-row">
								{[...new Set(recent.map((product) => product.agentId))].map((id) => (
									<Link key={id} href={agentHref(id)} className="wai-btn wai-btn--small wai-btn--quiet">
										{ROLE_BY_ID[id].name}
									</Link>
								))}
							</div>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
