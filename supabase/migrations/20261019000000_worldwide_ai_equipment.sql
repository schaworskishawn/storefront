-- Worldwide AI, tenth migration: equipment and calibration, cleaning and line-clearance records, and training.
--
-- These are records of what people did, with the evidence they named. They let the workspace refuse a step in software:
-- equipment that is out of service or out of calibration can't be recorded against a batch, a failed calibration puts the
-- batches measured since the last good one on hold, and, where the owner has set a requirement, a person without verified,
-- current training can't record a batch as made or a packaging run.
--
-- Nothing here controls a machine, reads an instrument, or shows that anything was physically done.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '10' where key = 'schema_version' and value = '9';

create table if not exists wai_equipment (
	id uuid primary key default gen_random_uuid(),
	code text not null,
	name text not null check (length(trim(name)) > 0),
	kind text not null check (kind in ('scale', 'mixer', 'filler', 'instrument', 'other')),
	location text,
	-- How often it has to be calibrated. Null when it needs no calibration.
	calibration_interval_days integer check (calibration_interval_days is null or calibration_interval_days > 0),
	status text not null default 'in_service' check (status in ('in_service', 'out_of_service')),
	status_reason text,
	status_changed_by text,
	status_changed_at timestamptz,
	created_by text not null,
	created_at timestamptz not null default now(),
	constraint wai_equipment_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_equipment_out_of_service_says_why
		check (status = 'in_service' or (status_reason is not null and length(trim(status_reason)) > 0))
);
create unique index if not exists wai_equipment_code on wai_equipment (lower(code));

-- A calibration as it was carried out, with the certificate or reference standard it rests on. Never changed afterwards.
create table if not exists wai_calibrations (
	id uuid primary key default gen_random_uuid(),
	equipment_id uuid not null references wai_equipment (id),
	performed_on date not null,
	result text not null check (result in ('pass', 'fail')),
	certificate text not null check (length(trim(certificate)) > 0),
	performed_by text not null check (length(trim(performed_by)) > 0),
	due_on date,
	notes text,
	recorded_by text not null,
	recorded_at timestamptz not null default now(),
	constraint wai_calibrations_recorder_is_a_person check (recorded_by like 'operator:%'),
	constraint wai_calibrations_due_is_later check (due_on is null or due_on > performed_on)
);
create index if not exists wai_calibrations_equipment on wai_calibrations (equipment_id, performed_on);

-- Which equipment a batch was made or measured with.
create table if not exists wai_equipment_use (
	id uuid primary key default gen_random_uuid(),
	equipment_id uuid not null references wai_equipment (id),
	batch_id uuid not null references wai_batches (id),
	purpose text not null check (length(trim(purpose)) > 0),
	used_on date not null,
	recorded_by text not null,
	recorded_at timestamptz not null default now(),
	constraint wai_equipment_use_recorder_is_a_person check (recorded_by like 'operator:%')
);
create unique index if not exists wai_equipment_use_once on wai_equipment_use (equipment_id, batch_id, lower(purpose));
create index if not exists wai_equipment_use_batch on wai_equipment_use (batch_id);

-- A cleaning or a line clearance, as a person recorded it, and (optionally) a second person's verification.
create table if not exists wai_cleaning_records (
	id uuid primary key default gen_random_uuid(),
	equipment_id uuid references wai_equipment (id),
	area text,
	kind text not null check (kind in ('cleaning', 'line_clearance')),
	procedure text not null check (length(trim(procedure)) > 0),
	detail text not null check (length(trim(detail)) > 0),
	done_by text not null,
	done_at timestamptz not null default now(),
	verified_by text,
	verified_at timestamptz,
	constraint wai_cleaning_records_says_where
		check (equipment_id is not null or (area is not null and length(trim(area)) > 0)),
	constraint wai_cleaning_records_doer_is_a_person check (done_by like 'operator:%'),
	constraint wai_cleaning_records_verified_by_someone_else check (
		(verified_by is null and verified_at is null)
		or (verified_by like 'operator:%' and verified_at is not null and verified_by <> done_by)
	)
);
create index if not exists wai_cleaning_records_equipment on wai_cleaning_records (equipment_id, done_at);

-- Training a person completed, with where the evidence is. It counts once the owner has verified it.
create table if not exists wai_training_records (
	id uuid primary key default gen_random_uuid(),
	person text not null check (length(trim(person)) > 0),
	-- The person's sign-in, when they have one. Only a record tied to a sign-in can satisfy a requirement.
	person_key text check (person_key is null or person_key like 'operator:%'),
	topic text not null check (length(trim(topic)) > 0),
	completed_on date not null,
	valid_until date,
	evidence text not null check (length(trim(evidence)) > 0),
	recorded_by text not null,
	recorded_at timestamptz not null default now(),
	verified_by text,
	verified_at timestamptz,
	constraint wai_training_records_recorder_is_a_person check (recorded_by like 'operator:%'),
	constraint wai_training_records_validity_is_later check (valid_until is null or valid_until >= completed_on),
	constraint wai_training_records_verification_says_who check (
		(verified_by is null and verified_at is null) or (verified_by like 'operator:%' and verified_at is not null)
	)
);
create index if not exists wai_training_records_person on wai_training_records (person_key, topic);

-- Training the owner requires before a controlled step can be recorded. With none set, nothing is gated.
create table if not exists wai_training_requirements (
	id uuid primary key default gen_random_uuid(),
	step text not null check (step in ('make_batch', 'package_batch')),
	topic text not null check (length(trim(topic)) > 0),
	set_by text not null,
	set_at timestamptz not null default now(),
	constraint wai_training_requirements_setter_is_a_person check (set_by like 'operator:%')
);
create unique index if not exists wai_training_requirements_once on wai_training_requirements (step, lower(topic));

alter table wai_equipment enable row level security;
alter table wai_calibrations enable row level security;
alter table wai_equipment_use enable row level security;
alter table wai_cleaning_records enable row level security;
alter table wai_training_records enable row level security;
alter table wai_training_requirements enable row level security;
