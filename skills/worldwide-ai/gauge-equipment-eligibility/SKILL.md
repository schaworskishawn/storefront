---
name: gauge-equipment-eligibility
description: "Work out from the equipment register which assets are eligible for use today, and which batches a failed instrument touched. Use it to review equipment eligibility."
---

# Gauge equipment eligibility

## Use this when

- Equipment eligibility or the reach of a failed instrument needs establishing.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- As of
- Equipment register (required)
- Batches measured on each asset
- Recorded failures

## Procedure

1. Read the register: calibration and service dates, and recorded status.
2. Mark each asset eligible or not, for today's date, with the reason.
3. For a failed instrument, list the batches recorded as using it since its last good calibration.
4. List assets with missing dates.
5. State what a reviewer should confirm.

## What you produce

- A stored EquipmentEligibilityReview record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Eligibility follows from the recorded dates only.
- An asset with a missing date is not eligible.
- No calibration or service is recorded as done.

## When something goes wrong

- If use records weren't supplied, affected batches can't be listed and the result says so.

## Example

**Request:** "Gauge: assess equipment eligibility."

**Result:** An equipment eligibility review is stored with each asset's eligibility and the reason, days to its next calibration and service, the batches affected by each recorded failure, and drafted service tasks.

## Limits

- It reads records. It does not calibrate, repair or operate anything, and never treats a missing calibration record as if one existed.
- Reviews records. Performs no calibration or repair and operates no machine.
- The figures and findings are calculated by code from what is supplied. No model writes them.
