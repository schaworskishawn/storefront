-- Worldwide AI, fourteenth migration: running a coding job.
--
-- One run per coding job: which throwaway machines it used, how far it has got, what the agent reported, and how it ended.
-- A run moves forward one bounded step at a time, so a step that is interrupted can be picked up again without starting a
-- second machine or collecting the same change twice.
--
-- Nothing here holds a key, a token or an address. The machines are created by the application when a person starts a run.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '14' where key = 'schema_version' and value = '13';

-- A job can now end without a change coming back: the agent stopped, ran out of time, or changed nothing.
alter table wai_coding_jobs drop constraint if exists wai_coding_jobs_status_check;
alter table wai_coding_jobs add constraint wai_coding_jobs_status_check check (
	status in ('awaiting_backend', 'queued', 'running', 'returned', 'rejected', 'failed', 'cancelled', 'outcome_unknown')
);

create table if not exists wai_coding_runs (
	id uuid primary key default gen_random_uuid(),
	-- One run per job. Trying again is a new job, with its own envelope.
	job_id uuid not null unique references wai_coding_jobs (id),
	phase text not null check (
		phase in ('prepare', 'installing_agent', 'agent', 'collect', 'verify_prepare', 'verify_setup', 'verify_check',
			'done', 'failed', 'cancelled')
	),
	-- The names of the machines this run created. A name is fixed by the job, so a step that is repeated finds the same
	-- machine instead of making another.
	agent_sandbox text,
	verify_sandbox text,
	-- The command the run is waiting on, and which setup step or check it is.
	command_id text,
	step_index integer not null default 0,
	-- What the agent reported when it stopped: how it ended, how many turns, what it cost if that was reported.
	agent_result jsonb,
	package_id uuid references wai_change_packages (id),
	detail text,
	log_tail text,
	started_by text not null,
	started_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- When the agent has to have finished by.
	deadline_at timestamptz,
	finished_at timestamptz,
	-- Held by whichever request is moving the run forward, so two can't do the same step at once.
	lease_token text,
	lease_until timestamptz,
	constraint wai_coding_runs_starter_is_a_person check (started_by like 'operator:%'),
	constraint wai_coding_runs_finished_when_over
		check ((phase in ('done', 'failed', 'cancelled')) = (finished_at is not null))
);

alter table wai_coding_runs enable row level security;
