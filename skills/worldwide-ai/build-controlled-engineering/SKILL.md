---
name: build-controlled-engineering
description: "Prepare an engineering brief for an approved proposal from pasted source excerpts: where the change would go, the smallest scope, the checks and the rollback. Use it to scope a change before any code is written."
---

# Build controlled engineering

## Use this when

- An approved proposal needs an engineering brief before work starts.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Proposal (required)
- Problem and approved scope (required)
- Acceptance criteria (required)
- Base revision
- Relevant source (with file paths) (required)

## Procedure

1. Read the proposal, its acceptance criteria and the source excerpts.
2. Name the files the change would touch, using only files that were shown.
3. Describe the smallest change that meets each criterion.
4. List the checks to run and how to roll back.
5. List open questions and any file that would be needed but wasn't shown.

## What you produce

- A stored EngineeringBrief record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- The brief says it is a brief and not a patch.
- Every acceptance criterion is addressed or listed as open.
- A file that wasn't shown is flagged, not described.

## When something goes wrong

- If the excerpts don't cover the area of the change, say what must be supplied.

## Example

**Request:** "Build: prepare engineering brief."

**Result:** An engineering brief draft is stored with the files it would touch, the approach, the checks and rollback, each acceptance criterion addressed, and open questions, waiting for a person's review.

## Limits

- It is a brief, not a change. No branch, diff or test run exists. Preparing an isolated code change needs Build's coding worker, which isn't connected.
- Cannot self-approve, merge a protected branch, change active permissions or deploy.
- No branch, diff or test run exists. An isolated code change needs the coding worker, which isn't built.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
