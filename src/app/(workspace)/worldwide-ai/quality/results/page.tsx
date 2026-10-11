import type { Metadata } from "next";
import Link from "next/link";
import {
	SAMPLE_EVENTS,
	SAMPLE_PURPOSES,
	listSamples,
	listUnverifiedResults,
} from "@/lib/worldwide-ai/lab/quality";
import { formatDay } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { Card, DataTable, Empty, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Samples and results" };

const QUALITY = `${WORKSPACE_PATH}/quality`;
const batchQuality = (batchId: string) => `${WORKSPACE_PATH}/lab/batches/${batchId}/quality`;

/** Across every batch: the results nobody has verified yet, and the samples with where each one is now. */
export default async function ResultsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [unverified, samples] = await Promise.all([listUnverifiedResults(sql), listSamples(sql)]);

	return (
		<>
			<PageHeader
				title="Samples and results"
				crumbs={[{ label: "Quality", href: QUALITY }, { label: "Samples and results" }]}
				lead="Results typed in from a laboratory's report count only once the owner has verified them against the report. Samples and results are entered on each batch; this page shows what is waiting across all of them."
				actions={
					<>
						<Link href={`${QUALITY}/specifications`} className="wai-btn">
							Specifications
						</Link>
						<Link href={`${WORKSPACE_PATH}/lab/finished`} className="wai-btn">
							Finished liquids
						</Link>
					</>
				}
			/>
			<div className="wai-stack">
				<Card
					title="Waiting to be verified"
					aside={<Pill tone={unverified.length ? "pink" : "plain"}>{unverified.length}</Pill>}
					accent={unverified.length > 0}
				>
					{unverified.length === 0 ? (
						<Empty>Every result on file has been verified.</Empty>
					) : (
						<DataTable
							caption="Oldest first. Open the batch to compare each with its report and verify it."
							columns={["Batch", "Tested", "Reported", "Laboratory and report", "Report date", "Entered"]}
							rows={unverified.map((result) => [
								<Link key="b" href={batchQuality(result.batchId)}>
									{result.batchCode}
								</Link>,
								result.analyte,
								`${result.reportedAs} ${result.unit}`,
								`${result.lab}, ${result.reportRef}`,
								formatDay(result.reportedOn),
								<When key="w" at={result.enteredAt} now={now} />,
							])}
						/>
					)}
				</Card>
				<Card title="Samples" aside={<Pill>{samples.length}</Pill>}>
					{samples.length === 0 ? (
						<Empty>No sample has been taken. Take one from a batch that has been made.</Empty>
					) : (
						<DataTable
							caption="Newest first. The last line of a sample's custody record says where it is now."
							columns={["Sample", "Batch", "For", "Quantity", "Where it is now", "Taken"]}
							numeric={[3]}
							rows={samples.map((sample) => {
								const last = sample.events[sample.events.length - 1];
								return [
									sample.code,
									<Link key="b" href={batchQuality(sample.batchId)}>
										{sample.batchCode}
									</Link>,
									SAMPLE_PURPOSES[sample.purpose],
									`${sample.quantityMl} mL`,
									last
										? `${SAMPLE_EVENTS[last.event]}${last.detail ? `: ${last.detail}` : ""}`
										: "Not recorded",
									<When key="w" at={sample.takenAt} now={now} />,
								];
							})}
						/>
					)}
				</Card>
			</div>
		</>
	);
}
