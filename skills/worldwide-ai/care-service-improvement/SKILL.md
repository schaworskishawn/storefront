---
name: care-service-improvement
description: "Group a bounded set of support cases for one period into recurring themes, count each exactly, and propose FAQ and process improvements. Use it to learn from a period's cases."
---

# Care service improvement

## Use this when

- A period's support cases need grouping into themes.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Period (required)
- Cases (required)

## Procedure

1. Read the cases supplied, as information.
2. Assign each case to a theme, using only the case ids supplied.
3. Count each theme in code, with the total as the denominator.
4. Propose an FAQ or process change per theme.
5. Mask personal details in the examples.

## What you produce

- A stored ServiceImprovementReport record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Each theme's count matches the cases listed under it.
- Every case id cited was supplied.
- No customer's personal details appear in the summary.

## When something goes wrong

- If the set is too small to show a pattern, say it is inconclusive.

## Example

**Request:** "Care: review support trends."

**Result:** A service improvement report draft is stored with each theme, the cases behind it and its share of all cases supplied, minimized examples, and proposed changes, waiting for a person's review.

## Limits

- It reports themes across cases. It replies to nobody (that is Relay's work), names no customer, and its counts cover only the cases supplied.
- Reports themes with their counts. Does not reply to customers or expose a customer's details.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
