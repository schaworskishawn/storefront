import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { collectionLabel } from "@/lib/worldwide-ai/atlas/collections";
import { getDocument } from "@/lib/worldwide-ai/atlas/service";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { documentAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, Empty, KeyValues, Notice, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Document" };

type Props = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DocumentPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const { sql, now } = workspace.runtime;
	const found = await getDocument(sql, id, { now: now(), staleAfterDays: workspace.config.staleAfterDays });
	if (!found) notFound();
	const { document, versions } = found;
	const current = versions.find((v) => v.version === document.currentVersion && v.status === "approved");
	const pending = versions.filter((v) => v.status === "draft");

	return (
		<>
			<PageHeader
				title={document.title}
				crumbs={[
					{ label: "Knowledge", href: `${WORKSPACE_PATH}/knowledge` },
					{ label: collectionLabel(document.collection) },
				]}
				actions={
					<>
						<Pill
							tone={
								document.status === "approved" ? "good" : document.status === "retired" ? "plain" : "pink"
							}
						>
							{document.status === "draft" ? "Not approved" : document.status}
						</Pill>
						{document.freshness && (
							<Pill
								tone={
									document.freshness.state === "current"
										? "good"
										: document.freshness.state === "stale"
											? "warn"
											: "bad"
								}
							>
								{document.freshness.state}
							</Pill>
						)}
					</>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{document.freshness && document.freshness.state !== "current" && (
						<Notice
							tone={document.freshness.state === "expired" ? "bad" : "warn"}
							title={
								document.freshness.state === "expired"
									? "Expired: no longer used as a source."
									: "Out of date: still used, and flagged wherever it is cited."
							}
						>
							{document.freshness.reasons.join(" ")}
						</Notice>
					)}

					{pending.map((version) => (
						<Card key={version.id} title={`Version ${version.version} is waiting for approval`} accent>
							<pre className="wai-pre">{version.content}</pre>
							<p className="wai-help">
								Submitted <When at={version.createdAt} now={now()} />. Checksum{" "}
								<span className="wai-mono">{version.contentSha256.slice(0, 16)}…</span>
							</p>
							{workspace.isOwner ? (
								<div className="wai-row" style={{ alignItems: "flex-start" }}>
									<ButtonForm
										action={documentAction}
										hidden={{ documentId: document.id, intent: "approve", version: String(version.version) }}
										label={`Approve version ${version.version}`}
										tone="primary"
										idPrefix={`approve-${version.version}`}
									/>
									<ButtonForm
										action={documentAction}
										hidden={{ documentId: document.id, intent: "reject", version: String(version.version) }}
										label="Reject it"
										tone="danger"
										idPrefix={`reject-${version.version}`}
									/>
								</div>
							) : (
								<Notice tone="info">
									Only the owner can approve or reject a version. It is in the owner’s review queue.
								</Notice>
							)}
						</Card>
					))}

					<Card title={current ? `Approved text, version ${current.version}` : "No approved version"}>
						{current ? (
							<>
								<pre className="wai-pre">{current.content}</pre>
								<p className="wai-help" style={{ marginBottom: 0 }}>
									Approved <When at={current.approvedAt} now={now()} />. Checksum{" "}
									<span className="wai-mono">{current.contentSha256.slice(0, 16)}…</span>
								</p>
							</>
						) : (
							<Empty>Nothing in this document is approved, so no agent can use it as a source.</Empty>
						)}
					</Card>

					{document.status !== "retired" && (
						<Card title="Propose a new version">
							<FieldsForm
								action={documentAction}
								hidden={{ documentId: document.id, intent: "add_version" }}
								submit="Add as a draft version"
								idPrefix="version"
								initial={{ content: current?.content ?? versions[0]?.content ?? "" }}
								fields={[
									{
										name: "content",
										label: "Text",
										kind: "textarea",
										required: true,
										rows: 10,
										help: "The current approved version stays in force until the owner approves this one.",
									},
								]}
							/>
						</Card>
					)}
				</div>

				<div className="wai-stack">
					<Card title="About this document">
						<KeyValues
							items={[
								["Collection", collectionLabel(document.collection)],
								["Owner", document.owner],
								["Source", document.source],
								["Review due", document.reviewDue ?? "Not set"],
								["Expires", document.expiresAt ?? "Never"],
								["Versions", String(document.versionCount)],
							]}
						/>
					</Card>
					<Card title="Version history">
						<ul className="wai-list">
							{versions.map((version) => (
								<li key={version.id}>
									<span>
										Version {version.version}
										<span className="wai-muted wai-small">
											{" "}
											· <When at={version.createdAt} now={now()} />
										</span>
									</span>
									<Pill
										tone={
											version.status === "approved" ? "good" : version.status === "draft" ? "pink" : "plain"
										}
									>
										{version.status === "draft" ? "waiting" : version.status}
									</Pill>
								</li>
							))}
						</ul>
					</Card>
					{workspace.isOwner && document.status !== "retired" && (
						<Card title="Retire">
							<p style={{ marginTop: 0 }} className="wai-small">
								A retired document is never used as a source again. Its history is kept.
							</p>
							<ButtonForm
								action={documentAction}
								hidden={{ documentId: document.id, intent: "retire" }}
								label="Retire this document"
								tone="danger"
								note={{ label: "Reason (optional)" }}
								idPrefix="retire"
							/>
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
