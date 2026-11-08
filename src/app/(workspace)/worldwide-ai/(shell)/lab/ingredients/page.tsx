import type { Metadata } from "next";
import Link from "next/link";
import {
	CATEGORIES,
	UNITS,
	categoryLabel,
	listInventory,
	type IngredientSummary,
} from "@/lib/worldwide-ai/lab/inventory";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { inventoryAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Ingredients" };

type Props = { searchParams: Promise<{ q?: string; category?: string }> };

const LAB = `${WORKSPACE_PATH}/lab`;

/** One line per unit an ingredient's lots are counted in. Lots in different units are never added together. */
function balances(item: IngredientSummary, pick: "onHand" | "usable" | "reserved" | "quarantined") {
	if (item.totals.length === 0) return <span className="wai-muted">—</span>;
	return (
		<>
			{item.totals.map((total) => (
				<div key={total.unit}>
					{total[pick]} {total.unit}
				</div>
			))}
		</>
	);
}

/** Ingredients: what is on hand, what of it is usable, and what needs attention, with a form to record a new one. */
export default async function IngredientsPage({ searchParams }: Props) {
	const workspace = await getWorkspace();
	const { q, category } = await searchParams;
	const today = opsDayKey(workspace.runtime.now());
	const items = await listInventory(workspace.runtime.sql, today, { search: q, category });

	return (
		<>
			<PageHeader
				title="Ingredients"
				crumbs={[{ label: "E-Liquid Lab", href: LAB }, { label: "Ingredients" }]}
				lead="Every ingredient and the lots it arrived in. Usable is what is on hand less what is reserved, and nothing at all for a lot that is in quarantine or past its expiry date."
				actions={
					<Link href={`${LAB}/movements`} className="wai-btn">
						Stock movements
					</Link>
				}
			/>
			<div className="wai-stack">
				<Card title="Find">
					<form
						method="get"
						className="wai-row"
						style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}
					>
						<div className="wai-field" style={{ flex: "1 1 240px" }}>
							<label htmlFor="inventory-q">Name, supplier, SKU, lot number or place</label>
							<input
								id="inventory-q"
								name="q"
								className="wai-input"
								defaultValue={q ?? ""}
								autoComplete="off"
							/>
						</div>
						<div className="wai-field">
							<label htmlFor="inventory-category">Kind</label>
							<select
								id="inventory-category"
								name="category"
								className="wai-select"
								defaultValue={category ?? ""}
							>
								<option value="">Every kind</option>
								{CATEGORIES.map((c) => (
									<option key={c.id} value={c.id}>
										{c.label}
									</option>
								))}
							</select>
						</div>
						<button type="submit" className="wai-btn">
							Find
						</button>
					</form>
				</Card>

				<Card title="On hand" aside={<Pill>{items.length}</Pill>}>
					{items.length === 0 ? (
						<Empty>
							{q || category
								? "Nothing matches."
								: "No ingredient has been recorded yet. Record the first one below."}
						</Empty>
					) : (
						<DataTable
							caption="Quantities are in the unit each lot is counted in. A weight is shown for a volume only when the lot has a documented density."
							columns={[
								"Ingredient",
								"Kind",
								"Supplier",
								"On hand",
								"Usable",
								"Reserved",
								"In quarantine",
								"Needs attention",
							]}
							rows={items.map((item) => [
								<Link key="n" href={`${LAB}/ingredients/${item.ingredient.id}`}>
									{item.ingredient.name}
								</Link>,
								categoryLabel(item.ingredient.category),
								item.ingredient.supplier ?? "—",
								balances(item, "onHand"),
								balances(item, "usable"),
								balances(item, "reserved"),
								balances(item, "quarantined"),
								item.flags.length ? (
									<Pill tone="warn">{item.flags.length}</Pill>
								) : (
									<span className="wai-muted">—</span>
								),
							])}
						/>
					)}
				</Card>

				<Card title="Record an ingredient">
					<p className="wai-help" style={{ marginTop: 0 }}>
						Enter what the supplier’s documents say. Leave the carrier blank if it isn’t documented: it is
						never assumed to be all PG.
					</p>
					<FieldsForm
						action={inventoryAction}
						hidden={{ intent: "ingredient" }}
						idPrefix="ingredient"
						submit="Record the ingredient"
						fields={[
							{ name: "name", label: "Name", kind: "text", required: true, maxLength: 160 },
							{
								name: "category",
								label: "Kind",
								kind: "select",
								required: true,
								options: CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
							},
							{ name: "supplier", label: "Supplier", kind: "text", maxLength: 160 },
							{ name: "sku", label: "SKU", kind: "text", maxLength: 80 },
							{
								name: "nicotineMgPerMl",
								label: "Nicotine strength, mg/mL",
								kind: "decimal",
								help: "For a nicotine base only, from the supplier’s documents.",
							},
							{ name: "nicotineType", label: "Nicotine type", kind: "text", placeholder: "Freebase, salt" },
							{ name: "pgPercent", label: "Carrier: PG percent", kind: "decimal" },
							{ name: "vgPercent", label: "Carrier: VG percent", kind: "decimal" },
							{
								name: "carrierSource",
								label: "Where the carrier figures come from",
								kind: "text",
								placeholder: "Specification sheet, revision 4",
							},
							{ name: "minStock", label: "Minimum usable stock", kind: "decimal" },
							{
								name: "minStockUnit",
								label: "Unit of the minimum",
								kind: "select",
								options: UNITS.map((unit) => ({ value: unit, label: unit })),
							},
							{ name: "notes", label: "Notes", kind: "textarea", rows: 2 },
						]}
					/>
				</Card>
			</div>
		</>
	);
}
