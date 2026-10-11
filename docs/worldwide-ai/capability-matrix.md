# Worldwide AI: capability matrix

<!-- Generated from the registry by `pnpm worldwide-ai:matrix`. Do not edit by hand: a test fails when this file and the registry differ. -->

One entry for each of the 49 agents, describing the one baseline function each agent can actually run. It is written out from `src/lib/worldwide-ai/agents/registry.ts` and `src/lib/worldwide-ai/functions/registry.ts`, so it says what the code does and nothing more.

How to read it:

- **49 baseline functions**, one per agent: 31 are calculated by code alone, and 18 are written by the model and then checked by code. 52 functions exist in all (some agents own more than one).
- **Review**: 37 baselines produce a draft that a person must accept or reject; the other 12 save a result that code has verified and that changes nothing outside the workspace.
- **Needs** lists the services a function can't run without. **With nothing configured** is its readiness on an installation with no settings at all, with the names of the missing settings (never their values). Live readiness for your installation is on the Team page.
- **Status** separates implemented from proven. Every function here is tested; none has been run against the live database, the live model or real business records.
- **Role pack** is the written procedure the agent follows, with its supporting foundations (see `skills/worldwide-ai/`). A pack guides work only after its exact version has been evaluated and the owner has approved it in the workspace; until then the agent runs on the instructions in the registry. Whether a pack is approved is a fact about an installation, so it is shown on the Skills page, not here.
- **Planned, not built** lists 5 later capabilities that have no working code. They are shown so that nobody mistakes an agent's name for something it can't do yet.

## Summary

| # | Agent | Baseline function | Written by | Review | Needs |
| --- | --- | --- | --- | --- | --- |
| 1 | Nexus (`nexus`) | `nexus.goal-plan`: Plan and coordinate goal | code | none | Supabase database |
| 2 | Patch (`patch`) | `patch.issue-diagnosis`: Diagnose website issue | code | a person | Supabase database |
| 3 | Relay (`relay`) | `relay.support_draft`: Prepare support reply | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 4 | Ledger (`ledger`) | `ledger.period-workpaper`: Prepare accounting workpaper | code | a person | Supabase database |
| 5 | Atlas (`atlas`) | `atlas.knowledge-review`: Review knowledge sources | code | none | Supabase database |
| 6 | Check (`check`) | `check.record-validation`: Validate selected records | code | none | Supabase database |
| 7 | Watch (`watch`) | `watch.health-assessment`: Assess service health | code | none | Supabase database |
| 8 | Review (`review`) | `review.deadline-register`: Review upcoming deadlines | code | none | Supabase database |
| 9 | Route (`route`) | `route.exception-package`: Resolve shipment exception | code | a person | Supabase database |
| 10 | Trace (`trace`) | `trace.shipment-timeline`: Build shipment timeline | code | none | Supabase database |
| 11 | Tally (`tally`) | `tally.tax-workpaper`: Prepare tax workpaper | code | a person | Supabase database |
| 12 | Vault (`vault`) | `vault.settlement-match`: Reconcile settlements | code | a person | Supabase database |
| 13 | Guard (`guard`) | `guard.access-review`: Review access and security | code | a person | Supabase database |
| 14 | Verify (`verify`) | `verify.workflow-acceptance`: Verify workflow result | code | none | Supabase database |
| 15 | Pulse (`pulse`) | `pulse.content-calendar`: Draft content calendar | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 16 | Focus (`focus`) | `focus.personal-plan`: Plan my personal priorities | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 17 | Insight (`insight`) | `insight.metric-analysis`: Analyze business metric | code | none | Supabase database |
| 18 | Strategy (`strategy`) | `strategy.option-brief`: Compare business options | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 19 | Post (`post`) | `post.email-draft`: Prepare email draft | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 20 | Talent (`talent`) | `talent.hiring-packet`: Prepare hiring packet | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 21 | Comet (`comet`) | `comet.store-audit`: Audit storefront experience | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 22 | Signal (`signal`) | `signal.search-package`: Prepare search content package | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 23 | Reach (`reach`) | `reach.wholesale-proposal`: Prepare wholesale proposal | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 24 | Script (`script`) | `script.copy-draft`: Draft approved brand copy | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 25 | Assist (`assist`) | `assist.meeting-pack`: Prepare business meeting pack | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 26 | Care (`care`) | `care.service-review`: Review support trends | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 27 | Stock (`stock`) | `stock.replenishment-plan`: Calculate replenishment needs | code | none | Supabase database |
| 28 | Source (`source`) | `source.quote-comparison`: Compare purchasing quotes | code | a person | Supabase database |
| 29 | Catalog (`catalog`) | `catalog.content-package`: Build product content package | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 30 | Comply (`comply`) | `comply.evidence-review`: Check requirement evidence | code | a person | Supabase database |
| 31 | Batch (`batch`) | `batch.record-reconciliation`: Reconcile batch records | code | a person | Supabase database |
| 32 | Return (`return`) | `return.case-review`: Review return or warranty | code | a person | Supabase database |
| 33 | Forecast (`forecast`) | `forecast.cash-scenario`: Model cash-flow scenario | code | none | Supabase database |
| 34 | Build (`build`) | `build.engineering-brief`: Prepare engineering brief | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 35 | Restore (`restore`) | `restore.coverage-review`: Review recovery coverage | code | none | Supabase database |
| 36 | Prism (`prism`) | `prism.design-review`: Review screen and visual design | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 37 | Scout (`scout`) | `scout.research-brief`: Prepare cited research brief | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 38 | Forge (`forge`) | `forge.feature-spec`: Define feature proposal | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 39 | Motion (`motion`) | `motion.storyboard`: Draft video production plan | model, checked by code | a person | Supabase database, Model provider (Anthropic) |
| 40 | Link (`link`) | `link.scan-reconciliation`: Reconcile scan session | code | none | Supabase database |
| 41 | Tempo (`tempo`) | `tempo.production-plan`: Draft production schedule | code | a person | Supabase database |
| 42 | Qualify (`qualify`) | `qualify.supplier-package`: Review supplier qualification | code | a person | Supabase database |
| 43 | Assay (`assay`) | `assay.lab-review`: Review laboratory evidence | code | a person | Supabase database |
| 44 | Assure (`assure`) | `assure.release-package`: Assemble quality review | code | a person | Supabase database |
| 45 | Gauge (`gauge`) | `gauge.equipment-review`: Assess equipment eligibility | code | a person | Supabase database |
| 46 | Clean (`clean`) | `clean.clearance-review`: Prepare line-clearance review | code | a person | Supabase database |
| 47 | Coach (`coach`) | `coach.training-review`: Check training eligibility | code | a person | Supabase database |
| 48 | Duty (`duty`) | `duty.excise-workpaper`: Reconcile excise and stamps | code | a person | Supabase database |
| 49 | Safeguard (`safeguard`) | `safeguard.records-review`: Review workplace and waste records | code | a person | Supabase database |

## Each agent

### 1. Nexus: Master coordinator (`nexus`)

- **Function:** `nexus.goal-plan` version 1: Plan and coordinate goal
- **What it produces:** A coordination brief is stored: for a plan, the ordered steps with one owning agent each, their readiness and blockers; for a consolidation, every child task's actual state and result.
- **Handler:** `src/lib/worldwide-ai/functions/operations.ts`
- **Inputs** (\* required): Goal* (textarea); What done looks like* (textarea); What to do* (select); Steps (for a plan) (table, up to 12 rows); Plan to consolidate (task id) (text)
- **Output:** `CoordinationBrief`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `nexus-coordination` version 1, supported by `goal-intake`, `outcome-and-performance-check`, `tool-contract-use`, `exception-and-retry-recovery`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** Planning starts no work: each step is started by a person from the plan. Consolidating reports what came back, including failures and unknown outcomes, and never fills in for a step that didn't finish.

### 2. Patch: Website maintenance (`patch`)

- **Function:** `patch.issue-diagnosis` version 1: Diagnose website issue
- **What it produces:** A diagnostic report is stored against the issue with grouped error signatures and their counts and times, the files implicated, the reproduction evidence or an explicit gap, and a proposed repair scope.
- **Handler:** `src/lib/worldwide-ai/functions/operations.ts`
- **Inputs** (\* required): Issue* (text); Affected page or route (text); Release or commit (text); What was observed* (textarea); Log lines (textarea); Site inspection to attach (task id) (text)
- **Output:** `DiagnosticReport`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `patch-diagnostics` version 1, supported by `structured-extraction`, `claim-and-conflict-check`, `review-package-preparation`, `exception-and-retry-recovery`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It reports what the evidence shows. It states no cause that the logs don't show, and it changes no code: a fix is Build's work, after review.
- **Also owns:** `patch.site_inspection` (Inspect website pages; evidence `src/lib/worldwide-ai/workflows/inspection.test.ts`)

### 3. Relay: Customer support (`relay`)

- **Function:** `relay.support_draft` version 1: Prepare support reply
- **What it produces:** A reply draft that cites approved sources (or says none matched) is reviewed by a person and saved to the case, and the application confirms the draft and its references were stored against the right case.
- **Handler:** `src/lib/worldwide-ai/workflows/relay.ts`
- **Inputs** (\* required): Support case* (text)
- **Output:** `SupportDraft`, checked against its declared format before it is stored in `wai_drafts, wai_draft_sources`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `relay-support-drafting` version 1, supported by `approved-source-retrieval`, `context-and-memory-hygiene`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. Tested with a stand-in model and an in-memory database; not yet run against the live model or database.
- **Evidence:** `src/lib/worldwide-ai/workflows/relay.test.ts`
- **It does not:** Saving a draft never sends it. The task is completed only after the saved draft has been read back and checked.

### 4. Ledger: Accounting (`ledger`)

- **Function:** `ledger.period-workpaper` version 1: Prepare accounting workpaper
- **What it produces:** An accounting workpaper is stored with every transaction's account and the basis for it, exact totals per account, proposed entries, and the transactions that could not be classified.
- **Handler:** `src/lib/worldwide-ai/functions/finance.ts`
- **Inputs** (\* required): Entity* (text); Period (YYYY-MM)* (text); Currency* (text); Chart of accounts* (table, up to 500 rows); Transactions* (table, up to 1000 rows)
- **Output:** `AccountingWorkpaper`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `ledger-workpapers` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** No entry is posted and no money moves. Proposals come only from the keywords you supply; a transaction no rule matches stays unclassified.

### 5. Atlas: Knowledge librarian (`atlas`)

- **Function:** `atlas.knowledge-review` version 1: Review knowledge sources
- **What it produces:** A knowledge review package is stored listing every document's status and version, conflicts between documents, uncovered topics, and a proposed action for each problem.
- **Handler:** `src/lib/worldwide-ai/functions/data.ts`
- **Inputs** (\* required): Collection* (select); Topics that should be covered (list)
- **Output:** `KnowledgeReviewPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `atlas-knowledge-control` version 1, supported by `approved-source-retrieval`, `claim-and-conflict-check`, `document-and-table-production`, `outcome-and-performance-check`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It proposes. Approving, rejecting or retiring a document version stays a separate decision by the owner on the Knowledge page.

### 6. Check: Data quality (`check`)

- **Function:** `check.record-validation` version 1: Validate selected records
- **What it produces:** A data quality report is stored listing each rule that was run, how many rows it checked and failed, and every problem by row and record key. No record is edited.
- **Handler:** `src/lib/worldwide-ai/functions/data.ts`
- **Inputs** (\* required): Dataset name* (text); Key column* (text); Columns that must be filled in (list); Columns that must be numbers (list); Columns that must be dates (YYYY-MM-DD) (list); Unit column (text); Units allowed in that column (list); Records* (table, up to 1000 rows)
- **Output:** `DataQualityReport`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `check-data-quality` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `document-and-table-production`, `outcome-and-performance-check`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It reports and proposes. It does not edit, merge or delete any record, and it checks only the rows you supplied.

### 7. Watch: Monitoring (`watch`)

- **Function:** `watch.health-assessment` version 1: Assess service health
- **What it produces:** A health assessment is stored with each service's status, when it was observed and how old that is, the incidents grouped from failing services, and the feeds that are unavailable.
- **Handler:** `src/lib/worldwide-ai/functions/operations.ts`
- **Inputs** (\* required): Observations to assess* (select); Hours before an observation counts as stale (integer); Snapshot (table, up to 200 rows)
- **Output:** `HealthAssessment`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `watch-monitoring` version 1, supported by `structured-extraction`, `outcome-and-performance-check`, `tool-contract-use`, `exception-and-retry-recovery`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** A pasted snapshot is assessed as a snapshot: it is never described as live monitoring. A service nobody checked is 'not observed', never healthy.
- **Also owns:** `watch.health_check` (Check every integration; evidence `src/lib/worldwide-ai/workflows/scheduled.test.ts`)

### 8. Review: Document tracking (`review`)

- **Function:** `review.deadline-register` version 1: Review upcoming deadlines
- **What it produces:** A deadline register is stored with each item's date, whether that date is confirmed or only suggested, the days remaining, and one follow-up per item that needs attention.
- **Handler:** `src/lib/worldwide-ai/functions/data.ts`
- **Inputs** (\* required): As of (date); Warn this many days ahead (integer); Dated items* (table, up to 500 rows)
- **Output:** `DeadlineRegister`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `review-deadlines` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `document-and-table-production`, `approved-source-retrieval`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It never invents an obligation: an item with no date stays 'no date', and a date with no source is marked as unsourced.
- **Also owns:** `review.document_scan` (Scan the document library; evidence `src/lib/worldwide-ai/workflows/scheduled.test.ts`)

### 9. Route: Logistics administration (`route`)

- **Function:** `route.exception-package` version 1: Resolve shipment exception
- **What it produces:** A logistics exception package is stored against the shipment with missing documents, each charge's invoiced and expected amount and difference, unverifiable charges, and drafted internal actions.
- **Handler:** `src/lib/worldwide-ai/functions/logistics.ts`
- **Inputs** (\* required): Shipment or tracking number* (text); Carrier (text); Carrier invoice number (text); What went wrong* (textarea); Currency* (text); Documents this shipment should have (list); Documents on file (list); Invoiced charges (table, up to 100 rows)
- **Output:** `LogisticsExceptionPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `route-logistics` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It prepares internal follow-ups only. It does not contact the carrier, dispute an invoice, or book or change a shipment.

### 10. Trace: Order tracking (`trace`)

- **Function:** `trace.shipment-timeline` version 1: Build shipment timeline
- **What it produces:** A shipment timeline is stored for the order with its confirmed events in order, estimates labelled as estimates, the latest confirmed status, the data's age, and any inconsistencies.
- **Handler:** `src/lib/worldwide-ai/functions/logistics.ts`
- **Inputs** (\* required): Order number* (text); Tracking number* (text); Carrier (text); When the events were exported (text); Carrier events* (table, up to 200 rows)
- **Output:** `ShipmentTimeline`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `trace-shipment-timelines` version 1, supported by `structured-extraction`, `claim-and-conflict-check`, `document-and-table-production`, `tool-contract-use`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It never adds an event or a delivery date that isn't in the record. It is a timeline, not a message to the customer.

### 11. Tally: Tax preparation (`tally`)

- **Function:** `tally.tax-workpaper` version 1: Prepare tax workpaper
- **What it produces:** A tax workpaper is stored with each line's tax, the rule and version used, totals per tax, the difference from tax collected, and every line no rule covers.
- **Handler:** `src/lib/worldwide-ai/functions/finance.ts`
- **Inputs** (\* required): Entity* (text); Period (YYYY-MM)* (text); Currency* (text); Approved tax rules* (table, up to 500 rows); Reviewed lines* (table, up to 1000 rows)
- **Output:** `TaxWorkpaper`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `tally-tax-preparation` version 1, supported by `deterministic-calculation-check`, `structured-extraction`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** No rate is ever assumed: a line with no rule in effect stays unresolved, not zero. Nothing is filed or paid. Vaping excise belongs to Duty.

### 12. Vault: Banking reconciliation (`vault`)

- **Function:** `vault.settlement-match` version 1: Reconcile settlements
- **What it produces:** A settlement reconciliation is stored with the matched pairs and their ids, ambiguous and unmatched items on both sides, fee checks, and exact totals.
- **Handler:** `src/lib/worldwide-ai/functions/finance.ts`
- **Inputs** (\* required): Currency* (text); Days a deposit may trail its settlement (integer); Bank lines* (table, up to 1000 rows); Processor settlements* (table, up to 1000 rows)
- **Output:** `SettlementReconciliation`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `vault-bank-reconciliation` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** Amounts must match exactly; nothing is matched 'approximately'. No bank access is used or changed and no money moves.

### 13. Guard: Security and access (`guard`)

- **Function:** `guard.access-review` version 1: Review access and security
- **What it produces:** A security review is stored with each finding's subject, the rule it breaks and a recommended correction, plus the workspace's own access setup and the denied attempts on record.
- **Handler:** `src/lib/worldwide-ai/functions/operations.ts`
- **Inputs** (\* required): System under review* (text); Approved policy (what each role may hold)* (table, up to 500 rows); Current grants* (table, up to 1000 rows)
- **Output:** `SecurityReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `guard-security-review` version 1, supported by `structured-extraction`, `claim-and-conflict-check`, `review-package-preparation`, `tool-contract-use`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It recommends. It cannot grant, revoke or change any permission, here or anywhere else, its own included.

### 14. Verify: Quality assurance (`verify`)

- **Function:** `verify.workflow-acceptance` version 1: Verify workflow result
- **What it produces:** A verification report is stored naming the exact result and checksum that was checked, each check's real pass or fail, and what could not be tested.
- **Handler:** `src/lib/worldwide-ai/functions/operations.ts`
- **Inputs** (\* required): Task to verify (task id)* (text); Acceptance criteria to record as not automatically tested (list)
- **Output:** `VerificationReport`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `verify-independent-acceptance` version 1, supported by `outcome-and-performance-check`, `tool-contract-use`, `exception-and-retry-recovery`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It checks records the application holds. It can't re-run a model's judgement or observe anything physical, it never checks its own reports, and it approves nothing.

### 15. Pulse: Social media (`pulse`)

- **Function:** `pulse.content-calendar` version 1: Draft content calendar
- **What it produces:** A content calendar draft is stored with dated entries per channel, each caption's supporting facts, and the asset it uses or needs, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Campaign* (text); Approved brief* (textarea); From* (date); To* (date); Channels* (list); Supported facts* (list); Approved assets available (list)
- **Output:** `ContentCalendarDraft`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `pulse-content-planning` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It drafts. No post is scheduled or published, and a caption states only what a supplied fact supports.

### 16. Focus: Personal assistant (`focus`)

- **Function:** `focus.personal-plan` version 1: Plan my personal priorities
- **What it produces:** A private personal plan is stored in your own scope with a few next actions tied to your goals and timing suggestions, visible only to you.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Plan for* (select); Goals* (list); Fixed commitments (list); Preferences (textarea)
- **Output:** `PrivatePersonalPlan`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `focus-private-planning` version 1, supported by `context-and-memory-hygiene`, `goal-intake`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It stays yours: the task and the plan never appear in shared briefings, team views, reports or another person's lists.

### 17. Insight: Data analyst (`insight`)

- **Function:** `insight.metric-analysis` version 1: Analyze business metric
- **What it produces:** A metric analysis is stored with the current and baseline values, the exact change, each segment's change, and plain statements of what the figures do and don't show.
- **Handler:** `src/lib/worldwide-ai/functions/data.ts`
- **Inputs** (\* required): Metric* (text); Definition* (textarea); Unit (text); Current period* (text); Baseline period* (text); Smallest denominator you would trust (integer); Observations* (table, up to 500 rows)
- **Output:** `MetricAnalysis`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `insight-business-analysis` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `document-and-table-production`, `claim-and-conflict-check`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It describes what changed. It does not say why: no cause is claimed, and a sample below your minimum is reported as inconclusive.

### 18. Strategy: Business assistant (`strategy`)

- **Function:** `strategy.option-brief` version 1: Compare business options
- **What it produces:** A decision brief draft is stored with each option's advantages and risks tied to supplied facts, the assumptions used, a recommendation and the open questions.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Decision to make* (text); Options* (list); Reviewed facts* (list); Constraints (list); Assumptions you are making (list)
- **Output:** `DecisionBrief`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `strategy-decision-briefs` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `clear-business-writing`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It compares and recommends. It commits the business to nothing, dispatches no other agent, and uses no fact you didn't supply.

### 19. Post: Email assistant (`post`)

- **Function:** `post.email-draft` version 1: Prepare email draft
- **What it produces:** An email draft is stored privately with a summary of the context, a subject, the body, the recipients it is for, and the facts it relies on, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Kind* (select); Thread or brief* (textarea); Who it is for* (list); Supporting facts (list); Tone (text)
- **Output:** `EmailDraft`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `post-inbox-drafts` version 1, supported by `context-and-memory-hygiene`, `clear-business-writing`, `claim-and-conflict-check`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It saves a private draft. It never sends, schedules or subscribes anyone, and it names only the recipients you gave it.

### 20. Talent: Recruiting (`talent`)

- **Function:** `talent.hiring-packet` version 1: Prepare hiring packet
- **What it produces:** A hiring packet draft is stored with a role summary, a criterion-by-criterion evidence map for each candidate, the gaps, and interview questions, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Role* (text); Approved criteria* (list); Candidate evidence (table, up to 120 rows)
- **Output:** `HiringPacket`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `talent-recruiting-support` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `clear-business-writing`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It makes no hiring decision and ranks nobody. It works only from the criteria and evidence supplied, and refuses criteria that refer to a protected characteristic.

### 21. Comet: Ecommerce assistant (`comet`)

- **Function:** `comet.store-audit` version 1: Audit storefront experience
- **What it produces:** A store audit draft is stored with findings tied to the step and evidence they came from, their severity, and proposed acceptance criteria, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Flow* (text); Screen* (select); Steps and what you saw* (table, up to 30 rows); Screenshots (images)
- **Output:** `StoreAudit`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `comet-store-usability` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `clear-business-writing`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It audits from the evidence supplied. It never places an order, and a critique is not a measured conversion result.

### 22. Signal: SEO, AEO and GEO (`signal`)

- **Function:** `signal.search-package` version 1: Prepare search content package
- **What it produces:** A search content package draft is stored with a title and description and their character counts, answer summaries and structured-data fields tied to facts, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Page or product* (text); Verified facts* (list); Current title (text); Current meta description (textarea); Search data (if you have any) (table, up to 50 rows)
- **Output:** `SearchContentPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `signal-search-content` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It proposes. No search volume, ranking or traffic figure appears unless it is in the search data you supplied, and nothing is published.

### 23. Reach: Sales assistant (`reach`)

- **Function:** `reach.wholesale-proposal` version 1: Prepare wholesale proposal
- **What it produces:** A wholesale proposal draft is stored with its sections tied to approved terms and product facts, the assumptions it makes, and internal follow-ups, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Prospect* (text); What we know about them* (textarea); Approved commercial terms* (list); Qualified product information* (list)
- **Output:** `WholesaleProposalDraft`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `reach-sales-preparation` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It drafts. It contacts nobody, and it states no price, discount or term that isn't among the approved terms you supplied.

### 24. Script: Copywriter (`script`)

- **Function:** `script.copy-draft` version 1: Draft approved brand copy
- **What it produces:** A copy draft is stored with each requested field's text and the facts it rests on, and the claims that were omitted and why, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): What the copy is for* (text); Fields to write* (list); Content brief* (textarea); Verified facts* (list); Brand voice (textarea); Current copy (textarea)
- **Output:** `CopyDraft`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `script-brand-copy` version 1, supported by `context-and-memory-hygiene`, `clear-business-writing`, `claim-and-conflict-check`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It writes from supplied facts only: no invented specification, health claim or promise. Nothing is published.

### 25. Assist: Executive assistant (`assist`)

- **Function:** `assist.meeting-pack` version 1: Prepare business meeting pack
- **What it produces:** A meeting pack draft is stored with a briefing, notes for each agenda item, proposed actions with owners and whether each date is confirmed or suggested, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Meeting* (text); Date (date); Agenda* (list); Notes and background (textarea); Existing commitments (table, up to 40 rows)
- **Output:** `MeetingPack`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `assist-executive-operations` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It prepares. It sends no invitation, and a date counts as confirmed only when it is in the commitments you supplied.

### 26. Care: Customer experience (`care`)

- **Function:** `care.service-review` version 1: Review support trends
- **What it produces:** A service improvement report draft is stored with each theme, the cases behind it and its share of all cases supplied, minimized examples, and proposed changes, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Period* (text); Cases* (table, up to 150 rows)
- **Output:** `ServiceImprovementReport`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `care-service-improvement` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `outcome-and-performance-check`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It reports themes across cases. It replies to nobody (that is Relay's work), names no customer, and its counts cover only the cases supplied.

### 27. Stock: Inventory planning (`stock`)

- **Function:** `stock.replenishment-plan` version 1: Calculate replenishment needs
- **What it produces:** A replenishment plan is stored with usable quantity, days of cover, target and shortage per SKU, with held and expired stock shown separately and every SKU that couldn't be calculated.
- **Handler:** `src/lib/worldwide-ai/functions/logistics.ts`
- **Inputs** (\* required): Snapshot name* (text); Snapshot date (date); Days to cover beyond the lead time (integer); Stock lines (one per SKU or per lot)* (table, up to 1000 rows)
- **Output:** `ReplenishmentPlan`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `stock-inventory-planning` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `document-and-table-production`, `outcome-and-performance-check`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It recommends. It does not adjust stock, confirm a reservation or place an order, and a SKU with no demand or lead time is not guessed at.

### 28. Source: Purchasing (`source`)

- **Function:** `source.quote-comparison` version 1: Compare purchasing quotes
- **What it produces:** A quote comparison is stored with each quote's landed total and per-unit cost in one currency, lead times, what each quote is missing, a ranking, and a draft purchase order for review.
- **Handler:** `src/lib/worldwide-ai/functions/finance.ts`
- **Inputs** (\* required): Item* (text); Quantity needed* (decimal); Compare in* (text); Quotes* (table, up to 50 rows)
- **Output:** `QuoteComparison`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `source-purchasing-analysis` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** A quote with a missing cost is shown as incomplete, not ranked on a guess. Supplier quality is Qualify's call. No order is submitted.

### 29. Catalog: Product information and content (`catalog`)

- **Function:** `catalog.content-package` version 1: Build product content package
- **What it produces:** A product content package draft is stored against the product and SKU with each selected output, the specifications each statement rests on, a status per output, and the specifications still missing.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Product* (text); SKU* (text); Variants covered (list); Outputs wanted* (list); Verified specifications* (table, up to 60 rows); Images (for alt text) (table, up to 12 rows)
- **Output:** `ProductContentPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `catalog-product-master` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `clear-business-writing`, `review-package-preparation`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It drafts text from supplied specifications. It generates no image (no image tool is connected), invents no specification, and publishes nothing to the store.

### 30. Comply: Compliance coordination (`comply`)

- **Function:** `comply.evidence-review` version 1: Check requirement evidence
- **What it produces:** A compliance evidence review is stored with each requirement's rule version, whether it applies, the evidence found and its validity, and a review request for everything uncertain.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Jurisdiction* (text); Activity or product* (text); As of (date); Reviewed requirements* (table, up to 500 rows); Evidence on file (table, up to 500 rows)
- **Output:** `ComplianceEvidenceReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `comply-requirement-evidence` version 1, supported by `structured-extraction`, `approved-source-retrieval`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It maps evidence to the requirements you supply. It does not decide what the law requires, approve a rule, or certify compliance.

### 31. Batch: Manufacturing records (`batch`)

- **Function:** `batch.record-reconciliation` version 1: Reconcile batch records
- **What it produces:** A batch reconciliation is stored with input and output balances on a volume basis, yield, the unexplained difference, each input's variance from plan, and every quantity that couldn't be converted.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Batch* (text); Approved formula and version* (text); Unexplained difference you would investigate (%) (decimal); Ingredients used (as recorded)* (table, up to 500 rows); Output, samples, waste and remaining bulk* (table, up to 500 rows); Documented densities (table, up to 500 rows)
- **Output:** `BatchReconciliation`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `batch-formula-traceability` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** Nothing is inferred: summed ingredient volume is nominal, 1 mL is never assumed to be 1 gram, and a missing observation stays missing. It does not release the batch.

### 32. Return: Returns and warranty (`return`)

- **Function:** `return.case-review` version 1: Review return or warranty
- **What it produces:** A return review package is stored with each eligibility check and its evidence, the facts still unconfirmed, and a proposed resolution or supplier claim for a person to decide.
- **Handler:** `src/lib/worldwide-ai/functions/logistics.ts`
- **Inputs** (\* required): Order number* (text); Product (SKU)* (text); Lot or serial (text); What the customer asked for* (textarea); Request type* (select); Requested on* (date); Delivered on (date); Reported condition* (select); Policy and version relied on (text); Policy window (days from delivery) (integer); Does the policy accept opened items of this kind? (select); Earlier returns on this order (integer); Evidence on file (list)
- **Output:** `ReturnReviewPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `return-case-verification` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `approved-source-retrieval`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It proposes. No refund, replacement or stock adjustment is made, and a missing fact leaves eligibility undetermined rather than assumed.

### 33. Forecast: Cash-flow planning (`forecast`)

- **Function:** `forecast.cash-scenario` version 1: Model cash-flow scenario
- **What it produces:** A cash-flow scenario is stored with a dated balance after every movement, the lowest balance and when, totals split into confirmed and assumed, and a sensitivity run.
- **Handler:** `src/lib/worldwide-ai/functions/finance.ts`
- **Inputs** (\* required): Scenario* (text); Currency* (text); Opening date* (date); Opening balance* (decimal); Forecast until* (date); Sensitivity: assumed receipts fall short by (%) (decimal); Receipts and payments* (table, up to 1000 rows)
- **Output:** `CashFlowScenario`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `forecast-cash-scenarios` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `document-and-table-production`, `claim-and-conflict-check`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** A forecast is an estimate from the items you supplied. It is not a bank balance and nothing in it has happened yet.

### 34. Build: Engineering (`build`)

- **Function:** `build.engineering-brief` version 1: Prepare engineering brief
- **What it produces:** An engineering brief draft is stored with the files it would touch, the approach, the checks and rollback, each acceptance criterion addressed, and open questions, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Proposal* (text); Problem and approved scope* (textarea); Acceptance criteria* (list); Base revision (text); Relevant source (with file paths)* (textarea)
- **Output:** `EngineeringBrief`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `build-controlled-engineering` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `goal-intake`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It is a brief, not a change. No branch, diff or test run exists. Preparing an isolated code change needs Build's coding worker, which isn't connected.
- **Planned, not built:** `build.change-proposal` (Prepare an isolated code change). Needs Build's coding worker (Claude Agent SDK). Needs the private coding worker (Claude Agent SDK, section 16). The worker contract isn't built yet, so no patch or diff is ever produced.

### 35. Restore: Recovery (`restore`)

- **Function:** `restore.coverage-review` version 1: Review recovery coverage
- **What it produces:** A recovery coverage report is stored with the newest backup's age and coverage, tables and files it misses, when restoration was last proven, each other asset's coverage, and a restore-test plan.
- **Handler:** `src/lib/worldwide-ai/functions/operations.ts`
- **Inputs** (\* required): Oldest acceptable backup (hours) (integer); Other things that must be recoverable (table, up to 500 rows)
- **Output:** `RecoveryCoverageReport`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `restore-recovery-verification` version 1, supported by `outcome-and-performance-check`, `exception-and-retry-recovery`, `tool-contract-use`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** Reading a manifest shows coverage on paper. Only the separate isolated restore check proves a backup restores, and this report says which of the two it found.

### 36. Prism: Design (`prism`)

- **Function:** `prism.design-review` version 1: Review screen and visual design
- **What it produces:** A design review draft is stored with observations tied to what is visible, their category and severity, proposed refinements, and a clear note of whether a screenshot was actually reviewed.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Screen* (text); Viewport* (select); What the person is trying to do* (text); Description of the screen (textarea); Design tokens or rules to check against (textarea); Screenshots (images)
- **Output:** `DesignReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `prism-design-and-assets` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `clear-business-writing`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It critiques. It generates and edits no image and writes to no design tool, and it says plainly when it worked from a description rather than a screenshot.
- **Planned, not built:** `prism.image-draft` (Generate or edit a product image). Needs Image generation and editing, Supabase Storage. Needs a configured image tool and approved reference assets with usage rights. No image is produced without them.

### 37. Scout: Research and fact-checking (`scout`)

- **Function:** `scout.research-brief` version 1: Prepare cited research brief
- **What it produces:** A research brief draft is stored with an answer, each claim tied to its sources and their dates, conflicts between sources, and what the sources leave open, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Question* (textarea); Source documents* (table, up to 8 rows)
- **Output:** `ResearchBrief`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `scout-cited-research` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `approved-source-retrieval`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It reviews the documents supplied. It is not a fresh web search and says so, and its brief is evidence for review, never approved knowledge.
- **Planned, not built:** `scout.web-research` (Research with fresh retrieval). Needs Web research retrieval. Needs a configured retrieval tool with permitted sources.

### 38. Forge: Product management and prototyping (`forge`)

- **Function:** `forge.feature-spec` version 1: Define feature proposal
- **What it produces:** A feature specification draft is stored with requirements, user stories, acceptance criteria tied to requirements, assumptions, dependencies and a prototype brief, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Feature* (text); Problem* (textarea); Desired result* (textarea); Evidence (list); Constraints (list)
- **Output:** `FeatureSpecification`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `forge-product-definition` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `goal-intake`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It specifies. It builds nothing, starts no other agent's work, and deploys nothing.

### 39. Motion: Video content (`motion`)

- **Function:** `motion.storyboard` version 1: Draft video production plan
- **What it produces:** A storyboard package draft is stored with timed scenes covering the full duration, script and on-screen text, the asset each scene uses or needs, and a caption plan, waiting for a person's review.
- **Handler:** `src/lib/worldwide-ai/functions/drafting.ts`
- **Inputs** (\* required): Video* (text); Approved brief* (textarea); Format* (select); Length in seconds* (integer); Claims that may be made (list); Approved assets (table, up to 30 rows)
- **Output:** `StoryboardPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** model writes, code checks
- **Review:** a person must accept
- **Needs:** Supabase database, Model provider (Anthropic)
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL, ANTHROPIC_API_KEY)
- **Role pack:** `motion-media-drafts` version 1, supported by `context-and-memory-hygiene`, `claim-and-conflict-check`, `review-package-preparation`, `clear-business-writing`
- **Status:** Implemented. The wording comes from the model; tested with a stand-in model only, so the quality of real drafts is unproven.
- **Evidence:** `src/lib/worldwide-ai/functions/drafting.test.ts`
- **It does not:** It is a plan, not a video. Rendering or exporting a clip needs a media tool, which isn't connected, and nothing is published.
- **Planned, not built:** `motion.clip-render` (Render or export a clip). Needs Image generation and editing, Supabase Storage. Needs a configured media tool. A real clip is only reported when a verified media file exists.

### 40. Link: RFID, NFC and traceability (`link`)

- **Function:** `link.scan-reconciliation` version 1: Reconcile scan session
- **What it produces:** A scan reconciliation is stored with expected and observed units per SKU, missing tags, unknown tags, how cartons were counted, and the number of repeated reads that were collapsed.
- **Handler:** `src/lib/worldwide-ai/functions/logistics.ts`
- **Inputs** (\* required): Session* (text); Session type* (select); Where the scans came from* (text); Manifest (expected tags)* (table, up to 2000 rows); Scan events* (table, up to 5000 rows)
- **Output:** `ScanReconciliation`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** none (verified save)
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `link-scan-traceability` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `document-and-table-production`, `outcome-and-performance-check`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** A read is an observation. No stock is moved, no location is inferred from a nearby read, and reading a tag proves nothing about authenticity, identity or age.
- **Planned, not built:** `link.live-readers` (Ingest live reader events). Needs RFID and NFC readers. Needs configured readers and an authenticated scan-ingestion endpoint.

### 41. Tempo: Production planning (`tempo`)

- **Function:** `tempo.production-plan` version 1: Draft production schedule
- **What it produces:** A production plan is stored with proposed manufacturing orders, the material each needs against eligible stock, the hours used against hours available, every shortage, and the constraints it did not check.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Plan name* (text); Equipment hours available in the period* (decimal); Output rate (mL per hour)* (decimal); Cleaning and changeover between products (hours)* (decimal); Reviewed demand* (table, up to 100 rows); Material per litre of product (from the approved formula)* (table, up to 500 rows); Eligible material stock* (table, up to 500 rows)
- **Output:** `ProductionPlan`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `tempo-production-planning` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** A plan is a proposal. It checks materials and equipment hours only, says which constraints it didn't check, and never starts a machine, consumes stock or authorizes production.

### 42. Qualify: Supplier quality (`qualify`)

- **Function:** `qualify.supplier-package` version 1: Review supplier qualification
- **What it produces:** A supplier qualification package is stored with each required document's status, version and expiry, the gaps, open quality issues and rejected lots, for an authorized person's decision.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Supplier* (text); Site (text); Material* (text); As of (date); Documents required for qualification* (list); Documents on file (table, up to 500 rows); Quality issues and rejected lots (table, up to 500 rows)
- **Output:** `SupplierQualificationPackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `qualify-supplier-evidence` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `approved-source-retrieval`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It assembles evidence. It does not approve the supplier, substitute a material, or release anything from quarantine.

### 43. Assay: Laboratory coordination (`assay`)

- **Function:** `assay.lab-review` version 1: Review laboratory evidence
- **What it produces:** A laboratory evidence review is stored with each planned test's verified result, its comparison to the approved limits, results that couldn't be compared, and the tests still outstanding.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Lot* (text); Approved sampling plan and version* (text); Planned tests and approved limits* (table, up to 500 rows); Laboratory results on file (table, up to 500 rows)
- **Output:** `LaboratoryEvidenceReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `assay-lab-evidence` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It performs no analysis and accepts no test. A result inside its limits is a specification match, not a declaration that anything is safe, and an unverified transcription is not used.

### 44. Assure: Manufacturing quality (`assure`)

- **Function:** `assure.release-package` version 1: Assemble quality review
- **What it produces:** A quality release package is stored listing each required evidence item and its status, open holds and deviations, and proposed actions, for a qualified, authorized person to decide.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Batch* (text); Product* (text); Required evidence* (table, up to 500 rows); Holds (table, up to 500 rows); Deviations and actions (table, up to 500 rows)
- **Output:** `QualityReleasePackage`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `assure-quality-packages` version 1, supported by `structured-extraction`, `claim-and-conflict-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It never releases a batch, lifts a hold or closes a deviation. 'Ready for a decision' means the evidence is complete, not that the batch is approved.

### 45. Gauge: Equipment, calibration and maintenance (`gauge`)

- **Function:** `gauge.equipment-review` version 1: Assess equipment eligibility
- **What it produces:** An equipment eligibility review is stored with each asset's eligibility and the reason, days to its next calibration and service, the batches affected by each recorded failure, and drafted service tasks.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): As of (date); Equipment register* (table, up to 500 rows); Batches measured on each asset (table, up to 500 rows); Recorded failures (table, up to 500 rows)
- **Output:** `EquipmentEligibilityReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `gauge-equipment-eligibility` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It reads records. It does not calibrate, repair or operate anything, and never treats a missing calibration record as if one existed.

### 46. Clean: Cleaning and line clearance (`clean`)

- **Function:** `clean.clearance-review` version 1: Prepare line-clearance review
- **What it produces:** A clearance review is stored with each procedure step's recorded performer and verifier, the steps still outstanding, and steps whose verification isn't independent.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Line or equipment* (text); Approved procedure and version* (text); Previous product and label* (text); Next product and label* (text); Procedure steps* (table, up to 500 rows); Recorded observations (table, up to 500 rows)
- **Output:** `ClearanceReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `clean-clearance-records` version 1, supported by `structured-extraction`, `claim-and-conflict-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It compares records to the procedure. It does not attest that any physical cleaning or clearance happened: only a recorded observation by an authorized person does that.

### 47. Coach: Training and qualifications (`coach`)

- **Function:** `coach.training-review` version 1: Check training eligibility
- **What it produces:** A training eligibility review is stored with each person's status per requirement and the reason, who is documented as eligible, and the training or requalification proposed for each gap.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Task* (text); As of (date); Staff to check* (list); Requirements for the task* (table, up to 500 rows); Training records on file (table, up to 1000 rows)
- **Output:** `TrainingEligibilityReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `coach-qualification-tracking` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It reports documented eligibility. It grants no qualification, and an acknowledgement that a document was read is never counted as a demonstrated assessment.

### 48. Duty: Vaping excise and stamp accounting (`duty`)

- **Function:** `duty.excise-workpaper` version 1: Reconcile excise and stamps
- **What it produces:** An excise workpaper is stored with the duty on each packaging event and the rule version used, total liability, a stamp reconciliation, and every exception.
- **Handler:** `src/lib/worldwide-ai/functions/finance.ts`
- **Inputs** (\* required): Jurisdiction* (text); Period (YYYY-MM)* (text); Currency* (text); Approved duty tiers* (table, up to 500 rows); Production and packaging events* (table, up to 1000 rows); Stamp ledger (table, up to 500 rows)
- **Output:** `ExciseWorkpaper`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `duty-excise-reconciliation` version 1, supported by `deterministic-calculation-check`, `structured-extraction`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** No duty rate is built in: a container no supplied rule covers leaves the liability unresolved, never zero. Nothing is filed or paid, and no stamp is ordered or disposed of.

### 49. Safeguard: Workplace safety and waste records (`safeguard`)

- **Function:** `safeguard.records-review` version 1: Review workplace and waste records
- **What it produces:** A workplace and waste review is stored with inspection counts against requirements, incidents needing follow-up, a balance per waste stream, undocumented collections, and drafted follow-ups.
- **Handler:** `src/lib/worldwide-ai/functions/manufacturing.ts`
- **Inputs** (\* required): Period (YYYY-MM)* (text); Inspections required in the period (table, up to 500 rows); Inspections recorded (table, up to 500 rows); Incidents and spills recorded (table, up to 500 rows); Waste movements (table, up to 500 rows)
- **Output:** `WorkplaceWasteReview`, checked against its declared format before it is stored in `wai_work_products`
- **Written by:** code only
- **Review:** a person must accept
- **Needs:** Supabase database
- **With nothing configured:** Awaiting configuration (missing: POSTGRES_URL)
- **Role pack:** `safeguard-workplace-records` version 1, supported by `structured-extraction`, `deterministic-calculation-check`, `review-package-preparation`, `document-and-table-production`
- **Status:** Implemented. Calculated by code; tested on its sample and its rules. Not yet run on real business records.
- **Evidence:** `src/lib/worldwide-ai/functions/functions.test.ts`
- **It does not:** It reviews records. It writes no emergency or spill response, certifies nothing as safe, and authorizes no disposal.
