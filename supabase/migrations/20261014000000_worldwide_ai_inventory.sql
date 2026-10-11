-- Worldwide AI, fifth migration: the E-Liquid Lab's ingredient inventory.
--
-- Ingredients, the lots they arrive in, and an append-only ledger of every movement of stock. A lot has one unit that it is
-- counted in (mL, grams, or each), so volume and weight never become two balances that drift apart. Nothing in the ledger is
-- ever edited or deleted: a mistake is put right with a correction, which is another line.
--
-- These records are the workspace's own. Saleor stays the only authority for sellable stock, and nothing here is sent to it.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '5' where key = 'schema_version' and value = '4';

create table if not exists wai_ingredients (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	supplier text,
	sku text,
	category text not null
		check (category in ('nicotine_base', 'flavour', 'pg', 'vg', 'additive', 'packaging', 'other')),
	-- For a nicotine base: its strength and what kind it is (freebase, salt). Null where it doesn't apply or isn't documented.
	nicotine_mg_per_ml numeric(12, 4) check (nicotine_mg_per_ml is null or nicotine_mg_per_ml >= 0),
	nicotine_type text,
	-- What the ingredient is carried in, as documented by the supplier. Null means not documented: it is never assumed to be
	-- all PG.
	pg_percent numeric(7, 4) check (pg_percent is null or (pg_percent >= 0 and pg_percent <= 100)),
	vg_percent numeric(7, 4) check (vg_percent is null or (vg_percent >= 0 and vg_percent <= 100)),
	carrier_source text,
	-- Below this much usable stock across its lots, the ingredient is reported as low. In the unit its lots are counted in.
	min_stock numeric(20, 6) check (min_stock is null or min_stock >= 0),
	min_stock_unit text check (min_stock_unit is null or min_stock_unit in ('mL', 'g', 'each')),
	status text not null default 'active' check (status in ('active', 'retired')),
	notes text,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint wai_ingredients_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_ingredients_carrier_adds_up check (coalesce(pg_percent, 0) + coalesce(vg_percent, 0) <= 100)
);
create unique index if not exists wai_ingredients_sku on wai_ingredients (lower(sku)) where sku is not null;
create index if not exists wai_ingredients_name on wai_ingredients (lower(name));

create table if not exists wai_ingredient_lots (
	id uuid primary key default gen_random_uuid(),
	ingredient_id uuid not null references wai_ingredients (id),
	-- The supplier's own lot or batch number, as printed on the container.
	lot_code text not null,
	-- The one unit this lot is counted in. Every movement of this lot is in this unit.
	unit text not null check (unit in ('mL', 'g', 'each')),
	received_on date,
	opened_on date,
	expires_on date,
	review_on date,
	location text,
	-- A documented density lets the other unit be shown. Without one the other unit is unavailable, never assumed.
	density_g_per_ml numeric(12, 6) check (density_g_per_ml is null or density_g_per_ml > 0),
	density_temp_c numeric(6, 2),
	density_source text,
	cost_per_unit numeric(20, 6) check (cost_per_unit is null or cost_per_unit >= 0),
	currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
	-- A quarantined lot is on hand but none of it is usable.
	status text not null default 'available' check (status in ('available', 'quarantined', 'retired')),
	-- The running balances. They are kept in step with the ledger inside the same transaction, and the constraints below make
	-- a negative balance or an over-reservation impossible whatever the application does.
	on_hand numeric(20, 6) not null default 0,
	reserved numeric(20, 6) not null default 0,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint wai_lots_one_per_code unique (ingredient_id, lot_code),
	constraint wai_lots_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_lots_never_negative check (on_hand >= 0 and reserved >= 0),
	constraint wai_lots_reserved_is_on_hand check (reserved <= on_hand),
	constraint wai_lots_density_only_for_liquids check (density_g_per_ml is null or unit in ('mL', 'g'))
);
create index if not exists wai_lots_ingredient on wai_ingredient_lots (ingredient_id, expires_on);

-- The ledger. One line per movement, never changed afterwards.
create table if not exists wai_stock_movements (
	id uuid primary key default gen_random_uuid(),
	lot_id uuid not null references wai_ingredient_lots (id),
	kind text not null check (
		kind in ('receipt', 'reservation', 'reservation_release', 'consumption', 'return', 'waste', 'transfer',
			'correction', 'quarantine', 'quarantine_release')
	),
	-- The size of the movement, always positive, in the lot's unit. Zero only for a movement that moves no quantity.
	quantity numeric(20, 6) not null check (quantity >= 0),
	unit text not null check (unit in ('mL', 'g', 'each')),
	-- What it did to each balance. A correction may be negative; everything else follows from its kind.
	delta_on_hand numeric(20, 6) not null,
	delta_reserved numeric(20, 6) not null,
	-- The balances straight after this line, so the ledger can be read on its own and checked against the lot.
	on_hand_after numeric(20, 6) not null check (on_hand_after >= 0),
	reserved_after numeric(20, 6) not null check (reserved_after >= 0),
	-- How the quantity is known: measured directly, calculated from a documented density, or an approved estimate.
	basis text not null default 'measured' check (basis in ('measured', 'calculated', 'estimate')),
	-- A second, direct measurement in the other unit, kept beside the first when both were taken.
	other_quantity numeric(20, 6) check (other_quantity is null or other_quantity >= 0),
	other_unit text check (other_unit is null or other_unit in ('mL', 'g')),
	reason text,
	-- What it was for: a batch code, a purchase order, a count sheet.
	reference text,
	from_location text,
	to_location text,
	-- The same request arriving twice is one movement, not two.
	idempotency_key text not null unique,
	actor text not null,
	at timestamptz not null default now(),
	-- Agents prepare proposals. Only a person moves stock.
	constraint wai_movements_actor_is_a_person check (actor like 'operator:%'),
	constraint wai_movements_explains_itself
		check (kind not in ('correction', 'waste', 'quarantine', 'quarantine_release') or (reason is not null and length(trim(reason)) > 0)),
	constraint wai_movements_moves_something
		check (quantity > 0 or kind in ('transfer', 'quarantine', 'quarantine_release'))
);
create index if not exists wai_movements_lot on wai_stock_movements (lot_id, at desc);
create index if not exists wai_movements_recent on wai_stock_movements (at desc);

alter table wai_ingredients enable row level security;
alter table wai_ingredient_lots enable row level security;
alter table wai_stock_movements enable row level security;
