import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { functionReadiness } from "@/lib/worldwide-ai/functions/readiness";
import { FUNCTIONS } from "@/lib/worldwide-ai/functions/registry";
import { listTasks } from "@/lib/worldwide-ai/tasks/repo";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { inspectionAction } from "@/lib/worldwide-ai/web/actions";
import { APP_BY_ID, AREAS, type AppId } from "@/lib/worldwide-ai/web/apps";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { LabCalculator } from "@/ui/sections/worldwide-ai/lab-calculator";
import {
	Bullets,
	Card,
	Empty,
	Notice,
	PageHeader,
	ReadinessPill,
	TaskStatePill,
	When,
	agentHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

type Props = { params: Promise<{ app: string }> };

const areaOf = (app: string) => (app in AREAS ? AREAS[app as AppId] : undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { app } = await params;
	return { title: areaOf(app) ? APP_BY_ID[app as AppId].label : "Not found" };
}

/**
 * The applications built around a group of agents (the Lab, RFID & NFC, Product Content Studio, Engineering, Manufacturing,
 * Quality, Canadian Compliance, Improvement). Each shows what its agents can do now, what they have done, and, plainly, what
 * the brief asks for here that isn't built.
 */
export default async function AreaPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { app } = await params;
	const area = areaOf(app);
	if (!area) notFound();
	const definition = APP_BY_ID[area.id];
	const { sql, now } = workspace.runtime;
	const [{ team, statuses }, tasks] = await Promise.all([
		loadTeam(workspace),
		listTasks(sql, { viewer: workspace.viewer, limit: 200 }),
	]);
	const agents = area.agents.flatMap((id) => team.agents.find((entry) => entry.role.id === id) ?? []);
	const recent = tasks.filter((task) => area.agents.some((id) => id === task.ownerRole)).slice(0, 8);
	const inspection = FUNCTIONS.get("patch.site_inspection");
	const inspectionReadiness = inspection
		? functionReadiness(inspection, {
				statuses,
				enabled: team.agents.find((a) => a.role.id === "patch")?.enabled ?? true,
			})
		: null;

	return (
		<>
			<PageHeader title={definition.label} lead={area.lead} />
			<div className="wai-stack">
				{area.id === "lab" && (
					<Card title="Recipe calculator" accent>
						<LabCalculator />
					</Card>
				)}

				{area.id === "engineering" && (
					<Card
						title="Inspect website pages"
						aside={inspectionReadiness && <ReadinessPill status={inspectionReadiness.status} />}
						accent
					>
						{inspectionReadiness?.status === "ready" ? (
							<FieldsForm
								action={inspectionAction}
								submit="Inspect at desktop and phone widths"
								idPrefix="inspect"
								fields={[
									{
										name: "urls",
										label: "Pages to inspect",
										kind: "list",
										required: true,
										help: `Up to five, one per line, on these hosts only: ${workspace.config.openclaw.allowedHosts.join(", ")}.`,
										placeholder: "https://www.worldwidevapor.com/shop",
									},
								]}
							/>
						) : (
							<Notice tone="warn" title="Inspections can't run yet.">
								{inspectionReadiness?.reasons.join(" ")}{" "}
								{inspectionReadiness?.missing.length
									? `Missing: ${inspectionReadiness.missing.join(", ")}.`
									: ""}{" "}
								The worker runs on a separate private host; see{" "}
								<span className="wai-mono">openclaw-host/README.md</span>. No screenshot is ever produced
								without it.
							</Notice>
						)}
					</Card>
				)}

				<div className="wai-split">
					<div className="wai-stack">
						<Card title="What you can run here">
							<ul className="wai-list">
								{agents.flatMap((agent) =>
									agent.functions.map((fn) => (
										<li key={fn.kind}>
											<span>
												<Link href={`${agentHref(agent.role.id)}?run=${fn.kind}`}>{fn.action}</Link>
												<span className="wai-muted wai-small">
													{" "}
													· {agent.role.name}, {agent.role.title}
												</span>
												{fn.readiness.status !== "ready" && (
													<>
														<br />
														<span className="wai-muted wai-small">
															{fn.readiness.reasons.join(" ")}{" "}
															{fn.readiness.missing.length
																? `Missing: ${fn.readiness.missing.join(", ")}.`
																: ""}
														</span>
													</>
												)}
											</span>
											<ReadinessPill status={fn.readiness.status} />
										</li>
									)),
								)}
							</ul>
						</Card>

						<Card title="Recent work here" aside={<Link href={`${WORKSPACE_PATH}/tasks`}>All tasks</Link>}>
							{recent.length === 0 ? (
								<Empty>Nothing has been run in this area yet.</Empty>
							) : (
								<ul className="wai-list">
									{recent.map((task) => (
										<li key={task.id}>
											<span>
												<Link href={taskHref(task.id)}>{task.title}</Link>
												<span className="wai-muted wai-small">
													{" "}
													· {ROLE_BY_ID[task.ownerRole].name} · <When at={task.createdAt} now={now()} />
												</span>
											</span>
											<TaskStatePill state={task.state} />
										</li>
									))}
								</ul>
							)}
						</Card>
					</div>

					<div className="wai-stack">
						{area.also && area.also.length > 0 && (
							<Card title="Also here">
								<Bullets items={area.also} />
								{area.id === "improvement" && (
									<p style={{ margin: "12px 0 0" }}>
										<Link href={`${WORKSPACE_PATH}/skills`} className="wai-btn">
											Open Skills
										</Link>
									</p>
								)}
							</Card>
						)}
						<Card title="Not built yet">
							<p className="wai-help" style={{ marginTop: 0 }}>
								The brief asks for these in this area. None of them exists in this build, and nothing on this
								page stands in for them.
							</p>
							<Bullets items={area.notBuilt} />
						</Card>
						{agents.some((agent) => agent.planned.length > 0) && (
							<Card title="Agent capabilities waiting on a connector">
								<ul className="wai-list">
									{agents.flatMap((agent) =>
										agent.planned.map(({ capability }) => (
											<li key={capability.id}>
												<span>
													<strong>{capability.label}</strong>{" "}
													<span className="wai-muted wai-small">· {agent.role.name}</span>
													<br />
													<span className="wai-muted wai-small">{capability.note}</span>
												</span>
												<ReadinessPill status="planned" />
											</li>
										)),
									)}
								</ul>
							</Card>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
