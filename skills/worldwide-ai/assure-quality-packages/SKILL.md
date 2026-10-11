---
name: assure-quality-packages
description: "Assemble a batch's release evidence: each required item with whether it is present, referenced and signed, every open hold and deviation, and what stands in the way of a decision. Use it to prepare a release package."
---

# Assure quality packages

## Use this when

- A batch's release evidence needs assembling for a qualified person.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Batch (required)
- Product (required)
- Required evidence (required)
- Holds
- Deviations and actions

## Procedure

1. Read the items required for release.
2. Mark each present, referenced and signed, or not.
3. List open holds and deviations.
4. State what stands in the way of a release decision.
5. Leave the decision to the qualified person.

## What you produce

- A stored QualityReleasePackage record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every blocker is named.
- An unsigned item doesn't count as complete.
- No release decision is made.

## When something goes wrong

- If a required item has no reference, it is a blocker.

## Example

**Request:** "Assure: assemble quality review."

**Result:** A quality release package is stored listing each required evidence item and its status, open holds and deviations, and proposed actions, for a qualified, authorized person to decide.

## Limits

- It never releases a batch, lifts a hold or closes a deviation. 'Ready for a decision' means the evidence is complete, not that the batch is approved.
- Assembles the package. Release, hold removal and disposition are human decisions.
- The figures and findings are calculated by code from what is supplied. No model writes them.
