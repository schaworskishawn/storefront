import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	LICENCE_STANDING_LABELS,
	LICENCE_STATUSES,
	getLicence,
	licenceStanding,
	type LicenceEvent,
} from "@/lib/worldwide-ai/compliance/licences";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { LICENCE_FIELDS, LICENCE_TONES } from "@/ui/sections/worldwide-ai/compliance-fields";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, KeyValues, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Licence" };

type Props = { params: Promise<{ id: string }> };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;
const who = (key: string | null) => (key ? key.replace(/^operator:/, "") : "—");
const KINDS: Record<LicenceEvent["kind"], string> = {
	recorded: "Recorded",
	renewed: "Renewed",
	changed: "Changed",
	status: "Status changed",
};

/** What changed between two versions of a licence, field by field. */
function changes(event: LicenceEvent): string {
	if (!event.before) return "First recorded.";
	const changed = Object.keys(event.after).filter(
		(key) => JSON.stringify(event.after[key]) !== JSON.stringify(event.before?.[key]),
	);
	return changed.length
		? changed
				.map((key) => `${key}: ${String(event.before?.[key] ?? "—")} → ${String(event.after[key] ?? "—")}`)
				.join("; ")
		: "No field changed.";
}

/** One licence: what it covers, its dates, its history, and the open questions about it. */
export default async function LicencePage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const found = await getLicence(workspace.runtime.sql, id);
	if (!found) notFound();
	const { licence, events, questions } = found;
	const now = workspace.runtime.now();
	const { standing, daysLeft } = licenceStanding(licence, opsDayKey(now));
	const open = questions.filter((q) => q.answer === null);
	const current: Record<string, string> = {
		name: licence.name,
		authority: licence.authority,
		reference: licence.reference ?? "",
		scope: licence.scope,
		premises: licence.premises ?? "",
		responsible: licence.responsible,
		securityObligations: licence.securityObligations ?? "",
		evidence: licence.evidence ?? "",
		status: licence.status,
		issuedOn: licence.issuedOn ?? "",
		expiresOn: licence.expiresOn ?? "",
		renewBy: licence.renewBy ?? "",
		remindDays: String(licence.remindDays),
	};

	return (
		<>
			<PageHeader
				title={licence.name}
				crumbs={[
					{ label: "Canadian Compliance", href: COMPLIANCE },
					{ label: "Licences", href: `${COMPLIANCE}/licences` },
					{ label: licence.name },
				]}
				lead={`Issued by ${licence.authority}${licence.reference ? `, number ${licence.reference}` : ""}.`}
				actions={
					<Pill tone={LICENCE_TONES[standing]}>
						{LICENCE_STANDING_LABELS[standing]}
						{daysLeft !== null ? (daysLeft >= 0 ? `, ${daysLeft} days left` : `, ${-daysLeft} days ago`) : ""}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="As it reads">
						<p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{licence.scope}</p>
						<KeyValues
							items={[
								["Status", LICENCE_STATUSES[licence.status]],
								["Premises", licence.premises ?? "—"],
								["Responsible", licence.responsible],
								["Conditions", licence.securityObligations ?? "—"],
								["Issued", formatDay(licence.issuedOn)],
								["Expires", formatDay(licence.expiresOn)],
								["Renewal due by", formatDay(licence.renewBy)],
								["Warning", `${licence.remindDays} days before`],
								["Document kept at", licence.evidence ?? "—"],
							]}
						/>
					</Card>
					<Card
						title="Questions about what it covers"
						aside={open.length ? <Pill tone="warn">{open.length} open</Pill> : undefined}
					>
						{questions.length === 0 ? (
							<Empty>No question has been asked.</Empty>
						) : (
							<div className="wai-stack">
								{questions.map((question) => (
									<div key={question.id} className="wai-card" style={{ padding: 12 }}>
										<p style={{ marginTop: 0 }}>
											<strong>{question.question}</strong>
										</p>
										<p className="wai-muted wai-small">
											Asked by {who(question.raisedBy)}, <When at={question.raisedAt} now={now} />
										</p>
										{question.answer ? (
											<p style={{ marginBottom: 0 }}>
												{question.answer}{" "}
												<span className="wai-muted wai-small">
													({who(question.answeredBy)}, <When at={question.answeredAt} now={now} />)
												</span>
											</p>
										) : workspace.isOwner ? (
											<ButtonForm
												action={complianceAction}
												hidden={{ intent: "licence.answer", questionId: question.id }}
												label="Answer"
												note={{ label: "The answer, and where it came from", required: true }}
												small
												idPrefix={`answer-${question.id}`}
											/>
										) : (
											<Pill tone="warn">Open</Pill>
										)}
									</div>
								))}
							</div>
						)}
						<div style={{ marginTop: 12 }}>
							<FieldsForm
								action={complianceAction}
								hidden={{ intent: "licence.question", licenceId: licence.id }}
								idPrefix="question"
								submit="Ask"
								fields={[
									{
										name: "question",
										label: "A question about its scope",
										kind: "textarea",
										required: true,
										rows: 2,
									},
								]}
							/>
						</div>
					</Card>
					<Card title="History">
						<DataTable
							caption="Newest first. What it said before each change is kept."
							columns={["When", "What", "By", "Changes", "Note"]}
							rows={events.map((event) => [
								<When key="w" at={event.at} now={now} />,
								KINDS[event.kind],
								who(event.actor),
								changes(event),
								event.note ?? "—",
							])}
						/>
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record a renewal or a change">
						{workspace.isOwner ? (
							<FieldsForm
								action={complianceAction}
								hidden={{ intent: "licence.change", licenceId: licence.id }}
								idPrefix="change"
								submit="Record it"
								initial={current}
								fields={[
									{
										name: "kind",
										label: "What happened",
										kind: "select",
										required: true,
										options: [
											{ value: "renewed", label: "It was renewed" },
											{ value: "changed", label: "Something on it changed" },
											{ value: "status", label: "Its status changed" },
										],
									},
									...LICENCE_FIELDS,
									{
										name: "note",
										label: "What happened, and what shows it",
										kind: "text",
										required: true,
										maxLength: 1000,
									},
								]}
							/>
						) : (
							<p className="wai-muted wai-small" style={{ margin: 0 }}>
								Only the owner records a renewal or a change.
							</p>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
