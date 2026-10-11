import type { Metadata } from "next";
import Link from "next/link";
import { buildBriefing } from "@/lib/worldwide-ai/briefing";
import { formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { Bullets, Card, Notice, PageHeader, Pill } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Daily Reports" };

/** The current briefing, assembled by application code from the records at the moment the page loads. */
export default async function ReportsPage() {
	const workspace = await getWorkspace();
	const briefing = await buildBriefing(workspace.runtime.sql, workspace.config, workspace.runtime.now());
	const tone = { action: "pink", attention: "warn", info: "plain" } as const;
	const word = { action: "Needs you", attention: "Attention", info: "For information" } as const;

	return (
		<>
			<PageHeader
				title="Daily Reports"
				lead={`The briefing as of ${formatOpsDateTime(briefing.generatedAt)}. Every figure is a count from the records, not an estimate.`}
			/>
			<div className="wai-split">
				<Card title="Briefing" accent>
					<ul className="wai-list">
						{briefing.items.map((item) => (
							<li key={item.text}>
								<span>
									<Pill tone={tone[item.level]}>{word[item.level]}</Pill> {item.text}
								</span>
								<Link href={item.href}>Open</Link>
							</li>
						))}
					</ul>
				</Card>
				<div className="wai-stack">
					<Notice tone="info" title="Not built yet:">
						<Bullets
							items={[
								"The 8:00 a.m. Winnipeg schedule that saves a report each morning, and the history of saved reports.",
								"The evening recap.",
								"Action items with owners, due dates and checklists, and carry-over between days.",
								"Sections for goals, learning and each department. This briefing covers tasks, reviews, findings, documents and integration health only.",
							]}
						/>
					</Notice>
					<Card title="What the briefing counts">
						<dl className="wai-kv">
							<dt>Drafts awaiting review</dt>
							<dd className="wai-num">{briefing.pendingDrafts}</dd>
							<dt>Document versions awaiting approval</dt>
							<dd className="wai-num">{briefing.pendingDocuments}</dd>
							<dt>Documents expired</dt>
							<dd className="wai-num">{briefing.documentIssues.expired}</dd>
							<dt>Documents past review</dt>
							<dd className="wai-num">{briefing.documentIssues.overdue}</dd>
							<dt>Tasks failed</dt>
							<dd className="wai-num">{briefing.tasks.failed}</dd>
							<dt>Tasks with unknown outcome</dt>
							<dd className="wai-num">{briefing.tasks.outcome_unknown}</dd>
							<dt>Integrations not answering</dt>
							<dd className="wai-num">{briefing.integrations.unhealthy.length}</dd>
						</dl>
					</Card>
				</div>
			</div>
		</>
	);
}
