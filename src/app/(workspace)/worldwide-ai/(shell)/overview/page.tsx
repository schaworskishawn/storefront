import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { countOpenFindings } from "@/lib/worldwide-ai/findings";
import { countTasksByState } from "@/lib/worldwide-ai/tasks/repo";
import { TASK_STATES, WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { summarizeUsage } from "@/lib/worldwide-ai/usage";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { Card, DataTable, Empty, PageHeader, Stat, agentHref } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Overview" };

/** Counts across the workspace, each one read from the records. A figure that can't be known is said to be unavailable, not shown as zero. */
export default async function OverviewPage() {
	const workspace = await getWorkspace();
	const { sql, now } = workspace.runtime;
	const since = new Date(now().getTime() - 7 * 86_400_000);
	const [tasks, findings, usage, { team }] = await Promise.all([
		countTasksByState(sql),
		countOpenFindings(sql),
		summarizeUsage(sql, since),
		loadTeam(workspace),
	]);
	const label = (state: string) =>
		state === "needs_review"
			? "Awaiting review"
			: state.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

	return (
		<>
			<PageHeader
				title="Overview"
				lead="Shared work only: private Focus plans and labelled demonstration runs are never counted here."
			/>
			<div className="wai-stack">
				<section aria-labelledby="ov-tasks">
					<h2 className="wai-h2" id="ov-tasks">
						Tasks by state
					</h2>
					<div className="wai-grid wai-grid--4">
						{TASK_STATES.map((state) => (
							<Stat
								key={state}
								value={tasks[state]}
								label={label(state)}
								href={`${WORKSPACE_PATH}/tasks?state=${state}`}
							/>
						))}
					</div>
				</section>

				<div className="wai-grid wai-grid--2">
					<Card
						title="Open findings by severity"
						aside={<Link href={`${WORKSPACE_PATH}/review`}>Review queue</Link>}
					>
						<dl className="wai-kv">
							{(["critical", "high", "medium", "low", "info"] as const).map((severity) => (
								<div key={severity} style={{ display: "contents" }}>
									<dt>{severity.replace(/^./, (c) => c.toUpperCase())}</dt>
									<dd className="wai-num">{findings[severity]}</dd>
								</div>
							))}
						</dl>
					</Card>
					<Card title="Team readiness" aside={<Link href={`${WORKSPACE_PATH}/team`}>Team</Link>}>
						<dl className="wai-kv">
							<dt>Agents in the roster</dt>
							<dd className="wai-num">{team.totals.agents}</dd>
							<dt>Switched on</dt>
							<dd className="wai-num">{team.totals.enabled}</dd>
							<dt>Baseline functions ready</dt>
							<dd className="wai-num">
								{team.totals.baselinesReady} of {team.totals.agents}
							</dd>
							<dt>All functions ready</dt>
							<dd className="wai-num">
								{team.totals.functionsReady} of {team.totals.functionsRequired}
							</dd>
							<dt>Capabilities not built yet</dt>
							<dd className="wai-num">{team.totals.planned}</dd>
						</dl>
					</Card>
				</div>

				<Card title="Usage in the last 7 days">
					{usage.length === 0 ? (
						<Empty>No model or tool call has been recorded in the last 7 days.</Empty>
					) : (
						<DataTable
							caption="Token counts are as the provider reported them. Cost is unavailable: no price is configured, so none is estimated."
							columns={["Agent", "Model calls", "Tool calls", "Refused calls", "Tokens in", "Tokens out"]}
							numeric={[1, 2, 3, 4, 5]}
							rows={usage.map((row) => [
								<Link key="a" href={agentHref(row.roleId)}>
									{ROLE_BY_ID[row.roleId]?.name ?? row.roleId}
								</Link>,
								row.modelCalls,
								row.toolCalls,
								row.deniedCalls,
								row.inputTokens.toLocaleString("en-CA"),
								row.outputTokens.toLocaleString("en-CA"),
							])}
						/>
					)}
				</Card>
			</div>
		</>
	);
}
