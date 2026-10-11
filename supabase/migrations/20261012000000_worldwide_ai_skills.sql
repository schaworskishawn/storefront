-- Worldwide AI, third migration: approved skills.
--
-- A skill is a written, tested procedure an agent follows for one of its functions. The procedures themselves live in the
-- repository (src/lib/worldwide-ai/skills). This migration adds what the application must remember about them: which exact
-- version was evaluated, which one a person approved, which one is in use, what was revoked, which procedures each task
-- actually followed, and improvement proposals that came out of a person's review.
--
-- Safe to run more than once. Nothing here changes an existing record. Until a person approves a release, no skill guides any
-- work and every function runs exactly as it did before this migration.

update wai_meta set value = '3' where key = 'schema_version' and value = '2';

-- One run of a skill's evaluation suite against one exact version of its package.
create table if not exists wai_skill_evaluations (
	id uuid primary key default gen_random_uuid(),
	skill_id text not null,
	version integer not null,
	-- The checksum of the package that was evaluated. Approval is only ever of this exact content.
	content_sha256 text not null,
	policy_version integer not null,
	suite_version integer not null,
	-- Where it ran. 'isolated' means a scratch database that shares nothing with live records.
	environment text not null check (environment in ('isolated')),
	passed boolean not null,
	critical_failures integer not null,
	totals jsonb not null,
	cases jsonb not null,
	ran_by text not null,
	ran_at timestamptz not null default now()
);
create index if not exists wai_skill_evaluations_skill on wai_skill_evaluations (skill_id, ran_at desc);

-- A version of a skill that a person approved. The package is kept here exactly as it was approved, so the version in use
-- does not change when the repository does, and an earlier approved version can be brought back.
create table if not exists wai_skill_releases (
	id uuid primary key default gen_random_uuid(),
	skill_id text not null,
	kind text not null check (kind in ('foundation', 'role-pack')),
	version integer not null,
	content_sha256 text not null,
	-- json, not jsonb: the checksum is of this text in this order.
	package json not null,
	state text not null default 'approved' check (state in ('approved', 'revoked')),
	-- The one release of a skill that guides new work. An approved release that is not active is a rollback target.
	active boolean not null default false,
	evaluation_id uuid not null references wai_skill_evaluations (id),
	previous_release_id uuid references wai_skill_releases (id),
	approved_by text not null,
	approved_at timestamptz not null default now(),
	activated_at timestamptz,
	revoked_by text,
	revoked_at timestamptz,
	revoke_reason text,
	constraint wai_skill_releases_one_per_content unique (skill_id, content_sha256),
	constraint wai_skill_releases_approver_is_a_person check (approved_by like 'operator:%'),
	constraint wai_skill_releases_revoker_is_a_person check (revoked_by is null or revoked_by like 'operator:%'),
	constraint wai_skill_releases_only_approved_is_active check (not active or state = 'approved'),
	constraint wai_skill_releases_revoked_says_who
		check (state <> 'revoked' or (revoked_by is not null and revoked_at is not null))
);
create unique index if not exists wai_skill_releases_one_active on wai_skill_releases (skill_id) where active;
create index if not exists wai_skill_releases_skill on wai_skill_releases (skill_id, approved_at desc);

-- Which approved procedures a task actually followed, pinned to the exact release. Being assigned a skill is not the same as
-- having followed it, so the stage is recorded: selected, loaded into a model's instructions, invoked, completed.
create table if not exists wai_skill_invocations (
	id serial primary key,
	task_id uuid not null references wai_tasks (id) on delete cascade,
	skill_id text not null,
	release_id uuid not null references wai_skill_releases (id),
	version integer not null,
	content_sha256 text not null,
	role text not null check (role in ('primary', 'foundation')),
	stage text not null check (stage in ('selected', 'loaded', 'invoked', 'completed')),
	at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint wai_skill_invocations_once_per_task unique (task_id, skill_id)
);
create index if not exists wai_skill_invocations_skill on wai_skill_invocations (skill_id, at desc);

-- A person's proposal to improve a procedure, usually written while reviewing a result. A proposal changes nothing by itself:
-- a changed procedure is a new version in the repository, which must be evaluated and approved before it guides any work.
create table if not exists wai_skill_proposals (
	id uuid primary key default gen_random_uuid(),
	skill_id text not null,
	base_version integer not null,
	base_sha256 text not null,
	summary text not null,
	proposed_change text not null,
	source_type text not null default 'none' check (source_type in ('none', 'work_product', 'draft', 'task')),
	source_id text,
	state text not null default 'open' check (state in ('open', 'accepted', 'declined', 'superseded')),
	created_by text not null,
	created_at timestamptz not null default now(),
	decided_by text,
	decided_at timestamptz,
	decision_note text,
	constraint wai_skill_proposals_author_is_a_person check (created_by like 'operator:%'),
	constraint wai_skill_proposals_decider_is_a_person check (decided_by is null or decided_by like 'operator:%'),
	constraint wai_skill_proposals_decided_says_who
		check (state = 'open' or (decided_by is not null and decided_at is not null))
);
create index if not exists wai_skill_proposals_skill on wai_skill_proposals (skill_id, created_at desc);

-- The procedures a stored result was produced under, pinned by version and checksum.
alter table wai_work_products add column if not exists skills jsonb not null default '[]'::jsonb;

alter table wai_skill_evaluations enable row level security;
alter table wai_skill_releases enable row level security;
alter table wai_skill_invocations enable row level security;
alter table wai_skill_proposals enable row level security;
