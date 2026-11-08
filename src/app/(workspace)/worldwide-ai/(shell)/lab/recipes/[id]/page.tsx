import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipe, planFor, type Formula } from "@/lib/worldwide-ai/lab/batches";
import { listInventory } from "@/lib/worldwide-ai/lab/inventory";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { batchAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm, type FormField } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Recipe" };

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAB = `${WORKSPACE_PATH}/lab`;
const FLAVOUR_ROWS = 6;

/** The formula in a sentence, and what it works out to at its own batch size. */
function formulaSummary(formula: Formula): string {
	const flavours = formula.flavours.map((f) => `${f.name} ${f.percent}%`).join(", ") || "no flavour";
	return `${formula.batchMl} mL at ${formula.targetNicotineMgPerMl} mg/mL, ${formula.targetPgPercent}% PG of the PG and VG. ${
		formula.base ? `${formula.base.name} (${formula.base.strengthMgPerMl} mg/mL)` : "No nicotine base"
	}; ${flavours}.`;
}

/** One recipe: its versions, the form to write another, and the form to plan a batch from an approved one. */
export default async function RecipePage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const found = UUID.test(id) ? await getRecipe(sql, id) : null;
	if (!found) notFound();
	const { recipe, versions } = found;
	const inventory = await listInventory(sql, opsDayKey(now));
	const of = (category: string) =>
		inventory
			.filter((item) => item.ingredient.category === category)
			.map((item) => ({ value: item.ingredient.id, label: item.ingredient.name }));
	const flavours = of("flavour");
	const approved = versions.filter((version) => version.state === "approved" && version.intact);

	const versionFields: FormField[] = [
		{ name: "batchMl", label: "Batch size, mL", kind: "decimal", required: true },
		{
			name: "targetNicotineMgPerMl",
			label: "Target nicotine, mg/mL",
			kind: "decimal",
			required: true,
			help: "0 for a nicotine-free recipe.",
		},
		{
			name: "targetPgPercent",
			label: "Target PG, percent of the PG and VG together",
			kind: "decimal",
			required: true,
			help: "Counted across the whole batch, including what the nicotine base and the flavours bring with them.",
		},
		{
			name: "baseIngredientId",
			label: "Nicotine base",
			kind: "select",
			options: of("nicotine_base"),
			help: "Not needed at 0 mg/mL.",
		},
		{ name: "pgIngredientId", label: "PG", kind: "select", required: true, options: of("pg") },
		{ name: "vgIngredientId", label: "VG", kind: "select", required: true, options: of("vg") },
		...Array.from({ length: FLAVOUR_ROWS }, (_, index): FormField[] => [
			{ name: `flavour${index + 1}`, label: `Flavour ${index + 1}`, kind: "select", options: flavours },
			{ name: `percent${index + 1}`, label: `Flavour ${index + 1}, percent of the batch`, kind: "decimal" },
		]).flat(),
	];

	return (
		<>
			<PageHeader
				title={recipe.name}
				crumbs={[
					{ label: "E-Liquid Lab", href: LAB },
					{ label: "Recipes", href: `${LAB}/recipes` },
					{ label: recipe.name },
				]}
				lead={recipe.product ? `Makes ${recipe.product}.` : undefined}
				actions={
					<Link href={`${LAB}/batches`} className="wai-btn">
						Batches
					</Link>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Versions" aside={<Pill>{versions.length}</Pill>}>
						{versions.length === 0 ? (
							<Empty>No version has been written. Write the first one on the right.</Empty>
						) : (
							<ul className="wai-list">
								{versions.map((version) => {
									let lines: Array<[string, string]> = [];
									let problem: string | null = null;
									try {
										lines = planFor(version.formula, version.formula.batchMl).lines.map((line) => [
											line.name,
											`${line.requiredMl} mL`,
										]);
									} catch (error) {
										problem = error instanceof Error ? error.message : "The formula can't be calculated.";
									}
									return (
										<li key={version.id} style={{ display: "block" }}>
											<div className="wai-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
												<strong>Version {version.version}</strong>
												<Pill
													tone={
														version.state === "approved"
															? "good"
															: version.state === "draft"
																? "pink"
																: "plain"
													}
												>
													{version.state === "approved"
														? "Approved"
														: version.state === "draft"
															? "Draft, waiting for the owner"
															: "Retired"}
												</Pill>
												{!version.intact && <Pill tone="bad">Altered since it was written</Pill>}
											</div>
											<p style={{ margin: "6px 0" }}>{formulaSummary(version.formula)}</p>
											{problem ? (
												<Notice tone="bad">{problem}</Notice>
											) : (
												<DataTable
													caption={`What version ${version.version} calls for at ${version.formula.batchMl} mL.`}
													columns={["Ingredient", "Quantity"]}
													numeric={[1]}
													rows={lines}
												/>
											)}
											<p className="wai-muted wai-small" style={{ margin: "6px 0 0" }}>
												Written <When at={version.createdAt} now={now} />
												{version.approvedAt && (
													<>
														. Approved <When at={version.approvedAt} now={now} />
													</>
												)}
												. Calculation version {version.calcVersion}.
											</p>
											{version.state === "draft" && workspace.isOwner && version.intact && (
												<div style={{ marginTop: 8 }}>
													<ButtonForm
														action={batchAction}
														hidden={{ intent: "approve", versionId: version.id }}
														label={`Approve version ${version.version}`}
														tone="primary"
														small
														idPrefix={`approve-${version.id}`}
													/>
												</div>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</Card>

					<Card title="Plan a batch" accent>
						{approved.length === 0 ? (
							<Empty>A batch can be planned once the owner has approved a version of this recipe.</Empty>
						) : (
							<FieldsForm
								action={batchAction}
								hidden={{ intent: "plan" }}
								idPrefix="plan"
								submit="Plan the batch"
								fields={[
									{
										name: "recipeVersionId",
										label: "Version",
										kind: "select",
										required: true,
										options: approved.map((version) => ({
											value: version.id,
											label: `Version ${version.version}`,
										})),
									},
									{
										name: "batchMl",
										label: "Batch size, mL",
										kind: "decimal",
										required: true,
										help: "Planning calculates what the batch needs. Nothing is reserved until you reserve it.",
									},
								]}
							/>
						)}
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="Write a new version">
						<p className="wai-help" style={{ marginTop: 0 }}>
							The strength and carrier of each ingredient are taken from its record as it stands now and kept
							with the version. An ingredient with no documented carrier can’t be used.
						</p>
						<FieldsForm
							action={batchAction}
							hidden={{ intent: "version", recipeId: recipe.id }}
							idPrefix="version"
							submit="Write the version"
							fields={versionFields}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
