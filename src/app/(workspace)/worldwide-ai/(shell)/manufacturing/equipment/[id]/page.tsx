import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	CALIBRATION_LABELS,
	CLEANING_KINDS,
	EQUIPMENT_KINDS,
	getEquipment,
} from "@/lib/worldwide-ai/lab/equipment";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { manufacturingAction } from "@/lib/worldwide-ai/web/actions";
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

export const metadata: Metadata = { title: "Equipment" };

type Props = { params: Promise<{ id: string }> };

const MANUFACTURING = `${WORKSPACE_PATH}/manufacturing`;

/** One piece of equipment: whether it may be used today and why, its calibrations, the batches it was used on, its cleaning. */
export default async function EquipmentDetailPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const found = await getEquipment(sql, id, opsDayKey(now));
	if (!found) notFound();
	const { equipment, standing, calibrations, uses, cleaning } = found;
	const out = equipment.status === "out_of_service";

	return (
		<>
			<PageHeader
				title={`${equipment.code}: ${equipment.name}`}
				crumbs={[
					{ label: "Manufacturing", href: MANUFACTURING },
					{ label: "Equipment", href: `${MANUFACTURING}/equipment` },
					{ label: equipment.code },
				]}
				lead={`${EQUIPMENT_KINDS[equipment.kind]}${equipment.location ? `, kept at ${equipment.location}` : ""}.`}
				actions={
					<Pill tone={standing.eligible ? "good" : "bad"}>
						{standing.eligible ? "May be used" : "Can’t be used"}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{!standing.eligible && (
						<Notice tone="warn" title="It can’t be recorded against a batch today.">
							{standing.reasons.join(" ")}
						</Notice>
					)}
					<Card title="Calibrations" aside={<Pill>{CALIBRATION_LABELS[standing.calibration]}</Pill>}>
						{calibrations.length === 0 ? (
							<Empty>No calibration is on record.</Empty>
						) : (
							<DataTable
								caption="Newest first. A calibration is recorded as it was carried out and never changed."
								columns={["Carried out", "Result", "Certificate or standard", "By", "Next due"]}
								rows={calibrations.map((calibration) => [
									formatDay(calibration.performedOn),
									<Pill key="r" tone={calibration.result === "pass" ? "good" : "bad"}>
										{calibration.result === "pass" ? "Passed" : "Failed"}
									</Pill>,
									calibration.certificate,
									calibration.performedBy,
									calibration.dueOn ? formatDay(calibration.dueOn) : "—",
								])}
							/>
						)}
						<details style={{ marginTop: 12 }} open={calibrations.length === 0}>
							<summary className="wai-small">Record a calibration</summary>
							<div style={{ marginTop: 8 }}>
								<FieldsForm
									action={manufacturingAction}
									hidden={{ intent: "equipment.calibrate", equipmentId: equipment.id }}
									idPrefix="calibration"
									submit="Record the calibration"
									fields={[
										{ name: "performedOn", label: "Carried out on", kind: "date", required: true },
										{
											name: "result",
											label: "Result",
											kind: "select",
											required: true,
											options: [
												{ value: "pass", label: "Passed" },
												{ value: "fail", label: "Failed" },
											],
											help: "A failure takes it out of service and puts on hold every batch recorded against it since it last passed.",
										},
										{
											name: "certificate",
											label: "Certificate number, or the reference standard used",
											kind: "text",
											required: true,
											maxLength: 200,
										},
										{
											name: "performedBy",
											label: "Carried out by",
											kind: "text",
											required: true,
											maxLength: 160,
										},
										{
											name: "dueOn",
											label: "Next due",
											kind: "date",
											help: equipment.calibrationIntervalDays
												? `Leave blank to use its interval of ${equipment.calibrationIntervalDays} days.`
												: "From the certificate. Leave blank when it gives none.",
										},
										{ name: "notes", label: "Notes", kind: "text", maxLength: 1000 },
									]}
								/>
							</div>
						</details>
					</Card>

					<Card title="Batches it was used on" aside={<Pill>{uses.length}</Pill>}>
						{uses.length === 0 ? (
							<Empty>
								It hasn’t been recorded against a batch. Equipment is recorded on the batch’s own page.
							</Empty>
						) : (
							<DataTable
								caption="Newest first. If it fails calibration, the batches since its last pass are put on hold."
								columns={["Batch", "Used for", "On"]}
								rows={uses.map((use) => [
									<Link key="b" href={`${WORKSPACE_PATH}/lab/batches/${use.batchId}`}>
										{use.batchCode}
									</Link>,
									use.purpose,
									formatDay(use.usedOn),
								])}
							/>
						)}
					</Card>

					<Card title="Cleaning" aside={<Pill>{cleaning.length}</Pill>}>
						{cleaning.length === 0 ? (
							<Empty>No cleaning is recorded for it. Record one from the Equipment page.</Empty>
						) : (
							<ul className="wai-list">
								{cleaning.map((record) => (
									<li key={record.id} style={{ display: "block" }}>
										<strong>{CLEANING_KINDS[record.kind]}</strong>{" "}
										<Pill tone={record.verifiedAt ? "good" : "pink"}>
											{record.verifiedAt ? "Verified by a second person" : "Not verified"}
										</Pill>
										<p className="wai-small" style={{ margin: "4px 0" }}>
											{record.detail}
										</p>
										<p className="wai-muted wai-small" style={{ margin: 0 }}>
											Under {record.procedure}. <When at={record.doneAt} now={now} />
										</p>
									</li>
								))}
							</ul>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="About it">
						<KeyValues
							items={[
								["Code", equipment.code],
								["Kind", EQUIPMENT_KINDS[equipment.kind]],
								["Kept at", equipment.location ?? "Not recorded"],
								[
									"Calibrate every",
									equipment.calibrationIntervalDays
										? `${equipment.calibrationIntervalDays} days`
										: "No calibration required",
								],
								["Next due", standing.dueOn ? formatDay(standing.dueOn) : "—"],
								["Status", out ? "Out of service" : "In service"],
							]}
						/>
					</Card>
					<Card title={out ? "Return to service" : "Take out of service"}>
						{out ? (
							workspace.isOwner ? (
								<>
									<p className="wai-help" style={{ marginTop: 0 }}>
										{equipment.statusReason} Returning it is your decision, and it is refused while its last
										calibration is a failure.
									</p>
									<ButtonForm
										action={manufacturingAction}
										hidden={{ intent: "equipment.status", equipmentId: equipment.id, status: "in_service" }}
										label="Return it to service"
										tone="primary"
										note={{ label: "On what basis", required: true }}
										idPrefix="return"
									/>
								</>
							) : (
								<p className="wai-muted wai-small" style={{ margin: 0 }}>
									{equipment.statusReason} Only the owner can return equipment to service.
								</p>
							)
						) : (
							<>
								<p className="wai-help" style={{ marginTop: 0 }}>
									Anyone can take equipment out of service. It then can’t be recorded against a batch until
									the owner returns it.
								</p>
								<ButtonForm
									action={manufacturingAction}
									hidden={{ intent: "equipment.status", equipmentId: equipment.id, status: "out_of_service" }}
									label="Take it out of service"
									tone="danger"
									note={{ label: "Why", required: true }}
									idPrefix="remove"
								/>
							</>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
