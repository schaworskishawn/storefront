import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { listEquipment } from "@/lib/worldwide-ai/lab/equipment";
import { listPackagingRuns } from "@/lib/worldwide-ai/lab/finished";
import {
	SCAN_SOURCES,
	SECURITY,
	SUBJECT_KINDS,
	TECHNOLOGIES,
	WORKFLOWS,
	getTag,
} from "@/lib/worldwide-ai/rfid/registry";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { rfidAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	When,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Tag" };

type Props = { params: Promise<{ id: string }> };

const RFID = `${WORKSPACE_PATH}/rfid`;

/** One tag: what it is attached to now, what it was on before, what is recorded inside it, and where it has been read. */
export default async function TagPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const found = await getTag(sql, id);
	if (!found) notFound();
	const { tag, assignment, history, inside, scans } = found;
	const active = tag.status === "active";
	const [equipment, runs] =
		active && !assignment
			? await Promise.all([listEquipment(sql, opsDayKey(now)), listPackagingRuns(sql)])
			: [[], []];

	return (
		<>
			<PageHeader
				title={`Tag ${tag.uid}`}
				crumbs={[
					{ label: "RFID & NFC", href: RFID },
					{ label: "Tags", href: `${RFID}/tags` },
					{ label: tag.uid },
				]}
				lead={`${TECHNOLOGIES[tag.technology]}. ${SECURITY[tag.security]}. Reading this tag shows that a tag with this identifier was read. It does not show that the tag is still on what it was attached to, or that anything is genuine.`}
				actions={
					<Pill tone={active ? "good" : tag.status === "revoked" ? "bad" : "plain"}>
						{active ? "In use" : tag.status === "revoked" ? "Revoked" : "Retired"}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{!active && (
						<Notice
							tone="warn"
							title={tag.status === "revoked" ? "This tag is revoked." : "This tag is retired."}
						>
							{tag.statusReason} A scan of it raises an exception.
						</Notice>
					)}
					<Card title="Attached to" accent={active && !assignment}>
						{assignment ? (
							<>
								<KeyValues
									items={[
										["What", `${SUBJECT_KINDS[assignment.subjectKind]}: ${assignment.subjectRef}`],
										["SKU", assignment.sku ?? "—"],
										["Lot", assignment.lot ?? "—"],
										["Serial", assignment.serial ?? "—"],
										[
											"Inside",
											assignment.parentTagId ? (
												<Link key="p" href={`${RFID}/tags/${assignment.parentTagId}`} className="wai-mono">
													{assignment.parentUid}
												</Link>
											) : (
												"Nothing"
											),
										],
										...(assignment.unitsDeclared
											? ([
													["Units it holds", `${assignment.unitsDeclared}, from ${assignment.unitsSource}`],
												] as Array<[string, string]>)
											: []),
										...(assignment.equipmentId
											? ([
													[
														"Equipment record",
														<Link
															key="e"
															href={`${WORKSPACE_PATH}/manufacturing/equipment/${assignment.equipmentId}`}
														>
															Open
														</Link>,
													],
												] as Array<[string, ReactNode]>)
											: []),
										["Since", <When key="s" at={assignment.assignedAt} now={now} />],
									]}
								/>
								<div style={{ marginTop: 12 }}>
									<ButtonForm
										action={rfidAction}
										hidden={{ intent: "tag.unassign", tagId: tag.id }}
										label="Take the tag off"
										note={{ label: "Why", required: true }}
										idPrefix="unassign"
									/>
								</div>
							</>
						) : active ? (
							<FieldsForm
								action={rfidAction}
								hidden={{ intent: "tag.assign", tagId: tag.id }}
								idPrefix="assign"
								submit="Attach the tag"
								fields={[
									{
										name: "subjectKind",
										label: "What it is attached to",
										kind: "select",
										required: true,
										options: Object.entries(SUBJECT_KINDS).map(([value, label]) => ({ value, label })),
									},
									{
										name: "subjectRef",
										label: "Which one",
										kind: "text",
										required: true,
										maxLength: 200,
										placeholder: "Mango 12, 30 mL · Shelf B2 · Tote 14",
									},
									{ name: "sku", label: "SKU", kind: "text", maxLength: 120 },
									{ name: "lot", label: "Lot", kind: "text", maxLength: 120 },
									{ name: "serial", label: "Serial", kind: "text", maxLength: 120 },
									{
										name: "packagingRunId",
										label: "Packaged lot it belongs to",
										kind: "select",
										help: "Choosing a packaging run fills the SKU and lot from that record.",
										options: runs.map((run) => ({
											value: run.id,
											label: `${run.code}: ${run.sku}, ${run.bottleMl} mL`,
										})),
									},
									{
										name: "parentUid",
										label: "Identifier of the carton, case or tote it is inside",
										kind: "text",
										maxLength: 200,
										help: "That tag has to be registered and attached to a carton, case, container or tote.",
									},
									{
										name: "unitsDeclared",
										label: "Units it holds",
										kind: "number",
										help: "For a carton, case, container or tote only.",
									},
									{
										name: "unitsSource",
										label: "Manifest or packing list that number comes from",
										kind: "text",
										maxLength: 200,
										help: "The quantity is never read from the tag.",
									},
									{
										name: "equipmentId",
										label: "Equipment record",
										kind: "select",
										help: "Only when it is attached to equipment.",
										options: equipment.map((row) => ({
											value: row.equipment.id,
											label: `${row.equipment.code}, ${row.equipment.name}`,
										})),
									},
								]}
							/>
						) : (
							<Empty>Nothing. A {tag.status} tag can’t be attached to anything.</Empty>
						)}
					</Card>

					{inside.length > 0 && (
						<Card title="Recorded as inside it" aside={<Pill>{inside.length}</Pill>}>
							<DataTable
								caption="From the registry, not from a scan. Reading a carton says nothing about what is in it."
								columns={["Identifier", "What", "SKU", "Serial"]}
								rows={inside.map((child) => [
									<Link key="u" href={`${RFID}/tags/${child.tag.id}`} className="wai-mono">
										{child.tag.uid}
									</Link>,
									`${SUBJECT_KINDS[child.assignment.subjectKind]}: ${child.assignment.subjectRef}`,
									child.assignment.sku ?? "—",
									child.assignment.serial ?? "—",
								])}
							/>
						</Card>
					)}

					<Card title="Where it has been read" aside={<Pill>{scans.length}</Pill>}>
						{scans.length === 0 ? (
							<Empty>No scan of this tag is recorded.</Empty>
						) : (
							<DataTable
								caption="Newest first, up to 50. Each is an observation: a read near a shelf is not the tag being on that shelf."
								columns={["Read", "Where", "For", "Came from"]}
								rows={scans.map((scan) => [
									<When key="w" at={scan.observedAt} now={now} />,
									scan.station,
									WORKFLOWS[scan.workflow],
									SCAN_SOURCES[scan.source],
								])}
							/>
						)}
					</Card>

					{history.length > 0 && (
						<Card title="What it was attached to before" aside={<Pill>{history.length}</Pill>}>
							<DataTable
								caption="Newest first. An ended assignment is kept as it was."
								columns={["What", "SKU and lot", "From", "Until", "Why it ended"]}
								rows={history.map((past) => [
									`${SUBJECT_KINDS[past.subjectKind]}: ${past.subjectRef}`,
									[past.sku, past.lot, past.serial].filter(Boolean).join(" · ") || "—",
									<When key="f" at={past.assignedAt} now={now} />,
									<When key="u" at={past.endedAt} now={now} />,
									past.endReason ?? "—",
								])}
							/>
						</Card>
					)}
				</div>

				<div className="wai-stack">
					<Card title="About this tag">
						<KeyValues
							items={[
								["Kind", TECHNOLOGIES[tag.technology]],
								["What it can do", SECURITY[tag.security]],
								["Came from", tag.sourceRef ?? "Not recorded"],
								["Registered", <When key="r" at={tag.registeredAt} now={now} />],
								[
									"Identifier confirmed",
									tag.verifiedAt ? <When key="v" at={tag.verifiedAt} now={now} /> : "Not yet",
								],
							]}
						/>
						{tag.note && <p className="wai-help">{tag.note}</p>}
						{tag.verifiedAt === null && active && (
							<div style={{ marginTop: 12 }}>
								<p className="wai-help" style={{ marginTop: 0 }}>
									Read the tag and compare what the reader shows with the identifier above.
								</p>
								<ButtonForm
									action={rfidAction}
									hidden={{ intent: "tag.verify", tagId: tag.id }}
									label="I read it and it matches"
									idPrefix="verify"
								/>
							</div>
						)}
					</Card>
					<Card title={active ? "Retire or revoke" : "Put back in use"}>
						{active ? (
							<>
								<p className="wai-help" style={{ marginTop: 0 }}>
									Retire a tag at the end of its life. Revoke one that shouldn’t be trusted: lost, damaged, or
									possibly copied. Either takes it off what it is attached to.
								</p>
								<ButtonForm
									action={rfidAction}
									hidden={{ intent: "tag.status", tagId: tag.id, status: "retired" }}
									label="Retire it"
									note={{ label: "Why", required: true }}
									idPrefix="retire"
								/>
								<div style={{ marginTop: 8 }}>
									<ButtonForm
										action={rfidAction}
										hidden={{ intent: "tag.status", tagId: tag.id, status: "revoked" }}
										label="Revoke it"
										tone="danger"
										note={{ label: "Why it shouldn’t be trusted", required: true }}
										idPrefix="revoke"
									/>
								</div>
							</>
						) : workspace.isOwner ? (
							<ButtonForm
								action={rfidAction}
								hidden={{ intent: "tag.status", tagId: tag.id, status: "active" }}
								label="Put it back in use"
								note={{ label: "On what basis", required: true }}
								idPrefix="reinstate"
							/>
						) : (
							<p className="wai-muted wai-small" style={{ margin: 0 }}>
								Only the owner can put a retired or revoked tag back in use.
							</p>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
