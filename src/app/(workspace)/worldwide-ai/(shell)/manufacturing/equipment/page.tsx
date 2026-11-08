import type { Metadata } from "next";
import Link from "next/link";
import {
	CALIBRATION_LABELS,
	CLEANING_KINDS,
	EQUIPMENT_KINDS,
	listCleaning,
	listEquipment,
	type Standing,
} from "@/lib/worldwide-ai/lab/equipment";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { manufacturingAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Equipment" };

const MANUFACTURING = `${WORKSPACE_PATH}/manufacturing`;
const CALIBRATION_TONE: Record<Standing["calibration"], Tone> = {
	not_required: "plain",
	current: "good",
	due_soon: "warn",
	overdue: "bad",
	never: "warn",
	failed: "bad",
};

/** Equipment: what there is, whether each piece may be used today, and the cleaning and line-clearance records. */
export default async function EquipmentPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const today = opsDayKey(now);
	const [equipment, cleaning] = await Promise.all([listEquipment(sql, today), listCleaning(sql)]);
	const me = `operator:${workspace.actor.id}`;

	return (
		<>
			<PageHeader
				title="Equipment"
				crumbs={[{ label: "Manufacturing", href: MANUFACTURING }, { label: "Equipment" }]}
				lead="Scales, mixers, fillers and instruments, with their calibrations and cleaning. Equipment that is out of service, has failed or is overdue for calibration, or has none on record when it needs one can't be recorded against a batch. These are records people type in: nothing here reads an instrument or controls a machine."
				actions={
					<Link href={`${MANUFACTURING}/training`} className="wai-btn">
						Training
					</Link>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Equipment" aside={<Pill>{equipment.length}</Pill>}>
						{equipment.length === 0 ? (
							<Empty>No equipment has been recorded yet.</Empty>
						) : (
							<DataTable
								caption="Whether each piece may be recorded against a batch today, from its own records."
								columns={["Code", "What it is", "Where", "Today", "Calibration", "Next due"]}
								rows={equipment.map(({ equipment: item, standing }) => [
									<Link key="c" href={`${MANUFACTURING}/equipment/${item.id}`}>
										{item.code}
									</Link>,
									`${item.name} (${EQUIPMENT_KINDS[item.kind].toLowerCase()})`,
									item.location ?? "—",
									<Pill key="e" tone={standing.eligible ? "good" : "bad"}>
										{standing.eligible ? "May be used" : "Can’t be used"}
									</Pill>,
									<Pill key="s" tone={CALIBRATION_TONE[standing.calibration]}>
										{CALIBRATION_LABELS[standing.calibration]}
									</Pill>,
									standing.dueOn ? formatDay(standing.dueOn) : "—",
								])}
							/>
						)}
					</Card>
					<Card title="Cleaning and line clearance" aside={<Pill>{cleaning.length}</Pill>}>
						{cleaning.length === 0 ? (
							<Empty>No cleaning or line clearance has been recorded.</Empty>
						) : (
							<ul className="wai-list">
								{cleaning.slice(0, 30).map((record) => (
									<li key={record.id} style={{ display: "block" }}>
										<div className="wai-row" style={{ gap: 8, flexWrap: "wrap" }}>
											<strong>
												{CLEANING_KINDS[record.kind]}: {record.equipmentCode ?? record.area}
											</strong>
											<Pill tone={record.verifiedAt ? "good" : "pink"}>
												{record.verifiedAt ? "Verified by a second person" : "Not verified"}
											</Pill>
										</div>
										<p className="wai-small" style={{ margin: "4px 0" }}>
											{record.detail}
										</p>
										<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
											Under {record.procedure}. Recorded <When at={record.doneAt} now={now} />
											{record.verifiedAt && (
												<>
													, verified <When at={record.verifiedAt} now={now} />
												</>
											)}
											.
										</p>
										{!record.verifiedAt && record.doneBy !== me && (
											<ButtonForm
												action={manufacturingAction}
												hidden={{ intent: "cleaning.verify", recordId: record.id }}
												label="Verify, as a second person"
												small
												idPrefix={`verify-${record.id}`}
											/>
										)}
									</li>
								))}
							</ul>
						)}
						<details style={{ marginTop: 12 }} open={cleaning.length === 0}>
							<summary className="wai-small">Record a cleaning or a line clearance</summary>
							<div style={{ marginTop: 8 }}>
								<FieldsForm
									action={manufacturingAction}
									hidden={{ intent: "cleaning.record" }}
									idPrefix="cleaning"
									submit="Record it"
									fields={[
										{
											name: "kind",
											label: "What it was",
											kind: "select",
											required: true,
											options: Object.entries(CLEANING_KINDS).map(([value, label]) => ({ value, label })),
										},
										{
											name: "equipmentId",
											label: "Equipment",
											kind: "select",
											options: equipment.map(({ equipment: item }) => ({
												value: item.id,
												label: `${item.code}, ${item.name}`,
											})),
										},
										{
											name: "area",
											label: "Or the area",
											kind: "text",
											maxLength: 160,
											help: "For a bench or a line that isn't one piece of equipment.",
										},
										{
											name: "procedure",
											label: "Procedure it was done under",
											kind: "text",
											required: true,
											maxLength: 200,
											placeholder: "SOP-CL-02 revision 3",
										},
										{
											name: "detail",
											label: "What was done and what was checked",
											kind: "textarea",
											required: true,
											rows: 2,
											help: "You are recording what you did yourself. Someone else verifies it.",
										},
									]}
								/>
							</div>
						</details>
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Add equipment">
						<FieldsForm
							action={manufacturingAction}
							hidden={{ intent: "equipment.add" }}
							idPrefix="equipment"
							submit="Add it"
							fields={[
								{
									name: "code",
									label: "Code",
									kind: "text",
									required: true,
									maxLength: 40,
									placeholder: "SC-1",
									help: "As marked on the equipment.",
								},
								{ name: "name", label: "What it is", kind: "text", required: true, maxLength: 160 },
								{
									name: "kind",
									label: "Kind",
									kind: "select",
									required: true,
									options: Object.entries(EQUIPMENT_KINDS).map(([value, label]) => ({ value, label })),
								},
								{ name: "location", label: "Where it is kept", kind: "text", maxLength: 160 },
								{
									name: "calibrationIntervalDays",
									label: "Calibrate every, days",
									kind: "number",
									help: "From its manual or your procedure. Leave blank when it needs no calibration. An interval is never suggested.",
								},
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
