import type { Metadata } from "next";
import Link from "next/link";
import { latestCompletedReport, listReports, type SavedReport } from "@/lib/worldwide-ai/reports/daily";
import { OPS_TIME_ZONE, formatOpsDate } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { checklistAction, reportAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import { ReportView } from "@/ui/sections/worldwide-ai/report-view";
import { Card, DataTable, Notice, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Daily Reports" };

const STATUS_TONE: Record<SavedReport["status"], Tone> = {
	completed: "good",
	generating: "info",
	failed: "bad",
};
const STATUS_LABEL: Record<SavedReport["status"], string> = {
	completed: "Saved",
	generating: "Being generated",
	failed: "Failed",
};
const by = (key: string) => (key.startsWith("system:") ? "The schedule" : "A person");

/** Daily Reports: the latest saved morning report, every earlier one, and a button to generate one now. */
export default async function ReportsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [latest, history] = await Promise.all([latestCompletedReport(sql, "morning"), listReports(sql, 30)]);
	const scheduled = workspace.config.trigger.secretSet;

	return (
		<>
			<PageHeader
				title="Daily Reports"
				lead="Nexus's account of where things stand, assembled by code from the workspace's own records and saved. Every figure is a count of records, every action item links to the record it came from, and nothing is sent anywhere."
			/>
			<div className="wai-stack">
				<Card title="Generate">
					<p className="wai-help" style={{ marginTop: 0 }}>
						{scheduled
							? `A morning report is saved every day at 8:00 a.m. (${OPS_TIME_ZONE}) once the background jobs are deployed. `
							: "Background jobs aren’t configured, so no report is saved by schedule. "}
						Generating one now saves a further report for today and keeps the earlier ones. The evening recap
						is {workspace.config.eveningRecap ? "switched on" : "switched off"} for the schedule; you can
						still generate one here.
					</p>
					<div className="wai-row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
						<ButtonForm
							action={reportAction}
							hidden={{ kind: "morning" }}
							label="Generate the morning report now"
							tone="primary"
							idPrefix="report-morning"
						/>
						<ButtonForm
							action={reportAction}
							hidden={{ kind: "evening" }}
							label="Generate an evening recap now"
							idPrefix="report-evening"
						/>
					</div>
				</Card>

				{latest?.report ? (
					<>
						<h2 className="wai-h2" style={{ marginBottom: 0 }}>
							Latest morning report: {formatOpsDate(latest.periodEnd)}
						</h2>
						{!latest.intact && (
							<Notice
								tone="bad"
								title="This saved report no longer matches the checksum recorded when it was saved."
							>
								Don’t rely on it. Generate a new one.
							</Notice>
						)}
						<ReportView report={latest.report} track={{ reportId: latest.id, action: checklistAction }} />
					</>
				) : (
					<Notice tone="info" title="No morning report has been saved yet.">
						Generate one above. Until the schedule is deployed, that is the only way one is made.
					</Notice>
				)}

				<Card title="Saved reports" aside={<Pill>{history.length}</Pill>}>
					{history.length === 0 ? (
						<p className="wai-muted wai-small" style={{ margin: 0 }}>
							None yet.
						</p>
					) : (
						<DataTable
							caption="Every attempt is kept, including ones that failed."
							columns={["Report", "For", "Status", "Generated", "By", "Needs action"]}
							numeric={[5]}
							rows={history.map((item) => [
								<Link key="r" href={`${WORKSPACE_PATH}/reports/${item.id}`}>
									{item.kind === "morning" ? "Morning report" : "Evening recap"}
									{item.attempt > 1 ? `, attempt ${item.attempt}` : ""}
								</Link>,
								formatOpsDate(item.periodEnd),
								<Pill key="s" tone={STATUS_TONE[item.status]}>
									{STATUS_LABEL[item.status]}
								</Pill>,
								<When key="w" at={item.completedAt ?? item.startedAt} now={now} />,
								by(item.requestedBy),
								item.report ? item.report.actions.length : "—",
							])}
						/>
					)}
				</Card>
			</div>
		</>
	);
}
