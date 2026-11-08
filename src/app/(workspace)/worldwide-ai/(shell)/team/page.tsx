import { Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AREA_LABELS, type RoleArea } from "@/lib/worldwide-ai/agents/registry";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { AgentAvatar, lookOf } from "@/ui/sections/worldwide-ai/look";
import { PageHeader, Pill, ReadinessPill, Stat, agentHref } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Team" };

/** All 49 agents. Each card shows what the agent's main button does and whether that can run right now, and why not. */
export default async function TeamPage() {
	const workspace = await getWorkspace();
	const { team } = await loadTeam(workspace);
	const { totals } = team;
	const running = Number(
		(
			await workspace.runtime.sql.query<{ n: number }>(
				`select count(*)::int as n from wai_tasks where state = 'running' and scope = 'business' and not demo`,
			)
		).rows[0].n,
	);
	const areas = [...new Set(team.agents.map((agent) => agent.role.area))] as RoleArea[];

	return (
		<>
			<PageHeader
				title="Team"
				lead="One coordinator and 48 specialists. An agent on this page is a registered role with a real function behind its button; whether that function can run now is shown on each card."
			/>
			<div className="wai-grid wai-grid--4" style={{ marginBottom: 20 }}>
				<Stat value={totals.agents} label="Agents in the roster" />
				<Stat value={totals.enabled} label="Switched on by the owner" />
				<Stat
					value={`${totals.functionsReady} of ${totals.functionsRequired}`}
					label="Functions that can run now"
				/>
				<Stat value={running} label="Tasks running right now" />
			</div>

			{areas.map((area) => {
				const members = team.agents.filter((agent) => agent.role.area === area);
				const { icon: AreaIcon, pink } = lookOf(area);
				return (
					<section key={area} style={{ marginBottom: 28 }} aria-labelledby={`area-${area}`}>
						<h2 className="wai-section-title" id={`area-${area}`}>
							<AreaIcon size={18} aria-hidden />
							{AREA_LABELS[area]}
							<span className="wai-muted">{members.length}</span>
						</h2>
						<div className="wai-grid wai-grid--3">
							{members.map(({ role, enabled, primary, functions, planned }) => (
								<Link
									key={role.id}
									href={agentHref(role.id)}
									className="wai-card wai-card--link wai-agent-card"
									data-tone={pink ? "pink" : "cyan"}
								>
									<div className="wai-agent">
										<div className="wai-agent-top">
											<AgentAvatar id={role.id} area={role.area} />
											<div>
												<h3>{role.name}</h3>
												<span>{role.title}</span>
											</div>
											<span className="wai-agent-no">{String(role.number).padStart(2, "0")}</span>
										</div>
										<div className="wai-row">
											<ReadinessPill status={primary.status} />
										</div>
										<p className="wai-agent-action">
											<Zap size={15} aria-hidden />
											{functions.find((f) => f.kind === role.primary)?.action ?? "No function"}
										</p>
										<p className="wai-muted wai-small" style={{ margin: 0, flex: 1 }}>
											{primary.status === "ready"
												? role.mission
												: primary.status === "disabled"
													? "Switched off by the owner. Nothing new will start for it."
													: `${primary.reasons.join(" ")}${primary.missing.length ? ` Missing: ${primary.missing.join(", ")}.` : ""}`}
										</p>
										<div className="wai-row">
											{!enabled && <Pill>Switched off</Pill>}
											{functions.length > 1 && (
												<span className="wai-muted wai-small">{functions.length} functions</span>
											)}
											{planned.length > 0 && (
												<span className="wai-muted wai-small">{planned.length} not built yet</span>
											)}
										</div>
									</div>
								</Link>
							))}
						</div>
					</section>
				);
			})}
		</>
	);
}
