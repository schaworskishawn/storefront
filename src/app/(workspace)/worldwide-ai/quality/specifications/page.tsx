import type { Metadata } from "next";
import Link from "next/link";
import { listRecipes } from "@/lib/worldwide-ai/lab/batches";
import { limitsText, listSpecifications, type Specification } from "@/lib/worldwide-ai/lab/quality";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { qualityAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Empty,
	Notice,
	PageHeader,
	Pill,
	When,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Specifications" };

const QUALITY = `${WORKSPACE_PATH}/quality`;
const STATE: Record<Specification["state"], { label: string; tone: Tone }> = {
	draft: { label: "Draft", tone: "pink" },
	approved: { label: "In force", tone: "good" },
	superseded: { label: "Superseded", tone: "plain" },
};

/** Specifications: what each recipe's liquid is tested against, in versions the owner approves. */
export default async function SpecificationsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [specifications, recipes] = await Promise.all([listSpecifications(sql), listRecipes(sql)]);
	const active = recipes.filter((recipe) => recipe.status === "active");

	return (
		<>
			<PageHeader
				title="Specifications"
				crumbs={[{ label: "Quality", href: QUALITY }, { label: "Specifications" }]}
				lead="What each recipe's liquid is tested against: what is measured, in which unit, between which limits and by which method. A specification is kept in versions and guides nothing until the owner approves it. The limits are yours to set from your own requirements; the workspace never suggests one."
				actions={
					<Link href={`${QUALITY}/results`} className="wai-btn">
						Results
					</Link>
				}
			/>
			<div className="wai-split">
				<div className="wai-stack">
					{specifications.length === 0 ? (
						<Card title="Specifications">
							<Empty>No specification has been written yet.</Empty>
						</Card>
					) : (
						specifications.map((specification) => (
							<Card
								key={specification.id}
								title={`${specification.recipeName}, version ${specification.version}`}
								aside={<Pill tone={STATE[specification.state].tone}>{STATE[specification.state].label}</Pill>}
								accent={specification.state === "draft"}
							>
								{!specification.intact && (
									<Notice tone="bad" title="The stored criteria no longer match their checksum.">
										This version can’t be approved or relied on.
									</Notice>
								)}
								<DataTable
									caption={
										specification.state === "approved"
											? "Verified results for this recipe's batches are compared with these limits."
											: specification.state === "draft"
												? "A draft. Nothing is compared with it until the owner approves it."
												: "No longer in force. Kept so an earlier release can be traced to what it was checked against."
									}
									columns={["Tested", "Limit", "Method", "Required"]}
									rows={specification.criteria.map((criterion) => [
										criterion.analyte,
										limitsText(criterion),
										criterion.method ?? "Any",
										criterion.required ? "Yes" : "Optional",
									])}
								/>
								{specification.note && <p className="wai-help">{specification.note}</p>}
								<p className="wai-muted wai-small" style={{ marginBottom: 0 }}>
									Written <When at={specification.createdAt} now={now} />
									{specification.approvedAt && (
										<>
											, approved <When at={specification.approvedAt} now={now} />
										</>
									)}
									.
								</p>
								{specification.state === "draft" &&
									(workspace.isOwner ? (
										<div style={{ marginTop: 8 }}>
											<ButtonForm
												action={qualityAction}
												hidden={{ intent: "spec.approve", specificationId: specification.id }}
												label="Approve and put in force"
												tone="primary"
												idPrefix={`approve-${specification.id}`}
											/>
										</div>
									) : (
										<p className="wai-muted wai-small">Only the owner can approve a specification.</p>
									))}
							</Card>
						))
					)}
				</div>
				<div className="wai-stack">
					<Card title="Write a new version">
						{active.length === 0 ? (
							<Empty>Create a recipe first. A specification belongs to a recipe.</Empty>
						) : (
							<FieldsForm
								action={qualityAction}
								hidden={{ intent: "spec.add" }}
								idPrefix="spec"
								submit="Save as a draft"
								fields={[
									{
										name: "recipeId",
										label: "Recipe",
										kind: "select",
										required: true,
										options: active.map((recipe) => ({ value: recipe.id, label: recipe.name })),
									},
									{
										name: "criteria",
										label: "What is tested",
										kind: "textarea",
										required: true,
										rows: 6,
										placeholder: "Nicotine | mg/mL | 11.4 | 12.6 | HPLC-UV",
										help: "One to a line: what | unit | lower limit | upper limit | method | optional. Leave a limit or the method blank when there is none; end a line with “optional” when the test isn’t required. Give at least one limit: none is ever assumed.",
									},
									{ name: "note", label: "Note", kind: "text", maxLength: 1000 },
								]}
							/>
						)}
						<p className="wai-help">
							A new version replaces the one in force only when the owner approves it. The earlier version is
							kept.
						</p>
					</Card>
				</div>
			</div>
		</>
	);
}
