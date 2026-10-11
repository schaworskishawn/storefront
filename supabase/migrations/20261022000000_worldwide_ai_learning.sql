-- Worldwide AI, thirteenth migration: lessons from review decisions.
--
-- Each time a person accepts, corrects or rejects a piece of work, that decision becomes a learning event: which task, which
-- agent, which version of which procedure the work followed, and how the review went. Events are made from the saved review
-- itself, once per review, so one can't be lost or counted twice.
--
-- When reviewers have corrected or rejected several results that followed the same version of a procedure, the workspace
-- raises one proposal against that procedure, with those reviews as its evidence. It proposes no wording and changes
-- nothing: a procedure in use stays exactly as approved until a person writes a new version, it is evaluated, and the owner
-- approves it.
-- Safe to run more than once. Nothing here changes an existing record.

update wai_meta set value = '13' where key = 'schema_version' and value = '12';

create table if not exists wai_learning_events (
	id uuid primary key default gen_random_uuid(),
	-- The review this came from. One event per review, however many times it is looked at.
	review_id uuid not null unique references wai_reviews (id),
	subject_type text not null check (subject_type in ('work_product', 'draft')),
	subject_id text not null,
	task_id uuid not null references wai_tasks (id),
	agent text not null,
	-- The procedure the work followed, pinned as it was then. Null when the task recorded none.
	skill_id text,
	skill_version integer,
	skill_sha256 text,
	-- accepted: saved as it was. corrected: a person changed it before saving. rejected: turned down, with a reason.
	outcome text not null check (outcome in ('accepted', 'corrected', 'rejected')),
	reviewer text not null,
	reviewed_at timestamptz not null,
	ingested_at timestamptz not null default now(),
	constraint wai_learning_events_reviewer_is_a_person check (reviewer like 'operator:%')
);
create index if not exists wai_learning_events_skill on wai_learning_events (skill_id, skill_version, reviewed_at);
create index if not exists wai_learning_events_agent on wai_learning_events (agent, reviewed_at);

-- A proposal can now be raised by the workspace from review decisions, as well as written by a person.
alter table wai_skill_proposals add column if not exists origin text not null default 'person'
	check (origin in ('person', 'reviews'));
-- The reviews a proposal rests on, by id. A person reads them where they are kept; they are not copied here.
alter table wai_skill_proposals add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table wai_skill_proposals add column if not exists evidence_updated_at timestamptz;
alter table wai_skill_proposals drop constraint if exists wai_skill_proposals_author_is_a_person;
alter table wai_skill_proposals add constraint wai_skill_proposals_author_matches_origin check (
	(origin = 'person' and created_by like 'operator:%') or (origin = 'reviews' and created_by = 'system:learning')
);
-- One proposal from reviews open per procedure: more evidence is added to it, not raised again.
create unique index if not exists wai_skill_proposals_one_from_reviews
	on wai_skill_proposals (skill_id) where origin = 'reviews' and state = 'open';

alter table wai_learning_events enable row level security;
