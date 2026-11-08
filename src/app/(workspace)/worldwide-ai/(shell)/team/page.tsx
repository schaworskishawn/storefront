import type { Metadata } from "next";
import Link from "next/link";
import { AREA_LABELS, type RoleArea } from "@/lib/worldwide-ai/agents/registry";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
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

			{areas.map((area) => (
				<section key={area} style={{ marginBottom: 24 }} aria-labelledby={`area-${area}`}>
					<h2 className="wai-h2" id={`area-${area}`}>
						{AREA_LABELS[area]}
					</h2>
					<div className="wai-grid wai-grid--3">
						{team.agents
							.filter((agent) => agent.role.area === area)
							.map(({ role, enabled, primary, functions, planned }) => (
								<Link key={role.id} href={agentHref(role.id)} className="wai-card wai-card--link">
									<div className="wai-agent">
										<div className="wai-row" style={{ justifyContent: "space-between" }}>
											<span className="wai-agent-no">{String(role.number).padStart(2, "0")}</span>
											<ReadinessPill status={primary.status} />
										</div>
										<div>
											<h3 className="wai-h3" style={{ fontSize: 16, margin: 0 }}>
												{role.name}
											</h3>
											<span className="wai-muted wai-small">{role.title}</span>
										</div>
										<p className="wai-small" style={{ margin: 0 }}>
											<strong>
												{functions.find((f) => f.kind === role.primary)?.action ?? "No function"}
											</strong>
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
			))}
		</>
	);
}
