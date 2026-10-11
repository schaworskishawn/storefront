-- Worldwide AI, eleventh migration: the RFID and NFC tag registry.
--
-- A tag is registered once under the identifier it reports. What it is attached to is an assignment, kept as history: a tag
-- has at most one assignment at a time, and an ended one is never changed. A scan is stored as an observation and nothing
-- more: it moves no stock and proves nothing about where a thing is, whose it is, or whether it is genuine. A tag nobody
-- registered, or one that was revoked or retired, turns a scan into an exception for a person to resolve.
--
-- No reader is connected by this migration, and nothing here verifies a tag cryptographically.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '11' where key = 'schema_version' and value = '10';

create table if not exists wai_tags (
	id uuid primary key default gen_random_uuid(),
	technology text not null check (technology in ('uhf_rfid', 'nfc')),
	-- The identifier as the tag reports it (EPC or UID), upper-case hexadecimal with no separators.
	tag_uid text not null check (tag_uid ~ '^[0-9A-F]+$'),
	-- What the tag itself can do. 'cryptographic' says the tag supports it, not that anything here checks it.
	security text not null check (security in ('plain', 'password', 'cryptographic')),
	status text not null default 'active' check (status in ('active', 'retired', 'revoked')),
	status_reason text,
	status_changed_by text,
	status_changed_at timestamptz,
	-- Where the tag came from: the roll, the order, the supplier.
	source_ref text,
	note text,
	registered_by text not null,
	registered_at timestamptz not null default now(),
	-- A person read the tag and confirmed the identifier on record is the one it reports.
	verified_by text,
	verified_at timestamptz,
	unique (technology, tag_uid),
	constraint wai_tags_registrar_is_a_person check (registered_by like 'operator:%'),
	constraint wai_tags_status_says_why
		check (status = 'active' or (status_reason is not null and length(trim(status_reason)) > 0)),
	constraint wai_tags_verification_says_who check (
		(verified_by is null and verified_at is null) or (verified_by like 'operator:%' and verified_at is not null)
	)
);

-- What a tag is attached to, over time.
create table if not exists wai_tag_assignments (
	id uuid primary key default gen_random_uuid(),
	tag_id uuid not null references wai_tags (id),
	subject_kind text not null
		check (subject_kind in ('product_unit', 'carton', 'case', 'container', 'location', 'equipment', 'tote')),
	-- What it is, in the business's words: a product name, "Shelf B2", "Tote 14".
	subject_ref text not null check (length(trim(subject_ref)) > 0),
	sku text,
	lot text,
	serial text,
	-- The tagged carton, case, container or tote this is inside.
	parent_tag_id uuid references wai_tags (id),
	equipment_id uuid references wai_equipment (id),
	packaging_run_id uuid references wai_packaging_runs (id),
	-- How many units a carton or case holds. It comes from a manifest or packing list, named beside it, never from the tag.
	units_declared integer check (units_declared is null or units_declared > 0),
	units_source text,
	assigned_by text not null,
	assigned_at timestamptz not null default now(),
	ended_by text,
	ended_at timestamptz,
	end_reason text,
	constraint wai_tag_assignments_assigner_is_a_person check (assigned_by like 'operator:%'),
	constraint wai_tag_assignments_not_its_own_parent check (parent_tag_id is null or parent_tag_id <> tag_id),
	constraint wai_tag_assignments_units_name_their_source check (
		units_declared is null or (units_source is not null and length(trim(units_source)) > 0)
	),
	constraint wai_tag_assignments_end_says_who_and_why check (
		(ended_by is null and ended_at is null and end_reason is null)
		or (ended_by like 'operator:%' and ended_at is not null and end_reason is not null and length(trim(end_reason)) > 0)
	)
);
-- One thing at a time.
create unique index if not exists wai_tag_assignments_one_current
	on wai_tag_assignments (tag_id) where ended_at is null;
create index if not exists wai_tag_assignments_tag on wai_tag_assignments (tag_id, assigned_at);
create index if not exists wai_tag_assignments_parent on wai_tag_assignments (parent_tag_id) where ended_at is null;

-- Something a scan showed that the registry can't account for. A person resolves it, saying how.
create table if not exists wai_tag_exceptions (
	id uuid primary key default gen_random_uuid(),
	technology text not null check (technology in ('uhf_rfid', 'nfc')),
	tag_uid text not null,
	kind text not null check (kind in ('unknown_tag', 'revoked_seen', 'retired_seen')),
	detail text not null,
	status text not null default 'open' check (status in ('open', 'resolved')),
	raised_at timestamptz not null default now(),
	-- How many scans have shown it since it was raised.
	seen integer not null default 1 check (seen > 0),
	last_seen_at timestamptz not null default now(),
	resolved_by text,
	resolved_at timestamptz,
	resolution text,
	constraint wai_tag_exceptions_resolution_says_who_and_how check (
		(status = 'open' and resolved_by is null and resolved_at is null and resolution is null)
		or (status = 'resolved' and resolved_by like 'operator:%' and resolved_at is not null and resolution is not null
			and length(trim(resolution)) > 0)
	)
);
-- One open exception of a kind per tag: more scans of it add to the count, not to the list.
create unique index if not exists wai_tag_exceptions_one_open
	on wai_tag_exceptions (technology, tag_uid, kind) where status = 'open';

-- A scan, as an observation: this tag was read at this station at this time. Nothing else follows from it.
create table if not exists wai_scan_events (
	id uuid primary key default gen_random_uuid(),
	-- The reader's own id for the read, or one made for a scan typed in. The same id arriving twice is one observation.
	event_id text not null unique,
	technology text not null check (technology in ('uhf_rfid', 'nfc')),
	tag_uid text not null,
	tag_id uuid references wai_tags (id),
	station text not null check (length(trim(station)) > 0),
	workflow text not null check (workflow in ('receiving', 'cycle_count', 'picking', 'shipping', 'lookup', 'other')),
	-- 'simulated' is a made-up read for a demonstration or a test. It is never mixed with real ones unlabelled.
	source text not null check (source in ('manual', 'reader_export', 'simulated')),
	evidence text,
	observed_at timestamptz not null,
	received_at timestamptz not null default now(),
	exception_id uuid references wai_tag_exceptions (id),
	operator text not null,
	constraint wai_scan_events_operator_is_a_person check (operator like 'operator:%')
);
create index if not exists wai_scan_events_tag on wai_scan_events (technology, tag_uid, observed_at);
create index if not exists wai_scan_events_received on wai_scan_events (received_at);

alter table wai_tags enable row level security;
alter table wai_tag_assignments enable row level security;
alter table wai_tag_exceptions enable row level security;
alter table wai_scan_events enable row level security;
