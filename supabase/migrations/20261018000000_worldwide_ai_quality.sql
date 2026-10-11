-- Worldwide AI, ninth migration: quality records.
--
-- Specifications a recipe's liquid is tested against, samples taken from a batch's bulk and where they went, the results a
-- laboratory reported, and deviations with their corrective actions. With these stored, a release can check for itself what
-- the owner used to confirm by ticking a box.
--
-- These are records of what people did and what a laboratory reported. Nothing here is a laboratory result of its own, a
-- safety finding, or a statement that a product meets any regulation.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '9' where key = 'schema_version' and value = '8';

-- What a recipe's liquid is tested against, in versions. Only the owner approves one, and an approved version is never
-- changed: a change is a new version.
create table if not exists wai_specifications (
	id uuid primary key default gen_random_uuid(),
	recipe_id uuid not null references wai_recipes (id),
	version integer not null check (version > 0),
	state text not null default 'draft' check (state in ('draft', 'approved', 'superseded')),
	-- One entry per thing tested: what, in which unit, between which limits, by which method, and whether it is required.
	criteria jsonb not null,
	criteria_sha256 text not null,
	note text,
	created_by text not null,
	created_at timestamptz not null default now(),
	approved_by text,
	approved_at timestamptz,
	unique (recipe_id, version),
	constraint wai_specifications_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_specifications_approval_says_who
		check (state = 'draft' or (approved_by like 'operator:%' and approved_at is not null))
);
-- One version in force per recipe.
create unique index if not exists wai_specifications_one_approved
	on wai_specifications (recipe_id) where state = 'approved';

-- A sample taken from a batch's bulk. The liquid it removed is a line in the bulk ledger, written in the same step.
create table if not exists wai_samples (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	batch_id uuid not null references wai_batches (id),
	purpose text not null check (purpose in ('release_test', 'retained', 'stability', 'other')),
	quantity_ml numeric(20, 6) not null check (quantity_ml > 0),
	tests_requested text,
	idempotency_key text not null unique,
	taken_by text not null,
	taken_at timestamptz not null default now(),
	constraint wai_samples_taker_is_a_person check (taken_by like 'operator:%')
);
create index if not exists wai_samples_batch on wai_samples (batch_id, taken_at);

-- Where a sample has been: one line per hand-over, never changed afterwards.
create table if not exists wai_sample_events (
	id uuid primary key default gen_random_uuid(),
	sample_id uuid not null references wai_samples (id),
	event text not null
		check (event in ('taken', 'stored', 'dispatched', 'received_by_lab', 'report_received', 'disposed', 'note')),
	detail text,
	actor text not null,
	at timestamptz not null default now(),
	constraint wai_sample_events_actor_is_a_person check (actor like 'operator:%')
);
create index if not exists wai_sample_events_sample on wai_sample_events (sample_id, at);

-- A result as a laboratory reported it, typed in by a person from the report. It counts as evidence only once the owner has
-- verified it against the report. It is never edited: a correction is a new result that names the one it replaces.
create table if not exists wai_test_results (
	id uuid primary key default gen_random_uuid(),
	batch_id uuid not null references wai_batches (id),
	sample_id uuid references wai_samples (id),
	analyte text not null check (length(trim(analyte)) > 0),
	method text,
	-- Exactly what the report says ("12.3", "< 0.05", "not detected").
	reported_as text not null check (length(trim(reported_as)) > 0),
	-- The same thing as a number, when it is one. Null when the report gives words.
	value numeric(20, 6),
	-- The uncertainty the report states, plus or minus, in the same unit. Null when it states none.
	uncertainty numeric(20, 6) check (uncertainty is null or uncertainty >= 0),
	unit text not null check (length(trim(unit)) > 0),
	lab text not null check (length(trim(lab)) > 0),
	report_ref text not null check (length(trim(report_ref)) > 0),
	reported_on date not null,
	-- How it got here. Only 'manual' exists: a person typed it from the report.
	source text not null default 'manual' check (source in ('manual')),
	entered_by text not null,
	entered_at timestamptz not null default now(),
	verified_by text,
	verified_at timestamptz,
	replaces_id uuid references wai_test_results (id),
	correction_reason text,
	-- The owner's ruling on a result, with a reason. 'set_aside': kept and shown, but no longer compared with the
	-- specification. 'accepted': a result the workspace could not judge for itself (other units, another method, words
	-- instead of a number, an uncertainty that reaches past a limit) that the owner has decided meets the specification.
	ruling text check (ruling in ('set_aside', 'accepted')),
	ruled_by text,
	ruled_at timestamptz,
	ruling_reason text,
	constraint wai_test_results_enterer_is_a_person check (entered_by like 'operator:%'),
	constraint wai_test_results_verification_says_who check (
		(verified_by is null and verified_at is null) or (verified_by like 'operator:%' and verified_at is not null)
	),
	constraint wai_test_results_correction_explains_itself check (
		replaces_id is null or (correction_reason is not null and length(trim(correction_reason)) > 0)
	),
	constraint wai_test_results_ruling_says_who_and_why check (
		(ruling is null and ruled_by is null and ruled_at is null and ruling_reason is null)
		or (ruling is not null and ruled_by like 'operator:%' and ruled_at is not null and ruling_reason is not null
			and length(trim(ruling_reason)) > 0)
	)
);
create index if not exists wai_test_results_batch on wai_test_results (batch_id, entered_at);
-- A result is replaced at most once: a correction to a correction replaces the correction.
create unique index if not exists wai_test_results_replaced_once
	on wai_test_results (replaces_id) where replaces_id is not null;

-- Something that didn't go as it should have, and what is being done about it.
create table if not exists wai_deviations (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	batch_id uuid references wai_batches (id),
	title text not null check (length(trim(title)) > 0),
	description text not null check (length(trim(description)) > 0),
	severity text not null check (severity in ('minor', 'major', 'critical')),
	status text not null default 'open' check (status in ('open', 'closed')),
	opened_by text not null,
	opened_at timestamptz not null default now(),
	closed_by text,
	closed_at timestamptz,
	disposition text,
	constraint wai_deviations_opener_is_a_person check (opened_by like 'operator:%'),
	constraint wai_deviations_closing_says_who_and_what check (
		(status = 'open' and closed_by is null and closed_at is null and disposition is null)
		or (status = 'closed' and closed_by like 'operator:%' and closed_at is not null and disposition is not null
			and length(trim(disposition)) > 0)
	)
);
create index if not exists wai_deviations_batch on wai_deviations (batch_id, opened_at);
create index if not exists wai_deviations_open on wai_deviations (opened_at) where status = 'open';

-- The investigation, one entry at a time: what was contained, how far it reaches, what is suspected, what was established.
-- Entries are added and never changed, so a suspicion stays apart from a finding.
create table if not exists wai_deviation_entries (
	id uuid primary key default gen_random_uuid(),
	deviation_id uuid not null references wai_deviations (id),
	kind text not null check (kind in ('containment', 'scope', 'suspected_cause', 'established_finding', 'note')),
	body text not null check (length(trim(body)) > 0),
	actor text not null,
	at timestamptz not null default now(),
	constraint wai_deviation_entries_actor_is_a_person check (actor like 'operator:%')
);
create index if not exists wai_deviation_entries_deviation on wai_deviation_entries (deviation_id, at);

-- A corrective or preventive action. Marking it done is not the end: the owner verifies that it worked, with what showed it.
create table if not exists wai_corrective_actions (
	id uuid primary key default gen_random_uuid(),
	deviation_id uuid not null references wai_deviations (id),
	action text not null check (length(trim(action)) > 0),
	responsible text not null check (length(trim(responsible)) > 0),
	due_on date,
	status text not null default 'open' check (status in ('open', 'done', 'verified', 'cancelled')),
	created_by text not null,
	created_at timestamptz not null default now(),
	done_by text,
	done_at timestamptz,
	evidence text,
	verified_by text,
	verified_at timestamptz,
	effectiveness text,
	cancelled_by text,
	cancelled_at timestamptz,
	cancel_reason text,
	constraint wai_corrective_actions_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_corrective_actions_done_has_evidence check (
		status not in ('done', 'verified')
		or (done_by like 'operator:%' and done_at is not null and evidence is not null and length(trim(evidence)) > 0)
	),
	constraint wai_corrective_actions_verified_says_how check (
		status <> 'verified'
		or (verified_by like 'operator:%' and verified_at is not null and effectiveness is not null
			and length(trim(effectiveness)) > 0)
	),
	constraint wai_corrective_actions_cancelled_says_why check (
		status <> 'cancelled'
		or (cancelled_by like 'operator:%' and cancelled_at is not null and cancel_reason is not null
			and length(trim(cancel_reason)) > 0)
	)
);
create index if not exists wai_corrective_actions_deviation on wai_corrective_actions (deviation_id, created_at);

alter table wai_specifications enable row level security;
alter table wai_samples enable row level security;
alter table wai_sample_events enable row level security;
alter table wai_test_results enable row level security;
alter table wai_deviations enable row level security;
alter table wai_deviation_entries enable row level security;
alter table wai_corrective_actions enable row level security;
