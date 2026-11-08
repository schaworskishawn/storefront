import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { listFindings } from "@/lib/worldwide-ai/findings";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { findingAction } from "@/lib/worldwide-ai/web/actions";
import { loadWaiting } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, Empty, PageHeader, Pill, When, resultHref } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Review Queue" };

/** Everything waiting for a person's decision, in one place. Agents put work here; only people take it out. */
export default async function ReviewPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [waiting, findings] = await Promise.all([
		loadWaiting(workspace),
		listFindings(sql, { status: "open", limit: 50 }),
	]);

	return (
		<>
			<PageHeader
				title="Review Queue"
				lead="Drafts and results wait here until a person accepts or rejects them. An agent can't approve its own work, and a task is only completed after the accepted record has been read back and checked."
			/>
			<div className="wai-grid wai-grid--2">
				<Card title="Support drafts" aside={<span className="wai-count">{waiting.drafts.length}</span>}>
					{waiting.drafts.length === 0 ? (
						<Empty>No reply draft is waiting.</Empty>
					) : (
						<ul className="wai-list">
							{waiting.drafts.map((draft) => (
								<li key={draft.id}>
									<span>
										<Link href={`${WORKSPACE_PATH}/support/drafts/${draft.id}`}>
											{draft.subject ?? "Reply draft"}
										</Link>
										<span className="wai-muted wai-small">
											{" "}
											· <When at={draft.createdAt} now={now} />
										</span>
									</span>
									<span className="wai-row">
										{draft.warnings.length > 0 && <Pill tone="warn">{draft.warnings.length} to read</Pill>}
										<Pill tone={draft.sourceStatus === "ok" ? "good" : "warn"}>
											{draft.sourceStatus === "ok"
												? "Sources current"
												: draft.sourceStatus === "stale"
													? "Source out of date"
													: "No source matched"}
										</Pill>
									</span>
								</li>
							))}
						</ul>
					)}
				</Card>

				<Card title="Agent results" aside={<span className="wai-count">{waiting.products.length}</span>}>
					{waiting.products.length === 0 ? (
						<Empty>No result is waiting to be accepted.</Empty>
					) : (
						<ul className="wai-list">
							{waiting.products.map((product) => (
								<li key={product.id}>
									<span>
										<Link href={resultHref(product.id)}>{product.summary}</Link>
										<span className="wai-muted wai-small">
											{" "}
											· {ROLE_BY_ID[product.agentId].name} · <When at={product.createdAt} now={now} />
										</span>
									</span>
									<span className="wai-row">
										{product.scope !== "business" && <Pill tone="info">Private to you</Pill>}
										{product.warnings.length > 0 && (
											<Pill tone="warn">{product.warnings.length} to check</Pill>
										)}
									</span>
								</li>
							))}
						</ul>
					)}
				</Card>

				<Card title="Document versions" aside={<span className="wai-count">{waiting.versions.length}</span>}>
					{waiting.versions.length === 0 ? (
						<Empty>No document version is waiting for approval.</Empty>
					) : (
						<>
							{!workspace.isOwner && (
								<p className="wai-help" style={{ marginTop: 0 }}>
									Only the owner can approve these.
								</p>
							)}
							<ul className="wai-list">
								{waiting.versions.map((version) => (
									<li key={version.id}>
										<span>
											<Link href={`${WORKSPACE_PATH}/knowledge/${version.documentId}`}>
												{version.documentTitle}
											</Link>
											<span className="wai-muted wai-small">
												{" "}
												· version {version.version} · <When at={version.createdAt} now={now} />
											</span>
										</span>
										<Pill tone="pink">Waiting</Pill>
									</li>
								))}
							</ul>
						</>
					)}
				</Card>

				<Card title="Open findings" aside={<span className="wai-count">{findings.length}</span>}>
					{findings.length === 0 ? (
						<Empty>No finding is open.</Empty>
					) : (
						<ul className="wai-list">
							{findings.map((finding) => (
								<li key={finding.id} style={{ alignItems: "flex-start" }}>
									<span style={{ flex: "1 1 260px" }}>
										<Pill
											tone={
												finding.severity === "critical" || finding.severity === "high"
													? "bad"
													: finding.severity === "medium"
														? "warn"
														: "plain"
											}
										>
											{finding.severity}
										</Pill>{" "}
										<strong>{finding.title}</strong>
										<br />
										<span className="wai-muted wai-small">
											{ROLE_BY_ID[finding.roleId].name} · {finding.category} ·{" "}
											<When at={finding.createdAt} now={now} />
										</span>
										{finding.detail && (
											<>
												<br />
												<span className="wai-small">{finding.detail}</span>
											</>
										)}
									</span>
									<span className="wai-row">
										<ButtonForm
											action={findingAction}
											hidden={{ findingId: finding.id, decision: "resolved" }}
											label="Resolved"
											small
											idPrefix={`resolve-${finding.id}`}
										/>
										<ButtonForm
											action={findingAction}
											hidden={{ findingId: finding.id, decision: "dismissed" }}
											label="Dismiss"
											tone="quiet"
											small
											idPrefix={`dismiss-${finding.id}`}
										/>
									</span>
								</li>
							))}
						</ul>
					)}
				</Card>
			</div>
		</>
	);
}
