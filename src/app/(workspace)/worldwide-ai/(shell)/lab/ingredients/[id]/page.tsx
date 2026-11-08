import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	MOVEMENT_KINDS,
	MOVEMENT_LABELS,
	OWNER_ONLY,
	UNITS,
	categoryLabel,
	getInventoryItem,
	listMovements,
} from "@/lib/worldwide-ai/lab/inventory";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { inventoryAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
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

export const metadata: Metadata = { title: "Ingredient" };

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAB = `${WORKSPACE_PATH}/lab`;

/** One ingredient: what the supplier documented, its lots and their balances, and the forms that move its stock. */
export default async function IngredientPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const today = opsDayKey(now);
	const item = UUID.test(id) ? await getInventoryItem(sql, id, today) : null;
	if (!item) notFound();
	const movements = await listMovements(sql, { ingredientId: id, limit: 40 });
	const { ingredient, lots } = item;
	const kinds = MOVEMENT_KINDS.filter((kind) => workspace.isOwner || !OWNER_ONLY.includes(kind));

	return (
		<>
			<PageHeader
				title={ingredient.name}
				crumbs={[
					{ label: "E-Liquid Lab", href: LAB },
					{ label: "Ingredients", href: `${LAB}/ingredients` },
					{ label: ingredient.name },
				]}
				lead={`${categoryLabel(ingredient.category)}${ingredient.supplier ? `, from ${ingredient.supplier}` : ""}.`}
				actions={
					<Pill tone={item.flags.length ? "warn" : "good"}>
						{item.flags.length ? `${item.flags.length} to look at` : "Nothing flagged"}
					</Pill>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{item.flags.length > 0 && (
						<Notice tone="warn" title="Needs attention">
							<Bullets items={item.flags} />
						</Notice>
					)}

					<Card title="Lots">
						{lots.length === 0 ? (
							<Empty>
								No lot has been recorded. Record one below, then record a receipt to put stock in it.
							</Empty>
						) : (
							<DataTable
								caption="Each lot is counted in one unit. The other unit appears only where the lot has a documented density."
								columns={["Lot", "On hand", "Reserved", "Usable", "Other unit", "Expires", "Where", "Status"]}
								rows={lots.map((lot) => [
									lot.lotCode,
									`${lot.onHand} ${lot.unit}`,
									`${lot.reserved} ${lot.unit}`,
									`${lot.usable} ${lot.unit}`,
									lot.other
										? `${lot.other.onHand} ${lot.other.unit} at ${lot.densityGPerMl} g/mL`
										: lot.unit === "each"
											? "—"
											: "Unavailable: no density",
									lot.expiresOn ? formatDay(lot.expiresOn) : "No date",
									lot.location ?? "—",
									<Pill key="s" tone={lot.status === "quarantined" || lot.expired ? "warn" : "good"}>
										{lot.status === "quarantined" ? "In quarantine" : lot.expired ? "Expired" : "Available"}
									</Pill>,
								])}
							/>
						)}
					</Card>

					{lots.length > 0 && (
						<Card title="Record a movement" accent>
							<p className="wai-help" style={{ marginTop: 0 }}>
								Stock is reserved for a batch before it is used, and use takes from what was reserved. A
								movement is never edited afterwards: a mistake is put right with a correction, which only the
								owner can record. Sending this form twice moves stock once.
							</p>
							<FieldsForm
								action={inventoryAction}
								hidden={{ intent: "move", idempotencyKey: randomUUID() }}
								idPrefix="move"
								submit="Record it"
								fields={[
									{
										name: "lotId",
										label: "Lot",
										kind: "select",
										required: true,
										options: lots.map((lot) => ({
											value: lot.id,
											label: `${lot.lotCode}: ${lot.usable} ${lot.unit} usable, ${lot.reserved} reserved`,
										})),
									},
									{
										name: "kind",
										label: "What happened",
										kind: "select",
										required: true,
										options: kinds.map((kind) => ({ value: kind, label: MOVEMENT_LABELS[kind] })),
									},
									{
										name: "quantity",
										label: "Quantity, in the lot’s unit",
										kind: "decimal",
										help: "Leave blank for a move or a quarantine. For a correction, the change to what is on hand, such as -2.5.",
									},
									{
										name: "reference",
										label: "What it was for",
										kind: "text",
										maxLength: 120,
										placeholder: "Batch code, purchase order, count sheet",
									},
									{
										name: "reason",
										label: "Reason",
										kind: "text",
										maxLength: 500,
										help: "Needed for waste, a correction, and putting a lot in or out of quarantine.",
									},
									{
										name: "toLocation",
										label: "Moved to",
										kind: "text",
										maxLength: 120,
										help: "For a move only.",
									},
									{
										name: "otherQuantity",
										label: "Second measurement, in the other unit",
										kind: "decimal",
										help: "For a receipt of a liquid, when it was both measured and weighed. It is kept beside the first and never becomes a second balance.",
									},
									{
										name: "basis",
										label: "How the quantity is known",
										kind: "select",
										options: [
											{ value: "measured", label: "Measured directly" },
											{ value: "calculated", label: "Calculated from a documented density" },
											{ value: "estimate", label: "An approved estimate" },
										],
									},
								]}
							/>
						</Card>
					)}

					<Card title="Movements" aside={<Link href={`${LAB}/movements`}>All movements</Link>}>
						{movements.length === 0 ? (
							<Empty>Nothing has moved yet.</Empty>
						) : (
							<DataTable
								caption="Newest first. Nothing here is ever changed or removed."
								columns={["When", "Lot", "What", "Quantity", "On hand after", "Reserved after", "For / why"]}
								rows={movements.map((m) => [
									<When key="w" at={m.at} now={now} />,
									m.lotCode,
									MOVEMENT_LABELS[m.kind],
									m.kind === "transfer"
										? `${m.fromLocation ?? "—"} → ${m.toLocation}`
										: m.quantity === "0"
											? "—"
											: `${m.kind === "correction" ? m.deltaOnHand : m.quantity} ${m.unit}`,
									`${m.onHandAfter} ${m.unit}`,
									`${m.reservedAfter} ${m.unit}`,
									<span key="r">
										{[m.reference, m.reason].filter(Boolean).join(" · ") || "—"}
										{m.discrepancy && (
											<>
												<br />
												<Pill tone="warn">Check</Pill> {m.discrepancy}
											</>
										)}
									</span>,
								])}
							/>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="As documented">
						<KeyValues
							items={[
								["Kind", categoryLabel(ingredient.category)],
								["Supplier", ingredient.supplier ?? "Not recorded"],
								["SKU", ingredient.sku ?? "Not recorded"],
								...(ingredient.category === "nicotine_base"
									? ([
											[
												"Nicotine",
												`${ingredient.nicotineMgPerMl} mg/mL${ingredient.nicotineType ? `, ${ingredient.nicotineType}` : ""}`,
											],
										] as Array<[string, string]>)
									: []),
								[
									"Carrier",
									ingredient.pgPercent || ingredient.vgPercent
										? `${ingredient.pgPercent ?? "0"}% PG, ${ingredient.vgPercent ?? "0"}% VG${ingredient.carrierSource ? ` (${ingredient.carrierSource})` : ""}`
										: "Not documented",
								],
								[
									"Minimum usable stock",
									ingredient.minStock ? `${ingredient.minStock} ${ingredient.minStockUnit}` : "Not set",
								],
								...item.totals.map(
									(total) =>
										[`Usable, ${total.unit}`, `${total.usable} of ${total.onHand} on hand`] as [
											string,
											string,
										],
								),
							]}
						/>
						{ingredient.notes && <p className="wai-help">{ingredient.notes}</p>}
					</Card>

					<Card title="Record a lot">
						<p className="wai-help" style={{ marginTop: 0 }}>
							A lot is counted in one unit from the start. A density is recorded only from a document, with
							where it came from.
						</p>
						<FieldsForm
							action={inventoryAction}
							hidden={{ intent: "lot", ingredientId: ingredient.id }}
							idPrefix="lot"
							submit="Record the lot"
							fields={[
								{
									name: "lotCode",
									label: "Supplier’s lot number",
									kind: "text",
									required: true,
									maxLength: 80,
								},
								{
									name: "unit",
									label: "Counted in",
									kind: "select",
									required: true,
									options: UNITS.map((unit) => ({ value: unit, label: unit })),
								},
								{ name: "receivedOn", label: "Received", kind: "date" },
								{ name: "expiresOn", label: "Expires", kind: "date" },
								{ name: "location", label: "Where it is kept", kind: "text", maxLength: 120 },
								{ name: "densityGPerMl", label: "Density, g/mL", kind: "decimal" },
								{ name: "densityTempC", label: "At temperature, °C", kind: "decimal" },
								{
									name: "densitySource",
									label: "Where the density comes from",
									kind: "text",
									placeholder: "Certificate of analysis 2291",
								},
								{ name: "costPerUnit", label: "Cost per unit", kind: "decimal" },
								{ name: "currency", label: "Currency", kind: "text", maxLength: 3, placeholder: "CAD" },
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
