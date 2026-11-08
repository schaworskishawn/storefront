import type { Metadata } from "next";
import { INTEGRATIONS } from "@/lib/worldwide-ai/integrations/catalog";
import { scheduledNowAction } from "@/lib/worldwide-ai/web/actions";
import { loadTeam } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Notice, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Integrations" };

const HEALTH_TONE: Record<string, Tone> = {
	healthy: "good",
	degraded: "warn",
	unhealthy: "bad",
	not_configured: "plain",
	unknown: "plain",
};

/**
 * What the workspace depends on. Two separate facts per system: whether its settings are present, and whether it answered the
 * last time it was actually asked. Setting names are shown; values never are.
 */
export default async function IntegrationsPage() {
	const workspace = await getWorkspace();
	const { statuses, health } = await loadTeam(workspace);
	const now = workspace.runtime.now();
	const byId = new Map(health.map((h) => [h.integration, h]));
	const connected = statuses.filter((s) => INTEGRATIONS[s.id].hasConnector);
	const notBuilt = statuses.filter((s) => !INTEGRATIONS[s.id].hasConnector);

	return (
		<>
			<PageHeader
				title="Integrations"
				lead="Configured means the settings are present. Health is what happened when the system was last asked. Nothing is shown as healthy that wasn't observed."
				actions={
					<ButtonForm
						action={scheduledNowAction}
						hidden={{ kind: "watch.health_check" }}
						label="Check every integration now"
						tone="primary"
						idPrefix="health"
					/>
				}
			/>
			<div className="wai-stack">
				{!workspace.config.trigger.secretSet && (
					<Notice tone="info" title="Background work is running inside the web application.">
						Trigger.dev isn’t configured, so there are no schedules (no hourly health check, no morning
						document scan, no nightly backup) and long jobs are limited by the web request’s time limit. Set
						TRIGGER_SECRET_KEY to hand them to Trigger.dev.
					</Notice>
				)}
				<Card title="Systems with a connector">
					<DataTable
						caption="Probes are read-only. The model provider and Trigger.dev are not probed (a probe would cost money or do work); their status is from the last real use."
						columns={["System", "What it is for", "Settings", "Last check", "When"]}
						rows={connected.map((status) => {
							const definition = INTEGRATIONS[status.id];
							const last = byId.get(status.id);
							return [
								<strong key="n">{definition.name}</strong>,
								<span key="p">
									{definition.purpose}
									{status.note && (
										<>
											<br />
											<span className="wai-muted wai-small">{status.note}</span>
										</>
									)}
								</span>,
								status.configured ? (
									<Pill tone="good">Configured</Pill>
								) : (
									<span>
										<Pill tone="warn">Missing</Pill>{" "}
										<span className="wai-mono">{status.missing.join(", ")}</span>
									</span>
								),
								last ? (
									<span>
										<Pill tone={HEALTH_TONE[last.status]}>{last.status.replace("_", " ")}</Pill>
										<br />
										<span className="wai-muted wai-small">{last.detail}</span>
									</span>
								) : (
									<span className="wai-muted">Never checked</span>
								),
								last ? <When key="w" at={last.checkedAt} now={now} /> : "—",
							];
						})}
					/>
				</Card>
				<Card title="No connector yet">
					<p className="wai-help" style={{ marginTop: 0 }}>
						Nothing in this application talks to these systems. Agents that would use them work from the
						records you supply instead, and say so.
					</p>
					<DataTable
						caption={`${notBuilt.length} systems the brief names that have no connector in this build.`}
						columns={["System", "What it would be for", "Status"]}
						rows={notBuilt.map((status) => [
							<strong key="n">{INTEGRATIONS[status.id].name}</strong>,
							INTEGRATIONS[status.id].purpose,
							<Pill key="p">Awaiting a connector</Pill>,
						])}
					/>
				</Card>
			</div>
		</>
	);
}
