import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	ENTRY_KINDS,
	SEVERITIES,
	getDeviation,
	type CorrectiveAction,
	type EntryKind,
} from "@/lib/worldwide-ai/lab/quality";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { qualityAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	When,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Deviation" };

type Props = { params: Promise<{ id: string }> };

const QUALITY = `${WORKSPACE_PATH}/quality`;
const ACTION_STATE: Record<CorrectiveAction["status"], { label: string; tone: Tone }> = {
	open: { label: "Open", tone: "warn" },
	done: { label: "Done, not verified", tone: "pink" },
	verified: { label: "Verified to have worked", tone: "good" },
	cancelled: { label: "Cancelled", tone: "plain" },
};
const ORDER: readonly EntryKind[] = [
	"containment",
	"scope",
	"suspected_cause",
	"established_finding",
	"note",
];

/** One deviation: what happened, the investigation as it was written, the actions, and how it was closed. */
export default async function DeviationPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const today = opsDayKey(now);
	const deviation = await getDeviation(sql, id);
	if (!deviation) notFound();
	const open = deviation.status === "open";
	const unfinished = deviation.actions.filter((a) => a.status === "open" || a.status === "done");
	const established = deviation.entries.some((entry) => entry.kind === "established_finding");
	const standsInTheWay = [
		...(unfinished.length
			? [
					`${unfinished.length} action${unfinished.length === 1 ? " is" : "s are"} not yet verified to have worked or cancelled.`,
				]
			: []),
		...(established
			? []
			: [
					"Nothing is recorded as established. Add an established finding, even if it is that the cause couldn't be found.",
				]),
	];

	return (
		<>
			<PageHeader
				title={`${deviation.code}: ${deviation.title}`}
				crumbs={[
					{ label: "Quality", href: QUALITY },
					{ label: "Deviations", href: `${QUALITY}/deviations` },
					{ label: deviation.code },
				]}
				lead={deviation.description}
				actions={
					<Pill tone={open ? "warn" : "plain"}>
						{open ? `${SEVERITIES[deviation.severity]}, open` : `${SEVERITIES[deviation.severity]}, closed`}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{!open && (
						<Notice tone="good" title="Closed by the owner.">
							{deviation.disposition} <When at={deviation.closedAt} now={now} />
						</Notice>
					)}
					<Card title="The investigation">
						<p className="wai-help" style={{ marginTop: 0 }}>
							Each entry is kept as it was written, so what was suspected stays apart from what was
							established.
						</p>
						{deviation.entries.length === 0 ? (
							<Empty>Nothing has been recorded yet.</Empty>
						) : (
							ORDER.filter((kind) => deviation.entries.some((entry) => entry.kind === kind)).map((kind) => (
								<div key={kind} style={{ marginTop: 12 }}>
									<h3 className="wai-label" style={{ margin: 0 }}>
										{ENTRY_KINDS[kind]}
									</h3>
									<ul className="wai-list">
										{deviation.entries
											.filter((entry) => entry.kind === kind)
											.map((entry) => (
												<li key={entry.id} style={{ display: "block" }}>
													{entry.body}
													<p className="wai-muted wai-small" style={{ margin: "4px 0 0" }}>
														<When at={entry.at} now={now} />
													</p>
												</li>
											))}
									</ul>
								</div>
							))
						)}
						{open && (
							<details style={{ marginTop: 12 }} open={deviation.entries.length === 0}>
								<summary className="wai-small">Add to the investigation</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={qualityAction}
										hidden={{ intent: "deviation.entry", deviationId: deviation.id }}
										idPrefix="entry"
										submit="Add the entry"
										fields={[
											{
												name: "kind",
												label: "What this is",
												kind: "select",
												required: true,
												options: Object.entries(ENTRY_KINDS).map(([value, label]) => ({ value, label })),
											},
											{
												name: "body",
												label: "Entry",
												kind: "textarea",
												required: true,
												rows: 3,
												help: "A suspected cause is a suspicion. Use an established finding only for what the evidence shows.",
											},
										]}
									/>
								</div>
							</details>
						)}
					</Card>

					<Card
						title="Corrective and preventive actions"
						aside={
							<Pill tone={unfinished.length ? "warn" : "plain"}>
								{deviation.actions.length === 0 ? "None" : `${unfinished.length} unfinished`}
							</Pill>
						}
					>
						{deviation.actions.length === 0 ? (
							<Empty>No action has been recorded.</Empty>
						) : (
							<ul className="wai-list">
								{deviation.actions.map((action) => (
									<li key={action.id} style={{ display: "block" }}>
										<div className="wai-row" style={{ gap: 8, flexWrap: "wrap" }}>
											<strong>{action.action}</strong>
											<Pill tone={ACTION_STATE[action.status].tone}>{ACTION_STATE[action.status].label}</Pill>
											{action.status === "open" && action.dueOn && action.dueOn < today && (
												<Pill tone="bad">Overdue</Pill>
											)}
										</div>
										<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
											{action.responsible}
											{action.dueOn ? `, due ${formatDay(action.dueOn)}` : ", no due date"}.
										</p>
										{action.evidence && (
											<p className="wai-small" style={{ margin: "4px 0" }}>
												Done <When at={action.doneAt} now={now} />: {action.evidence}
											</p>
										)}
										{action.effectiveness && (
											<p className="wai-small" style={{ margin: "4px 0" }}>
												Verified <When at={action.verifiedAt} now={now} />: {action.effectiveness}
											</p>
										)}
										{action.cancelReason && (
											<p className="wai-small" style={{ margin: "4px 0" }}>
												Cancelled: {action.cancelReason}
											</p>
										)}
										{open && action.status === "open" && (
											<ButtonForm
												action={qualityAction}
												hidden={{ intent: "deviation.action.step", actionId: action.id, step: "done" }}
												label="Mark done"
												small
												note={{ label: "What was done, and where the evidence is", required: true }}
												idPrefix={`done-${action.id}`}
											/>
										)}
										{open && action.status === "done" && workspace.isOwner && (
											<ButtonForm
												action={qualityAction}
												hidden={{ intent: "deviation.action.step", actionId: action.id, step: "verified" }}
												label="Verify that it worked"
												tone="primary"
												small
												note={{ label: "What showed that it worked", required: true }}
												idPrefix={`verified-${action.id}`}
											/>
										)}
										{open && (action.status === "open" || action.status === "done") && workspace.isOwner && (
											<details style={{ marginTop: 6 }}>
												<summary className="wai-small">Cancel this action</summary>
												<div style={{ marginTop: 6 }}>
													<ButtonForm
														action={qualityAction}
														hidden={{
															intent: "deviation.action.step",
															actionId: action.id,
															step: "cancelled",
														}}
														label="Cancel it"
														tone="danger"
														small
														note={{ label: "Why it isn't needed", required: true }}
														idPrefix={`cancel-${action.id}`}
													/>
												</div>
											</details>
										)}
									</li>
								))}
							</ul>
						)}
						{open && (
							<details style={{ marginTop: 12 }} open={deviation.actions.length === 0}>
								<summary className="wai-small">Add an action</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={qualityAction}
										hidden={{ intent: "deviation.action.add", deviationId: deviation.id }}
										idPrefix="action"
										submit="Add the action"
										fields={[
											{
												name: "action",
												label: "What is to be done",
												kind: "textarea",
												required: true,
												rows: 2,
											},
											{
												name: "responsible",
												label: "Who is responsible",
												kind: "text",
												required: true,
												maxLength: 120,
											},
											{
												name: "dueOn",
												label: "Due",
												kind: "date",
												help: "Leave blank when no date has been agreed. One is never made up.",
											},
										]}
									/>
								</div>
							</details>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="About this deviation">
						<KeyValues
							items={[
								["Seriousness", SEVERITIES[deviation.severity]],
								[
									"Batch",
									deviation.batchId ? (
										<Link key="b" href={`${WORKSPACE_PATH}/lab/batches/${deviation.batchId}`}>
											{deviation.batchCode}
										</Link>
									) : (
										"Not about one batch"
									),
								],
								["Opened", <When key="o" at={deviation.openedAt} now={now} />],
								[
									"Closed",
									deviation.closedAt ? <When key="c" at={deviation.closedAt} now={now} /> : "Not yet",
								],
							]}
						/>
						{open && deviation.batchId && (
							<p className="wai-help">
								While this is open, batch {deviation.batchCode} can’t be released. Opening a deviation doesn’t
								stop it being packaged: a hold does that.
							</p>
						)}
					</Card>
					{open && (
						<Card title="Close">
							{standsInTheWay.length > 0 ? (
								<Notice tone="warn" title="It can’t be closed yet.">
									{standsInTheWay.join(" ")}
								</Notice>
							) : workspace.isOwner ? (
								<ButtonForm
									action={qualityAction}
									hidden={{ intent: "deviation.close", deviationId: deviation.id }}
									label="Close this deviation"
									tone="primary"
									note={{
										label: "Disposition: what was decided, and what happens to the stock",
										required: true,
									}}
									idPrefix="close"
								/>
							) : (
								<p className="wai-muted wai-small" style={{ margin: 0 }}>
									Only the owner can close a deviation.
								</p>
							)}
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
