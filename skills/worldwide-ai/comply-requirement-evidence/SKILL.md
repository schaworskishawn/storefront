---
name: comply-requirement-evidence
description: "Map the reviewed requirements in effect on a date, for one jurisdiction and activity, to the evidence on file, and say for each whether it is covered. Use it to prepare a compliance evidence review."
---

# Comply requirement evidence

## Use this when

- Reviewed requirements need mapping to the evidence held.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Jurisdiction (required)
- Activity or product (required)
- As of
- Reviewed requirements (required)
- Evidence on file

## Procedure

1. Read the requirements with their jurisdiction, activity and effective dates.
2. Keep only those in effect on the date in question.
3. Match each to the evidence supplied, by reference.
4. Mark each covered, partly covered or not covered, with what is missing.
5. List requirements that could not be assessed.

## What you produce

- A stored ComplianceEvidenceReview record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Only requirements in effect on the date are assessed.
- Evidence that has expired doesn't count as covering.
- Nothing is certified and no legal advice is given.

## When something goes wrong

- If a requirement has no effective date, it is listed as unassessable.

## Example

**Request:** "Comply: check requirement evidence."

**Result:** A compliance evidence review is stored with each requirement's rule version, whether it applies, the evidence found and its validity, and a review request for everything uncertain.

## Limits

- It maps evidence to the requirements you supply. It does not decide what the law requires, approve a rule, or certify compliance.
- Maps evidence to reviewed rules. Gives no legal certification and approves no rule.
- You supply the reviewed requirements. No rule register is stored yet.
- The figures and findings are calculated by code from what is supplied. No model writes them.
