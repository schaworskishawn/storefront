---
name: assay-lab-evidence
description: "Reconcile a lot's planned tests with the verified laboratory results on file and compare each result to its approved specification in the same unit. Use it to prepare a lab review."
---

# Assay lab evidence

## Use this when

- A lot's test results need comparing with specifications.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Lot (required)
- Approved sampling plan and version (required)
- Planned tests and approved limits (required)
- Laboratory results on file

## Procedure

1. Read the planned tests and the results on file.
2. Use only results marked verified.
3. Compare each to its specification, only when the units match.
4. Mark each within, outside, or not comparable.
5. List planned tests with no verified result.

## What you produce

- A stored LaboratoryEvidenceReview record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Unverified results are never compared.
- Results in a different unit from the specification are not comparable, not converted.
- Nothing is declared safe.

## When something goes wrong

- If a specification is missing for a test, the result is listed as not comparable.

## Example

**Request:** "Assay: review laboratory evidence."

**Result:** A laboratory evidence review is stored with each planned test's verified result, its comparison to the approved limits, results that couldn't be compared, and the tests still outstanding.

## Limits

- It performs no analysis and accepts no test. A result inside its limits is a specification match, not a declaration that anything is safe, and an unverified transcription is not used.
- Compares verified results to specifications. Invents no test and declares nothing safe.
- The figures and findings are calculated by code from what is supplied. No model writes them.
