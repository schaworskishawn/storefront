import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import {
	STAMP_STATES,
	listStampStocks,
	stampReconciliation,
	type StampState,
} from "@/lib/worldwide-ai/compliance/stamps";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, Stat } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Excise stamps" };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;
const STATES = Object.keys(STAMP_STATES) as StampState[];

/** The excise stamp ledger: what was received, where every stamp stands, and how that reconciles with packaging. */
export default async function StampsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const [stocks, reconciliation] = await Promise.all([listStampStocks(sql), stampReconciliation(sql)]);
	const today = opsDayKey(workspace.runtime.now());

	return (
		<>
			<PageHeader
				title="Excise stamps"
				crumbs={[{ label: "Canadian Compliance", href: COMPLIANCE }, { label: "Excise stamps" }]}
				lead="The stamps received, and every thing a person did with them. Each stamp is counted in exactly one state, and the counts always add up to what was received. Identifiers can't be received twice or applied twice."
				actions={
					<Link href={`${COMPLIANCE}/recall`} className="wai-btn">
						Recall trace
					</Link>
				}
			/>
			<Notice tone="info" title="A record of what people did, nothing more.">
				Nothing here orders, makes, reproduces or disposes of a stamp, or decides which products need one. A
				damaged stamp stays damaged until a return or a disposal is recorded, and only the owner records a
				disposal, with the authorization it was done under.
			</Notice>
			<div className="wai-grid wai-grid--3" style={{ margin: "16px 0" }}>
				<Stat value={stocks.length} label="Receipts on record" />
				<Stat
					value={reconciliation.exceptions.filter((e) => e.kind !== "damaged").length}
					label="Losses or ledger differences"
				/>
				<Stat
					value={reconciliation.exceptions.filter((e) => e.kind === "damaged").length}
					label="Receipts with damage not yet returned or disposed of"
				/>
			</div>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="By jurisdiction">
						{reconciliation.byJurisdiction.length === 0 ? (
							<Empty>No stamps have been received.</Empty>
						) : (
							<DataTable
								caption="What was received, and where it stands now."
								columns={["Jurisdiction", "Received", ...STATES.map((s) => STAMP_STATES[s])]}
								rows={reconciliation.byJurisdiction.map((row) => [
									row.jurisdiction,
									String(row.received),
									...STATES.map((s) => String(row.counts[s])),
								])}
							/>
						)}
					</Card>
					{reconciliation.exceptions.length > 0 && (
						<Card title="Needs a person" aside={<Pill tone="warn">{reconciliation.exceptions.length}</Pill>}>
							<DataTable
								caption="Each stays here until the stamps are found, returned or disposed of, or the ledger is explained."
								columns={["Receipt", "What"]}
								rows={reconciliation.exceptions.map((e) => [
									<Link key="c" href={`${COMPLIANCE}/stamps/${e.stockId}`} className="wai-mono">
										{e.code}
									</Link>,
									e.detail,
								])}
							/>
						</Card>
					)}
					<Card title="Receipts" aside={<Pill>{stocks.length}</Pill>}>
						{stocks.length === 0 ? (
							<Empty>None yet.</Empty>
						) : (
							<DataTable
								caption="Newest first. Open one to record what was done with its stamps."
								columns={[
									"Receipt",
									"Jurisdiction",
									"Identifiers",
									"Received",
									"Available",
									"Applied",
									"Where",
								]}
								rows={stocks.map((stock) => [
									<Link key="c" href={`${COMPLIANCE}/stamps/${stock.id}`} className="wai-mono">
										{stock.code}
									</Link>,
									stock.jurisdiction,
									stock.serialFrom !== null
										? `${stock.serialPrefix}${stock.serialFrom} to ${stock.serialPrefix}${stock.serialTo}`
										: "Not recorded",
									`${stock.quantity} on ${formatDay(stock.receivedOn)}`,
									String(stock.counts.available),
									String(stock.counts.applied),
									stock.location,
								])}
							/>
						)}
					</Card>
					<Card title="Packaging runs and stamps">
						<p className="wai-help" style={{ marginTop: 0 }}>
							Stamps applied to each run beside the units it filled. More stamps than units can’t be recorded.
							Whether a product needs stamps at all is not decided here.
						</p>
						{reconciliation.runs.length === 0 ? (
							<Empty>No stamps have been applied to a packaging run.</Empty>
						) : (
							<DataTable
								caption="Runs with at least one stamp applied."
								columns={["Run", "SKU", "Units filled", "Rejected", "Stamps applied", "Difference"]}
								rows={reconciliation.runs.map((run) => [
									run.code,
									run.sku,
									String(run.unitsFilled),
									String(run.unitsRejected),
									String(run.applied),
									run.applied === run.unitsFilled ? (
										<Pill key="d" tone="good">
											None
										</Pill>
									) : (
										<Pill key="d" tone="warn">
											{run.unitsFilled - run.applied} units without a stamp recorded
										</Pill>
									),
								])}
							/>
						)}
						{reconciliation.unstamped.length > 0 && (
							<p className="wai-muted wai-small">
								{reconciliation.unstamped.length} packaging run
								{reconciliation.unstamped.length === 1 ? " has" : "s have"} no stamps recorded:{" "}
								{reconciliation.unstamped
									.slice(0, 12)
									.map((run) => run.code)
									.join(", ")}
								{reconciliation.unstamped.length > 12 ? ", and more" : ""}.
							</p>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record stamps received">
						<FieldsForm
							action={complianceAction}
							hidden={{ intent: "stamps.receive", idempotencyKey: randomUUID() }}
							idPrefix="receive"
							submit="Record the receipt"
							initial={{ receivedOn: today }}
							fields={[
								{
									name: "jurisdiction",
									label: "Jurisdiction they were issued for",
									kind: "text",
									required: true,
									maxLength: 120,
									help: "As the stamps or their paperwork say.",
								},
								{
									name: "authorizedEntity",
									label: "Licensee they were issued to",
									kind: "text",
									required: true,
									maxLength: 200,
								},
								{
									name: "sourceDocument",
									label: "Document they came with",
									kind: "text",
									required: true,
									maxLength: 300,
								},
								{ name: "serialPrefix", label: "Identifier prefix", kind: "text", maxLength: 20 },
								{ name: "serialFrom", label: "First identifier (number)", kind: "text", maxLength: 20 },
								{ name: "serialTo", label: "Last identifier (number)", kind: "text", maxLength: 20 },
								{
									name: "quantity",
									label: "How many",
									kind: "number",
									help: "Worked out from the identifiers when they are entered.",
								},
								{ name: "receivedOn", label: "Received on", kind: "date", required: true },
								{ name: "location", label: "Kept at", kind: "text", required: true, maxLength: 200 },
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
