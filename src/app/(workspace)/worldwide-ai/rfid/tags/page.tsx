import type { Metadata } from "next";
import Link from "next/link";
import {
	SECURITY,
	SUBJECT_KINDS,
	TECHNOLOGIES,
	listTags,
	tagCounts,
	type Tag,
} from "@/lib/worldwide-ai/rfid/registry";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { rfidAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill, Stat, type Tone } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Tags" };

type Props = { searchParams: Promise<{ q?: string; show?: string }> };

const RFID = `${WORKSPACE_PATH}/rfid`;
const STATUS: Record<Tag["status"], { label: string; tone: Tone }> = {
	active: { label: "In use", tone: "good" },
	retired: { label: "Retired", tone: "plain" },
	revoked: { label: "Revoked", tone: "bad" },
};

/** The tag registry: every tag the business has registered, and what each is attached to now. */
export default async function TagsPage({ searchParams }: Props) {
	const workspace = await getWorkspace();
	const { q, show } = await searchParams;
	const { sql } = workspace.runtime;
	const unassigned = show === "unassigned";
	const [rows, counts] = await Promise.all([
		listTags(sql, { q: typeof q === "string" ? q : undefined, unassigned }),
		tagCounts(sql),
	]);

	return (
		<>
			<PageHeader
				title="Tags"
				crumbs={[{ label: "RFID & NFC", href: RFID }, { label: "Tags" }]}
				lead="Every tag registered, under the identifier it reports, and what each is attached to now. UHF RFID and NFC are different kinds of tag and are kept apart. A readable identifier is not proof of authenticity, of who someone is, of age, or that a product is safe."
				actions={
					<Link href={`${RFID}/scans`} className="wai-btn">
						Scans and exceptions
					</Link>
				}
			/>
			<div className="wai-grid wai-grid--3" style={{ marginBottom: 16 }}>
				<Stat value={counts.total} label="Tags registered" href={`${RFID}/tags`} />
				<Stat
					value={counts.unassigned}
					label="In use, attached to nothing"
					href={`${RFID}/tags?show=unassigned`}
				/>
				<Stat value={counts.openExceptions} label="Open exceptions" href={`${RFID}/scans`} />
			</div>
			<div className="wai-split">
				<div className="wai-stack">
					<Card
						title={unassigned ? "In use, attached to nothing" : q ? `Matching “${q}”` : "Registered tags"}
						aside={<Pill>{rows.length}</Pill>}
					>
						<form method="get" className="wai-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
							<label htmlFor="tag-q" className="wai-small">
								Find a tag
							</label>
							<input
								id="tag-q"
								name="q"
								className="wai-input"
								defaultValue={typeof q === "string" ? q : ""}
								placeholder="Identifier, SKU, lot, serial or what it is on"
								style={{ flex: "1 1 220px" }}
							/>
							<button type="submit" className="wai-btn">
								Find
							</button>
							{(q || unassigned) && (
								<Link href={`${RFID}/tags`} className="wai-btn wai-btn--quiet">
									Show all
								</Link>
							)}
						</form>
						{rows.length === 0 ? (
							<Empty>{q || unassigned ? "No tag matches." : "No tag has been registered yet."}</Empty>
						) : (
							<DataTable
								caption="Newest first, up to 300. Open a tag to attach it, take it off, or see where it has been read."
								columns={["Identifier", "Kind", "Attached to", "SKU and lot", "Status"]}
								rows={rows.map(({ tag, assignment }) => [
									<Link key="u" href={`${RFID}/tags/${tag.id}`} className="wai-mono">
										{tag.uid}
									</Link>,
									TECHNOLOGIES[tag.technology],
									assignment
										? `${SUBJECT_KINDS[assignment.subjectKind]}: ${assignment.subjectRef}`
										: tag.status === "active"
											? "Nothing yet"
											: "—",
									assignment ? [assignment.sku, assignment.lot].filter(Boolean).join(" · ") || "—" : "—",
									<span key="s">
										<Pill tone={STATUS[tag.status].tone}>{STATUS[tag.status].label}</Pill>
										{tag.verifiedAt === null && tag.status === "active" && (
											<>
												{" "}
												<Pill tone="pink">Not confirmed</Pill>
											</>
										)}
									</span>,
								])}
							/>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Register tags">
						<FieldsForm
							action={rfidAction}
							hidden={{ intent: "tag.register" }}
							idPrefix="register"
							submit="Register"
							fields={[
								{
									name: "technology",
									label: "Kind of tag",
									kind: "select",
									required: true,
									options: Object.entries(TECHNOLOGIES).map(([value, label]) => ({ value, label })),
								},
								{
									name: "security",
									label: "What the tag itself can do",
									kind: "select",
									required: true,
									options: Object.entries(SECURITY).map(([value, label]) => ({ value, label })),
									help: "From the tag's datasheet. Recording that a tag supports cryptographic verification doesn't mean anything here checks it: nothing does.",
								},
								{
									name: "uids",
									label: "Identifiers",
									kind: "textarea",
									required: true,
									rows: 5,
									placeholder: "E28011700000020100000001",
									help: "One to a line, up to 500, as the reader or the label gives them. All are registered or none is.",
								},
								{
									name: "sourceRef",
									label: "Where they came from",
									kind: "text",
									maxLength: 200,
									placeholder: "Roll R-12, order 4471",
								},
								{ name: "note", label: "Note", kind: "text", maxLength: 500 },
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
