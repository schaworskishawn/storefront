import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { loadProductView } from "@/lib/worldwide-ai/functions/pipeline";
import { lookupFunction } from "@/lib/worldwide-ai/functions/registry";
import { formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { reviewResultAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import { ResultView } from "@/ui/sections/worldwide-ai/result-view";
import {
	Bullets,
	Card,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	TaskStatePill,
	When,
	agentHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Result" };

type Props = { params: Promise<{ id: string }> };

/**
 * One stored result. The record is shown as it is stored, with what was missing, what was assumed and what to check placed
 * above it, and the decision (accept or reject) beside it for results that need a person.
 */
export default async function ResultPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const view = await loadProductView(workspace.runtime, id, workspace.viewer);
	if (!view) notFound();
	const { product, task, decisions } = view;
	const role = ROLE_BY_ID[product.agentId];
	const definition = lookupFunction(product.functionId);
	const now = workspace.runtime.now();

	return (
		<>
			<PageHeader
				title={definition?.action ?? product.outputType}
				lead={product.summary}
				crumbs={[
					{ label: "Team", href: `${WORKSPACE_PATH}/team` },
					{ label: role.name, href: agentHref(role.id) },
					{ label: product.outputType },
				]}
				actions={
					<>
						<TaskStatePill state={task.state} />
						{product.demo && <Pill tone="pink">Demonstration data</Pill>}
						{product.scope !== "business" && <Pill tone="info">Private to you</Pill>}
					</>
				}
			/>

			<div className="wai-split">
				<div className="wai-stack">
					{product.demo && (
						<Notice tone="warn" title="This is a demonstration run on fictional input.">
							It shows what the function produces. It is not business data and is no evidence that anything is
							connected.
						</Notice>
					)}
					{product.warnings.length > 0 && (
						<Notice tone="warn" title="Check before relying on this:">
							<ul>
								{product.warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</Notice>
					)}
					{product.missing.length > 0 && (
						<Notice tone="info" title="Could not be determined from what was supplied:">
							<ul>
								{product.missing.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</Notice>
					)}

					<Card title={product.outputType} accent>
						<ResultView payload={product.payload} />
					</Card>

					{product.assumptions.length > 0 && (
						<Card title="Assumptions">
							<Bullets items={product.assumptions} />
						</Card>
					)}
				</div>

				<div className="wai-stack">
					<Card title="Decision">
						{product.reviewState === "pending" ? (
							<div className="wai-stack" style={{ gap: 14 }}>
								<p style={{ margin: 0 }}>
									This result waits for a person. Accepting it completes the task, after the stored record has
									been read back and checked. An agent can’t accept its own work.
								</p>
								<ButtonForm
									action={reviewResultAction}
									hidden={{ productId: product.id, intent: "accept" }}
									label="Accept this result"
									tone="primary"
									note={{ label: "Note (optional)" }}
									idPrefix="accept"
								/>
								<ButtonForm
									action={reviewResultAction}
									hidden={{ productId: product.id, intent: "reject" }}
									label="Reject it"
									tone="danger"
									note={{ label: "Why", required: true, placeholder: "What is wrong with it" }}
									idPrefix="reject"
								/>
							</div>
						) : product.reviewState === "not_required" ? (
							<p style={{ margin: 0 }}>
								No review is required for this kind of result. It was stored, read back and checked by the
								application.
							</p>
						) : (
							<p style={{ margin: 0 }}>
								{product.reviewState === "accepted" ? "Accepted" : "Rejected"}{" "}
								<When at={product.reviewedAt} now={now} />.
								{product.reviewNote ? ` Note: ${product.reviewNote}` : ""}
							</p>
						)}
						{decisions.length > 0 && (
							<ul className="wai-list" style={{ marginTop: 12 }}>
								{decisions.map((decision) => (
									<li key={decision.at}>
										<span>
											{decision.decision} by {decision.reviewerLabel ?? "a person"}
											{decision.note ? `: ${decision.note}` : ""}
										</span>
										<span className="wai-muted wai-small">{formatOpsDateTime(decision.at)}</span>
									</li>
								))}
							</ul>
						)}
					</Card>

					<Card title="Where this came from">
						<KeyValues
							items={[
								["Agent", <Link key="a" href={agentHref(role.id)}>{`${role.name}, ${role.title}`}</Link>],
								[
									"Function",
									<span
										key="f"
										className="wai-mono"
									>{`${product.functionId} v${product.functionVersion}`}</span>,
								],
								[
									"Task",
									<Link key="t" href={taskHref(task.id)}>
										{task.id.slice(0, 8)}
									</Link>,
								],
								["Produced", <When key="w" at={product.createdAt} now={now} />],
								[
									"Written by",
									product.model
										? `${product.model} (prompt ${product.promptVersion ?? "unversioned"}), checked by application code`
										: "Application code only. No model was involved.",
								],
								[
									"Result checksum",
									<span key="p" className="wai-mono">
										{product.payloadSha256.slice(0, 16)}…
									</span>,
								],
								[
									"Input checksum",
									<span key="i" className="wai-mono">
										{product.inputSha256.slice(0, 16)}…
									</span>,
								],
							]}
						/>
					</Card>

					<Card title="Coverage">
						{Object.keys(product.coverage).length === 0 ? (
							<Empty>Nothing recorded.</Empty>
						) : (
							<KeyValues
								items={Object.entries(product.coverage).map(([key, value]) => [key, String(value)])}
							/>
						)}
					</Card>

					<Card title="Sources">
						<Bullets
							items={product.sourceRefs.map((ref) => (
								<span key={`${ref.system}-${ref.id}`}>
									{ref.label ?? ref.id}{" "}
									<span className="wai-muted wai-small">
										({ref.system}
										{ref.version !== undefined ? `, version ${ref.version}` : ""}, read{" "}
										{formatOpsDateTime(ref.retrievedAt)})
									</span>
								</span>
							))}
						/>
					</Card>

					{definition && (
						<Card title="What this is not">
							<p style={{ margin: 0 }}>{definition.notThis}</p>
						</Card>
					)}

					{product.scope === "business" && product.functionId !== "verify.workflow-acceptance" && (
						<Card title="Independent check">
							<p style={{ marginTop: 0 }}>
								Verify can re-read this result, recompute its checksums and re-run the function’s own rules,
								as a separate task.
							</p>
							<Link className="wai-btn" href={`${WORKSPACE_PATH}/team/verify?task=${task.id}`}>
								Ask Verify to check it
							</Link>
							<p className="wai-help" style={{ marginBottom: 0 }}>
								Task id to give Verify: <span className="wai-mono">{task.id}</span>
							</p>
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
