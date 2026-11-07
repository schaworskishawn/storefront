import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
	APPLICABILITY,
	RULE_KINDS,
	STANDING_LABELS,
	getRule,
	ruleStanding,
	type RuleVersion,
} from "@/lib/worldwide-ai/compliance/rules";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { VERSION_FIELDS } from "@/ui/sections/worldwide-ai/compliance-fields";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, KeyValues, Notice, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Rule" };

type Props = { params: Promise<{ id: string }> };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;
const who = (key: string | null) => (key ? key.replace(/^operator:/, "") : "—");
const STATUS: Record<RuleVersion["status"], { label: string; tone: Tone }> = {
	draft: { label: "Draft, guides nothing", tone: "info" },
	approved: { label: "Approved", tone: "good" },
	superseded: { label: "Superseded", tone: "plain" },
	rejected: { label: "Rejected", tone: "bad" },
};

/** One rule, every reading of it, and the owner's decision on a draft. */
export default async function RulePage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const found = await getRule(workspace.runtime.sql, id);
	if (!found) notFound();
	const { rule, versions } = found;
	const now = workspace.runtime.now();
	const today = opsDayKey(now);
	const current = versions.find((v) => v.status === "approved") ?? null;
	const draft = versions.find((v) => v.status === "draft") ?? null;
	const standing = ruleStanding(rule, current, draft, today);
	const latest = versions[0];

	return (
		<>
			<PageHeader
				title={`${rule.code}: ${rule.title}`}
				crumbs={[
					{ label: "Canadian Compliance", href: COMPLIANCE },
					{ label: "Rule register", href: `${COMPLIANCE}/rules` },
					{ label: rule.code },
				]}
				lead={`${rule.jurisdiction}. Looked after by ${rule.ownerLabel}.`}
				actions={<Pill tone={standing === "approved" ? "good" : "warn"}>{STANDING_LABELS[standing]}</Pill>}
			/>
			{rule.status === "withdrawn" && (
				<Notice tone="info" title="Withdrawn.">
					{rule.withdrawnReason} Its versions are kept below. None of them guides anything.
				</Notice>
			)}
			{rule.status === "active" && !current && (
				<Notice tone="warn" title="No approved version.">
					Until the owner approves a reading of this rule, nothing relies on it and nothing stands in for it.
				</Notice>
			)}
			<div className="wai-split" style={{ marginTop: 16 }}>
				<div className="wai-stack">
					{versions.map((version) => (
						<Card
							key={version.id}
							title={`Version ${version.version}`}
							aside={<Pill tone={STATUS[version.status].tone}>{STATUS[version.status].label}</Pill>}
							accent={version.status === "approved"}
						>
							<p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{version.summary}</p>
							<KeyValues
								items={[
									["Kind of source", RULE_KINDS[version.kind]],
									[
										"Source",
										version.sourceUrl ? (
											<a key="u" href={version.sourceUrl} target="_blank" rel="noreferrer noopener">
												{version.sourceTitle}
											</a>
										) : (
											version.sourceTitle
										),
									],
									["Read on", formatDay(version.retrievedOn)],
									["Published or changed on", formatDay(version.publishedOn)],
									[
										"In effect",
										version.effectiveFrom
											? `From ${formatDay(version.effectiveFrom)}${version.effectiveTo ? ` to ${formatDay(version.effectiveTo)}` : ""}`
											: "Not recorded",
									],
									[
										"Applies here",
										`${APPLICABILITY[version.applicability]}${version.applicabilityReason ? `: ${version.applicabilityReason}` : ""}`,
									],
									["Next review", formatDay(version.nextReviewOn)],
									["Drafted", <When key="d" at={version.draftedAt} now={now} />],
									["Drafted by", who(version.draftedBy)],
									...(version.reviewedAt
										? ([
												["Decided", <When key="r" at={version.reviewedAt} now={now} />],
												["Decided by", who(version.reviewedBy)],
												["On what basis", version.reviewNote ?? "—"],
											] as Array<[string, ReactNode]>)
										: []),
								]}
							/>
							{version.status === "draft" && rule.status === "active" && workspace.isOwner && (
								<div style={{ marginTop: 12 }}>
									<FieldsForm
										action={complianceAction}
										hidden={{ intent: "rule.review", versionId: version.id }}
										idPrefix={`review-${version.version}`}
										submit="Record the decision"
										initial={{
											applicability: version.applicability,
											applicabilityReason: version.applicabilityReason ?? "",
										}}
										fields={[
											{
												name: "decision",
												label: "Decision",
												kind: "select",
												required: true,
												options: [
													{ value: "approve", label: "Approve this reading" },
													{ value: "reject", label: "Reject it" },
												],
											},
											{
												name: "applicability",
												label: "Does it apply here?",
												kind: "select",
												options: Object.entries(APPLICABILITY).map(([value, label]) => ({ value, label })),
												help: "An undecided reading can't be approved.",
											},
											{ name: "applicabilityReason", label: "Why", kind: "textarea", rows: 2 },
											{
												name: "nextReviewOn",
												label: "Look at it again on",
												kind: "date",
												help: version.reviewEveryDays
													? `Leave empty for ${version.reviewEveryDays} days from today.`
													: "Needed: the draft doesn't say how often.",
											},
											{ name: "note", label: "On what basis", kind: "text", required: true, maxLength: 2000 },
										]}
									/>
								</div>
							)}
							{version.status === "draft" && !workspace.isOwner && (
								<p className="wai-muted wai-small">Only the owner can approve or reject it.</p>
							)}
						</Card>
					))}
				</div>
				<div className="wai-stack">
					{rule.status === "active" && (
						<Card title="Record a new reading">
							<p className="wai-help" style={{ marginTop: 0 }}>
								When the source changes or is read again. It starts as a draft: the approved version goes on
								guiding until the owner decides on this one.
							</p>
							<FieldsForm
								action={complianceAction}
								hidden={{ intent: "rule.draft", ruleId: rule.id }}
								idPrefix="draft"
								submit="Record as a draft"
								initial={{
									kind: latest.kind,
									sourceTitle: latest.sourceTitle,
									sourceUrl: latest.sourceUrl ?? "",
									effectiveFrom: latest.effectiveFrom ?? "",
									applicability: latest.applicability,
									applicabilityReason: latest.applicabilityReason ?? "",
									reviewEveryDays: latest.reviewEveryDays ? String(latest.reviewEveryDays) : "",
								}}
								fields={VERSION_FIELDS}
							/>
						</Card>
					)}
					{rule.status === "active" && workspace.isOwner && (
						<Card title="Withdraw this rule">
							<ButtonForm
								action={complianceAction}
								hidden={{ intent: "rule.withdraw", ruleId: rule.id }}
								label="Withdraw"
								tone="danger"
								note={{ label: "Why", required: true }}
								idPrefix="withdraw"
							/>
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
