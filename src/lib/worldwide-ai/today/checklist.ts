import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import { isIsoDay } from "../functions/table";
import { sha256Hex } from "../hash";
import { getReport, type Priority } from "../reports/daily";
import { actorKey, type OperatorActor } from "../types";
import { WorkflowError } from "../workflows/types";

/**
 * The Today checklist: things a person has to do. An item is added by hand or tracked from a line of a daily report. It can
 * be given to someone, given a priority and a date, snoozed with a reason, and closed with a note of what was done.
 *
 * Closing an item closes the item and nothing else. It never completes a task, accepts a result, approves a document or
 * changes any record: those have their own screens and their own checks. If the thing an item was about is still waiting,
 * the next daily report lists it again.
 */

export type ActionStatus = "open" | "done" | "dismissed";

export type ActionItem = {
	id: string;
	title: string;
	detail: string | null;
	source: "manual" | "report";
	reportId: string | null;
	priority: Priority;
	/** null for anyone, "owner", "staff", or one person's key. */
	assignedTo: string | null;
	dueOn: string | null;
	dueConfirmed: boolean;
	status: ActionStatus;
	snoozedUntil: string | null;
	snoozeReason: string | null;
	links: Array<{ label: string; href: string }>;
	closingNote: string | null;
	createdBy: string;
	createdAt: string;
	closedBy: string | null;
	closedAt: string | null;
};

const COLUMNS = `id, title, detail, source, report_id, priority, assigned_to, due_on::text as due_on, due_confirmed, status,
	snoozed_until::text as snoozed_until, snooze_reason, links, closing_note, created_by, created_at, closed_by, closed_at`;

const toItem = (r: Row): ActionItem => ({
	id: r.id as string,
	title: r.title as string,
	detail: (r.detail as string | null) ?? null,
	source: r.source as ActionItem["source"],
	reportId: (r.report_id as string | null) ?? null,
	priority: r.priority as Priority,
	assignedTo: (r.assigned_to as string | null) ?? null,
	dueOn: r.due_on ? String(r.due_on).slice(0, 10) : null,
	dueConfirmed: r.due_confirmed === true,
	status: r.status as ActionStatus,
	snoozedUntil: r.snoozed_until ? String(r.snoozed_until).slice(0, 10) : null,
	snoozeReason: (r.snooze_reason as string | null) ?? null,
	links: (r.links as ActionItem["links"]) ?? [],
	closingNote: (r.closing_note as string | null) ?? null,
	createdBy: r.created_by as string,
	createdAt: iso(r.created_at) as string,
	closedBy: (r.closed_by as string | null) ?? null,
	closedAt: iso(r.closed_at),
});

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/\r\n?/g, "\n")
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

const PRIORITIES: readonly Priority[] = ["urgent", "high", "normal"];
const priorityOf = (value: unknown): Priority => PRIORITIES.find((p) => p === value) ?? "normal";

function dayOf(label: string, value: unknown): string | null {
	const text = tidy(value, 20);
	if (!text) return null;
	if (!isIsoDay(text)) throw new WorkflowError("invalid", `${label} must be a date like 2026-10-31.`);
	return text;
}

/** Who an item can be given to: anyone, a role, or the person asking. Nobody can be handed work under another person's key. */
function assigneeOf(value: unknown, actor: OperatorActor): string | null {
	const text = tidy(value, 80);
	if (!text || text === "anyone") return null;
	if (text === "owner" || text === "staff") return text;
	if (text === "me") return actorKey(actor);
	throw new WorkflowError("invalid", "An action can be for anyone, the owner, staff, or you.");
}

/** Whether an item is this person's to do: unassigned, given to their role, or given to them. */
export const isFor = (item: Pick<ActionItem, "assignedTo">, actor: OperatorActor): boolean =>
	item.assignedTo === null || item.assignedTo === actor.role || item.assignedTo === actorKey(actor);

export const assigneeLabel = (item: Pick<ActionItem, "assignedTo">, actor?: OperatorActor): string =>
	item.assignedTo === null
		? "Anyone"
		: item.assignedTo === "owner"
			? "The owner"
			: item.assignedTo === "staff"
				? "Staff"
				: actor && item.assignedTo === actorKey(actor)
					? "You"
					: "One person";

export type NewAction = {
	title: string;
	detail?: string;
	priority?: string;
	dueOn?: string;
	assignedTo?: string;
};

export async function addAction(sql: Sql, actor: OperatorActor, input: NewAction): Promise<ActionItem> {
	const title = tidy(input.title, 200);
	if (title.length < 3) throw new WorkflowError("invalid", "Say what has to be done.");
	const { rows } = await sql.query(
		`insert into wai_action_items (title, detail, source, priority, assigned_to, due_on, due_confirmed, created_by)
		 values ($1,$2,'manual',$3,$4,$5::date,false,$6) returning ${COLUMNS}`,
		[
			title,
			tidy(input.detail, 2000) || null,
			priorityOf(input.priority),
			assigneeOf(input.assignedTo, actor),
			dayOf("The date", input.dueOn),
			actorKey(actor),
		],
	);
	await audit(sql, {
		actor,
		action: "checklist.add",
		subject: rows[0].id as string,
		outcome: "allowed",
		detail: { title },
	});
	return toItem(rows[0]);
}

/**
 * Puts one line of a saved report on the checklist. The same line tracked twice, from the same report or a later one, is one
 * item for as long as it is open.
 */
export async function trackReportAction(
	sql: Sql,
	actor: OperatorActor,
	input: { reportId: string; index: number },
): Promise<{ item: ActionItem; created: boolean }> {
	const saved = await getReport(sql, input.reportId);
	const action = saved?.report?.actions[input.index];
	if (!saved || !action) throw new WorkflowError("not_found", "That line of the report doesn't exist.");
	// What the item is about: its title and the records it points at. A later report describing the same thing has the same key.
	const key = sha256Hex(`${action.title}\n${action.links.map((link) => link.href).join("\n")}`).slice(0, 40);
	const existing = await sql.query(
		`select ${COLUMNS} from wai_action_items where source_key = $1 and status = 'open'`,
		[key],
	);
	if (existing.rows[0]) return { item: toItem(existing.rows[0]), created: false };
	const { rows } = await sql.query(
		`insert into wai_action_items (title, detail, source, report_id, source_key, priority, assigned_to, due_on, due_confirmed,
			links, created_by)
		 values ($1,$2,'report',$3,$4,$5,null,$6::date,$7,$8::jsonb,$9)
		 on conflict (source_key) where source_key is not null and status = 'open' do nothing
		 returning ${COLUMNS}`,
		[
			action.title.slice(0, 200),
			[action.reason, ...action.nextSteps.map((step, index) => `${index + 1}. ${step}`)]
				.join("\n")
				.slice(0, 2000),
			saved.id,
			key,
			action.priority,
			action.due?.date ?? null,
			action.due?.confirmed ?? false,
			json(action.links),
			actorKey(actor),
		],
	);
	if (!rows[0]) {
		// Someone tracked the same line at the same moment.
		const raced = await sql.query(
			`select ${COLUMNS} from wai_action_items where source_key = $1 and status = 'open'`,
			[key],
		);
		return { item: toItem(raced.rows[0]), created: false };
	}
	await audit(sql, {
		actor,
		action: "checklist.track",
		subject: rows[0].id as string,
		outcome: "allowed",
		detail: { report: saved.id },
	});
	return { item: toItem(rows[0]), created: true };
}

const ORDER = `case priority when 'urgent' then 0 when 'high' then 1 else 2 end, due_on nulls last, created_at`;

/** Open items, most pressing first. `today` hides the ones snoozed past today. */
export async function listOpenActions(sql: Sql, options: { today?: string } = {}): Promise<ActionItem[]> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_action_items where status = 'open'
		 ${options.today ? "and (snoozed_until is null or snoozed_until <= $1::date)" : ""} order by ${ORDER} limit 300`,
		options.today ? [options.today] : [],
	);
	return rows.map(toItem);
}

export async function listClosedActions(sql: Sql, limit = 30): Promise<ActionItem[]> {
	const { rows } = await sql.query(
		`select ${COLUMNS} from wai_action_items where status <> 'open' order by closed_at desc limit $1`,
		[limit],
	);
	return rows.map(toItem);
}

async function openItem(sql: Sql, id: string): Promise<ActionItem> {
	const { rows } = await sql.query(`select ${COLUMNS} from wai_action_items where id = $1`, [id]);
	if (!rows[0]) throw new WorkflowError("not_found", "That action doesn't exist.");
	const item = toItem(rows[0]);
	if (item.status !== "open") throw new WorkflowError("conflict", "That action has already been closed.");
	return item;
}

/** Changes who an item is for, its priority, or its date. */
export async function updateAction(
	sql: Sql,
	actor: OperatorActor,
	id: string,
	change: { assignedTo?: string; priority?: string; dueOn?: string },
): Promise<ActionItem> {
	const item = await openItem(sql, id);
	const assignedTo = change.assignedTo === undefined ? item.assignedTo : assigneeOf(change.assignedTo, actor);
	const priority = change.priority === undefined ? item.priority : priorityOf(change.priority);
	const dueOn = change.dueOn === undefined ? item.dueOn : dayOf("The date", change.dueOn);
	// A date a person types over a recorded one is their suggestion, not a recorded deadline.
	const dueConfirmed = dueOn === item.dueOn ? item.dueConfirmed : false;
	const { rows } = await sql.query(
		`update wai_action_items set assigned_to = $2, priority = $3, due_on = $4::date, due_confirmed = $5, updated_at = now()
		 where id = $1 and status = 'open' returning ${COLUMNS}`,
		[id, assignedTo, priority, dueOn, dueConfirmed],
	);
	await audit(sql, {
		actor,
		action: "checklist.update",
		subject: id,
		outcome: "allowed",
		detail: { assignedTo: assignedTo ?? "anyone", priority, dueOn },
	});
	return toItem(rows[0]);
}

/** Hides an item until a later day. The reason is kept, so a snoozed item is never just a forgotten one. */
export async function snoozeAction(
	sql: Sql,
	actor: OperatorActor,
	id: string,
	input: { until: string; reason: string },
	today: string,
): Promise<ActionItem> {
	await openItem(sql, id);
	const until = dayOf("The date to bring it back", input.until);
	if (!until || until <= today)
		throw new WorkflowError("invalid", "Choose a day after today to bring it back.");
	const reason = tidy(input.reason, 500);
	if (!reason) throw new WorkflowError("invalid", "Say why it is being put off. The reason is kept with it.");
	const { rows } = await sql.query(
		`update wai_action_items set snoozed_until = $2::date, snooze_reason = $3, updated_at = now()
		 where id = $1 and status = 'open' returning ${COLUMNS}`,
		[id, until, reason],
	);
	await audit(sql, {
		actor,
		action: "checklist.snooze",
		subject: id,
		outcome: "allowed",
		detail: { until, reason },
	});
	return toItem(rows[0]);
}

/**
 * Closes an item, with a note of what was done (or why it is being dismissed). This closes the item only. Whatever it was
 * about, a task, a result, a document, is untouched and still has to be dealt with on its own screen.
 */
export async function closeAction(
	sql: Sql,
	actor: OperatorActor,
	id: string,
	input: { outcome: "done" | "dismissed"; note: string },
): Promise<ActionItem> {
	await openItem(sql, id);
	const note = tidy(input.note, 1000);
	if (!note)
		throw new WorkflowError(
			"invalid",
			input.outcome === "done"
				? "Say what was done. The note is kept with it."
				: "Say why it is being dismissed.",
		);
	const { rows } = await sql.query(
		`update wai_action_items set status = $2, closing_note = $3, closed_by = $4, closed_at = now(), updated_at = now(),
			snoozed_until = null, snooze_reason = null
		 where id = $1 and status = 'open' returning ${COLUMNS}`,
		[id, input.outcome, note, actorKey(actor)],
	);
	if (!rows[0]) throw new WorkflowError("conflict", "That action has already been closed.");
	await audit(sql, {
		actor,
		action: `checklist.${input.outcome}`,
		subject: id,
		outcome: "allowed",
		detail: { note },
	});
	return toItem(rows[0]);
}
