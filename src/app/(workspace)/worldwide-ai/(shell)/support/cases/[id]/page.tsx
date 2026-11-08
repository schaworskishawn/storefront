import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRoleSettings } from "@/lib/worldwide-ai/agents/settings";
import { functionReadiness } from "@/lib/worldwide-ai/functions/readiness";
import { FUNCTIONS } from "@/lib/worldwide-ai/functions/registry";
import { configStatus } from "@/lib/worldwide-ai/integrations/catalog";
import { getCase } from "@/lib/worldwide-ai/support/cases";
import { listDrafts } from "@/lib/worldwide-ai/support/drafts";
import { findLatestTask } from "@/lib/worldwide-ai/tasks/repo";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { caseStatusAction, requestDraftAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	TaskStatePill,
	When,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Support case" };

type Props = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CasePage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const { sql, now } = workspace.runtime;
	const supportCase = await getCase(sql, id);
	if (!supportCase) notFound();
	const [drafts, latest, settings] = await Promise.all([
		listDrafts(sql, { caseId: id, limit: 20 }),
		findLatestTask(sql, "relay.support_draft", "caseId", id),
		loadRoleSettings(sql, "relay"),
	]);
	const relay = FUNCTIONS.get("relay.support_draft");
	const readiness = relay
		? functionReadiness(relay, { statuses: configStatus(workspace.config), enabled: settings.enabled })
		: null;
	const inProgress =
		latest && (latest.state === "queued" || latest.state === "running" || latest.state === "needs_review");

	return (
		<>
			<PageHeader
				title={supportCase.subject}
				crumbs={[{ label: "Support Drafts", href: `${WORKSPACE_PATH}/support` }, { label: "Case" }]}
				actions={
					<>
						<Pill
							tone={
								supportCase.status === "open"
									? "info"
									: supportCase.status === "draft_ready"
										? "good"
										: "plain"
							}
						>
							{supportCase.status.replace("_", " ")}
						</Pill>
						{supportCase.source === "demo" && <Pill tone="pink">Demonstration data</Pill>}
					</>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="The customer's message">
						<pre className="wai-pre">{supportCase.message}</pre>
						<p className="wai-help" style={{ marginBottom: 0 }}>
							Customer-written text is shown and used as information only. If it contains instructions, they
							are not followed, and the draft says so.
						</p>
					</Card>

					<Card title="Reply drafts">
						{drafts.length === 0 ? (
							<Empty>No draft has been written for this case yet.</Empty>
						) : (
							<ul className="wai-list">
								{drafts.map((draft) => (
									<li key={draft.id}>
										<span>
											<Link href={`${WORKSPACE_PATH}/support/drafts/${draft.id}`}>
												{draft.subject ?? "Reply draft"}
											</Link>
											<span className="wai-muted wai-small">
												{" "}
												· <When at={draft.createdAt} now={now()} />
												{draft.sourceStatus !== "ok" ? ` · sources ${draft.sourceStatus}` : ""}
											</span>
										</span>
										<Pill
											tone={
												draft.state === "pending_review" ? "pink" : draft.state === "saved" ? "good" : "plain"
											}
										>
											{draft.state === "pending_review" ? "Awaiting review" : draft.state}
										</Pill>
									</li>
								))}
							</ul>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Draft a reply" accent>
						{supportCase.status === "closed" ? (
							<Empty>This case is closed.</Empty>
						) : readiness && readiness.status !== "ready" ? (
							<Notice tone="warn" title="Relay can't draft yet.">
								{readiness.reasons.join(" ")}{" "}
								{readiness.missing.length ? `Missing: ${readiness.missing.join(", ")}.` : ""}{" "}
								<Link href={`${WORKSPACE_PATH}/integrations`}>See Integrations</Link>
							</Notice>
						) : inProgress && latest ? (
							<p style={{ margin: 0 }}>
								A draft task is already under way for this case:{" "}
								<Link href={taskHref(latest.id)}>open it</Link> <TaskStatePill state={latest.state} />
							</p>
						) : (
							<>
								<p style={{ marginTop: 0 }}>
									Relay reads this case, asks Atlas for the approved policy that applies, and writes a reply
									that cites it. If nothing approved matches, you get a holding reply and are told so.
								</p>
								<ButtonForm
									action={requestDraftAction}
									hidden={{
										caseId: supportCase.id,
										...(latest?.state === "completed" ? { regenerate: "1" } : {}),
									}}
									label={latest?.state === "completed" ? "Draft a new reply" : "Draft a reply"}
									tone="primary"
									idPrefix="draft"
								/>
							</>
						)}
					</Card>

					<Card title="Case details">
						<KeyValues
							items={[
								["From", supportCase.customerName ?? "Not given"],
								["Email", supportCase.customerEmail ?? "Not given"],
								["Order number", supportCase.orderNumber ?? "Not given"],
								["Received", <When key="r" at={supportCase.receivedAt} now={now()} />],
								[
									"Came in through",
									supportCase.source === "contact_form"
										? "The contact form"
										: supportCase.source === "demo"
											? "Demonstration seed"
											: "Typed in by staff",
								],
							]}
						/>
					</Card>

					<Card title="Status">
						<div className="wai-row">
							{(["open", "resolved", "closed"] as const)
								.filter((status) => status !== supportCase.status)
								.map((status) => (
									<ButtonForm
										key={status}
										action={caseStatusAction}
										hidden={{ caseId: supportCase.id, status }}
										label={`Mark ${status}`}
										tone="quiet"
										small
										idPrefix={`status-${status}`}
									/>
								))}
						</div>
					</Card>
				</div>
			</div>
		</>
	);
}
