-- Worldwide AI: operational records for the private operations dashboard.
--
-- What lives here: tasks and their history, support cases and reply drafts, approved knowledge documents and their versions,
-- findings, review decisions, usage, integration health, OpenClaw runs, and an audit log.
-- What does NOT live here: orders, carrier events, payments, bank and accounting records. Those stay in their own systems;
-- rows here point at them (source identifiers, retrieval timestamps, versions) instead of copying them.
--
-- Access: every table has row level security enabled and no policies, so Supabase's anon and authenticated roles can read and
-- write nothing. The application connects with a server-side database role (POSTGRES_URL) and enforces who may do what in code.
-- All timestamps are timestamptz (UTC); the dashboard shows them in America/Winnipeg.

create table if not exists wai_meta (
	key text primary key,
	value text not null
);
insert into wai_meta (key, value) values ('schema_version', '1') on conflict (key) do nothing;

-- Owner-adjustable settings for the fourteen roles (the roles themselves are defined in code).
create table if not exists wai_agent_settings (
	role_id text primary key,
	enabled boolean not null default true,
	limits jsonb not null default '{}'::jsonb,
	updated_by text,
	updated_at timestamptz not null default now()
);

create table if not exists wai_tasks (
	id uuid primary key default gen_random_uuid(),
	kind text not null,
	title text not null,
	-- One owning role per task.
	owner_role text not null,
	state text not null default 'queued'
		check (state in ('queued', 'running', 'needs_review', 'completed', 'failed', 'cancelled', 'outcome_unknown')),
	-- The same request made twice maps to the same key, so it cannot create a second task.
	idempotency_key text not null unique,
	requested_by text not null,
	requested_by_label text,
	-- What "done" means, written down when the task is created.
	expected_result text not null,
	-- What proves it is done. A task cannot be completed without it.
	completion_evidence jsonb,
	input jsonb not null default '{}'::jsonb,
	result jsonb,
	error text,
	attempts integer not null default 0,
	parent_task_id uuid references wai_tasks (id),
	delegation_depth integer not null default 0 check (delegation_depth between 0 and 3),
	-- Where the facts used came from: [{ system, id, version, retrievedAt, sha256, label }]
	source_refs jsonb not null default '[]'::jsonb,
	-- The background job runner's own id for the run (Trigger.dev), when there is one.
	external_run_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	started_at timestamptz,
	finished_at timestamptz,
	constraint wai_tasks_completed_has_evidence
		check (state <> 'completed' or (completion_evidence is not null and finished_at is not null)),
	constraint wai_tasks_requester_is_known
		check (requested_by like 'operator:%' or requested_by like 'agent:%' or requested_by like 'system:%')
);
create index if not exists wai_tasks_state_created on wai_tasks (state, created_at desc);
create index if not exists wai_tasks_owner on wai_tasks (owner_role, state);
create index if not exists wai_tasks_kind_created on wai_tasks (kind, created_at desc);

-- Execution history: one row per step that mattered (state changes, tool calls, model calls, verification).
create table if not exists wai_task_events (
	id serial primary key,
	task_id uuid not null references wai_tasks (id) on delete cascade,
	at timestamptz not null default now(),
	kind text not null,
	actor text not null,
	role_id text,
	tool text,
	from_state text,
	to_state text,
	detail jsonb not null default '{}'::jsonb
);
create index if not exists wai_task_events_task on wai_task_events (task_id, id);

-- Atlas: approved knowledge. A document has versions; only an approved, current version is ever retrieved as authoritative.
create table if not exists wai_documents (
	id uuid primary key default gen_random_uuid(),
	collection text not null,
	title text not null,
	owner text not null,
	-- Where it came from ("Shipping policy page, Oct 2026", a URL, a contract name).
	source text not null,
	status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
	current_version integer,
	review_due date,
	expires_at date,
	tags jsonb not null default '[]'::jsonb,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists wai_documents_collection_status on wai_documents (collection, status);

create table if not exists wai_document_versions (
	id uuid primary key default gen_random_uuid(),
	document_id uuid not null references wai_documents (id) on delete cascade,
	version integer not null,
	title text not null,
	content text not null,
	content_sha256 text not null,
	-- The original upload, when there is one (a path in the storage bucket).
	file_path text,
	file_name text,
	mime text,
	bytes integer,
	status text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'retired')),
	submitted_by text not null,
	-- Only a person approves, never an agent or the system.
	approved_by text,
	approved_at timestamptz,
	created_at timestamptz not null default now(),
	search tsvector generated always as (
		setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(content, '')), 'B')
	) stored,
	unique (document_id, version),
	constraint wai_versions_approver_is_a_person check (approved_by is null or approved_by like 'operator:%'),
	constraint wai_versions_approved_has_approver check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);
create index if not exists wai_document_versions_search on wai_document_versions using gin (search);
create index if not exists wai_document_versions_status on wai_document_versions (status);

-- Support cases. Cases that arrive through the contact form or are typed in by staff live here; the customer's orders stay in Saleor.
create table if not exists wai_cases (
	id uuid primary key default gen_random_uuid(),
	source text not null check (source in ('manual', 'contact_form', 'demo')),
	source_ref text,
	subject text not null,
	customer_name text,
	customer_email text,
	order_number text,
	message text not null,
	message_sha256 text not null,
	status text not null default 'open' check (status in ('open', 'draft_ready', 'resolved', 'closed')),
	created_by text not null,
	received_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create unique index if not exists wai_cases_source_ref on wai_cases (source, source_ref) where source_ref is not null;
create index if not exists wai_cases_status_received on wai_cases (status, received_at desc);

create table if not exists wai_drafts (
	id uuid primary key default gen_random_uuid(),
	task_id uuid not null references wai_tasks (id),
	case_id uuid not null references wai_cases (id),
	kind text not null default 'support_reply',
	subject text,
	body text not null,
	body_sha256 text not null,
	state text not null default 'pending_review' check (state in ('pending_review', 'saved', 'rejected', 'superseded')),
	-- ok: every source current. stale: a source is past its review date. missing: no approved source was found.
	source_status text not null check (source_status in ('ok', 'stale', 'missing')),
	warnings jsonb not null default '[]'::jsonb,
	model text,
	prompt_version text,
	created_by_role text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	edited_by text,
	reviewed_by text,
	reviewed_at timestamptz,
	review_note text,
	saved_at timestamptz,
	-- A task produces at most one draft, however many times a job is retried.
	unique (task_id),
	constraint wai_drafts_reviewer_is_a_person check (reviewed_by is null or reviewed_by like 'operator:%'),
	constraint wai_drafts_saved_was_reviewed check (state <> 'saved' or (reviewed_by is not null and saved_at is not null))
);
create index if not exists wai_drafts_case on wai_drafts (case_id, created_at desc);
create index if not exists wai_drafts_state on wai_drafts (state, created_at desc);

-- The documents a draft was written from, exactly as they were when read.
create table if not exists wai_draft_sources (
	id uuid primary key default gen_random_uuid(),
	draft_id uuid not null references wai_drafts (id) on delete cascade,
	document_id uuid not null references wai_documents (id),
	version integer not null,
	title text not null,
	content_sha256 text not null,
	retrieved_at timestamptz not null,
	freshness text not null check (freshness in ('current', 'stale')),
	-- Whether the draft cites it, as opposed to it simply having been retrieved.
	cited boolean not null default false,
	excerpt text,
	unique (draft_id, document_id, version)
);
create index if not exists wai_draft_sources_draft on wai_draft_sources (draft_id);

-- Every approval, rejection and edit decision, by a person.
create table if not exists wai_reviews (
	id uuid primary key default gen_random_uuid(),
	subject_type text not null check (subject_type in ('draft', 'document_version', 'finding', 'task')),
	subject_id text not null,
	decision text not null check (decision in ('approved', 'rejected', 'edited', 'acknowledged', 'dismissed', 'retired')),
	reviewer text not null,
	reviewer_label text,
	note text,
	before_sha256 text,
	after_sha256 text,
	at timestamptz not null default now(),
	constraint wai_reviews_reviewer_is_a_person check (reviewer like 'operator:%')
);
create index if not exists wai_reviews_subject on wai_reviews (subject_type, subject_id, at);

create table if not exists wai_findings (
	id uuid primary key default gen_random_uuid(),
	task_id uuid references wai_tasks (id) on delete set null,
	role_id text not null,
	severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
	category text not null,
	title text not null,
	detail text not null default '',
	evidence jsonb not null default '{}'::jsonb,
	source_refs jsonb not null default '[]'::jsonb,
	status text not null default 'open' check (status in ('open', 'acknowledged', 'dismissed', 'resolved')),
	-- A finding that is about the same thing as an open one is not recorded twice.
	dedupe_key text unique,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists wai_findings_status_severity on wai_findings (status, severity, created_at desc);

create table if not exists wai_usage (
	id serial primary key,
	task_id uuid references wai_tasks (id) on delete set null,
	role_id text not null,
	kind text not null check (kind in ('model', 'tool')),
	model text,
	tool text,
	input_tokens integer,
	output_tokens integer,
	total_tokens integer,
	latency_ms integer,
	status text not null default 'ok',
	at timestamptz not null default now()
);
create index if not exists wai_usage_role_at on wai_usage (role_id, at desc);
create index if not exists wai_usage_task on wai_usage (task_id);

create table if not exists wai_integration_health (
	id serial primary key,
	integration text not null,
	status text not null check (status in ('healthy', 'degraded', 'unhealthy', 'not_configured', 'unknown')),
	detail text,
	latency_ms integer,
	checked_at timestamptz not null default now()
);
create index if not exists wai_integration_health_latest on wai_integration_health (integration, checked_at desc);

-- OpenClaw runs. The session id is made by this application before anything is sent; the run id is kept as the worker returns it.
create table if not exists wai_openclaw_runs (
	id uuid primary key default gen_random_uuid(),
	task_id uuid not null references wai_tasks (id),
	session_id text not null unique,
	run_id text,
	job_type text not null,
	spec jsonb not null,
	state text not null default 'submitting'
		check (state in ('submitting', 'submitted', 'running', 'succeeded', 'failed', 'timed_out', 'unknown')),
	submitted_at timestamptz,
	last_polled_at timestamptz,
	finished_at timestamptz,
	result jsonb,
	-- [{ kind: 'screenshot', path, sha256, bytes, url, viewport }]
	evidence jsonb not null default '[]'::jsonb,
	error text,
	created_at timestamptz not null default now()
);
create index if not exists wai_openclaw_runs_task on wai_openclaw_runs (task_id);
create unique index if not exists wai_openclaw_runs_run_id on wai_openclaw_runs (run_id) where run_id is not null;

-- Every file the application stores, so backups and restore checks know what to cover.
create table if not exists wai_files (
	id uuid primary key default gen_random_uuid(),
	bucket text not null,
	path text not null unique,
	sha256 text not null,
	bytes integer not null,
	mime text,
	kind text not null check (kind in ('evidence_screenshot', 'document_upload', 'backup')),
	task_id uuid references wai_tasks (id) on delete set null,
	created_at timestamptz not null default now()
);

create table if not exists wai_audit_log (
	id serial primary key,
	at timestamptz not null default now(),
	actor text not null,
	actor_role text,
	action text not null,
	subject text,
	outcome text not null check (outcome in ('allowed', 'denied')),
	detail jsonb not null default '{}'::jsonb
);
create index if not exists wai_audit_log_at on wai_audit_log (at desc);

-- Lock the tables to the server: no policies means no access for Supabase's anon and authenticated roles.
alter table wai_meta enable row level security;
alter table wai_agent_settings enable row level security;
alter table wai_tasks enable row level security;
alter table wai_task_events enable row level security;
alter table wai_documents enable row level security;
alter table wai_document_versions enable row level security;
alter table wai_cases enable row level security;
alter table wai_drafts enable row level security;
alter table wai_draft_sources enable row level security;
alter table wai_reviews enable row level security;
alter table wai_findings enable row level security;
alter table wai_usage enable row level security;
alter table wai_integration_health enable row level security;
alter table wai_openclaw_runs enable row level security;
alter table wai_files enable row level security;
alter table wai_audit_log enable row level security;
