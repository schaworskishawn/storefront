import type { Metadata } from "next";
import Link from "next/link";
import {
	CONTROLLED_STEPS,
	STANDING_LABELS,
	listRequirements,
	listTraining,
	qualificationGaps,
	trainingStanding,
	type ControlledStep,
	type TrainingStanding,
} from "@/lib/worldwide-ai/lab/training";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { manufacturingAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Training" };

const MANUFACTURING = `${WORKSPACE_PATH}/manufacturing`;
const TONE: Record<TrainingStanding, Tone> = {
	unverified: "pink",
	valid: "good",
	expiring: "warn",
	expired: "bad",
};
const STEPS = Object.keys(CONTROLLED_STEPS) as ControlledStep[];

/** Training: who completed what, with where the evidence is, and what the owner requires before a controlled step. */
export default async function TrainingPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const today = opsDayKey(workspace.runtime.now());
	const me = `operator:${workspace.actor.id}`;
	const [records, requirements, ...gaps] = await Promise.all([
		listTraining(sql),
		listRequirements(sql),
		...STEPS.map((step) => qualificationGaps(sql, me, step, today)),
	]);
	const refused = STEPS.map((step, index) => ({ step, missing: gaps[index] })).filter(
		(entry) => entry.missing.length > 0,
	);

	return (
		<>
			<PageHeader
				title="Training"
				crumbs={[{ label: "Manufacturing", href: MANUFACTURING }, { label: "Training" }]}
				lead="Who completed what training, and where the evidence is kept. A record counts once the owner has verified it, and only while it is in date. This holds a name, a topic, dates and where the evidence is: it is not a personnel file, and a record is not proof of competence."
				actions={
					<Link href={`${MANUFACTURING}/equipment`} className="wai-btn">
						Equipment
					</Link>
				}
			/>
			{refused.length > 0 && (
				<Notice tone="warn" title="Some steps are refused to you at the moment.">
					{refused
						.map(
							(entry) =>
								`${CONTROLLED_STEPS[entry.step]} needs verified, in-date training in: ${entry.missing.join("; ")}.`,
						)
						.join(" ")}{" "}
					Record it below and ask the owner to verify it.
				</Notice>
			)}
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Records" aside={<Pill>{records.length}</Pill>}>
						{records.length === 0 ? (
							<Empty>No training has been recorded.</Empty>
						) : (
							<ul className="wai-list">
								{records.map((record) => {
									const standing = trainingStanding(record, today);
									return (
										<li key={record.id} style={{ display: "block" }}>
											<div className="wai-row" style={{ gap: 8, flexWrap: "wrap" }}>
												<strong>
													{record.person}: {record.topic}
												</strong>
												<Pill tone={TONE[standing]}>{STANDING_LABELS[standing]}</Pill>
												{record.personKey === null && <Pill>By name only</Pill>}
											</div>
											<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
												Completed {formatDay(record.completedOn)}
												{record.validUntil
													? `, valid until ${formatDay(record.validUntil)}`
													: ", no end date"}
												. Evidence: {record.evidence}
											</p>
											{record.verifiedAt === null && workspace.isOwner && (
												<ButtonForm
													action={manufacturingAction}
													hidden={{ intent: "training.verify", recordId: record.id }}
													label="Verify against the evidence"
													tone="primary"
													small
													idPrefix={`verify-${record.id}`}
												/>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</Card>
					<Card title="What a step requires" aside={<Pill>{requirements.length}</Pill>}>
						<p className="wai-help" style={{ marginTop: 0 }}>
							With nothing required, nothing is refused. Once training is required for a step, that step is
							refused to anyone without a verified, in-date record of their own for it, the owner included,
							and each refusal is logged.
						</p>
						{requirements.length === 0 ? (
							<Empty>No training is required for any step.</Empty>
						) : (
							<DataTable
								caption="Set by the owner. A record made for someone by name only can't satisfy a requirement."
								columns={["Step", "Training required", "Change"]}
								rows={requirements.map((requirement) => [
									CONTROLLED_STEPS[requirement.step],
									requirement.topic,
									workspace.isOwner ? (
										<ButtonForm
											key="r"
											action={manufacturingAction}
											hidden={{ intent: "training.unrequire", requirementId: requirement.id }}
											label="Stop requiring it"
											small
											tone="quiet"
											idPrefix={`unrequire-${requirement.id}`}
										/>
									) : (
										""
									),
								])}
							/>
						)}
						{workspace.isOwner && (
							<details style={{ marginTop: 12 }}>
								<summary className="wai-small">Require training for a step</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={manufacturingAction}
										hidden={{ intent: "training.require" }}
										idPrefix="require"
										submit="Require it"
										fields={[
											{
												name: "step",
												label: "Step",
												kind: "select",
												required: true,
												options: STEPS.map((step) => ({ value: step, label: CONTROLLED_STEPS[step] })),
											},
											{
												name: "topic",
												label: "Training required",
												kind: "text",
												required: true,
												maxLength: 200,
												help: "Exactly as it will be written on the records, including the procedure's version. Make sure your own record is verified first: this applies to you too.",
											},
										]}
									/>
								</div>
							</details>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record training">
						<FieldsForm
							action={manufacturingAction}
							hidden={{ intent: "training.record" }}
							idPrefix="training"
							submit="Record it"
							initial={{ who: "me" }}
							fields={[
								{
									name: "who",
									label: "Who completed it",
									kind: "select",
									required: true,
									options: [
										{ value: "me", label: `Me, ${workspace.actor.label}` },
										{ value: "other", label: "Someone else, by name" },
									],
									help: "Only a record you make for yourself is tied to your sign-in, and only that can satisfy a requirement.",
								},
								{ name: "person", label: "Their name, if someone else", kind: "text", maxLength: 120 },
								{
									name: "topic",
									label: "Training",
									kind: "text",
									required: true,
									maxLength: 200,
									placeholder: "Batch manufacturing SOP-MF-01 revision 2",
								},
								{ name: "completedOn", label: "Completed on", kind: "date", required: true },
								{
									name: "validUntil",
									label: "Valid until",
									kind: "date",
									help: "Leave blank when it has no end date. One is never made up.",
								},
								{
									name: "evidence",
									label: "Where the evidence is",
									kind: "text",
									required: true,
									maxLength: 500,
									help: "The signed sheet, the certificate, the assessment.",
								},
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
