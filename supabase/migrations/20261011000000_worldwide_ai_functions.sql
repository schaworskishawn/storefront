-- Worldwide AI, second migration: the 49-agent function pipeline.
--
-- Adds the store for what each agent's function produces (one typed, reviewable result per task), marks tasks that belong to
-- one person only (Focus) or to a labelled demonstration run, and lets a review decision and an uploaded file point at them.
-- Safe to run more than once. Nothing here changes or removes an existing record: tasks written under the first fourteen
-- agent ids keep their owner, kind and history.

update wai_meta set value = '2' where key = 'schema_version' and value = '1';

-- 'business' work is visible to every operator. 'personal:<operator key>' work (Focus) is visible to that person only and is
-- left out of every shared list, count, briefing and report.
alter table wai_tasks add column if not exists scope text not null default 'business';
-- A "Run sample" task: fictional input, kept out of live lists and counts, and never evidence that an integration works.
alter table wai_tasks add column if not exists demo boolean not null default false;
alter table wai_tasks drop constraint if exists wai_tasks_scope_is_known;
alter table wai_tasks add constraint wai_tasks_scope_is_known
	check (scope = 'business' or scope like 'personal:operator:%');
create index if not exists wai_tasks_scope on wai_tasks (scope, demo, created_at desc);

create table if not exists wai_work_products (
	id uuid primary key default gen_random_uuid(),
	-- A task produces at most one result, however many times a job is retried.
	task_id uuid not null unique references wai_tasks (id),
	function_id text not null,
	function_version integer not null,
	agent_id text not null,
	-- The typed record this is: "DataQualityReport", "SettlementReconciliation"…
	output_type text not null,
	scope text not null default 'business',
	demo boolean not null default false,
	summary text not null,
	payload jsonb not null,
	payload_sha256 text not null,
	-- A hash of exactly what was supplied, so a result can always be tied to its input.
	input_sha256 text not null,
	missing jsonb not null default '[]'::jsonb,
	assumptions jsonb not null default '[]'::jsonb,
	coverage jsonb not null default '{}'::jsonb,
	warnings jsonb not null default '[]'::jsonb,
	source_refs jsonb not null default '[]'::jsonb,
	model text,
	prompt_version text,
	review_required boolean not null,
	review_state text not null default 'pending'
		check (review_state in ('pending', 'accepted', 'rejected', 'not_required')),
	reviewed_by text,
	reviewed_at timestamptz,
	review_note text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint wai_work_products_agent_owns_function check (split_part(function_id, '.', 1) = agent_id),
	constraint wai_work_products_reviewer_is_a_person check (reviewed_by is null or reviewed_by like 'operator:%'),
	constraint wai_work_products_decided_was_reviewed
		check (review_state not in ('accepted', 'rejected') or (reviewed_by is not null and reviewed_at is not null)),
	constraint wai_work_products_review_matches_policy
		check ((review_required and review_state <> 'not_required') or (not review_required and review_state = 'not_required')),
	constraint wai_work_products_scope_is_known check (scope = 'business' or scope like 'personal:operator:%')
);
create index if not exists wai_work_products_agent on wai_work_products (agent_id, created_at desc);
create index if not exists wai_work_products_review on wai_work_products (review_state, created_at desc);

-- A review decision can now be about a stored result, and a stored file can be something a person uploaded for a task.
alter table wai_reviews drop constraint if exists wai_reviews_subject_type_check;
alter table wai_reviews add constraint wai_reviews_subject_type_check
	check (subject_type in ('draft', 'document_version', 'finding', 'task', 'work_product'));
alter table wai_files drop constraint if exists wai_files_kind_check;
alter table wai_files add constraint wai_files_kind_check
	check (kind in ('evidence_screenshot', 'document_upload', 'backup', 'task_upload'));

alter table wai_work_products enable row level security;
