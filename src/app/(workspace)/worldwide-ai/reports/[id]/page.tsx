import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/worldwide-ai/reports/daily";
import { formatOpsDate, formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ReportView } from "@/ui/sections/worldwide-ai/report-view";
import { Notice, PageHeader, Pill } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Saved report" };

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One saved report exactly as it was stored, or the reason an attempt failed. */
export default async function SavedReportPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const saved = UUID.test(id) ? await getReport(workspace.runtime.sql, id) : null;
	if (!saved) notFound();
	const name = saved.kind === "morning" ? "Morning report" : "Evening recap";

	return (
		<>
			<PageHeader
				title={`${name}: ${formatOpsDate(saved.periodEnd)}`}
				crumbs={[
					{ label: "Daily Reports", href: `${WORKSPACE_PATH}/reports` },
					{ label: formatOpsDate(saved.periodEnd) },
				]}
				lead={`Generated ${formatOpsDateTime(saved.completedAt ?? saved.startedAt)} by ${
					saved.requestedBy.startsWith("system:") ? "the schedule" : "a person"
				}${saved.attempt > 1 ? `, attempt ${saved.attempt} for this day` : ""}.`}
				actions={
					<Pill tone={saved.status === "completed" ? "good" : saved.status === "failed" ? "bad" : "info"}>
						{saved.status === "completed"
							? "Saved"
							: saved.status === "failed"
								? "Failed"
								: "Being generated"}
					</Pill>
				}
			/>
			{saved.status === "failed" && (
				<Notice tone="bad" title="This attempt failed and saved no report.">
					{saved.error}
				</Notice>
			)}
			{saved.status === "generating" && (
				<Notice tone="info" title="This report is still being generated.">
					Reload in a moment. A run that stops is marked failed after fifteen minutes so the day isn’t
					blocked.
				</Notice>
			)}
			{saved.report && !saved.intact && (
				<Notice
					tone="bad"
					title="This saved report no longer matches the checksum recorded when it was saved."
				>
					Don’t rely on it.
				</Notice>
			)}
			{saved.report && <ReportView report={saved.report} />}
		</>
	);
}
