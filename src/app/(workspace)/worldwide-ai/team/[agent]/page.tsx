import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LIMIT_KEYS, HARD_CAPS } from "@/lib/worldwide-ai/agents/limits";
import { AREA_LABELS, ROLE_BY_ID, SHARED_RULES } from "@/lib/worldwide-ai/agents/registry";
import { loadRoleSettings } from "@/lib/worldwide-ai/agents/settings";
import { TOOLS } from "@/lib/worldwide-ai/agents/tools";
import { collectionLabel } from "@/lib/worldwide-ai/atlas/collections";
import { listProducts } from "@/lib/worldwide-ai/functions/products";
import { listInventory, stockSnapshot } from "@/lib/worldwide-ai/lab/inventory";
import { requiredIntegrations } from "@/lib/worldwide-ai/functions/readiness";
import { functionsOf } from "@/lib/worldwide-ai/functions/registry";
import { INTEGRATIONS } from "@/lib/worldwide-ai/integrations/catalog";
import { skillsOf } from "@/lib/worldwide-ai/skills/catalog";
import { MAX_FOUNDATIONS_PER_STEP } from "@/lib/worldwide-ai/skills/resolver";
import { listTasks } from "@/lib/worldwide-ai/tasks/repo";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH, isRoleId } from "@/lib/worldwide-ai/types";
import { roleSettingsAction } from "@/lib/worldwide-ai/web/actions";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { STANDING_LABELS, loadSkillRows } from "@/lib/worldwide-ai/web/skills";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { FunctionForm } from "@/ui/sections/worldwide-ai/function-form";
import { humanize } from "@/ui/sections/worldwide-ai/result-view";
import {
	Bullets,
	Card,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	ReadinessPill,
	TaskStatePill,
	When,
	resultHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

type Props = {
	params: Promise<{ agent: string }>;
	searchParams: Promise<{ run?: string; plan?: string; task?: string; from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { agent } = await params;
	return { title: isRoleId(agent) ? ROLE_BY_ID[agent].name : "Agent" };
}

/**
 * One agent: what it is for, the function its button runs (with the form to run it), what it may and may not touch, its
 * limits, and what it has actually done. A function that can't run says exactly what is missing instead of offering a button.
 */
export default async function AgentPage({ params, searchParams }: Props) {
	const workspace = await getWorkspace();
	const { agent } = await params;
	const { run, plan, task: carried, from } = await searchParams;
	if (!isRoleId(agent)) notFound();
	const role = ROLE_BY_ID[agent];
	const { sql, now } = workspace.runtime;
	const [{ team }, settings, tasks, products, skillRows] = await Promise.all([
		loadTeam(workspace),
		loadRoleSettings(sql, agent),
		listTasks(sql, { ownerRole: agent, viewer: workspace.viewer, limit: 8 }),
		listProducts(sql, { agentId: agent, viewer: workspace.viewer, limit: 8 }),
		loadSkillRows(sql),
	]);
	// This agent's own role pack first, then the foundations that pack names, in the pack's order.
	const skills = skillsOf(agent).flatMap((skill) => skillRows.filter((row) => row.skill.id === skill.id));
	const readiness = team.agents.find((entry) => entry.role.id === agent);
	if (!readiness) notFound();
	const definitions = functionsOf(agent);
	const selected =
		definitions.find((d) => d.id === run) ?? definitions.find((d) => d.id === role.primary) ?? definitions[0];
	const selectedReadiness = readiness.functions.find((f) => f.kind === selected.id)?.readiness;
	const personal = selected.scope === "personal";
	// Stock can start from what the inventory holds instead of a pasted table. Demand and lead time are left to fill in.
	const today = opsDayKey(now());
	const stored =
		selected.id === "stock.replenishment-plan" && from === "inventory"
			? { snapshot: "Stored stock", asOf: today, stock: stockSnapshot(await listInventory(sql, today)) }
			: null;

	return (
		<>
			<PageHeader
				title={role.name}
				lead={role.mission}
				crumbs={[{ label: "Team", href: `${WORKSPACE_PATH}/team` }, { label: role.name }]}
				actions={
					<>
						<Pill>
							Agent {role.number} of 49 · {AREA_LABELS[role.area]}
						</Pill>
						{!settings.enabled && <Pill tone="warn">Switched off</Pill>}
					</>
				}
			/>

			<div className="wai-split">
				<div className="wai-stack">
					<Card
						title={selected.action}
						aside={selectedReadiness && <ReadinessPill status={selectedReadiness.status} />}
						accent
					>
						<p style={{ marginTop: 0 }}>{selected.purpose}</p>
						<KeyValues
							items={[
								["Produces", `${selected.outputType}. ${selected.expectedResult}`],
								["Does not", selected.notThis],
								[
									"How",
									selected.uses === "code"
										? "Calculated entirely by application code. No model is involved."
										: "The wording comes from the model; the checks are application code.",
								],
								[
									"Then",
									selected.review === "required"
										? "A person must accept the result before the task is completed."
										: "The stored result is read back and checked; the task is completed when every check passes.",
								],
							]}
						/>
						<hr style={{ border: 0, borderTop: "1px solid var(--wai-line)", margin: "16px 0" }} />
						{personal && (
							<div style={{ marginBottom: 12 }}>
								<Notice tone="info" title="Private to you.">
									What you enter and what comes back are visible only to you. They never appear in shared
									lists, counts, briefings or another person’s view.
								</Notice>
							</div>
						)}
						{plan && (
							<div style={{ marginBottom: 12 }}>
								<Notice tone="info" title="Part of a Nexus plan.">
									This run will be linked to plan <Link href={taskHref(plan)}>{plan.slice(0, 8)}</Link>.
								</Notice>
							</div>
						)}
						{selected.external ? (
							<Notice tone="info" title="This function has its own screen.">
								<Link href={selected.external.start}>Open it</Link>
							</Notice>
						) : selectedReadiness?.status === "ready" ? (
							<FunctionForm
								functionId={selected.id}
								action={selected.action}
								fields={selected.fields}
								hasSample={selected.sample !== null}
								plan={plan}
								initial={carried ? { task: carried } : (stored ?? undefined)}
							/>
						) : (
							<Notice tone="warn" title={`${selected.action} can't run yet.`}>
								{selectedReadiness?.reasons.join(" ")}{" "}
								{selectedReadiness?.missing.length ? `Missing: ${selectedReadiness.missing.join(", ")}.` : ""}{" "}
								{selectedReadiness?.status === "disabled" ? (
									"The owner can switch the agent on below."
								) : (
									<Link href={`${WORKSPACE_PATH}/integrations`}>See what each setting is for</Link>
								)}
							</Notice>
						)}
					</Card>

					{definitions.length > 1 && (
						<Card title="All of this agent's functions">
							<ul className="wai-list">
								{definitions.map((definition) => (
									<li key={definition.id}>
										<span>
											<Link href={`${WORKSPACE_PATH}/team/${agent}?run=${definition.id}`}>
												{definition.action}
											</Link>
											<span className="wai-muted wai-small"> · {definition.outputType}</span>
										</span>
										<ReadinessPill
											status={
												readiness.functions.find((f) => f.kind === definition.id)?.readiness.status ??
												"planned"
											}
										/>
									</li>
								))}
							</ul>
						</Card>
					)}

					{role.planned.length > 0 && (
						<Card title="Not built yet">
							<ul className="wai-list">
								{role.planned.map((capability) => (
									<li key={capability.id}>
										<span>
											<strong>{capability.label}</strong>
											<br />
											<span className="wai-muted wai-small">{capability.note}</span>
										</span>
										<ReadinessPill status="planned" />
									</li>
								))}
							</ul>
						</Card>
					)}

					<Card
						title="What it has done"
						aside={<Link href={`${WORKSPACE_PATH}/tasks?owner=${agent}`}>All its tasks</Link>}
					>
						{tasks.length === 0 ? (
							<Empty>Nothing yet. No run of this agent is on record.</Empty>
						) : (
							<ul className="wai-list">
								{tasks.map((task) => {
									const product = products.find((p) => p.taskId === task.id);
									return (
										<li key={task.id}>
											<span>
												<Link href={product ? resultHref(product.id) : taskHref(task.id)}>
													{product?.summary ?? task.title}
												</Link>
												<span className="wai-muted wai-small">
													{" "}
													· <When at={task.createdAt} now={now()} />
												</span>
											</span>
											<TaskStatePill state={task.state} />
										</li>
									);
								})}
							</ul>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Boundaries">
						<p style={{ margin: 0 }}>{role.boundaries}</p>
					</Card>

					<Card title="What it may use">
						<h3 className="wai-h3">Tools</h3>
						<Bullets items={role.tools.map((tool) => `${tool}: ${TOOLS[tool].summary}`)} />
						<h3 className="wai-h3" style={{ marginTop: 14 }}>
							Approved knowledge it may read
						</h3>
						<Bullets
							items={role.knowledge.map(collectionLabel)}
							empty="None. It works only from what is supplied with each task."
						/>
						<h3 className="wai-h3" style={{ marginTop: 14 }}>
							Needs to be configured
						</h3>
						<Bullets items={requiredIntegrations(selected).map((id) => INTEGRATIONS[id].name)} />
						<p className="wai-help" style={{ marginTop: 10 }}>
							Tools are enforced in application code on every call. An agent can’t add to this list, approve
							its own work, or change its limits.
						</p>
					</Card>

					<Card title="Limits for one task">
						<KeyValues
							items={LIMIT_KEYS.map((key) => [
								humanize(key.replace(/^max/, "")),
								`${settings.limits[key]} (cap ${HARD_CAPS[key]})`,
							])}
						/>
						{workspace.isOwner ? (
							<div className="wai-stack" style={{ marginTop: 14 }}>
								<ButtonForm
									action={roleSettingsAction}
									hidden={{ roleId: agent, enabled: settings.enabled ? "0" : "1" }}
									label={settings.enabled ? "Switch this agent off" : "Switch this agent on"}
									tone={settings.enabled ? "danger" : "primary"}
									idPrefix={`switch-${agent}`}
								/>
								<details>
									<summary className="wai-small">Change limits</summary>
									<div style={{ marginTop: 10 }}>
										<FieldsForm
											action={roleSettingsAction}
											hidden={{ roleId: agent }}
											submit="Save limits"
											idPrefix={`limits-${agent}`}
											fields={LIMIT_KEYS.map((key) => ({
												name: `limit.${key}`,
												label: humanize(key.replace(/^max/, "")),
												kind: "number" as const,
												placeholder: String(settings.limits[key]),
												help: `Whole number, at most ${HARD_CAPS[key]}.`,
											}))}
										/>
									</div>
								</details>
							</div>
						) : (
							<p className="wai-help" style={{ marginTop: 10 }}>
								Only the owner can switch an agent off or change its limits.
							</p>
						)}
					</Card>

					<Card title={`Instructions, version ${role.instructionsVersion}`}>
						<pre className="wai-pre">{role.instructions}</pre>
						<details style={{ marginTop: 10 }}>
							<summary className="wai-small">Rules shared by every agent</summary>
							<pre className="wai-pre" style={{ marginTop: 8 }}>
								{SHARED_RULES}
							</pre>
						</details>
					</Card>

					<Card title="Skills" aside={<Link href={`${WORKSPACE_PATH}/skills`}>All skills</Link>}>
						<p className="wai-help" style={{ marginTop: 0 }}>
							The written procedure this agent follows, and the shared foundations behind it. Being assigned a
							skill is not the same as following it: a skill guides work only once its exact version is
							approved, and at most {MAX_FOUNDATIONS_PER_STEP} foundations are loaded for a step.
						</p>
						<ul className="wai-list">
							{skills.map((row) => (
								<li key={row.skill.id}>
									<span>
										<Link href={`${WORKSPACE_PATH}/skills/${row.skill.id}`}>{row.skill.title}</Link>
										<span className="wai-muted wai-small">
											{" "}
											· {row.skill.kind === "role-pack" ? "role pack" : "foundation"} · version{" "}
											{row.active ? row.active.version : row.skill.version}
											{row.usage.completed > 0 ? ` · followed ${row.usage.completed} times` : ""}
										</span>
									</span>
									<Pill tone={row.active ? "good" : row.standing === "evaluated" ? "pink" : "plain"}>
										{STANDING_LABELS[row.standing]}
									</Pill>
								</li>
							))}
						</ul>
						<p className="wai-muted wai-small" style={{ marginBottom: 0 }}>
							Not built yet: recorded lessons and a quality scorecard for each agent.
						</p>
					</Card>
				</div>
			</div>
		</>
	);
}
