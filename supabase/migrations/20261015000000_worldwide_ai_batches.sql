-- Worldwide AI, sixth migration: stored recipes and batch records for the E-Liquid Lab.
--
-- A recipe has versions, and a version is never changed once written: it carries the exact ingredients, strengths, carriers and
-- calculation it was written with. A batch is planned from an approved version, reserves the lots it will use through the
-- stock ledger, and records what was actually used and what came out.
--
-- A batch record here is a production record. Whether a batch may be released is a qualified person's decision and is not
-- recorded by this migration: every batch stays "awaiting review".
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '6' where key = 'schema_version' and value = '5';

create table if not exists wai_recipes (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	-- What it makes, in the business's own words ("Mango Ice 12 mg").
	product text,
	status text not null default 'active' check (status in ('active', 'retired')),
	created_by text not null,
	created_at timestamptz not null default now(),
	constraint wai_recipes_creator_is_a_person check (created_by like 'operator:%')
);
create unique index if not exists wai_recipes_name on wai_recipes (lower(name));

create table if not exists wai_recipe_versions (
	id uuid primary key default gen_random_uuid(),
	recipe_id uuid not null references wai_recipes (id),
	version integer not null check (version >= 1),
	-- The whole formula as it was written: ingredient ids and names, strengths, carriers, percentages, densities. json, not
	-- jsonb: the checksum is of this text in this order.
	formula json not null,
	formula_sha256 text not null,
	-- Which version of the calculation the formula was checked with.
	calc_version integer not null,
	state text not null default 'draft' check (state in ('draft', 'approved', 'retired')),
	created_by text not null,
	created_at timestamptz not null default now(),
	approved_by text,
	approved_at timestamptz,
	constraint wai_recipe_versions_one_per_number unique (recipe_id, version),
	constraint wai_recipe_versions_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_recipe_versions_approver_is_a_person check (approved_by is null or approved_by like 'operator:%'),
	constraint wai_recipe_versions_approved_says_who
		check (state <> 'approved' or (approved_by is not null and approved_at is not null))
);

create table if not exists wai_batches (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	recipe_version_id uuid not null references wai_recipe_versions (id),
	planned_ml numeric(20, 6) not null check (planned_ml > 0),
	status text not null default 'planned' check (status in ('planned', 'reserved', 'completed', 'cancelled')),
	-- What the plan calls for, calculated when the batch was planned and never recalculated afterwards.
	plan json not null,
	plan_sha256 text not null,
	-- The nominal volume the ingredients add up to. The measured yield is entered by a person and may differ.
	expected_yield_ml numeric(20, 6) not null,
	actual_yield_ml numeric(20, 6) check (actual_yield_ml is null or actual_yield_ml >= 0),
	waste_ml numeric(20, 6) check (waste_ml is null or waste_ml >= 0),
	samples_ml numeric(20, 6) check (samples_ml is null or samples_ml >= 0),
	notes text,
	-- Release is a qualified person's decision, made elsewhere. Nothing here releases a batch.
	quality_status text not null default 'awaiting_review' check (quality_status in ('awaiting_review')),
	planned_by text not null,
	planned_at timestamptz not null default now(),
	reserved_by text,
	reserved_at timestamptz,
	completed_by text,
	completed_at timestamptz,
	cancelled_by text,
	cancelled_at timestamptz,
	cancel_reason text,
	constraint wai_batches_planner_is_a_person check (planned_by like 'operator:%'),
	constraint wai_batches_people_only check (
		(reserved_by is null or reserved_by like 'operator:%')
		and (completed_by is null or completed_by like 'operator:%')
		and (cancelled_by is null or cancelled_by like 'operator:%')
	),
	constraint wai_batches_completed_has_yield
		check (status <> 'completed' or (actual_yield_ml is not null and completed_by is not null and completed_at is not null)),
	constraint wai_batches_cancelled_says_why
		check (status <> 'cancelled' or (cancelled_by is not null and cancel_reason is not null))
);
create index if not exists wai_batches_recent on wai_batches (planned_at desc);

-- Which lot each part of a batch comes from. Every quantity here is backed by a line in the stock ledger.
create table if not exists wai_batch_allocations (
	id uuid primary key default gen_random_uuid(),
	batch_id uuid not null references wai_batches (id),
	-- Which line of the plan this serves: 'base', 'pg', 'vg', or 'flavour:<ingredient id>'.
	line_key text not null,
	ingredient_id uuid not null references wai_ingredients (id),
	lot_id uuid not null references wai_ingredient_lots (id),
	-- What the plan needs from this lot, in millilitres.
	required_ml numeric(20, 6) not null check (required_ml > 0),
	-- The same amount in the lot's own unit. For a lot counted in grams it is calculated with the lot's documented density.
	reserved_quantity numeric(20, 6) not null check (reserved_quantity > 0),
	unit text not null check (unit in ('mL', 'g')),
	basis text not null check (basis in ('measured', 'calculated')),
	-- What was actually used, entered by a person when the batch is completed.
	used_quantity numeric(20, 6) check (used_quantity is null or used_quantity >= 0),
	reservation_movement_id uuid not null references wai_stock_movements (id),
	consumption_movement_id uuid references wai_stock_movements (id),
	release_movement_id uuid references wai_stock_movements (id),
	constraint wai_batch_allocations_one_per_lot unique (batch_id, line_key, lot_id)
);
create index if not exists wai_batch_allocations_batch on wai_batch_allocations (batch_id);

alter table wai_recipes enable row level security;
alter table wai_recipe_versions enable row level security;
alter table wai_batches enable row level security;
alter table wai_batch_allocations enable row level security;
