-- Worldwide AI, twelfth migration: Build's coding work, as records.
--
-- A registered repository with the paths a change may and may not touch; a coding job with the envelope the server built for
-- it; the change package a worker returns, frozen with a hash of exactly what it contains; Verify's results, each tied to
-- that hash; and the owner's decision, tied to it too.
--
-- No coding backend is connected by this migration. A job waits until one is, and nothing here writes a patch, runs a check,
-- pushes a branch, merges or deploys.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '12' where key = 'schema_version' and value = '11';

-- A repository coding work may be asked for. Its address and where it is checked out are the worker's own configuration,
-- looked up by this id: they are never stored here and never taken from a request.
create table if not exists wai_repositories (
	id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
	label text not null check (length(trim(label)) > 0),
	default_branch text not null check (default_branch ~ '^[A-Za-z0-9._/-]{1,100}$'),
	-- Path patterns a change may touch, and patterns it may never touch whatever the first list says.
	change_scope jsonb not null,
	protected_paths jsonb not null,
	status text not null default 'active' check (status in ('active', 'retired')),
	registered_by text not null,
	registered_at timestamptz not null default now(),
	constraint wai_repositories_registrar_is_a_person check (registered_by like 'operator:%')
);

create table if not exists wai_coding_jobs (
	id uuid primary key default gen_random_uuid(),
	task_id uuid references wai_tasks (id),
	job_type text not null check (job_type in ('repository_inspection', 'change_proposal', 'acceptance_verification')),
	repository_id text not null references wai_repositories (id),
	backend text not null check (backend in ('claude-agent-sdk', 'openhands')),
	-- Everything the worker is given, built by the server. Its checksum is how a returned package proves which job it is for.
	envelope jsonb not null,
	envelope_sha256 text not null,
	status text not null check (
		status in ('awaiting_backend', 'queued', 'running', 'returned', 'rejected', 'cancelled', 'outcome_unknown')
	),
	status_detail text,
	idempotency_key text not null unique,
	requested_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint wai_coding_jobs_requester_is_a_person check (requested_by like 'operator:%')
);
-- One job in hand per repository at a time.
create unique index if not exists wai_coding_jobs_one_active
	on wai_coding_jobs (repository_id) where status in ('awaiting_backend', 'queued', 'running');

-- A change a worker returned, frozen. The candidate checksum covers the base commit, the diff and the list of files, so any
-- change to any of them is a different candidate.
create table if not exists wai_change_packages (
	id uuid primary key default gen_random_uuid(),
	job_id uuid not null references wai_coding_jobs (id),
	base_commit text not null check (base_commit ~ '^[0-9a-f]{40}$'),
	candidate_sha256 text not null,
	diff text not null,
	diff_sha256 text not null,
	files jsonb not null,
	summary text not null,
	-- What the backend said its own checks did. Useful, and never a substitute for Verify's.
	build_checks jsonb not null default '[]'::jsonb,
	status text not null default 'frozen' check (status in ('frozen', 'superseded')),
	returned_by text not null,
	frozen_at timestamptz not null default now(),
	decision text check (decision in ('approved', 'rejected')),
	decided_by text,
	decided_at timestamptz,
	decision_note text,
	-- The candidate the decision was made on. A decision never carries over to another.
	decision_candidate_sha256 text,
	unique (job_id, candidate_sha256),
	-- A package comes from a worker, never from a person or an agent.
	constraint wai_change_packages_returned_by_a_worker check (returned_by like 'system:%'),
	constraint wai_change_packages_decision_says_who_and_on_what check (
		(decision is null and decided_by is null and decided_at is null and decision_note is null
			and decision_candidate_sha256 is null)
		or (decision is not null and decided_by like 'operator:%' and decided_at is not null
			and decision_note is not null and length(trim(decision_note)) > 0
			and decision_candidate_sha256 = candidate_sha256)
	)
);
create index if not exists wai_change_packages_job on wai_change_packages (job_id, frozen_at);

-- A check Verify ran against one exact candidate. Only Verify writes these.
create table if not exists wai_package_verifications (
	id uuid primary key default gen_random_uuid(),
	package_id uuid not null references wai_change_packages (id),
	candidate_sha256 text not null,
	runner_id text not null,
	exit_status integer not null,
	passed boolean not null,
	environment text not null check (length(trim(environment)) > 0),
	evidence_sha256 text,
	summary text,
	recorded_by text not null,
	recorded_at timestamptz not null default now(),
	constraint wai_package_verifications_recorded_by_verify check (recorded_by = 'agent:verify'),
	constraint wai_package_verifications_pass_means_zero check (passed = (exit_status = 0))
);
create index if not exists wai_package_verifications_package on wai_package_verifications (package_id, recorded_at);

alter table wai_repositories enable row level security;
alter table wai_coding_jobs enable row level security;
alter table wai_change_packages enable row level security;
alter table wai_package_verifications enable row level security;
