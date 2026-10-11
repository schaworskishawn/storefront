import type { Metadata } from "next";
import Link from "next/link";
import { listBatches, type BatchStatus } from "@/lib/worldwide-ai/lab/batches";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { Card, DataTable, Empty, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Batches" };

const LAB = `${WORKSPACE_PATH}/lab`;
const STATUS_TONE: Record<BatchStatus, Tone> = {
	planned: "plain",
	reserved: "info",
	completed: "good",
	cancelled: "plain",
};
const STATUS_LABEL: Record<BatchStatus, string> = {
	planned: "Planned",
	reserved: "Reserved",
	completed: "Made",
	cancelled: "Cancelled",
};

/** Batches: every batch planned, where it stands, and what came out of the ones that were made. */
export default async function BatchesPage() {
	const workspace = await getWorkspace();
	const now = workspace.runtime.now();
	const batches = await listBatches(workspace.runtime.sql);

	return (
		<>
			<PageHeader
				title="Batches"
				crumbs={[{ label: "E-Liquid Lab", href: LAB }, { label: "Batches" }]}
				lead="A batch is planned from an approved recipe version, reserves the lots it will use, and records what was actually used and what was measured coming out. Whether a made batch is released is the owner's decision, recorded on the batch."
				actions={
					<Link href={`${LAB}/recipes`} className="wai-btn">
						Recipes
					</Link>
				}
			/>
			<Card title="Batches" aside={<Pill>{batches.length}</Pill>}>
				{batches.length === 0 ? (
					<Empty>No batch has been planned. Plan one from an approved recipe version.</Empty>
				) : (
					<DataTable
						caption="Newest first."
						columns={["Batch", "Recipe", "Planned size", "Status", "Planned", "Measured yield"]}
						rows={batches.map((batch) => [
							<Link key="c" href={`${LAB}/batches/${batch.id}`}>
								{batch.code}
							</Link>,
							`${batch.recipeName}, version ${batch.recipeVersion}`,
							`${batch.plannedMl} mL`,
							<Pill key="s" tone={STATUS_TONE[batch.status]}>
								{STATUS_LABEL[batch.status]}
							</Pill>,
							<When key="w" at={batch.plannedAt} now={now} />,
							batch.actualYieldMl ? `${batch.actualYieldMl} mL` : "—",
						])}
					/>
				)}
			</Card>
		</>
	);
}
