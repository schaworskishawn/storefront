import type { Metadata } from "next";
import Link from "next/link";
import { STANDING_LABELS, listFinished, type FinishedBatch } from "@/lib/worldwide-ai/lab/finished";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { Card, DataTable, Empty, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Finished liquids" };

const LAB = `${WORKSPACE_PATH}/lab`;
const TONE: Record<FinishedBatch["standing"], Tone> = {
	awaiting_review: "pink",
	released: "good",
	rejected: "warn",
	on_hold: "warn",
};

/** Finished liquids: every batch that has been made, what is left in bulk, what was packaged, and where it stands. */
export default async function FinishedPage() {
	const workspace = await getWorkspace();
	const now = workspace.runtime.now();
	const finished = await listFinished(workspace.runtime.sql);

	return (
		<>
			<PageHeader
				title="Finished liquids"
				crumbs={[{ label: "E-Liquid Lab", href: LAB }, { label: "Finished liquids" }]}
				lead="Every batch that has been made: what is left of its bulk, what has been packaged from it, and whether the owner has released it. Released means eligible in this workspace. The store stays the only record of what can be sold, and nothing here is sent to it."
				actions={
					<Link href={`${LAB}/batches`} className="wai-btn">
						Batches
					</Link>
				}
			/>
			<Card title="Made batches" aside={<Pill>{finished.length}</Pill>}>
				{finished.length === 0 ? (
					<Empty>No batch has been recorded as made yet.</Empty>
				) : (
					<DataTable
						caption="Newest first. Open a batch to package it, place or lift a hold, or record the release decision."
						columns={["Batch", "Recipe", "Made", "Left in bulk", "Packaged", "Standing"]}
						rows={finished.map((item) => [
							<Link key="b" href={`${LAB}/batches/${item.batch.id}`}>
								{item.batch.code}
							</Link>,
							`${item.batch.recipeName}, version ${item.batch.recipeVersion}`,
							<When key="w" at={item.batch.completedAt} now={now} />,
							`${item.batch.bulkRemainingMl ?? "0"} mL of ${item.batch.actualYieldMl ?? "0"}`,
							item.runs.length === 0 ? (
								"Nothing yet"
							) : (
								<>
									{item.runs.map((run) => (
										<div key={run.id}>
											{run.unitsFilled} × {run.bottleMl} mL, {run.sku} ({run.code})
										</div>
									))}
								</>
							),
							<span key="s">
								<Pill tone={TONE[item.standing]}>{STANDING_LABELS[item.standing]}</Pill>
								{item.standing === "on_hold" && item.batch.qualityStatus === "released" && (
									<>
										{" "}
										<Pill>Was released</Pill>
									</>
								)}
							</span>,
						])}
					/>
				)}
			</Card>
		</>
	);
}
