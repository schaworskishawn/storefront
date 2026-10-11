---
name: insight-business-analysis
description: "Calculate a metric for two periods from supplied observations, by segment where given, and state the change with its denominators. Use it to compare two periods honestly."
---

# Insight business analysis

## Use this when

- A metric needs comparing between two periods from supplied counts.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Metric (required)
- Definition (required)
- Unit
- Current period (required)
- Baseline period (required)
- Smallest denominator you would trust
- Observations (required)

## Procedure

1. Read each period's numerators and denominators, by segment where supplied.
2. Calculate the rate for each period in code.
3. Calculate the change, absolute and relative.
4. Call the result inconclusive when the sample is small.
5. State what the data does not cover.

## What you produce

- A stored MetricAnalysis record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every rate is shown with its denominator.
- No cause is asserted for a change.
- A period with no data is refused, not treated as zero.

## When something goes wrong

- If a denominator is zero, the rate is unavailable and says so.

## Example

**Request:** "Insight: analyze business metric."

**Result:** A metric analysis is stored with the current and baseline values, the exact change, each segment's change, and plain statements of what the figures do and don't show.

## Limits

- It describes what changed. It does not say why: no cause is claimed, and a sample below your minimum is reported as inconclusive.
- Describes what the data shows. Does not attribute a change to a cause without evidence.
- The figures and findings are calculated by code from what is supplied. No model writes them.
