import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { buildBriefing } from "@/lib/worldwide-ai/briefing";
import { ALL_FUNCTIONS, FUNCTIONS } from "@/lib/worldwide-ai/functions/registry";
import { listTasks } from "@/lib/worldwide-ai/tasks/repo";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FunctionForm } from "@/ui/sections/worldwide-ai/function-form";
import {
	Card,
	DataTable,
	Empty,
	PageHeader,
	Pill,
	ReadinessPill,
	TaskStatePill,
	When,
	agentHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Nexus Command Center" };

type Props = { searchParams: Promise<{ consolidate?: string }> };

/**
 * Nexus, the only coordinator. Give it a goal and the steps to take; it orders them, names the one agent that owns each,
 * shows which can run now, and starts nothing by itself. Later it consolidates what each started step actually returned.
 */
export default async function NexusPage({ searchParams }: Props) {
	const workspace = await getWorkspace();
	const { consolidate } = await searchParams;
	const { sql, now } = workspace.runtime;
	const nexus = FUNCTIONS.get("nexus.goal-plan");
	const [plans, briefing, { team }] = await Promise.all([
		listTasks(sql, { kind: "nexus.goal-plan", limit: 10 }),
		buildBriefing(sql, workspace.config, now()),
		loadTeam(workspace),
	]);
	const readinessOf = new Map(
		team.agents.flatMap((agent) => agent.functions.map((f) => [f.kind, f.readiness.status] as const)),
	);
	const plannable = ALL_FUNCTIONS.filter((f) => f.id !== "nexus.goal-plan" && f.scope !== "personal");

	return (
		<>
			<PageHeader
				title="Nexus Command Center"
				lead="Nexus plans and consolidates. It never does a specialist's work, approves anything, or starts a step by itself: each step is started by a person from the plan, and is linked to it."
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title={consolidate ? "Consolidate a plan" : "Plan a goal"} accent>
						{nexus && (
							<FunctionForm
								functionId={nexus.id}
								action={consolidate ? "Consolidate the results" : "Plan the steps"}
								fields={nexus.fields}
								hasSample={!consolidate}
								initial={consolidate ? { mode: "consolidate", planTask: consolidate } : { mode: "plan" }}
							/>
						)}
						<p className="wai-help">
							For steps, paste one function per row under the header{" "}
							<span className="wai-mono">function,depends_on,note</span>. The function ids are in the table
							below; “depends on” is another step’s number.
						</p>
					</Card>

					<Card title="Functions Nexus can plan">
						<DataTable
							caption={`${plannable.length} functions across 48 specialists. A step that isn't ready is planned as blocked, with the reason.`}
							columns={["Function id", "What it does", "Agent", "Now"]}
							rows={plannable.map((definition) => [
								<span key="i" className="wai-mono">
									{definition.id}
								</span>,
								definition.action,
								<Link key="a" href={agentHref(definition.agent)}>
									{ROLE_BY_ID[definition.agent].name}
								</Link>,
								<ReadinessPill key="r" status={readinessOf.get(definition.id) ?? "planned"} />,
							])}
						/>
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Briefing">
						<ul className="wai-list">
							{briefing.items.slice(0, 6).map((item) => (
								<li key={item.text}>
									<span>
										<Pill
											tone={item.level === "action" ? "pink" : item.level === "attention" ? "warn" : "plain"}
										>
											{item.level === "action"
												? "Needs you"
												: item.level === "attention"
													? "Attention"
													: "Info"}
										</Pill>{" "}
										{item.text}
									</span>
									<Link href={item.href}>Open</Link>
								</li>
							))}
						</ul>
					</Card>

					<Card
						title="Plans and consolidations"
						aside={<Link href={`${WORKSPACE_PATH}/tasks?owner=nexus`}>All</Link>}
					>
						{plans.length === 0 ? (
							<Empty>Nexus hasn’t planned anything yet.</Empty>
						) : (
							<ul className="wai-list">
								{plans.map((plan) => (
									<li key={plan.id}>
										<span>
											<Link href={taskHref(plan.id)}>{plan.title}</Link>
											<span className="wai-muted wai-small">
												{" "}
												· <When at={plan.createdAt} now={now()} />
											</span>
										</span>
										<TaskStatePill state={plan.state} />
									</li>
								))}
							</ul>
						)}
					</Card>

					<Card title="What Nexus can't do">
						<p style={{ margin: 0 }}>
							{ROLE_BY_ID.nexus.boundaries} Focus plans are personal and can never be part of a shared plan.
						</p>
					</Card>
				</div>
			</div>
		</>
	);
}
