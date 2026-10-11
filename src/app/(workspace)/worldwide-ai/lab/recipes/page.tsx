import type { Metadata } from "next";
import Link from "next/link";
import { listRecipes } from "@/lib/worldwide-ai/lab/batches";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { batchAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Recipes" };

const LAB = `${WORKSPACE_PATH}/lab`;

/** Recipes: each one's versions and which is approved, with a form to start a new recipe. */
export default async function RecipesPage() {
	const workspace = await getWorkspace();
	const recipes = await listRecipes(workspace.runtime.sql);

	return (
		<>
			<PageHeader
				title="Recipes"
				crumbs={[{ label: "E-Liquid Lab", href: LAB }, { label: "Recipes" }]}
				lead="A recipe is kept in versions. A version is the formula exactly as it was written and is never changed; a change is a new version. Only a version the owner approved can be made into a batch."
				actions={
					<Link href={`${LAB}/batches`} className="wai-btn">
						Batches
					</Link>
				}
			/>
			<div className="wai-stack">
				<Card title="Recipes" aside={<Pill>{recipes.length}</Pill>}>
					{recipes.length === 0 ? (
						<Empty>No recipe has been written yet. Start one below.</Empty>
					) : (
						<DataTable
							caption="Open a recipe to see its versions, write a new one, or plan a batch."
							columns={["Recipe", "Makes", "Versions", "Approved version"]}
							numeric={[2]}
							rows={recipes.map((recipe) => [
								<Link key="n" href={`${LAB}/recipes/${recipe.id}`}>
									{recipe.name}
								</Link>,
								recipe.product ?? "—",
								recipe.versions,
								recipe.approved === null ? (
									<Pill tone="plain">None yet</Pill>
								) : (
									<Pill tone="good">Version {recipe.approved}</Pill>
								),
							])}
						/>
					)}
				</Card>
				<Card title="Start a recipe">
					<FieldsForm
						action={batchAction}
						hidden={{ intent: "recipe" }}
						idPrefix="recipe"
						submit="Start the recipe"
						fields={[
							{ name: "name", label: "Name", kind: "text", required: true, maxLength: 160 },
							{
								name: "product",
								label: "What it makes",
								kind: "text",
								maxLength: 160,
								placeholder: "Mango Ice 12 mg",
							},
						]}
					/>
				</Card>
			</div>
		</>
	);
}
