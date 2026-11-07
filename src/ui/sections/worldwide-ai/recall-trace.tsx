import Link from "next/link";
import type { RecallTrace } from "@/lib/worldwide-ai/compliance/recall";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { Card, DataTable, Empty, Notice, Pill, Stat } from "./ui";

/** A recall trace, as worked out now or as it was saved. Shows what the records link, and what they don't show. */
export function RecallTraceView({ trace }: { trace: RecallTrace }) {
	return (
		<div className="wai-stack">
			<div className="wai-grid wai-grid--3">
				<Stat value={trace.totals.batches} label="Batches reached" />
				<Stat value={trace.totals.runs} label="Packaging runs reached" />
				<Stat value={trace.totals.unitsFilled} label="Units filled in those runs" />
			</div>
			<Notice tone="warn" title="What the records don’t show">
				<ul>
					{trace.gaps.map((gap) => (
						<li key={gap}>{gap}</li>
					))}
				</ul>
			</Notice>
			<Card title="Lots" aside={<Pill>{trace.lots.length}</Pill>}>
				{trace.lots.length === 0 ? (
					<Empty>No lot is linked.</Empty>
				) : (
					<DataTable
						caption="Each lot, and what it went into, in its own unit."
						columns={["Lot", "Status", "Went into"]}
						rows={trace.lots.map((lot) => [
							<Link key="l" href={`${WORKSPACE_PATH}/lab/ingredients/${lot.ingredientId}`}>
								{lot.ingredient}, {lot.code}
							</Link>,
							lot.status,
							lot.uses
								.map(
									(use) =>
										`${use.into}: ${use.quantity ?? "amount not recorded"} ${lot.unit}${use.basis === "used" ? "" : ` (${use.basis})`}`,
								)
								.join("; "),
						])}
					/>
				)}
			</Card>
			<Card title="Batches" aside={<Pill>{trace.batches.length}</Pill>}>
				{trace.batches.length === 0 ? (
					<Empty>No batch is linked.</Empty>
				) : (
					<DataTable
						caption="Every batch the trace reached, and whether it is held."
						columns={["Batch", "Status", "Quality", "Made (mL)", "Bulk left (mL)", "Holds"]}
						rows={trace.batches.map((batch) => [
							<Link key="b" href={`${WORKSPACE_PATH}/lab/batches/${batch.id}`} className="wai-mono">
								{batch.code}
							</Link>,
							batch.status,
							batch.qualityStatus.replace("_", " "),
							batch.yieldMl ?? "—",
							batch.bulkRemainingMl ?? "—",
							batch.openHolds ? (
								<Pill key="h" tone="warn">
									{batch.openHolds} open
								</Pill>
							) : (
								"None"
							),
						])}
					/>
				)}
			</Card>
			<Card title="Packaging runs" aside={<Pill>{trace.runs.length}</Pill>}>
				{trace.runs.length === 0 ? (
					<Empty>No packaging run is linked.</Empty>
				) : (
					<DataTable
						caption="Every run the trace reached, oldest first, with the stamps recorded on it."
						columns={["Run", "Batch", "SKU", "Units filled", "Rejected", "Label", "Stamps applied"]}
						rows={trace.runs.map((run) => [
							run.code,
							run.batchCode,
							run.sku,
							String(run.unitsFilled),
							String(run.unitsRejected),
							run.labelVersion,
							String(run.stampsApplied),
						])}
					/>
				)}
			</Card>
		</div>
	);
}
