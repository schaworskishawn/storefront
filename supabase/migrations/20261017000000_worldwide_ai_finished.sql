-- Worldwide AI, eighth migration: finished liquid, packaging runs, quality holds and the release decision.
--
-- When a batch is recorded as made, what was measured coming out becomes its bulk liquid. Bulk is drawn down by packaging
-- runs, samples and waste through its own append-only ledger, so the same liquid is never counted twice. A packaging run
-- records what was filled, from which bulk, with which packaging lots and label version, after a recorded line clearance.
--
-- Release is a decision by a person, recorded with what was checked. It makes stock eligible in this workspace only: nothing
-- here publishes a product or changes sellable stock in Saleor.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '8' where key = 'schema_version' and value = '7';

-- What is left of a batch's bulk liquid. Null until the batch has been made.
alter table wai_batches add column if not exists bulk_remaining_ml numeric(20, 6)
	check (bulk_remaining_ml is null or bulk_remaining_ml >= 0);

-- The release decision. Until now every batch stayed 'awaiting_review'.
alter table wai_batches drop constraint if exists wai_batches_quality_status_check;
alter table wai_batches add constraint wai_batches_quality_status_check
	check (quality_status in ('awaiting_review', 'released', 'rejected'));
alter table wai_batches add column if not exists decided_by text;
alter table wai_batches add column if not exists decided_at timestamptz;
alter table wai_batches add column if not exists decision_note text;
-- What the application checked and what the person confirmed, exactly as they stood when the decision was made.
alter table wai_batches add column if not exists decision_record jsonb;
alter table wai_batches drop constraint if exists wai_batches_decision_says_who;
alter table wai_batches add constraint wai_batches_decision_says_who check (
	quality_status = 'awaiting_review'
	or (decided_by like 'operator:%' and decided_at is not null and decision_note is not null and decision_record is not null)
);
-- Only a batch that was made can be decided.
alter table wai_batches drop constraint if exists wai_batches_decided_was_made;
alter table wai_batches add constraint wai_batches_decided_was_made
	check (quality_status = 'awaiting_review' or status = 'completed');

-- The ledger of a batch's bulk liquid. One line per movement, never changed afterwards.
create table if not exists wai_bulk_movements (
	id uuid primary key default gen_random_uuid(),
	batch_id uuid not null references wai_batches (id),
	kind text not null check (kind in ('produced', 'packaged', 'sample', 'waste', 'correction')),
	quantity_ml numeric(20, 6) not null check (quantity_ml > 0),
	delta_ml numeric(20, 6) not null,
	remaining_after_ml numeric(20, 6) not null check (remaining_after_ml >= 0),
	reason text,
	reference text,
	idempotency_key text not null unique,
	actor text not null,
	at timestamptz not null default now(),
	constraint wai_bulk_movements_actor_is_a_person check (actor like 'operator:%'),
	constraint wai_bulk_movements_explains_itself
		check (kind not in ('waste', 'correction', 'sample') or (reason is not null and length(trim(reason)) > 0))
);
create index if not exists wai_bulk_movements_batch on wai_bulk_movements (batch_id, at);

-- A hold on a batch. While one is open the batch can't be packaged or released.
create table if not exists wai_quality_holds (
	id uuid primary key default gen_random_uuid(),
	batch_id uuid not null references wai_batches (id),
	reason text not null check (length(trim(reason)) > 0),
	placed_by text not null,
	placed_at timestamptz not null default now(),
	lifted_by text,
	lifted_at timestamptz,
	lift_reason text,
	constraint wai_quality_holds_placer_is_a_person check (placed_by like 'operator:%'),
	constraint wai_quality_holds_lift_says_who_and_why check (
		(lifted_by is null and lifted_at is null and lift_reason is null)
		or (lifted_by like 'operator:%' and lifted_at is not null and lift_reason is not null and length(trim(lift_reason)) > 0)
	)
);
create index if not exists wai_quality_holds_batch on wai_quality_holds (batch_id, placed_at);

-- A packaging run: bulk liquid filled into units. The run is also the packaged lot.
create table if not exists wai_packaging_runs (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	batch_id uuid not null references wai_batches (id),
	-- The product this fills, as it is known in the store. A label only: nothing is sent to Saleor.
	sku text not null,
	bottle_ml numeric(20, 6) not null check (bottle_ml > 0),
	units_filled integer not null check (units_filled > 0),
	units_rejected integer not null default 0 check (units_rejected >= 0),
	-- What actually left the bulk, as measured. It is entered, never taken to be units times bottle size.
	bulk_used_ml numeric(20, 6) not null check (bulk_used_ml > 0),
	label_version text not null check (length(trim(label_version)) > 0),
	-- What was checked before the run to confirm the previous product's materials and labels were gone.
	line_clearance text not null check (length(trim(line_clearance)) > 0),
	-- The packaging lots used and how many of each, as recorded in the stock ledger.
	components jsonb not null default '[]'::jsonb,
	notes text,
	idempotency_key text not null unique,
	run_by text not null,
	run_at timestamptz not null default now(),
	constraint wai_packaging_runs_operator_is_a_person check (run_by like 'operator:%')
);
create index if not exists wai_packaging_runs_batch on wai_packaging_runs (batch_id, run_at);

alter table wai_bulk_movements enable row level security;
alter table wai_quality_holds enable row level security;
alter table wai_packaging_runs enable row level security;
