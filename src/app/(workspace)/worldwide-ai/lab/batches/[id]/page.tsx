import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	batchAvailability,
	getBatch,
	listAllocations,
	yieldDifference,
} from "@/lib/worldwide-ai/lab/batches";
import {
	RELEASE_CONFIRMATIONS,
	listBulkMovements,
	listHolds,
	listPackagingRuns,
	releaseChecks,
} from "@/lib/worldwide-ai/lab/finished";
import { listInventory } from "@/lib/worldwide-ai/lab/inventory";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { batchAction, finishedAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm, type FormField } from "@/ui/sections/worldwide-ai/forms";
import { ReleaseForm } from "@/ui/sections/worldwide-ai/release-form";
import {
	Bullets,
	Card,
	DataTable,
	Empty,
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
const COMPONENT_ROWS = 3;
const BULK_LABEL = {
	produced: "Made",
	packaged: "Packaged",
	sample: "Sample",
	waste: "Waste",
	correction: "Correction",
} as const;

/** One batch: the plan, the lots it took from, what was used and what came out, its bulk and packaging, and its release. */
export default async function BatchPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const today = opsDayKey(now);
	const batch = UUID.test(id) ? await getBatch(sql, id) : null;
	if (!batch) notFound();
	const made = batch.status === "completed";
	const [allocations, availability, holds, runs, bulk, checks, inventory] = await Promise.all([
		listAllocations(sql, batch.id),
		batch.status === "planned" ? batchAvailability(sql, batch, today) : null,
		listHolds(sql, batch.id),
		made ? listPackagingRuns(sql, batch.id) : [],
		made ? listBulkMovements(sql, batch.id) : [],
		made ? releaseChecks(sql, batch) : [],
		made ? listInventory(sql, today, { category: "packaging" }) : [],
	]);
	const short = availability?.filter((entry) => entry.shortMl !== "0") ?? [];
	const notes = [...batch.plan.notes, ...(availability?.flatMap((entry) => entry.notes) ?? [])];
	const difference = yieldDifference(batch);
	const openHolds = holds.filter((hold) => hold.liftedAt === null);
	const onHold = openHolds.length > 0;
	const undecided = batch.qualityStatus === "awaiting_review";
	const canPackage = made && batch.qualityStatus !== "rejected" && !onHold && batch.bulkRemainingMl !== "0";
	const packagingLots = inventory.flatMap((item) =>
		item.lots
			.filter((lot) => lot.unit === "each" && lot.usable !== "0")
			.map((lot) => ({
				value: lot.id,
				label: `${item.ingredient.name}, lot ${lot.lotCode}: ${lot.usable} usable`,
			})),
	);
	const label =
		batch.status === "planned"
			? "Planned"
			: batch.status === "reserved"
				? "Reserved"
				: batch.status === "cancelled"
					? "Cancelled"
					: batch.qualityStatus === "rejected"
						? "Rejected"
						: onHold
							? "On hold"
							: batch.qualityStatus === "released"
								? "Released"
								: "Made, awaiting a release decision";

	const packageFields: FormField[] = [
		{ name: "sku", label: "Product or SKU it fills", kind: "text", required: true, maxLength: 120 },
		{ name: "bottleMl", label: "Bottle size, mL", kind: "decimal", required: true },
		{ name: "unitsFilled", label: "Units filled", kind: "number", required: true },
		{ name: "unitsRejected", label: "Units rejected", kind: "number" },
		{
			name: "bulkUsedMl",
			label: "Bulk used, mL, as measured",
			kind: "decimal",
			required: true,
			help: "What actually left the bulk. It is not taken to be units times bottle size.",
		},
		{
			name: "labelVersion",
			label: "Approved label version used",
			kind: "text",
			required: true,
			maxLength: 160,
		},
		{
			name: "lineClearance",
			label: "Line clearance",
			kind: "text",
			required: true,
			maxLength: 500,
			help: "What was checked to confirm the previous product’s materials and labels were removed.",
		},
		...Array.from({ length: COMPONENT_ROWS }, (_, index): FormField[] => [
			{
				name: `componentLot${index + 1}`,
				label: `Packaging lot ${index + 1}`,
				kind: "select",
				options: packagingLots,
			},
			{ name: `componentQuantity${index + 1}`, label: `Pieces used from lot ${index + 1}`, kind: "number" },
		]).flat(),
		{ name: "notes", label: "Notes", kind: "textarea", rows: 2 },
	];

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
					<Pill
						tone={
							batch.qualityStatus === "released" && !onHold
								? "good"
								: batch.qualityStatus === "rejected" || onHold
									? "warn"
									: batch.status === "reserved"
										? "info"
										: "plain"
						}
					>
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
					{onHold && (
						<Notice tone="warn" title="This batch is on hold.">
							<Bullets items={openHolds.map((hold) => hold.reason)} />
							It can’t be packaged or released until the owner lifts the hold.
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
								const name = (
									<Link key="i" href={`${LAB}/ingredients/${line.ingredientId}`}>
										{line.name}
									</Link>
								);
								return entry
									? [
											name,
											`${line.requiredMl} mL`,
											`${entry.availableMl} mL`,
											entry.shortMl === "0" ? "—" : <Pill tone="bad">{entry.shortMl} mL</Pill>,
										]
									: [name, `${line.requiredMl} mL`, `${line.percentOfBatch}%`];
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
									batch.status === "reserved" ? "How known" : "Used",
								]}
								rows={allocations.map((allocation) => [
									<Link key="i" href={`${LAB}/ingredients/${allocation.ingredientId}`}>
										{allocation.ingredientName}
									</Link>,
									allocation.lotCode,
									`${allocation.requiredMl} mL`,
									`${allocation.reservedQuantity} ${allocation.unit}`,
									batch.status === "reserved"
										? allocation.basis === "calculated"
											? "Calculated from density"
											: "Measured in mL"
										: `${allocation.usedQuantity ?? "0"} ${allocation.unit}`,
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

					{made && (
						<Card
							title="Bulk and packaging"
							aside={<Pill>{`${batch.bulkRemainingMl ?? "0"} mL left in bulk`}</Pill>}
						>
							<p className="wai-help" style={{ marginTop: 0 }}>
								What was measured when the batch was made is its bulk. It is drawn down only by packaging
								runs, samples and waste, each recorded here, so the same liquid is never counted twice.
							</p>
							{runs.length > 0 && (
								<DataTable
									caption="Each run is also the packaged lot. Nominal is units times bottle size, shown beside what actually left the bulk."
									columns={["Run", "Fills", "Units", "Bulk used", "Nominal", "Label", "When"]}
									rows={runs.map((run) => [
										run.code,
										`${run.sku}, ${run.bottleMl} mL`,
										`${run.unitsFilled}${run.unitsRejected ? ` (+${run.unitsRejected} rejected)` : ""}`,
										`${run.bulkUsedMl} mL`,
										`${run.nominalMl} mL`,
										run.labelVersion,
										<When key="w" at={run.runAt} now={now} />,
									])}
								/>
							)}
							<DataTable
								caption="The bulk's own ledger, newest first. Nothing in it is ever changed."
								columns={["What", "Quantity", "Left after", "For / why", "When"]}
								numeric={[1, 2]}
								rows={bulk.map((movement) => [
									BULK_LABEL[movement.kind],
									`${movement.deltaMl} mL`,
									`${movement.remainingAfterMl} mL`,
									[movement.reference, movement.reason].filter(Boolean).join(" · ") || "—",
									<When key="w" at={movement.at} now={now} />,
								])}
							/>
							{canPackage ? (
								<details style={{ marginTop: 12 }} open={runs.length === 0}>
									<summary className="wai-small">Record a packaging run</summary>
									<div style={{ marginTop: 8 }}>
										<FieldsForm
											action={finishedAction}
											hidden={{ intent: "package", batchId: batch.id, idempotencyKey: randomUUID() }}
											idPrefix="package"
											submit="Record the run"
											fields={packageFields}
										/>
									</div>
								</details>
							) : (
								<Empty>
									{batch.qualityStatus === "rejected"
										? "A rejected batch can’t be packaged."
										: onHold
											? "A batch on hold can’t be packaged."
											: "Nothing is left in bulk to package."}
								</Empty>
							)}
							{batch.bulkRemainingMl !== "0" && (
								<details style={{ marginTop: 12 }}>
									<summary className="wai-small">Record a sample, waste, or a correction</summary>
									<div style={{ marginTop: 8 }}>
										<FieldsForm
											action={finishedAction}
											hidden={{ intent: "bulk", batchId: batch.id, idempotencyKey: randomUUID() }}
											idPrefix="bulk"
											submit="Record it"
											fields={[
												{
													name: "kind",
													label: "What happened",
													kind: "select",
													required: true,
													options: [
														{ value: "sample", label: "A sample was taken" },
														{ value: "waste", label: "Liquid was lost" },
														...(workspace.isOwner
															? [{ value: "correction", label: "Correction to what is left" }]
															: []),
													],
												},
												{
													name: "quantityMl",
													label: "Quantity, mL",
													kind: "decimal",
													required: true,
													help: "For a correction, the change, such as -2.5.",
												},
												{ name: "reason", label: "Reason", kind: "text", required: true, maxLength: 500 },
											]}
										/>
									</div>
								</details>
							)}
						</Card>
					)}

					{made && (
						<Card
							title="Release"
							accent={undecided}
							aside={
								<Pill tone={batch.qualityStatus === "released" ? "good" : undecided ? "pink" : "warn"}>
									{batch.qualityStatus === "released"
										? "Released"
										: undecided
											? "Awaiting a decision"
											: "Rejected"}
								</Pill>
							}
						>
							<p className="wai-help" style={{ marginTop: 0 }}>
								Release is the owner’s decision. The workspace checks what it can for itself, again at the
								moment of release, and refuses if anything fails. Releasing makes this batch eligible here
								only: nothing is published and no stock changes in the store.
							</p>
							<DataTable
								caption={
									undecided
										? "What the workspace can check for itself, as things stand now."
										: "What the workspace checked now. What it checked at the time is kept with the decision."
								}
								columns={["Check", "Result", "What was found"]}
								rows={checks.map((check) => [
									check.name,
									<Pill key="r" tone={check.ok ? "good" : "bad"}>
										{check.ok ? "Passed" : "Failed"}
									</Pill>,
									check.detail,
								])}
							/>
							{!undecided && (
								<Notice
									tone={batch.qualityStatus === "released" ? "good" : "warn"}
									title={
										batch.qualityStatus === "released" ? "Released by the owner." : "Rejected by the owner."
									}
								>
									{batch.decisionNote} <When at={batch.decidedAt} now={now} />
								</Notice>
							)}
							{undecided &&
								(workspace.isOwner ? (
									<ReleaseForm
										action={finishedAction}
										batchId={batch.id}
										confirmations={RELEASE_CONFIRMATIONS}
										canRelease={checks.every((check) => check.ok)}
									/>
								) : (
									<p className="wai-muted wai-small" style={{ marginBottom: 0 }}>
										Only the owner can release or reject a batch.
									</p>
								))}
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
								["Release", made ? label : "Not made yet"],
							]}
						/>
						{batch.notes && <p className="wai-help">{batch.notes}</p>}
					</Card>

					{made && (
						<Card
							title="Holds"
							aside={<Pill tone={onHold ? "warn" : "plain"}>{`${openHolds.length} open`}</Pill>}
						>
							{holds.length > 0 && (
								<ul className="wai-list">
									{holds.map((hold) => (
										<li key={hold.id} style={{ display: "block" }}>
											<strong>{hold.reason}</strong>
											<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
												Placed <When at={hold.placedAt} now={now} />
												{hold.liftedAt && (
													<>
														. Lifted <When at={hold.liftedAt} now={now} />: {hold.liftReason}
													</>
												)}
											</p>
											{!hold.liftedAt && workspace.isOwner && (
												<ButtonForm
													action={finishedAction}
													hidden={{ intent: "lift", holdId: hold.id }}
													label="Lift this hold"
													small
													note={{ label: "Why it is being lifted", required: true }}
													idPrefix={`lift-${hold.id}`}
												/>
											)}
										</li>
									))}
								</ul>
							)}
							<p className="wai-help">
								Anyone can place a hold. It stops the batch being packaged or released until the owner lifts
								it.
							</p>
							<ButtonForm
								action={finishedAction}
								hidden={{ intent: "hold", batchId: batch.id }}
								label="Put this batch on hold"
								tone="danger"
								note={{ label: "Why", required: true }}
								idPrefix="hold"
							/>
						</Card>
					)}

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
