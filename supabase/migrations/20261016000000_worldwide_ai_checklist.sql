-- Worldwide AI, seventh migration: the Today checklist.
--
-- An action item is something a person has to do: added by hand, or tracked from a line of a daily report. It can be given to
-- someone, given a priority and a date, snoozed with a reason, and closed with a note of what was done.
--
-- Closing an action item closes the item and nothing else. It never completes a task, accepts a result or changes a record:
-- if the thing it was about is still waiting, the next daily report says so again.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '7' where key = 'schema_version' and value = '6';

create table if not exists wai_action_items (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	detail text,
	source text not null default 'manual' check (source in ('manual', 'report')),
	-- For an item tracked from a report: which report, and a key for the thing it is about, so tracking it twice makes one item.
	report_id uuid references wai_daily_reports (id),
	source_key text,
	priority text not null default 'normal' check (priority in ('urgent', 'high', 'normal')),
	-- Who it is for: null for anyone, 'owner', 'staff', or one person's own key.
	assigned_to text,
	due_on date,
	-- True for a recorded date such as an expiry; false for a date someone suggested.
	due_confirmed boolean not null default false,
	status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
	snoozed_until date,
	snooze_reason text,
	links jsonb not null default '[]'::jsonb,
	-- What was done, or why it was dismissed, written by the person who closed it.
	closing_note text,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	closed_by text,
	closed_at timestamptz,
	constraint wai_action_items_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_action_items_closer_is_a_person check (closed_by is null or closed_by like 'operator:%'),
	constraint wai_action_items_assignee_is_known
		check (assigned_to is null or assigned_to in ('owner', 'staff') or assigned_to like 'operator:%'),
	constraint wai_action_items_closed_says_who_and_what
		check (status = 'open' or (closed_by is not null and closed_at is not null and closing_note is not null)),
	constraint wai_action_items_snooze_says_why
		check (snoozed_until is null or (snooze_reason is not null and length(trim(snooze_reason)) > 0)),
	constraint wai_action_items_report_has_key check (source <> 'report' or source_key is not null)
);
-- One open item per thing a report is about.
create unique index if not exists wai_action_items_one_open_per_source
	on wai_action_items (source_key) where source_key is not null and status = 'open';
create index if not exists wai_action_items_open on wai_action_items (status, priority, due_on);

alter table wai_action_items enable row level security;
