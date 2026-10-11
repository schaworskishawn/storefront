-- Worldwide AI, fourth migration: saved daily reports.
--
-- A daily report is assembled by application code from the workspace's own records and saved, so there is a history to look
-- back through and a fixed record of what was known on the morning it was written. Nothing is sent anywhere.
--
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '4' where key = 'schema_version' and value = '3';

create table if not exists wai_daily_reports (
	id uuid primary key default gen_random_uuid(),
	kind text not null check (kind in ('morning', 'evening')),
	-- The day the report is for, on the Winnipeg calendar.
	report_day date not null,
	-- 1 for the first report of a day. "Generate report now" makes a further attempt and keeps the earlier ones.
	attempt integer not null default 1 check (attempt >= 1),
	-- What the report covers: from the end of the last completed report of this kind to the moment it was generated.
	period_start timestamptz not null,
	period_end timestamptz not null,
	status text not null default 'generating' check (status in ('generating', 'completed', 'failed')),
	-- Shared business reports only. One person's own work (Focus) is never read into a report.
	scope text not null default 'business' check (scope = 'business'),
	-- json, not jsonb: the checksum is of this text in this order.
	payload json,
	payload_sha256 text,
	error text,
	requested_by text not null,
	started_at timestamptz not null default now(),
	completed_at timestamptz,
	constraint wai_daily_reports_one_per_attempt unique (kind, report_day, attempt),
	constraint wai_daily_reports_requester_is_known
		check (requested_by like 'operator:%' or requested_by like 'system:%'),
	constraint wai_daily_reports_period_is_ordered check (period_end >= period_start),
	constraint wai_daily_reports_completed_has_content
		check (status <> 'completed' or (payload is not null and payload_sha256 is not null and completed_at is not null)),
	constraint wai_daily_reports_failed_says_why check (status <> 'failed' or error is not null)
);
-- Two runs for the same day can't overlap: only one can be generating at a time.
create unique index if not exists wai_daily_reports_one_generating
	on wai_daily_reports (kind, report_day) where status = 'generating';
create index if not exists wai_daily_reports_recent on wai_daily_reports (kind, period_end desc);

alter table wai_daily_reports enable row level security;
