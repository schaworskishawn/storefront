import type { Metadata } from "next";
import { assigneeLabel, isFor, listClosedActions, listOpenActions } from "@/lib/worldwide-ai/today/checklist";
import { opsDayKey } from "@/lib/worldwide-ai/time";
import { checklistAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ADD_FIELDS, ChecklistItems } from "@/ui/sections/worldwide-ai/checklist";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Checklist" };

/** The whole checklist: what is yours, what is someone else's, what has been put off, and what was closed lately. */
export default async function ActionsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const today = opsDayKey(now);
	const [open, closed] = await Promise.all([listOpenActions(sql), listClosedActions(sql, 30)]);
	const mine = open.filter((item) => isFor(item, workspace.actor));
	const others = open.filter((item) => !isFor(item, workspace.actor));

	return (
		<>
			<PageHeader
				title="Checklist"
				crumbs={[{ label: "Checklist" }]}
				lead="Things a person has to do: added by hand, or put here from a line of a daily report. An item can be given to someone, put off with a reason, and closed with a note of what was done."
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Notice tone="info" title="Closing an item closes the item, and nothing else.">
						It doesn’t complete a task, accept a result or approve a document. Those have their own screens
						and their own checks, and if the thing an item was about is still waiting, the next daily report
						says so again.
					</Notice>
					<Card title="Yours" aside={<Pill>{mine.length}</Pill>}>
						{mine.length === 0 ? (
							<Empty>Nothing is on your checklist.</Empty>
						) : (
							<ChecklistItems
								items={mine}
								actor={workspace.actor}
								action={checklistAction}
								today={today}
								full
							/>
						)}
					</Card>
					{others.length > 0 && (
						<Card title="For someone else" aside={<Pill>{others.length}</Pill>}>
							<ChecklistItems
								items={others}
								actor={workspace.actor}
								action={checklistAction}
								today={today}
								full
							/>
						</Card>
					)}
					<Card title="Closed lately">
						{closed.length === 0 ? (
							<Empty>Nothing has been closed yet.</Empty>
						) : (
							<DataTable
								caption="The newest 30. The note is what the person who closed it wrote."
								columns={["Action", "Outcome", "Note", "For", "Closed"]}
								rows={closed.map((item) => [
									item.title,
									<Pill key="s" tone={item.status === "done" ? "good" : "plain"}>
										{item.status === "done" ? "Done" : "Dismissed"}
									</Pill>,
									item.closingNote ?? "—",
									assigneeLabel(item, workspace.actor),
									<When key="w" at={item.closedAt} now={now} />,
								])}
							/>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Add an action">
						<FieldsForm
							action={checklistAction}
							hidden={{ intent: "add" }}
							idPrefix="add-action"
							submit="Add it"
							fields={ADD_FIELDS}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
