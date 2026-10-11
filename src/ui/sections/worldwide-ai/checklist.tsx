import Link from "next/link";
import { assigneeLabel, type ActionItem } from "@/lib/worldwide-ai/today/checklist";
import { formatDay } from "@/lib/worldwide-ai/time";
import type { OperatorActor } from "@/lib/worldwide-ai/types";
import { ButtonForm, FieldsForm, type FormAction, type FormField } from "./forms";
import { Pill, type Tone } from "./ui";

/** The checklist as a list. On Today each item has a "done" button; on its own page each also has the other controls. */

const PRIORITY_TONE: Record<ActionItem["priority"], Tone> = { urgent: "bad", high: "warn", normal: "plain" };
const PRIORITY_LABEL: Record<ActionItem["priority"], string> = {
	urgent: "Urgent",
	high: "High",
	normal: "Normal",
};

export const PRIORITY_OPTIONS = [
	{ value: "normal", label: "Normal" },
	{ value: "high", label: "High" },
	{ value: "urgent", label: "Urgent" },
] as const;

export const ASSIGNEE_OPTIONS = [
	{ value: "anyone", label: "Anyone" },
	{ value: "me", label: "Me" },
	{ value: "owner", label: "The owner" },
	{ value: "staff", label: "Staff" },
] as const;

/** The fields for adding an action by hand. */
export const ADD_FIELDS: readonly FormField[] = [
	{ name: "title", label: "What has to be done", kind: "text", required: true, maxLength: 200 },
	{ name: "detail", label: "Anything that helps", kind: "textarea", rows: 2 },
	{ name: "priority", label: "How pressing", kind: "select", options: PRIORITY_OPTIONS },
	{
		name: "dueOn",
		label: "By when",
		kind: "date",
		help: "A date you choose is shown as suggested, not as a recorded deadline.",
	},
	{ name: "assignedTo", label: "For", kind: "select", options: ASSIGNEE_OPTIONS },
];

const assigneeValue = (item: ActionItem, actor: OperatorActor) =>
	item.assignedTo === null
		? "anyone"
		: item.assignedTo === "owner" || item.assignedTo === "staff"
			? item.assignedTo
			: item.assignedTo === `operator:${actor.id}`
				? "me"
				: "anyone";

export function ChecklistItems({
	items,
	actor,
	action,
	today,
	full = false,
}: {
	items: readonly ActionItem[];
	actor: OperatorActor;
	action: FormAction;
	today: string;
	/** Show the controls for putting off, changing and dismissing as well as closing. */
	full?: boolean;
}) {
	return (
		<ul className="wai-list" style={{ listStyle: "none", padding: 0 }}>
			{items.map((item) => {
				const snoozed = item.snoozedUntil !== null && item.snoozedUntil > today;
				const overdue = item.dueOn !== null && item.dueOn < today;
				return (
					<li key={item.id} style={{ display: "block" }}>
						<div className="wai-row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
							<Pill tone={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Pill>
							<strong>{item.title}</strong>
							{overdue && <Pill tone="bad">Overdue</Pill>}
							{snoozed && <Pill tone="info">Put off until {formatDay(item.snoozedUntil)}</Pill>}
						</div>
						{item.detail && (
							<p className="wai-small" style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
								{item.detail}
							</p>
						)}
						<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
							For: {assigneeLabel(item, actor)}
							{item.dueOn
								? ` · By ${formatDay(item.dueOn)} (${item.dueConfirmed ? "confirmed: a recorded date" : "suggested"})`
								: ""}
							{item.source === "report" ? " · From a daily report" : ""}
							{snoozed && item.snoozeReason ? ` · Put off because: ${item.snoozeReason}` : ""}
							{item.links.map((link) => (
								<span key={link.href}>
									{" · "}
									<Link href={link.href}>{link.label}</Link>
								</span>
							))}
						</p>
						<ButtonForm
							action={action}
							hidden={{ intent: "done", id: item.id }}
							label="Done"
							small
							note={{ label: "What was done", required: true }}
							idPrefix={`done-${item.id}`}
						/>
						{full && (
							<details style={{ marginTop: 8 }}>
								<summary className="wai-small">Put off, change or dismiss</summary>
								<div className="wai-grid wai-grid--2" style={{ marginTop: 8 }}>
									<FieldsForm
										action={action}
										hidden={{ intent: "snooze", id: item.id }}
										idPrefix={`snooze-${item.id}`}
										submit="Put it off"
										fields={[
											{ name: "until", label: "Bring it back on", kind: "date", required: true },
											{
												name: "reason",
												label: "Why it is being put off",
												kind: "text",
												required: true,
												maxLength: 500,
											},
										]}
									/>
									<FieldsForm
										action={action}
										hidden={{ intent: "update", id: item.id }}
										idPrefix={`update-${item.id}`}
										submit="Save"
										initial={{
											assignedTo: assigneeValue(item, actor),
											priority: item.priority,
											dueOn: item.dueOn ?? "",
										}}
										fields={[
											{ name: "assignedTo", label: "For", kind: "select", options: ASSIGNEE_OPTIONS },
											{ name: "priority", label: "How pressing", kind: "select", options: PRIORITY_OPTIONS },
											{ name: "dueOn", label: "By when", kind: "date" },
										]}
									/>
								</div>
								<div style={{ marginTop: 8 }}>
									<ButtonForm
										action={action}
										hidden={{ intent: "dismiss", id: item.id }}
										label="Dismiss"
										tone="quiet"
										small
										note={{ label: "Why it is being dismissed", required: true }}
										idPrefix={`dismiss-${item.id}`}
									/>
								</div>
							</details>
						)}
					</li>
				);
			})}
		</ul>
	);
}
