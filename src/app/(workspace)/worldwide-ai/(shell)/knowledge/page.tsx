import type { Metadata } from "next";
import Link from "next/link";
import { KNOWLEDGE_COLLECTIONS, collectionLabel } from "@/lib/worldwide-ai/atlas/collections";
import { listDocuments } from "@/lib/worldwide-ai/atlas/service";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { createDocumentAction, scheduledNowAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Knowledge" };

/**
 * Atlas's library. Only an approved, current version of a document is ever used as a source; a document past its review
 * date is used but flagged; an expired one is not used at all. Approving a version is the owner's decision.
 */
export default async function KnowledgePage() {
	const workspace = await getWorkspace();
	const { sql, now } = workspace.runtime;
	const documents = await listDocuments(
		sql,
		{},
		{ now: now(), staleAfterDays: workspace.config.staleAfterDays },
	);

	return (
		<>
			<PageHeader
				title="Knowledge"
				lead="The approved documents the agents may rely on, with their owner, source and every version. Relay can only cite what is approved and current here."
				actions={
					<>
						<Link href={`${WORKSPACE_PATH}/team/atlas`} className="wai-btn">
							Ask Atlas to review the library
						</Link>
					</>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Documents">
						{documents.length === 0 ? (
							<Empty>
								The library is empty. Until an approved document exists, Relay can only write a holding reply.
							</Empty>
						) : (
							<DataTable
								caption={`${documents.length} ${documents.length === 1 ? "document" : "documents"}. A document counts as stale ${workspace.config.staleAfterDays} days after approval unless it has its own review date.`}
								columns={["Document", "Collection", "Status", "Version", "Review due", "Owner"]}
								numeric={[3]}
								rows={documents.map((doc) => [
									<Link key="d" href={`${WORKSPACE_PATH}/knowledge/${doc.id}`}>
										{doc.title}
									</Link>,
									collectionLabel(doc.collection),
									<span key="s" className="wai-row">
										<Pill
											tone={doc.status === "approved" ? "good" : doc.status === "retired" ? "plain" : "pink"}
										>
											{doc.status === "draft" ? "Not approved" : doc.status}
										</Pill>
										{doc.freshness && doc.freshness.state !== "current" && (
											<Pill tone={doc.freshness.state === "expired" ? "bad" : "warn"}>
												{doc.freshness.state}
											</Pill>
										)}
										{doc.pendingVersion !== null && doc.status !== "draft" && (
											<Pill tone="pink">v{doc.pendingVersion} waiting</Pill>
										)}
									</span>,
									doc.currentVersion ?? "—",
									doc.reviewDue ?? "—",
									doc.owner,
								])}
							/>
						)}
					</Card>
					<Card title="Scan for reviews and expiry">
						<p style={{ marginTop: 0 }}>
							Review checks every document for overdue reviews, approaching expiry and versions left
							unapproved, and records a finding for each. It also runs each morning when Trigger.dev is
							configured.
						</p>
						<ButtonForm
							action={scheduledNowAction}
							hidden={{ kind: "review.document_scan" }}
							label="Scan the library now"
							idPrefix="scan"
						/>
					</Card>
				</div>
				<Card title="Add a document">
					<p className="wai-help" style={{ marginTop: 0 }}>
						A new document starts as a draft. It isn’t used as a source until the owner approves it.
					</p>
					<FieldsForm
						action={createDocumentAction}
						submit="Add as a draft"
						idPrefix="doc"
						fields={[
							{
								name: "collection",
								label: "Collection",
								kind: "select",
								required: true,
								options: KNOWLEDGE_COLLECTIONS.map((c) => ({ value: c.id, label: c.label })),
							},
							{ name: "title", label: "Title", kind: "text", required: true, maxLength: 200 },
							{
								name: "owner",
								label: "Owner",
								kind: "text",
								required: true,
								maxLength: 120,
								help: "The person responsible for keeping it right.",
							},
							{
								name: "source",
								label: "Where it comes from",
								kind: "text",
								required: true,
								maxLength: 300,
								placeholder: "Returns page on the website, October 2026",
							},
							{ name: "content", label: "Text", kind: "textarea", required: true, rows: 10 },
							{ name: "reviewDue", label: "Review by", kind: "date" },
							{
								name: "expiresAt",
								label: "Expires",
								kind: "date",
								help: "After this date it is no longer used as a source.",
							},
						]}
					/>
				</Card>
			</div>
		</>
	);
}
