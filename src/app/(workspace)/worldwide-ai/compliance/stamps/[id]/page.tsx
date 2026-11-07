import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	STAMP_ACTIONS,
	STAMP_STATES,
	getStampStock,
	replayStampEvents,
	type StampEvent,
	type StampState,
} from "@/lib/worldwide-ai/compliance/stamps";
import { listPackagingRuns } from "@/lib/worldwide-ai/lab/finished";
import { formatDay } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, KeyValues, Notice, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Stamp receipt" };

type Props = { params: Promise<{ id: string }> };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;
const STATES = Object.keys(STAMP_STATES) as StampState[];
const who = (key: string) => key.replace(/^operator:/, "");
/** How each line of the ledger reads: what was done, not what to do. */
const EVENT_LABELS: Record<StampEvent["kind"], string> = {
	received: "Received",
	moved: "Moved",
	reserved: "Reserved",
	unreserved: "Reservation released",
	applied: "Applied",
	damaged: "Damaged",
	returned: "Returned",
	disposed: "Disposed of",
	lost: "Lost",
	found: "Found",
};

/** One receipt of stamps: where each of them stands, and the ledger of what was done with them. */
export default async function StampStockPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const found = await getStampStock(sql, id);
	if (!found) notFound();
	const { stock, events } = found;
	const now = workspace.runtime.now();
	const runs = await listPackagingRuns(sql);
	const replayed = replayStampEvents(events);
	const agrees = STATES.every((state) => replayed[state] === stock.counts[state]);

	return (
		<>
			<PageHeader
				title={`Stamps ${stock.code}`}
				crumbs={[
					{ label: "Canadian Compliance", href: COMPLIANCE },
					{ label: "Excise stamps", href: `${COMPLIANCE}/stamps` },
					{ label: stock.code },
				]}
				lead={`${stock.quantity} stamps for ${stock.jurisdiction}, issued to ${stock.authorizedEntity}. Received ${formatDay(stock.receivedOn)}, with ${stock.sourceDocument}.`}
				actions={
					agrees ? (
						<Pill tone="good">The ledger adds up</Pill>
					) : (
						<Pill tone="bad">The ledger doesn’t add up</Pill>
					)
				}
			/>
			{!agrees && (
				<Notice tone="bad" title="The counts don’t match the ledger.">
					Replaying the events below gives different counts from the ones stored. Nothing here changes either:
					find out why before recording anything else.
				</Notice>
			)}
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Where they stand">
						<KeyValues
							items={[
								...STATES.map(
									(state) => [STAMP_STATES[state], String(stock.counts[state])] as [string, string],
								),
								[
									"Identifiers",
									stock.serialFrom !== null
										? `${stock.serialPrefix}${stock.serialFrom} to ${stock.serialPrefix}${stock.serialTo}`
										: "Not recorded with the receipt",
								],
								["Kept at", stock.location],
							]}
						/>
					</Card>
					<Card title="Ledger" aside={<Pill>{events.length}</Pill>}>
						<DataTable
							caption="Newest first. Nothing here is changed afterwards."
							columns={["When", "What", "How many", "From → to", "Identifiers", "Run", "Detail", "By"]}
							rows={events.map((event) => [
								<When key="w" at={event.at} now={now} />,
								EVENT_LABELS[event.kind],
								String(event.quantity),
								event.fromState || event.toState
									? `${event.fromState ? STAMP_STATES[event.fromState] : "—"} → ${event.toState ? STAMP_STATES[event.toState] : "—"}`
									: "—",
								event.serialFrom !== null
									? `${stock.serialPrefix}${event.serialFrom} to ${stock.serialPrefix}${event.serialTo}`
									: "—",
								event.packagingRunCode ?? "—",
								[
									event.location && `At ${event.location}`,
									event.reason,
									event.evidence && `Evidence: ${event.evidence}`,
									event.authorization && `Authorized by: ${event.authorization}`,
								]
									.filter(Boolean)
									.join(" · ") || "—",
								who(event.actor),
							])}
						/>
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record what was done">
						<FieldsForm
							action={complianceAction}
							hidden={{ intent: "stamps.event", stockId: stock.id, idempotencyKey: randomUUID() }}
							idPrefix="event"
							submit="Record it"
							fields={[
								{
									name: "kind",
									label: "What was done",
									kind: "select",
									required: true,
									options: Object.entries(STAMP_ACTIONS).map(([value, action]) => ({
										value,
										label: `${action.label}${"ownerOnly" in action ? " (owner)" : ""}`,
									})),
								},
								{
									name: "from",
									label: "Taken from",
									kind: "select",
									options: STATES.map((state) => ({ value: state, label: STAMP_STATES[state] })),
									help: "Leave it unchosen for the usual state: applying takes available stamps unless you choose reserved; damage, available unless reserved; a return, damaged unless available.",
								},
								{
									name: "quantity",
									label: "How many",
									kind: "number",
									help:
										stock.serialFrom !== null ? "When applying, enter the identifiers instead." : undefined,
								},
								...(stock.serialFrom !== null
									? ([
											{
												name: "serialFrom",
												label: "First identifier applied",
												kind: "text",
												maxLength: 20,
												placeholder: String(stock.serialFrom),
											},
											{
												name: "serialTo",
												label: "Last identifier applied",
												kind: "text",
												maxLength: 20,
											},
										] as const)
									: []),
								{
									name: "packagingRunId",
									label: "Packaging run",
									kind: "select",
									options: runs.map((run) => ({
										value: run.id,
										label: `${run.code}, ${run.sku}, ${run.unitsFilled} units`,
									})),
									help: "Needed when applying.",
								},
								{ name: "reason", label: "What happened", kind: "text", maxLength: 1000 },
								{ name: "evidence", label: "What shows it happened", kind: "text", maxLength: 1000 },
								{
									name: "authorization",
									label: "Authorization (for a disposal)",
									kind: "text",
									maxLength: 300,
								},
							]}
						/>
					</Card>
					<Card title="Move them">
						<FieldsForm
							action={complianceAction}
							hidden={{ intent: "stamps.move", stockId: stock.id, idempotencyKey: randomUUID() }}
							idPrefix="move"
							submit="Record the move"
							fields={[
								{ name: "location", label: "Now kept at", kind: "text", required: true, maxLength: 200 },
								{ name: "reason", label: "Why", kind: "text", maxLength: 500 },
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
