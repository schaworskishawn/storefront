# Worldwide AI

Worldwide AI is a private workspace inside the storefront, at `/worldwide-ai`, for the owner and named staff. It holds a roster of 49 agents. Each agent has one working function that takes real input, produces a typed result, checks it, stores it privately and, where the result is a draft, waits for a person to accept or reject it.

This document covers how to try it, how to set it up, what each setting does, how backups work, and exactly what is and isn't built. The companion document, [the capability matrix](worldwide-ai/capability-matrix.md), lists every agent's function and is generated from the code.

**Where it stands (11 October 2026).** The code is implemented and tested on a developer machine. It has not been connected to the live database, the live model, Trigger.dev, Langfuse or an OpenClaw host, and nobody has signed in to it with a real store account yet. Nothing in it sends a message, changes a product, moves money or touches production data. The section [What is not built](#what-is-not-built) lists the parts of the larger plan that have no code yet.

## Try it without setting anything up

```bash
pnpm worldwide-ai:preview
```

Then open `http://localhost:3100/worldwide-ai`. This starts the site with an in-memory database, fictional records labelled `[DEMO]`, and a stand-in owner, so you can look around without a store sign-in or any cloud service. `pnpm worldwide-ai:preview staff` shows it as a staff member.

- Everything in the preview is lost when the server stops.
- The stand-in operator exists only under `next dev` with the demonstration store. It is refused in production, on Vercel, and against a real database.
- The demonstration store never uses real file storage or Trigger.dev, even if their settings are present on your machine.
- Agents whose wording comes from the model show "Awaiting configuration" unless `ANTHROPIC_API_KEY` is set. The 31 code-only functions run as they are.

Each agent's page has a **Run the labelled sample** button that runs its function on a small fictional example (the four workflows with their own screens, such as support drafts, don't). The result is labelled `[DEMO]` and kept out of live lists and counts.

## Who can get in

A person gets in only when all of these are true:

1. They are signed in to the store.
2. Their store account is a Saleor staff account.
3. Their email is listed in `WORLDWIDE_AI_OWNER_EMAILS` or `WORLDWIDE_AI_STAFF_EMAILS`.

Everyone else is turned away before any page content is produced:

| Who                                 | Pages                                | API routes                    |
| ----------------------------------- | ------------------------------------ | ----------------------------- |
| Not signed in                       | Redirected to sign-in                | `401`                         |
| Signed in, not on a list (customer) | "Not found", and the attempt logged  | `404`, and the attempt logged |
| Staff                               | The workspace                        | Allowed                       |
| Owner                               | The workspace and owner-only actions | Allowed                       |

Only the owner can approve a knowledge document, switch an agent on or off or change its limits, take a backup, and run the restore check. A refused attempt is written to the audit log.

Every workspace page and API response is sent with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. Private files are served from `/api/worldwide-ai/file?path=…`, only to a signed-in person who may see the task the file belongs to, and only if the stored bytes still match their recorded checksum.

## The applications

| Application                                                                                                             | What it does today                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today                                                                                                                   | What is waiting for you: results to review, failed tasks, findings, document reviews due. A checklist of your own actions, which you can add to, put off and close. |
| Nexus Command Center                                                                                                    | Plan a goal as ordered steps with an owner each, and consolidate what the steps produced. A plan starts nothing by itself.                                          |
| Overview                                                                                                                | Counts of tasks by state, readiness across the team, and model usage.                                                                                               |
| Team                                                                                                                    | All 49 agents with truthful readiness. Each agent's page runs its function.                                                                                         |
| Tasks                                                                                                                   | Every task with its history, input, result, retries and cancel.                                                                                                     |
| Daily Reports                                                                                                           | A saved morning report with action items, each linked to the record it came from; an optional evening recap; every earlier report. Generate one at any time.        |
| Support Drafts                                                                                                          | File a case, ask Relay for a reply draft that cites approved documents, then save or reject it. Nothing is ever sent.                                               |
| Knowledge                                                                                                               | The approved-document library Atlas searches, with versions, owner approval, review dates and expiry.                                                               |
| Review Queue                                                                                                            | Everything waiting for a person, in one list.                                                                                                                       |
| E-Liquid Lab, RFID & NFC, Product Content Studio, Engineering, Manufacturing, Quality, Canadian Compliance, Improvement | The agents for that area, plus a plain list on each page of what that area does not do yet. The Lab has a recipe calculator.                                        |
| Integrations                                                                                                            | Each service's configuration status (names of missing settings, never values) and its last health check.                                                            |
| Activity                                                                                                                | The audit log.                                                                                                                                                      |
| Settings                                                                                                                | Agent switches and limits, backups, the restore check, and the current configuration flags.                                                                         |

Times are stored in UTC and shown in Winnipeg time.

## How a piece of work runs

Every function goes through the same steps, and a task is never called complete on the model's say-so:

1. **Authorize and validate.** The person must be allowed, the agent switched on, everything the function needs configured, and the input valid. A problem with the input is reported field by field and nothing is created.
2. **Create one task.** The same request made twice produces one task, not two.
3. **Run the handler.** Either code calculates the result, or the model drafts it from only what was supplied. Supplied text is fenced as data, so instructions inside a customer message or document are not followed, and an attempt is flagged.
4. **Validate.** The result must match its declared format. A draft is also checked by code: cited items must be ones that were supplied, figures that appear nowhere in the input are flagged, and each function's own rules apply. A result that fails is not stored.
5. **Store privately**, with a SHA-256 checksum of the result and of the input.
6. **Read it back** and compare the checksum before the task is marked.
7. **Mark the task**: `completed` when verified, `needs_review` when a person must decide, `failed` with the reason, or `outcome_unknown` when the application can't tell what happened.

Task states are `queued`, `running`, `needs_review`, `completed`, `failed`, `cancelled` and `outcome_unknown`. A person's accept or reject is recorded with who and when. An agent cannot review its own work.

Readiness is reported per function as `ready`, `awaiting_configuration`, `blocked`, `disabled`, `unhealthy` or `planned`, worked out from what is actually configured and the last health checks.

## Skills

A skill is a written, tested procedure an agent follows for one of its functions: when to use it, when not to, what it needs, the steps, what it produces, and the checks before it is finished. It is not an agent, a model or a permission. The registered handler still does the work and stores the result; the skill says how the work is meant to be done, and is put in front of the model when a function's wording comes from one.

There are 61: twelve shared foundations (retrieving approved sources, exact calculation, fencing supplied text, and so on) and one role pack for each of the 49 agents. They are written in `src/lib/worldwide-ai/skills/` and exported in the Agent Skills format to `skills/worldwide-ai/`. Open them in the workspace from **Improvement** or from any agent's page.

**Nothing guides work until the owner approves it.** On a new installation no skill is in use and every function runs on its agent's registry instructions, exactly as it did before skills existed. To put them in use:

1. **Evaluate.** Anyone in the workspace can run a skill's evaluation. It runs in a scratch database that shares nothing with live records, and checks that the package is a real procedure in the portable format, that it asks for no tool or knowledge its agents lack, and that the function behind it works: it produces a verified result from its sample, refuses incomplete input, never does the same request twice, and stops when its agent is switched off. Foundations are checked against the mechanism they describe (exact decimals, refused tools, fenced data, intact checksums).
2. **Read what it found.** Each case is shown as passed, failed or not run. A critical failure blocks approval outright.
3. **Approve.** Only the owner can. An approval is of the exact content that was evaluated; change one word and it has to be evaluated again. The approved package is stored as approved, so what is in use does not change when the repository does.

What the evaluation does **not** do is judge how well a model writes. Those cases need the live model and a reviewed set of examples; they are listed as not run and are never counted as passes.

How a task uses skills:

- The server chooses, before any model is involved: the agent's own approved role pack, if it covers the function, and at most two of that pack's foundations. Another agent's pack is never a candidate. What was turned away is recorded with the reason.
- A stored package that was altered, was revoked, or asks for more than its agent has is refused.
- The task and its stored result are pinned to the exact versions followed, and the task page shows how far each got: selected, loaded, invoked, completed.
- If a procedure is revoked or replaced while a task is running, the task fails and nothing is stored.

**Revoking and rolling back.** The owner can revoke a version at once. Nothing takes its place by itself: no version of that skill guides work until the owner rolls back to an earlier approved version or approves a new one. Every approve, revoke and rollback, and every refused attempt, is in Activity.

**Improving a skill.** While reviewing a result, anyone can record a proposal: what should improve and the change to the procedure. A proposal changes nothing. The procedure is changed in the repository, which makes a new version; that version is evaluated on the same cases as the current one and guides work only after the owner approves it. Lessons are not drawn automatically from review decisions.

After changing a skill, bump its version and run `pnpm worldwide-ai:skills` to regenerate the exported files.

## Ingredient inventory

The E-Liquid Lab keeps ingredients, the lots they arrive in, and a ledger of every movement of stock. Open it from **E-Liquid Lab**.

How the balances work:

| Balance       | What it means                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------- |
| On hand       | What is physically in the lot, in the lot's own unit.                                         |
| Reserved      | The part of that promised to a batch.                                                         |
| In quarantine | All of what is on hand, while the lot is in quarantine.                                       |
| Usable        | On hand less reserved. Nothing at all while the lot is in quarantine or past its expiry date. |

The rules the ledger enforces:

- **One unit per lot.** A lot is counted in mL, grams or pieces from the start, so volume and weight never become two balances. The other unit is shown only when the lot has a documented density with its source. One millilitre is never assumed to weigh one gram.
- **Reserve, then use.** Stock is reserved for a batch before it is used, and recording use takes from what was reserved. More than is usable can't be reserved.
- **Nothing is edited.** A movement is never changed or removed. A mistake is put right with a correction, which is another line and needs a reason.
- **Only a person moves stock.** Agents prepare proposals. The database itself refuses a ledger line whose actor isn't a person, a negative balance, and a reservation larger than what is on hand.
- **Once means once.** Each form carries its own key, so a form sent twice moves stock once. Two people taking the last of a lot at the same moment can't both succeed.
- **The owner's alone:** corrections, and releasing a lot from quarantine. Staff can do everything else.
- **Carriers are never assumed.** A nicotine base or flavour with no documented carrier is flagged, not treated as all PG.

When a liquid is both measured and weighed on receipt, both are kept, and the receipt is flagged if they disagree with the documented density by more than 2%.

The inventory feeds two other places. **Stock** can plan replenishment from the stored stock (daily demand and lead time aren't stored yet, so you add those). The **Daily Report** lists each ingredient with something to look at: low stock, an expired or expiring lot, a lot in quarantine, a missing density or carrier.

These records are the workspace's own. Saleor stays the only authority for sellable stock, and nothing here is sent to it.

## Recipes and batches

A **recipe** is kept in versions. A version is the formula exactly as it was written: which ingredients, their documented strength and carrier at the time, the percentages, and the version of the calculation it was checked with. It is never changed; a change is a new version. Only a version the owner approved can be made, and an ingredient with no documented carrier can't be used in one.

A **batch** goes through these steps, each recorded with who did it and when:

1. **Plan.** Choose an approved version and a size. The exact calculation works out what the batch needs. Nothing is reserved yet, and the batch page shows what is usable now and what is short.
2. **Reserve.** Everything the batch needs is reserved through the stock ledger, taking the lots that expire first. A lot kept by weight is converted with its documented density. It is all or nothing: if any ingredient is short, nothing is reserved.
3. **Record that it was made.** Enter what was actually used from each lot and the yield you measured. Use is taken from the reservation and whatever was reserved but not used goes back to free stock. Recording more than was reserved is refused and changes nothing.
4. **Or cancel**, with a reason. Everything reserved is given back.

The yield is what a person measured; it is never calculated. A batch that has been made is **awaiting a quality review**. Whether it may be released is a qualified person's decision, and recording that decision is not built: nothing in the workspace releases a batch.

## The Today checklist

The checklist is for things a person has to do. An item is added by hand, on Today or the checklist page, or put there from a line of a daily report with **Put on the checklist**. The same line tracked twice is one item.

An item can be:

- **Given to** anyone, the owner, staff, or yourself. Nobody can be handed work under another person's name.
- **Given a priority and a date.** A date you type is shown as suggested; a date that came from a record, such as an expiry, is shown as confirmed.
- **Put off**, to a later day, with a reason that is kept with it. It is hidden from Today until that day and is always visible on the checklist page.
- **Closed**, with a note of what was done, or dismissed with a reason.

**Closing an item closes the item and nothing else.** It never completes a task, accepts a result or approves a document: those have their own screens and their own checks. If the thing an item was about is still waiting, the next daily report lists it again.

## Setting it up for real

These are steps for the owner. Nothing here is applied automatically, and none of it has been done yet.

1. **Database.** Create a Supabase project. Run the seven files in `supabase/migrations/` in name order, with `supabase db push` or by pasting each into the SQL editor. The code expects the schema the newest file leaves; if the database is behind, the database health check says which version it is at and which the code needs. Row-level security is switched on for every table with no policies, so only the server's own connection can read them. Set `POSTGRES_URL` to the connection string.
2. **File storage.** Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Create a private bucket named `worldwide-ai` (or name your own in `WORLDWIDE_AI_BUCKET`). It must not be public. The service key stays on the server and is never sent to a browser.
3. **Who may enter.** Set `WORLDWIDE_AI_OWNER_EMAILS` and, if you want, `WORLDWIDE_AI_STAFF_EMAILS`. Each address must belong to a Saleor staff account.
4. **Model.** Set `ANTHROPIC_API_KEY`. Without it the 31 code-only functions still work.
5. **Background jobs (optional).** Set `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_REF`, then deploy the jobs with `npx trigger.dev deploy`. Deploying starts the schedules listed below, so do it when you intend them to run. Without Trigger.dev, work runs inside the web application and nothing is scheduled.
6. **Tracing (optional).** Set `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`. Trace data is redacted before it leaves.
7. **Site inspections (optional).** Run the adapter on an OpenClaw host (see `openclaw-host/README.md`) and set `OPENCLAW_ADAPTER_URL`, `OPENCLAW_ADAPTER_SECRET` and `OPENCLAW_ALLOWED_HOSTS`.

Put the values in the hosting provider's environment settings (or `.env.local` on your own machine). Never commit them.

After that, open **Integrations** and run a health check, then **Settings** and take a backup followed by a restore check. When you are ready for the agents to follow their written procedures, open **Skills**, evaluate them, and approve the ones you are satisfied with.

## Settings

Names only. `.env.example` has the same list with empty values.

| Setting                                                                     | Needed                 | What it is for                                                                                            |
| --------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `WORLDWIDE_AI_OWNER_EMAILS`                                                 | Yes                    | Owners' sign-in emails, separated by commas. Without at least one, the workspace is off.                  |
| `WORLDWIDE_AI_STAFF_EMAILS`                                                 | No                     | Staff sign-in emails.                                                                                     |
| `POSTGRES_URL` or `WORLDWIDE_AI_DATABASE_URL`                               | Yes                    | The database. `WORLDWIDE_AI_DATABASE_URL` wins when both are set.                                         |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                 | For files and backups  | Private file storage. Server only.                                                                        |
| `WORLDWIDE_AI_BUCKET`                                                       | No                     | Bucket name. Default `worldwide-ai`.                                                                      |
| `ANTHROPIC_API_KEY`                                                         | For model-written work | The model provider.                                                                                       |
| `WORLDWIDE_AI_MODEL`                                                        | No                     | Model id. Default `claude-sonnet-5-5`.                                                                    |
| `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`                                 | No                     | Background jobs and schedules.                                                                            |
| `OPENCLAW_ADAPTER_URL`, `OPENCLAW_ADAPTER_SECRET`, `OPENCLAW_ALLOWED_HOSTS` | No                     | The site-inspection worker. The secret is at least 32 characters and matches the host's `ADAPTER_SECRET`. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`           | No                     | Tracing. Base address defaults to Langfuse Cloud.                                                         |
| `WORLDWIDE_AI_RECORD_RAW`                                                   | No                     | `true` keeps redacted prompt and output text in traces and task history. Off by default.                  |
| `WORLDWIDE_AI_INGEST_CONTACT_FORM`                                          | No                     | `true` also files each contact-form message as a support case. Off by default. See below.                 |
| `WORLDWIDE_AI_STALE_AFTER_DAYS`                                             | No                     | Days after approval before a document counts as stale. Default 180.                                       |
| `WORLDWIDE_AI_EVENING_RECAP`                                                | No                     | `true` also saves an evening recap on schedule. Off by default.                                           |
| `WORLDWIDE_AI_STORE`                                                        | Development only       | `demo` uses the in-memory demonstration store. Ignored in production.                                     |
| `WORLDWIDE_AI_DEMO_OPERATOR`                                                | Development only       | `owner` or `staff`: the stand-in operator for the local preview. Ignored outside `next dev`.              |

**Contact form.** With `WORLDWIDE_AI_INGEST_CONTACT_FORM=true`, a message from the public contact form is also filed as a support case, after the visitor's response has been sent. The email to the store inbox is unchanged and does not depend on it. The same message from the same address is filed once. No draft is started: a case waits until a person asks Relay for one.

## Schedules

These exist only once the jobs are deployed to Trigger.dev. Times are Winnipeg time, and a schedule that fires twice for the same slot does the work once.

| Schedule             | When                    | What it does                                                                                                                            |
| -------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Health check         | Every hour, on the hour | Checks each configured service, records the result, raises a finding for anything down.                                                 |
| Stuck-task sweep     | Every hour, at :15      | Marks tasks that ran past their limit `outcome_unknown` instead of leaving them "running".                                              |
| Nightly backup       | 2:30 AM                 | Backs up every table and stored file, keeping the newest fourteen.                                                                      |
| Weekly restore check | Sunday 3:30 AM          | Restores the newest backup into a scratch database and checks it came back intact.                                                      |
| Document scan        | 7:30 AM                 | Finds documents due for review, expiring, or waiting for approval.                                                                      |
| Morning report       | 8:00 AM                 | Saves the daily report. One a day: a second firing finds the first and does nothing. The time follows Winnipeg through daylight saving. |
| Evening recap        | 5:30 PM                 | Saves a recap with what to pick up first tomorrow. Does nothing unless `WORLDWIDE_AI_EVENING_RECAP` is set.                             |

The morning report is code reading the workspace's own records: no model writes it and nothing is sent. Each report covers the time since the last one, so nothing is counted twice. Today's page still shows the live picture; the report is the saved record of a morning.

**One scheduled job is not expected to work yet.** The restore check builds a scratch database from the migration files, using an in-process database package that is loaded by name at run time. The web application is told to deploy both (see `outputFileTracingIncludes` in `next.config.js`), so the restore check and skill evaluations started from the workspace have what they need. The Trigger.dev build has not been told: its image needs `supabase/migrations/` and `@electric-sql/pglite` added through Trigger.dev's own build settings, and that has not been set up or tried on a real project. Until it has, expect the weekly restore check job to fail, and run the restore check from **Settings** instead. The other jobs don't use the scratch database.

## Backups and recovery

There are two layers, and you need both.

**Supabase's own backups** are the first line for the database. Check which plan you are on and what it keeps: daily backups and point-in-time recovery depend on the plan. They do not cover the storage bucket.

**The workspace's own backup** covers what Supabase's doesn't prove:

- Every `wai_` table, one JSON line per row, from a single consistent snapshot, with each table's row count and checksum in a manifest. That includes approved skill releases, their evaluations, and which procedures each task followed.
- Every stored file (uploads, inspection screenshots), kept by checksum so a file is copied once.
- It is written to the same private bucket under `backups/`. The newest fourteen are kept.

**The restore check** is what makes it a backup rather than a hope. It loads the newest backup into an empty scratch database and a scratch folder, then compares every table's row count and checksum and every file's checksum against the manifest. It touches nothing live. The result, with each check, is recorded and shown in Settings. Restore's coverage review reports the last time a restore was actually proven.

**Not covered by any of this, and worth keeping your own record of:**

- The environment settings (the values in the table above). Keep them in a password manager. They are not in the database and must never be in the repository.
- The Trigger.dev project and its schedules, which are recreated by deploying again.
- The OpenClaw host: its job records and screenshots live in its `JOBS_DIR`. Screenshots the workspace accepted are already copied into storage; the host's own folder is not backed up by the workspace.
- Saleor. The store's products, orders and customers are Saleor's, and the workspace keeps no copy of them.

**To recover into a new project:** create the database, run the migrations, restore the newest backup, point the settings at the new project, then run the restore check and a health check before relying on it. Restoring into a live database is a deliberate manual step; no button does it.

Because backups sit in the same bucket as the files, losing the whole Supabase project loses both. Copying `backups/` to a second location is a step for the owner and is not automated.

## Privacy and safety rules in the code

- Secrets are read on the server only. The Integrations and Settings pages show whether a setting is present, never its value.
- Prompts and model output are not kept in traces or task history unless `WORLDWIDE_AI_RECORD_RAW` is on, and then only after emails, phone numbers, card numbers, keys and tokens are removed. Redaction can't find a name or a street address in free text, which is why recording is off by default.
- Text from customers, documents and web pages is treated as information, not instructions.
- Personal work (Focus) is visible only to the person who asked for it. Nobody else sees it, including the owner.
- An agent can use only the tools on its own list, cannot approve its own work, and cannot grant itself access.
- Nothing sends an email, posts anything, changes a Saleor record, or moves money. Drafts are saved for a person to use.
- Demonstration records are labelled and are kept out of business counts.

## What has been checked, and what hasn't

Checked on a developer machine:

- The unit and workflow tests (`pnpm run test:run`), which run against an in-process Postgres with the real migrations.
- Every code-only function on its sample and on cases written for its rules, including exact-decimal arithmetic.
- Every model-written function with a stand-in model: the format, the citation rules, and that a reply breaking the rules stores nothing.
- The checklist: adding, giving, putting off with a reason, closing with a note, one item per report line, and that closing an item leaves its task and result untouched.
- Recipes and batches: a version kept as written, an all-or-nothing reservation across lots, use and yield recorded, and a refusal leaving every balance untouched.
- The ingredient ledger: every kind of movement and its limits, a request sent twice, two people taking the last of a lot, exact decimals, and the database refusing a negative balance or an agent as the actor.
- Daily reports: one a day, a second attempt kept beside the first, no overlapping runs, a failed attempt saved with its reason, and nothing from a demonstration run or one person's own work in a shared report.
- All 61 skills evaluated in an isolated database, and the approve, revoke, rollback and mid-run revocation paths, including a worked example of improving Relay's procedure from version 1 to version 2 and back.
- The pages, in a browser, in the local preview at desktop and phone widths.
- That a visitor who isn't signed in is redirected from every page and gets `401` from the API.
- A backup followed by an isolated restore check in the preview.

Not checked, because it needs your accounts or a deployment:

- A real Saleor staff sign-in, and a real customer being refused.
- The live database, storage bucket, model, Trigger.dev, Langfuse, and an OpenClaw host.
- The restore check and skill evaluation on the hosted site. The build is confirmed to carry the files they need, but they have only been run on a developer machine.
- The quality of real drafts. A stand-in model proves the checks work, not that the writing is good.
- Any function on real business records.

## What is not built

The larger plan describes much more than this. These parts have no working code. The workspace says so on the relevant pages rather than showing empty features as if they worked.

| Part of the plan                                                                                               | Status                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 49 agents, each with a real function, typed output and truthful readiness                                      | Built and tested. See the capability matrix.                                                                                                                                                                                         |
| Private workspace, access control, task pipeline, review, audit log                                            | Built and tested locally. Not yet used with a real sign-in.                                                                                                                                                                          |
| Atlas knowledge library and the Relay support draft with a verified save                                       | Built and tested with a stand-in model.                                                                                                                                                                                              |
| Site inspection through OpenClaw                                                                               | Built and tested against a stand-in worker. No real host connected.                                                                                                                                                                  |
| Health checks, backups, restore check, schedules, redacted tracing                                             | Built and tested locally. Schedules not deployed.                                                                                                                                                                                    |
| Skills: twelve shared foundations and a role pack per agent                                                    | Built and tested locally: catalog, isolated evaluation, owner approval, revoke, rollback, and pinning to tasks. Not approved anywhere yet.                                                                                           |
| Evaluating how well a model writes; exporting skills to other agent runtimes                                   | Not built. The evaluation checks the procedure, its permissions and the function behind it. Only this application loads skills.                                                                                                      |
| Learning loop                                                                                                  | Partly. A person can record an improvement proposal and the owner decides it. Lessons are not drawn automatically from review decisions.                                                                                             |
| Daily Reports                                                                                                  | Built and tested locally: saved morning report and evening recap from the records, action items with owners, steps, links and sources, carry-over by task id, history, one a day, no overlapping runs. The schedule is not deployed. |
| Daily Report sections with no data behind them                                                                 | Not built. Shipments, purchasing, accounting, manufacturing records, goals and engineering changes are listed in each report as unavailable, with the reason.                                                                        |
| Today checklist                                                                                                | Built and tested locally: actions added by hand or tracked from a report, given to a role or yourself, put off with a reason, closed with a note. Reassigning an agent's task to a person is not built.                              |
| Ingredient inventory                                                                                           | Built and tested locally: ingredients, lots, and an append-only ledger with reservations, quarantine and corrections. Used in the preview only.                                                                                      |
| Recipes and batch records                                                                                      | Built and tested locally: versioned recipes the owner approves, batches that reserve and consume lots through the ledger, measured yield. Not used in the preview beyond a walkthrough.                                              |
| Finished-liquid and packaged stock; recording a release decision                                               | Not built. A batch that has been made stays awaiting review, and what it produced is not tracked as stock.                                                                                                                           |
| Manufacturing, quality and compliance record models with software gates                                        | Not built. The agents review records you supply and never release, approve or certify.                                                                                                                                               |
| RFID and NFC tag registry, live scan ingestion, public authenticity page                                       | Not built. Link reconciles scan exports you supply.                                                                                                                                                                                  |
| Product Content Studio: Saleor product picker, images, per-field approval                                      | Not built beyond text drafts from details you enter. No image is ever produced.                                                                                                                                                      |
| Build's coding worker (Claude Agent SDK) and independent review by Verify                                      | Not built. Build writes an engineering brief, which is not a patch. Verify re-checks stored results, not code changes.                                                                                                               |
| OpenHands, Agent Zero, Hermes, Paperclip, Buzz                                                                 | Not installed or connected. They appear on Integrations as having no connector.                                                                                                                                                      |
| Linux desktop, installer image, VirtualBox machine                                                             | Not started. These need downloads and virtual machines that are the owner's decision to start.                                                                                                                                       |
| Layout preferences, notifications, per-agent autonomy policies                                                 | Not built.                                                                                                                                                                                                                           |
| Connectors for accounting, carriers, bank, payment processor, email, calendar, search data, Figma, instruments | Not built. The functions that would use them work from records you supply.                                                                                                                                                           |

## Commands

| Command                     | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `pnpm worldwide-ai:preview` | Local preview with fictional data, on port 3100.                             |
| `pnpm worldwide-ai:matrix`  | Regenerates the capability matrix after a registry change.                   |
| `pnpm worldwide-ai:skills`  | The same command: it also regenerates the exported skill files.              |
| `pnpm run verify`           | The repository's full check: lint, types and every test.                     |
| `pnpm run test:e2e`         | Browser tests, including that the workspace turns away a signed-out visitor. |
| `npx trigger.dev deploy`    | Deploys the background jobs and starts their schedules. The owner's step.    |

## Where things are

| What                           | Where                                                  |
| ------------------------------ | ------------------------------------------------------ |
| Agents                         | `src/lib/worldwide-ai/agents/registry.ts`              |
| Functions                      | `src/lib/worldwide-ai/functions/`                      |
| Skills (source, exported copy) | `src/lib/worldwide-ai/skills/`, `skills/worldwide-ai/` |
| The pipeline                   | `src/lib/worldwide-ai/functions/pipeline.ts`           |
| Support drafts, inspections    | `src/lib/worldwide-ai/workflows/`                      |
| Database schema                | `supabase/migrations/`                                 |
| Pages                          | `src/app/(workspace)/worldwide-ai/`                    |
| Page components and styles     | `src/ui/sections/worldwide-ai/`                        |
| Background jobs                | `src/trigger/`, `trigger.config.ts`                    |
| The OpenClaw adapter           | `openclaw-host/`                                       |
