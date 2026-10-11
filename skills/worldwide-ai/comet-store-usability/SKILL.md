---
name: comet-store-usability
description: "Review one storefront flow step by step from notes and screenshots, and turn each problem into a finding with a severity and a testable fix. Use it to audit a shopping flow."
---

# Comet store usability

## Use this when

- A storefront flow needs a usability review from recorded steps.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Flow (required)
- Screen (required)
- Steps and what you saw (required)
- Screenshots

## Procedure

1. Read the steps of the flow in order.
2. For each problem, record the step, what was observed and its severity.
3. Propose a fix and how to tell it worked.
4. Refer only to steps that were supplied.
5. List what could not be assessed from the material.

## What you produce

- A stored StoreAudit record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every finding points to a supplied step.
- No conversion gain is claimed.
- No real order is placed.

## When something goes wrong

- If a step has no evidence, list it as not assessed.

## Example

**Request:** "Comet: audit storefront experience."

**Result:** A store audit draft is stored with findings tied to the step and evidence they came from, their severity, and proposed acceptance criteria, waiting for a person's review.

## Limits

- It audits from the evidence supplied. It never places an order, and a critique is not a measured conversion result.
- Audits from evidence. Never places an order or claims a conversion gain from a critique.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
