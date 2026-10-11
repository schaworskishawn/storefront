import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	batchAvailability,
	getBatch,
	listAllocations,
	yieldDifference,
} from "@/lib/worldwide-ai/lab/batches";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { batchAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Bullets,
	Card,
	DataTable,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	When,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Batch" };

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAB = `${WORKSPACE_PATH}/lab`;

/** One batch: what the plan calls for, which lots it takes from, what was actually used, and what came out. */
export default async function BatchPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const batch = UUID.test(id) ? await getBatch(sql, id) : null;
	if (!batch) notFound();
	const [allocations, availability] = await Promise.all([
		listAllocations(sql, batch.id),
		batch.status === "planned" ? batchAvailability(sql, batch, opsDayKey(now)) : null,
	]);
	const short = availability?.filter((entry) => entry.shortMl !== "0") ?? [];
	const notes = [...batch.plan.notes, ...(availability?.flatMap((entry) => entry.notes) ?? [])];
	const difference = yieldDifference(batch);
	const label =
		batch.status === "planned"
			? "Planned"
			: batch.status === "reserved"
				? "Reserved"
				: batch.status === "completed"
					? "Made, awaiting review"
					: "Cancelled";

	return (
		<>
			<PageHeader
				title={`Batch ${batch.code}`}
				crumbs={[
					{ label: "E-Liquid Lab", href: LAB },
					{ label: "Batches", href: `${LAB}/batches` },
					{ label: batch.code },
				]}
				lead={`${batch.recipeName}, version ${batch.recipeVersion}, planned at ${batch.plannedMl} mL.`}
				actions={
					<Pill tone={batch.status === "completed" ? "good" : batch.status === "reserved" ? "info" : "plain"}>
						{label}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{batch.status === "cancelled" && (
						<Notice tone="info" title="This batch was cancelled.">
							{batch.cancelReason}
						</Notice>
					)}
					{batch.status === "completed" && (
						<Notice tone="info" title="Made, and awaiting a quality review.">
							Whether this batch may be released is a qualified person’s decision. Recording that decision
							isn’t built yet, and nothing on this page releases it.
						</Notice>
					)}

					<Card title="What the plan calls for">
						<DataTable
							caption={`Calculated when the batch was planned, with calculation version ${batch.plan.calcVersion}. The volumes add up to a nominal ${batch.expectedYieldMl} mL; the measured yield may differ.`}
							columns={
								availability
									? ["Ingredient", "Needed", "Usable now", "Short by"]
									: ["Ingredient", "Needed", "Share of batch"]
							}
							numeric={[1, 2, 3]}
							rows={batch.plan.lines.map((line) => {
								const entry = availability?.find((a) => a.line.key === line.key);
								return entry
									? [
											<Link key="i" href={`${LAB}/ingredients/${line.ingredientId}`}>
												{line.name}
											</Link>,
											`${line.requiredMl} mL`,
											`${entry.availableMl} mL`,
											entry.shortMl === "0" ? "—" : <Pill tone="bad">{entry.shortMl} mL</Pill>,
										]
									: [
											<Link key="i" href={`${LAB}/ingredients/${line.ingredientId}`}>
												{line.name}
											</Link>,
											`${line.requiredMl} mL`,
											`${line.percentOfBatch}%`,
										];
							})}
						/>
						{notes.length > 0 && <Bullets items={notes} />}
						{batch.status === "planned" &&
							(short.length > 0 ? (
								<Notice tone="warn" title="Not enough usable stock to reserve this batch.">
									Reserving takes everything or nothing. Receive more of what is short, or plan a smaller
									batch.
								</Notice>
							) : (
								<div style={{ marginTop: 12 }}>
									<ButtonForm
										action={batchAction}
										hidden={{ intent: "reserve", batchId: batch.id }}
										label="Reserve everything this batch needs"
										tone="primary"
										idPrefix="reserve"
									/>
								</div>
							))}
					</Card>

					{allocations.length > 0 && (
						<Card title="Lots it takes from">
							<DataTable
								caption="Earliest expiry first. A lot counted in grams is converted with its documented density."
								columns={[
									"Ingredient",
									"Lot",
									"Plan needs",
									"Reserved",
									batch.status === "completed" ? "Used" : "How known",
								]}
								rows={allocations.map((allocation) => [
									<Link key="i" href={`${LAB}/ingredients/${allocation.ingredientId}`}>
										{allocation.ingredientName}
									</Link>,
									allocation.lotCode,
									`${allocation.requiredMl} mL`,
									`${allocation.reservedQuantity} ${allocation.unit}`,
									batch.status === "completed" || batch.status === "cancelled"
										? `${allocation.usedQuantity ?? "0"} ${allocation.unit}`
										: allocation.basis === "calculated"
											? "Calculated from density"
											: "Measured in mL",
								])}
							/>
						</Card>
					)}

					{batch.status === "reserved" && (
						<Card title="Record that it was made" accent>
							<p className="wai-help" style={{ marginTop: 0 }}>
								Enter what was actually used from each lot, in that lot’s unit. Leave a line as it is if all
								of what was reserved was used. Whatever was reserved but not used goes back to free stock. The
								yield is what you measured; it is never calculated.
							</p>
							<FieldsForm
								action={batchAction}
								hidden={{ intent: "complete", batchId: batch.id }}
								idPrefix="complete"
								submit="Record the batch as made"
								initial={Object.fromEntries(allocations.map((a) => [`used.${a.id}`, a.reservedQuantity]))}
								fields={[
									...allocations.map((allocation) => ({
										name: `used.${allocation.id}`,
										label: `${allocation.ingredientName}, lot ${allocation.lotCode}: used, ${allocation.unit} (reserved ${allocation.reservedQuantity})`,
										kind: "decimal" as const,
									})),
									{
										name: "actualYieldMl",
										label: "Measured yield, mL",
										kind: "decimal" as const,
										required: true,
									},
									{ name: "wasteMl", label: "Waste and spills, mL", kind: "decimal" as const },
									{ name: "samplesMl", label: "Samples taken, mL", kind: "decimal" as const },
									{ name: "notes", label: "Notes", kind: "textarea" as const, rows: 2 },
								]}
							/>
						</Card>
					)}
				</div>

				<div className="wai-stack">
					<Card title="About this batch">
						<KeyValues
							items={[
								["Recipe", `${batch.recipeName}, version ${batch.recipeVersion}`],
								["Planned size", `${batch.plannedMl} mL`],
								["Nominal volume", `${batch.expectedYieldMl} mL`],
								["Calculated nicotine", `${batch.plan.totals.calculatedNicotineMgPerMl} mg/mL`],
								["PG share of PG and VG", `${batch.plan.totals.pgShareOfPgVg}%`],
								["Flavour", `${batch.plan.totals.flavourPercent}%`],
								["Planned", <When key="p" at={batch.plannedAt} now={now} />],
								["Reserved", batch.reservedAt ? <When key="r" at={batch.reservedAt} now={now} /> : "Not yet"],
								["Made", batch.completedAt ? <When key="c" at={batch.completedAt} now={now} /> : "Not yet"],
								...(batch.actualYieldMl
									? ([
											["Measured yield", `${batch.actualYieldMl} mL`],
											["Against nominal", difference ? `${difference.ml} mL (${difference.percent}%)` : "—"],
											["Waste and spills", batch.wasteMl ? `${batch.wasteMl} mL` : "Not recorded"],
											["Samples", batch.samplesMl ? `${batch.samplesMl} mL` : "Not recorded"],
										] as Array<[string, string]>)
									: []),
								["Quality", "Awaiting review"],
							]}
						/>
						{batch.notes && <p className="wai-help">{batch.notes}</p>}
					</Card>

					{(batch.status === "planned" || batch.status === "reserved") && (
						<Card title="Cancel">
							<p className="wai-help" style={{ marginTop: 0 }}>
								Cancelling gives back everything this batch has reserved. It can’t be undone; plan a new batch
								instead.
							</p>
							<ButtonForm
								action={batchAction}
								hidden={{ intent: "cancel", batchId: batch.id }}
								label="Cancel this batch"
								tone="danger"
								note={{ label: "Why it is being cancelled", required: true }}
								idPrefix="cancel"
							/>
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
