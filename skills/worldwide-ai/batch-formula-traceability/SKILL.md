---
name: batch-formula-traceability
description: "Reconcile a batch from the quantities staff recorded: what went in by lot against output, samples, waste and remaining bulk, converting units only with a documented density. Use it to prepare a batch reconciliation."
---

# Batch formula traceability

## Use this when

- A batch's recorded inputs and outputs need reconciling.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Batch (required)
- Approved formula and version (required)
- Unexplained difference you would investigate (%)
- Ingredients used (as recorded) (required)
- Output, samples, waste and remaining bulk (required)
- Documented densities

## Procedure

1. Read what went in by ingredient and lot, and what came out.
2. Convert grams to millilitres only where a documented density was recorded.
3. Sum inputs and outputs in the same unit.
4. Report the unexplained difference as its own figure.
5. Say the balance is incomplete when a conversion wasn't possible.

## What you produce

- A stored BatchReconciliation record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- One millilitre is never assumed to weigh one gram.
- Every figure traces to a recorded quantity and lot.
- The batch is not released.

## When something goes wrong

- If a density is missing, the affected line is unavailable and the balance is marked incomplete.

## Example

**Request:** "Batch: reconcile batch records."

**Result:** A batch reconciliation is stored with input and output balances on a volume basis, yield, the unexplained difference, each input's variance from plan, and every quantity that couldn't be converted.

## Limits

- Nothing is inferred: summed ingredient volume is nominal, 1 mL is never assumed to be 1 gram, and a missing observation stays missing. It does not release the batch.
- Reconciles recorded quantities. Never fabricates a reading and never releases a batch.
- The figures and findings are calculated by code from what is supplied. No model writes them.
