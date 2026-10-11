import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatch } from "@/lib/worldwide-ai/lab/batches";
import { listHolds } from "@/lib/worldwide-ai/lab/finished";
import {
	BLOCKING,
	OUTCOME_LABELS,
	SAMPLE_EVENTS,
	SAMPLE_PURPOSES,
	SEVERITIES,
	batchAssessment,
	judge,
	listDeviations,
	listSamples,
	type AssessmentOutcome,
	type TestResult,
} from "@/lib/worldwide-ai/lab/quality";
import { formatDay } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { qualityAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Empty,
	Notice,
	PageHeader,
	Pill,
	When,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Samples and results" };

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAB = `${WORKSPACE_PATH}/lab`;
const QUALITY = `${WORKSPACE_PATH}/quality`;
const OUTCOME_TONE: Record<AssessmentOutcome, Tone> = {
	pass: "good",
	accepted: "good",
	fail: "bad",
	unresolved: "warn",
	unverified: "pink",
	missing: "warn",
	not_tested: "plain",
	no_criterion: "plain",
};

const same = (a: string, b: string) =>
	a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

function standingOf(result: TestResult): { label: string; tone: Tone } {
	if (result.replaced) return { label: "Replaced by a correction", tone: "plain" };
	if (result.ruling === "set_aside") return { label: "Set aside", tone: "plain" };
	if (result.verifiedAt === null) return { label: "Not verified", tone: "pink" };
	if (result.ruling === "accepted") return { label: "Verified, accepted by the owner", tone: "good" };
	return { label: "Verified", tone: "good" };
}

/** A batch's quality records: how its results stand against the specification, the results, its samples and its deviations. */
export default async function BatchQualityPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const batch = UUID.test(id) ? await getBatch(sql, id) : null;
	if (!batch) notFound();
	const made = batch.status === "completed";
	const [{ specification, results, lines }, samples, deviations, holds] = await Promise.all([
		batchAssessment(sql, batch),
		listSamples(sql, batch.id),
		listDeviations(sql, { batchId: batch.id }),
		listHolds(sql, batch.id),
	]);
	const openHolds = holds.filter((hold) => hold.liftedAt === null);
	const counted = results.filter((result) => !result.replaced && result.ruling !== "set_aside");
	const blocking = lines.filter((line) => BLOCKING.includes(line.outcome));
	/** A verified result the code couldn't judge, which the owner may accept with a reason. */
	const unresolved = (result: TestResult) => {
		const criterion = specification?.criteria.find((c) => same(c.analyte, result.analyte));
		return !!criterion && judge(criterion, result).outcome === "unresolved";
	};

	return (
		<>
			<PageHeader
				title={`Samples and results: batch ${batch.code}`}
				crumbs={[
					{ label: "E-Liquid Lab", href: LAB },
					{ label: "Batches", href: `${LAB}/batches` },
					{ label: batch.code, href: `${LAB}/batches/${batch.id}` },
					{ label: "Samples and results" },
				]}
				lead={`${batch.recipeName}, version ${batch.recipeVersion}. What a laboratory reported is typed in here from its report, verified by the owner, and compared with the approved specification by the workspace. Nothing here is a laboratory finding of its own, and meeting a specification is not a statement that a product is safe.`}
				actions={
					<Link href={`${LAB}/batches/${batch.id}`} className="wai-btn">
						Back to the batch
					</Link>
				}
			/>
			{!made && (
				<Notice tone="info" title="This batch hasn't been recorded as made.">
					Samples and results start once it has been.
				</Notice>
			)}
			{openHolds.length > 0 && (
				<Notice tone="warn" title="This batch is on hold.">
					{openHolds.map((hold) => hold.reason).join(" ")} It can’t be packaged or released until the owner
					lifts the hold on <Link href={`${LAB}/batches/${batch.id}`}>the batch</Link>.
				</Notice>
			)}
			<div className="wai-split">
				<div className="wai-stack">
					<Card
						title="Against the specification"
						aside={
							specification ? (
								<Pill tone={blocking.length ? "warn" : "good"}>
									{blocking.length ? `${blocking.length} in the way of release` : "Nothing in the way"}
								</Pill>
							) : (
								<Pill>No specification</Pill>
							)
						}
					>
						{specification ? (
							<p className="wai-help" style={{ marginTop: 0 }}>
								Specification version {specification.version} for {specification.recipeName}. Every result
								that counts has to be within its limit: a passing retest doesn’t hide a failing result that is
								still on file. Units are never converted and a method is never assumed.
							</p>
						) : (
							<Notice tone="info" title="No specification is approved for this recipe.">
								Results are kept, but there is nothing to compare them with, so the owner confirms them in
								person when releasing the batch.{" "}
								<Link href={`${QUALITY}/specifications`}>Write a specification</Link>
							</Notice>
						)}
						{lines.length > 0 ? (
							<DataTable
								caption="One line per thing tested, as the records stand now."
								columns={["Tested", "Limit", "Standing", "What was found"]}
								rows={lines.map((line) => [
									<span key="a">
										{line.analyte}
										{line.limits && !line.required ? " (optional)" : ""}
									</span>,
									line.limits ?? "—",
									<Pill key="o" tone={OUTCOME_TONE[line.outcome]}>
										{OUTCOME_LABELS[line.outcome]}
									</Pill>,
									line.detail,
								])}
							/>
						) : (
							!specification && <Empty>No result is on file for this batch.</Empty>
						)}
					</Card>

					<Card title="Results" aside={<Pill>{results.length}</Pill>}>
						{results.length === 0 ? (
							<Empty>No result has been entered.</Empty>
						) : (
							<ul className="wai-list">
								{results.map((result) => {
									const standing = standingOf(result);
									const live = !result.replaced && result.ruling === null;
									return (
										<li key={result.id} style={{ display: "block" }}>
											<div className="wai-row" style={{ gap: 8, flexWrap: "wrap" }}>
												<strong>
													{result.analyte}: {result.reportedAs} {result.unit}
													{result.uncertainty ? ` ± ${result.uncertainty}` : ""}
												</strong>
												<Pill tone={standing.tone}>{standing.label}</Pill>
											</div>
											<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
												{result.lab}, report {result.reportRef}, dated {formatDay(result.reportedOn)}
												{result.method ? `, by ${result.method}` : ", method not recorded"}
												{result.sampleCode ? `, sample ${result.sampleCode}` : ""}. Entered{" "}
												<When at={result.enteredAt} now={now} />
												{result.verifiedAt && (
													<>
														, verified <When at={result.verifiedAt} now={now} />
													</>
												)}
												.
											</p>
											{result.correctionReason && (
												<p className="wai-small" style={{ margin: "4px 0" }}>
													Corrects an earlier result: {result.correctionReason}
												</p>
											)}
											{result.rulingReason && (
												<p className="wai-small" style={{ margin: "4px 0" }}>
													{result.ruling === "accepted" ? "Accepted" : "Set aside"} by the owner:{" "}
													{result.rulingReason}
												</p>
											)}
											{workspace.isOwner && live && result.verifiedAt === null && (
												<ButtonForm
													action={qualityAction}
													hidden={{ intent: "result.verify", resultId: result.id }}
													label="Verify against the report"
													tone="primary"
													small
													idPrefix={`verify-${result.id}`}
												/>
											)}
											{workspace.isOwner && live && result.verifiedAt !== null && unresolved(result) && (
												<ButtonForm
													action={qualityAction}
													hidden={{ intent: "result.rule", resultId: result.id, ruling: "accepted" }}
													label="Accept this result"
													small
													note={{
														label: "On what basis it meets the specification",
														required: true,
													}}
													idPrefix={`accept-${result.id}`}
												/>
											)}
											{workspace.isOwner && live && (
												<details style={{ marginTop: 6 }}>
													<summary className="wai-small">Set this result aside</summary>
													<div style={{ marginTop: 6 }}>
														<ButtonForm
															action={qualityAction}
															hidden={{ intent: "result.rule", resultId: result.id, ruling: "set_aside" }}
															label="Set it aside"
															tone="danger"
															small
															note={{ label: "Why it should not be counted", required: true }}
															idPrefix={`aside-${result.id}`}
														/>
													</div>
												</details>
											)}
										</li>
									);
								})}
							</ul>
						)}
						{made && (
							<details style={{ marginTop: 12 }} open={results.length === 0}>
								<summary className="wai-small">Enter a result from a report</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={qualityAction}
										hidden={{ intent: "result.enter", batchId: batch.id }}
										idPrefix="result"
										submit="Put the result on file"
										fields={[
											{
												name: "analyte",
												label: "What was tested",
												kind: "text",
												required: true,
												maxLength: 120,
												placeholder: "Nicotine",
											},
											{
												name: "reportedAs",
												label: "Result, exactly as the report gives it",
												kind: "text",
												required: true,
												maxLength: 80,
												help: "A number, or the report's words, such as < 0.05 or not detected. Never an estimate.",
											},
											{
												name: "unit",
												label: "Unit",
												kind: "text",
												required: true,
												maxLength: 40,
												placeholder: "mg/mL",
											},
											{
												name: "uncertainty",
												label: "Reported uncertainty, plus or minus",
												kind: "decimal",
												help: "In the same unit. Leave blank when the report states none.",
											},
											{ name: "method", label: "Method", kind: "text", maxLength: 160 },
											{ name: "lab", label: "Laboratory", kind: "text", required: true, maxLength: 160 },
											{
												name: "reportRef",
												label: "Report number",
												kind: "text",
												required: true,
												maxLength: 160,
											},
											{ name: "reportedOn", label: "Report date", kind: "date", required: true },
											{
												name: "sampleId",
												label: "Sample it was run on",
												kind: "select",
												options: samples.map((sample) => ({
													value: sample.id,
													label: `${sample.code}, ${SAMPLE_PURPOSES[sample.purpose].toLowerCase()}`,
												})),
											},
											{
												name: "replacesId",
												label: "Corrects an earlier result",
												kind: "select",
												help: "Only when this replaces a result already on file. The earlier one is kept.",
												options: counted.map((result) => ({
													value: result.id,
													label: `${result.analyte}: ${result.reportedAs} ${result.unit}, report ${result.reportRef}`,
												})),
											},
											{
												name: "correctionReason",
												label: "Why it is being corrected",
												kind: "text",
												maxLength: 500,
											},
										]}
									/>
								</div>
							</details>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Samples" aside={<Pill>{samples.length}</Pill>}>
						{samples.length === 0 ? (
							<Empty>No sample has been taken from this batch.</Empty>
						) : (
							<ul className="wai-list">
								{samples.map((sample) => (
									<li key={sample.id} style={{ display: "block" }}>
										<strong>
											{sample.code}: {sample.quantityMl} mL, {SAMPLE_PURPOSES[sample.purpose].toLowerCase()}
										</strong>
										{sample.testsRequested && (
											<p className="wai-small" style={{ margin: "4px 0" }}>
												Tests asked for: {sample.testsRequested}
											</p>
										)}
										<ul className="wai-muted wai-small" style={{ margin: "4px 0", paddingLeft: 18 }}>
											{sample.events.map((event) => (
												<li key={event.id}>
													{SAMPLE_EVENTS[event.event]}
													{event.detail ? `: ${event.detail}` : ""} <When at={event.at} now={now} />
												</li>
											))}
										</ul>
									</li>
								))}
							</ul>
						)}
						{made && batch.bulkRemainingMl !== "0" && (
							<details style={{ marginTop: 12 }} open={samples.length === 0}>
								<summary className="wai-small">Take a sample</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={qualityAction}
										hidden={{ intent: "sample.take", batchId: batch.id, idempotencyKey: randomUUID() }}
										idPrefix="sample"
										submit="Record the sample"
										fields={[
											{
												name: "purpose",
												label: "What it is for",
												kind: "select",
												required: true,
												options: Object.entries(SAMPLE_PURPOSES).map(([value, label]) => ({ value, label })),
											},
											{
												name: "quantityMl",
												label: "Quantity taken, mL",
												kind: "decimal",
												required: true,
												help: `Taken from the bulk in the same step. ${batch.bulkRemainingMl} mL is left.`,
											},
											{ name: "testsRequested", label: "Tests asked for", kind: "text", maxLength: 500 },
										]}
									/>
								</div>
							</details>
						)}
						{samples.length > 0 && (
							<details style={{ marginTop: 12 }}>
								<summary className="wai-small">Add to a sample’s custody record</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={qualityAction}
										hidden={{ intent: "sample.event" }}
										idPrefix="custody"
										submit="Add the line"
										fields={[
											{
												name: "sampleId",
												label: "Sample",
												kind: "select",
												required: true,
												options: samples.map((sample) => ({ value: sample.id, label: sample.code })),
											},
											{
												name: "event",
												label: "What happened",
												kind: "select",
												required: true,
												options: Object.entries(SAMPLE_EVENTS)
													.filter(([value]) => value !== "taken")
													.map(([value, label]) => ({ value, label })),
											},
											{
												name: "detail",
												label: "Where it went or what happened",
												kind: "text",
												required: true,
												maxLength: 500,
												help: "The place, the laboratory, the courier and waybill, or the report. Recording this sends nothing to anyone.",
											},
										]}
									/>
								</div>
							</details>
						)}
					</Card>

					<Card
						title="Deviations"
						aside={
							<Pill tone={deviations.some((d) => d.status === "open") ? "warn" : "plain"}>
								{`${deviations.filter((d) => d.status === "open").length} open`}
							</Pill>
						}
					>
						{deviations.length === 0 ? (
							<Empty>No deviation is recorded against this batch.</Empty>
						) : (
							<ul className="wai-list">
								{deviations.map((deviation) => (
									<li key={deviation.id} style={{ display: "block" }}>
										<Link href={`${QUALITY}/deviations/${deviation.id}`}>
											{deviation.code}: {deviation.title}
										</Link>{" "}
										<Pill tone={deviation.status === "open" ? "warn" : "plain"}>
											{deviation.status === "open"
												? `${SEVERITIES[deviation.severity]}, open`
												: `${SEVERITIES[deviation.severity]}, closed`}
										</Pill>
									</li>
								))}
							</ul>
						)}
						<p className="wai-help">
							An open deviation stands in the way of this batch’s release until the owner closes it.
						</p>
						<Link href={`${QUALITY}/deviations?batch=${batch.id}`} className="wai-btn">
							Open a deviation for this batch
						</Link>
					</Card>
				</div>
			</div>
		</>
	);
}
