---
name: forecast-cash-scenarios
description: "Project the cash balance day by day from an opening position and dated receipts and payments, each marked confirmed or assumed. Use it to see the low point and what moves it."
---

# Forecast cash scenarios

## Use this when

- A cash projection is needed from dated receipts and payments.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Scenario (required)
- Currency (required)
- Opening date (required)
- Opening balance (required)
- Forecast until (required)
- Sensitivity: assumed receipts fall short by (%)
- Receipts and payments (required)

## Procedure

1. Read the opening balance and each dated item with its confirmed or assumed mark.
2. Project the balance day by day in exact decimals.
3. Find the lowest balance and its date.
4. Recalculate with assumed receipts reduced, to show sensitivity.
5. Keep confirmed and assumed items apart in the result.

## What you produce

- A stored CashFlowScenario record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- The projection is labelled an estimate, not a bank balance.
- Confirmed and assumed items are never mixed in one total without saying so.
- Each day's balance follows from the previous day's.

## When something goes wrong

- If an item has no date, it is excluded and listed.

## Example

**Request:** "Forecast: model cash-flow scenario."

**Result:** A cash-flow scenario is stored with a dated balance after every movement, the lowest balance and when, totals split into confirmed and assumed, and a sensitivity run.

## Limits

- A forecast is an estimate from the items you supplied. It is not a bank balance and nothing in it has happened yet.
- Models scenarios. A forecast is never presented as a confirmed balance.
- The figures and findings are calculated by code from what is supplied. No model writes them.
