-- Worldwide AI, fifteenth migration: compliance records. A rule register, a licence calendar, an excise stamp ledger and
-- saved recall checks.
--
-- None of this decides what the law requires. A rule is what a person recorded from a source, with the dates it was read
-- and takes effect; it guides nothing until the owner approves a version of it with a decision on whether it applies here.
-- A licence is what is on the licence, as entered. The stamp ledger records what people did with stamps they hold: nothing
-- here orders, makes, reproduces or disposes of a stamp, and a damaged stamp stays damaged until a disposal is recorded with
-- its authorization.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '15' where key = 'schema_version' and value = '14';

-- A requirement the business tracks, under a short code. What it says lives in its versions.
create table if not exists wai_compliance_rules (
	id uuid primary key default gen_random_uuid(),
	code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,47}$'),
	title text not null check (length(trim(title)) > 0),
	jurisdiction text not null check (length(trim(jurisdiction)) > 0),
	-- Who looks after it: a person's name or a role, as written.
	owner_label text not null check (length(trim(owner_label)) > 0),
	status text not null default 'active' check (status in ('active', 'withdrawn')),
	withdrawn_reason text,
	created_by text not null,
	created_at timestamptz not null default now(),
	constraint wai_compliance_rules_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_compliance_rules_withdrawal_says_why
		check (status = 'active' or (withdrawn_reason is not null and length(trim(withdrawn_reason)) > 0))
);

-- One reading of a rule. A draft guides nothing. Approving one supersedes the version that was approved before it.
create table if not exists wai_compliance_rule_versions (
	id uuid primary key default gen_random_uuid(),
	rule_id uuid not null references wai_compliance_rules (id),
	version integer not null check (version > 0),
	kind text not null check (kind in ('law', 'guidance', 'internal_policy', 'unresolved_interpretation')),
	source_title text not null check (length(trim(source_title)) > 0),
	source_url text check (source_url is null or source_url ~ '^https://'),
	retrieved_on date,
	published_on date,
	effective_from date,
	effective_to date,
	-- What it asks of the business, in a person's own words. Not a quotation of the source.
	summary text not null check (length(trim(summary)) > 0),
	applicability text not null default 'undecided' check (applicability in ('applies', 'does_not_apply', 'undecided')),
	applicability_reason text,
	review_every_days integer check (review_every_days is null or review_every_days between 1 and 1825),
	next_review_on date,
	status text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'rejected')),
	drafted_by text not null,
	drafted_at timestamptz not null default now(),
	reviewed_by text,
	reviewed_at timestamptz,
	review_note text,
	constraint wai_rule_versions_one_number unique (rule_id, version),
	constraint wai_rule_versions_drafter_is_a_person check (drafted_by like 'operator:%'),
	constraint wai_rule_versions_dates_in_order
		check (effective_to is null or effective_from is null or effective_to >= effective_from),
	-- An approved reading says whether it applies, why, from when, and when it is next looked at, and who approved it.
	constraint wai_rule_versions_approval_is_complete check (
		status in ('draft')
		or (reviewed_by like 'operator:%' and reviewed_at is not null and review_note is not null and length(trim(review_note)) > 0)
	),
	constraint wai_rule_versions_approved_is_decided check (
		status not in ('approved', 'superseded')
		or (applicability in ('applies', 'does_not_apply') and applicability_reason is not null
			and length(trim(applicability_reason)) > 0 and effective_from is not null and next_review_on is not null)
	)
);
create index if not exists wai_rule_versions_rule on wai_compliance_rule_versions (rule_id, version desc);
-- At most one approved reading of a rule at a time.
create unique index if not exists wai_rule_versions_one_approved
	on wai_compliance_rule_versions (rule_id) where status = 'approved';

-- A licence, registration or permit the business holds or has applied for, as it reads on the document.
create table if not exists wai_licences (
	id uuid primary key default gen_random_uuid(),
	name text not null check (length(trim(name)) > 0),
	authority text not null check (length(trim(authority)) > 0),
	reference text,
	scope text not null check (length(trim(scope)) > 0),
	premises text,
	responsible text not null check (length(trim(responsible)) > 0),
	security_obligations text,
	evidence text,
	status text not null default 'held' check (status in ('applied_for', 'held', 'surrendered', 'refused')),
	issued_on date,
	expires_on date,
	-- When the renewal has to be in, if the licence says so. Never filled in from a rule of thumb.
	renew_by date,
	remind_days integer not null default 60 check (remind_days between 0 and 365),
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint wai_licences_creator_is_a_person check (created_by like 'operator:%'),
	constraint wai_licences_dates_in_order check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

-- What happened to a licence: recorded, renewed, changed, surrendered. Never changed afterwards.
create table if not exists wai_licence_events (
	id uuid primary key default gen_random_uuid(),
	licence_id uuid not null references wai_licences (id),
	kind text not null check (kind in ('recorded', 'renewed', 'changed', 'status')),
	-- The fields as they were before and after.
	before jsonb,
	after jsonb not null,
	note text,
	actor text not null,
	at timestamptz not null default now(),
	constraint wai_licence_events_actor_is_a_person check (actor like 'operator:%')
);
create index if not exists wai_licence_events_licence on wai_licence_events (licence_id, at);

-- A question about what a licence covers, open until a person answers it.
create table if not exists wai_licence_questions (
	id uuid primary key default gen_random_uuid(),
	licence_id uuid not null references wai_licences (id),
	question text not null check (length(trim(question)) > 0),
	raised_by text not null,
	raised_at timestamptz not null default now(),
	answer text,
	answered_by text,
	answered_at timestamptz,
	constraint wai_licence_questions_people_only
		check (raised_by like 'operator:%' and (answered_by is null or answered_by like 'operator:%')),
	constraint wai_licence_questions_answer_says_who
		check ((answer is null and answered_by is null and answered_at is null)
			or (answer is not null and length(trim(answer)) > 0 and answered_by is not null and answered_at is not null))
);
create index if not exists wai_licence_questions_licence on wai_licence_questions (licence_id, raised_at);

-- Excise stamps received, one record per receipt. The counts by state always add up to what was received.
create table if not exists wai_stamp_stocks (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	-- As issued: the jurisdiction the stamps are for, and the licensee they were issued to.
	jurisdiction text not null check (length(trim(jurisdiction)) > 0),
	authorized_entity text not null check (length(trim(authorized_entity)) > 0),
	source_document text not null check (length(trim(source_document)) > 0),
	-- The printed identifiers, when the stamps carry a run of them: a prefix and the first and last number.
	serial_prefix text not null default '',
	serial_from bigint,
	serial_to bigint,
	quantity integer not null check (quantity > 0),
	received_on date not null,
	location text not null check (length(trim(location)) > 0),
	available integer not null check (available >= 0),
	reserved integer not null default 0 check (reserved >= 0),
	applied integer not null default 0 check (applied >= 0),
	damaged integer not null default 0 check (damaged >= 0),
	returned integer not null default 0 check (returned >= 0),
	disposed integer not null default 0 check (disposed >= 0),
	lost integer not null default 0 check (lost >= 0),
	idempotency_key text not null unique,
	received_by text not null,
	received_at timestamptz not null default now(),
	constraint wai_stamp_stocks_receiver_is_a_person check (received_by like 'operator:%'),
	constraint wai_stamp_stocks_range_is_whole check (
		(serial_from is null and serial_to is null)
		or (serial_from is not null and serial_to is not null and serial_from >= 0 and serial_to >= serial_from
			and serial_to - serial_from + 1 = quantity)
	),
	constraint wai_stamp_stocks_adds_up
		check (available + reserved + applied + damaged + returned + disposed + lost = quantity)
);
create index if not exists wai_stamp_stocks_jurisdiction on wai_stamp_stocks (jurisdiction, serial_prefix, serial_from);

-- The stamp ledger. One line per thing a person did with stamps, never changed afterwards.
create table if not exists wai_stamp_events (
	id uuid primary key default gen_random_uuid(),
	stock_id uuid not null references wai_stamp_stocks (id),
	kind text not null check (kind in (
		'received', 'moved', 'reserved', 'unreserved', 'applied', 'damaged', 'returned', 'disposed', 'lost', 'found'
	)),
	quantity integer not null check (quantity >= 0),
	from_state text,
	to_state text,
	-- The identifiers applied, when the stock has a run of them.
	serial_from bigint,
	serial_to bigint,
	packaging_run_id uuid references wai_packaging_runs (id),
	location text,
	-- For a return or a disposal: who allowed it and what shows it happened.
	authorization_ref text,
	evidence text,
	reason text,
	idempotency_key text not null unique,
	actor text not null,
	at timestamptz not null default now(),
	constraint wai_stamp_events_actor_is_a_person check (actor like 'operator:%'),
	constraint wai_stamp_events_range_is_whole check (
		(serial_from is null and serial_to is null)
		or (serial_from is not null and serial_to is not null and serial_to >= serial_from and serial_to - serial_from + 1 = quantity)
	),
	constraint wai_stamp_events_applied_names_a_run check (kind <> 'applied' or packaging_run_id is not null),
	constraint wai_stamp_events_disposal_is_authorized check (
		kind <> 'disposed' or (authorization_ref is not null and length(trim(authorization_ref)) > 0
			and evidence is not null and length(trim(evidence)) > 0)
	)
);
create index if not exists wai_stamp_events_stock on wai_stamp_events (stock_id, at);
create index if not exists wai_stamp_events_run on wai_stamp_events (packaging_run_id) where packaging_run_id is not null;

-- A recall trace, saved as it stood when a person ran it, with whatever holds it placed.
create table if not exists wai_recall_checks (
	id uuid primary key default gen_random_uuid(),
	start_kind text not null check (start_kind in ('ingredient_lot', 'batch', 'packaging_run')),
	start_id uuid not null,
	start_label text not null,
	reason text not null check (length(trim(reason)) > 0),
	result jsonb not null,
	result_sha256 text not null check (result_sha256 ~ '^[0-9a-f]{64}$'),
	holds_placed integer not null default 0 check (holds_placed >= 0),
	run_by text not null,
	run_at timestamptz not null default now(),
	constraint wai_recall_checks_runner_is_a_person check (run_by like 'operator:%')
);
create index if not exists wai_recall_checks_recent on wai_recall_checks (run_at desc);

alter table wai_compliance_rules enable row level security;
alter table wai_compliance_rule_versions enable row level security;
alter table wai_licences enable row level security;
alter table wai_licence_events enable row level security;
alter table wai_licence_questions enable row level security;
alter table wai_stamp_stocks enable row level security;
alter table wai_stamp_events enable row level security;
alter table wai_recall_checks enable row level security;
