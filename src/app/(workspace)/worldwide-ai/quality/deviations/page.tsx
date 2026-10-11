import type { Metadata } from "next";
import Link from "next/link";
import { listBatches } from "@/lib/worldwide-ai/lab/batches";
import { SEVERITIES, listDeviations, type Deviation } from "@/lib/worldwide-ai/lab/quality";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { qualityAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill, When, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Deviations" };

type Props = { searchParams: Promise<{ batch?: string }> };

const QUALITY = `${WORKSPACE_PATH}/quality`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEVERITY_TONE: Record<Deviation["severity"], Tone> = { minor: "plain", major: "warn", critical: "bad" };

/** Deviations: things that didn't go as they should have, what is being done about each, and how each was closed. */
export default async function DeviationsPage({ searchParams }: Props) {
	const workspace = await getWorkspace();
	const { batch: wanted } = await searchParams;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [deviations, batches] = await Promise.all([listDeviations(sql), listBatches(sql, 60)]);
	const open = deviations.filter((deviation) => deviation.status === "open");
	const closed = deviations.filter((deviation) => deviation.status === "closed");
	const choices = batches.filter((batch) => batch.status !== "cancelled");
	const preset = wanted && UUID.test(wanted) && choices.some((batch) => batch.id === wanted) ? wanted : "";

	const table = (items: Deviation[], caption: string) => (
		<DataTable
			caption={caption}
			columns={["Deviation", "What", "Seriousness", "Batch", "Actions", "Opened"]}
			rows={items.map((deviation) => {
				const waiting = deviation.actions.filter((a) => a.status === "open" || a.status === "done").length;
				return [
					<Link key="d" href={`${QUALITY}/deviations/${deviation.id}`}>
						{deviation.code}
					</Link>,
					deviation.title,
					<Pill key="s" tone={SEVERITY_TONE[deviation.severity]}>
						{SEVERITIES[deviation.severity]}
					</Pill>,
					deviation.batchId ? (
						<Link key="b" href={`${WORKSPACE_PATH}/lab/batches/${deviation.batchId}`}>
							{deviation.batchCode}
						</Link>
					) : (
						"—"
					),
					deviation.actions.length === 0
						? "None"
						: `${deviation.actions.length}${waiting ? `, ${waiting} unfinished` : ", all settled"}`,
					<When key="w" at={deviation.openedAt} now={now} />,
				];
			})}
		/>
	);

	return (
		<>
			<PageHeader
				title="Deviations"
				crumbs={[{ label: "Quality", href: QUALITY }, { label: "Deviations" }]}
				lead="Something that didn't go as it should have: a failed measurement, a spill, a wrong label on the bench. Anyone can open one. Each keeps its investigation as it was written, and can't be closed until every action is verified to have worked."
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Open" aside={<Pill tone={open.length ? "warn" : "plain"}>{open.length}</Pill>}>
						{open.length === 0 ? (
							<Empty>No deviation is open.</Empty>
						) : (
							table(open, "Newest first. A deviation against a batch stands in the way of its release.")
						)}
					</Card>
					<Card title="Closed" aside={<Pill>{closed.length}</Pill>}>
						{closed.length === 0 ? (
							<Empty>No deviation has been closed yet.</Empty>
						) : (
							table(closed, "Newest first. A closed deviation is kept as it was and is not reopened.")
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Open a deviation" accent={!!preset}>
						<FieldsForm
							action={qualityAction}
							hidden={{ intent: "deviation.open" }}
							idPrefix="deviation"
							submit="Open the deviation"
							initial={preset ? { batchId: preset } : undefined}
							fields={[
								{ name: "title", label: "In a few words", kind: "text", required: true, maxLength: 160 },
								{
									name: "description",
									label: "What happened",
									kind: "textarea",
									required: true,
									rows: 4,
									help: "What was seen, where and when. Say what is known; a guess at the cause goes in the investigation, marked as suspected.",
								},
								{
									name: "severity",
									label: "How serious",
									kind: "select",
									required: true,
									options: Object.entries(SEVERITIES).map(([value, label]) => ({ value, label })),
								},
								{
									name: "batchId",
									label: "Batch it concerns",
									kind: "select",
									help: "Leave blank when it isn't about one batch.",
									options: choices.map((batch) => ({
										value: batch.id,
										label: `${batch.code}, ${batch.recipeName}`,
									})),
								},
								{
									name: "hold",
									label: "Put that batch on hold now",
									kind: "select",
									help: "A hold stops the batch being packaged or released until the owner lifts it.",
									options: [{ value: "yes", label: "Yes, put it on hold" }],
								},
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
